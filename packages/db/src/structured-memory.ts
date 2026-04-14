import { getPrisma } from "./client";

export const STRUCTURED_MEMORY_FACT_KEYS = {
  CONTACT_NAME: "contact_name",
  COMPANY: "company",
  ROLE: "role",
  NEED: "need",
  TIMELINE: "timeline",
  BUDGET: "budget",
  AVAILABILITY: "availability",
  MEETING_INTENT: "meeting_intent",
  UNANSWERED_QUESTION: "unanswered_question",
  NEXT_SUGGESTED_MOVE: "next_suggested_move",
} as const;

export type StructuredMemoryFactKey =
  (typeof STRUCTURED_MEMORY_FACT_KEYS)[keyof typeof STRUCTURED_MEMORY_FACT_KEYS];

export type StructuredMemoryFactRecord = {
  id: string;
  conversationId: string;
  sourceMessageId: string | null;
  key: StructuredMemoryFactKey;
  valueText: string;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ListStructuredMemoryFactsInput = {
  workspaceId: string;
  conversationId: string;
  keys?: StructuredMemoryFactKey[] | null;
};

export type UpsertStructuredMemoryFactInput = {
  key: StructuredMemoryFactKey;
  valueText: string;
  confidence?: number | null;
  sourceMessageId?: string | null;
};

export type UpsertStructuredMemoryFactsInput = {
  workspaceId: string;
  conversationId: string;
  facts: UpsertStructuredMemoryFactInput[];
};

function normalizeValueText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Structured memory fact value text is required.");
  }

  return trimmed;
}

export async function listStructuredMemoryFacts(
  input: ListStructuredMemoryFactsInput,
): Promise<StructuredMemoryFactRecord[]> {
  const prisma = getPrisma();
  const records = await prisma.conversationFact.findMany({
    where: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      key: input.keys ? { in: input.keys } : undefined,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      conversationId: true,
      sourceMessageId: true,
      key: true,
      valueText: true,
      confidence: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const latestByKey = new Map<string, StructuredMemoryFactRecord>();
  for (const record of records) {
    if (!latestByKey.has(record.key)) {
      latestByKey.set(record.key, {
        id: record.id,
        conversationId: record.conversationId,
        sourceMessageId: record.sourceMessageId,
        key: record.key as StructuredMemoryFactKey,
        valueText: record.valueText,
        confidence: record.confidence,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }
  }

  return Array.from(latestByKey.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

export async function upsertStructuredMemoryFacts(
  input: UpsertStructuredMemoryFactsInput,
): Promise<StructuredMemoryFactRecord[]> {
  const prisma = getPrisma();

  if (input.facts.length === 0) {
    return [];
  }

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!conversation) {
      throw new Error("The conversation could not be loaded for structured memory.");
    }

    const sourceMessageIds = Array.from(
      new Set(
        input.facts
          .map((fact) => fact.sourceMessageId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (sourceMessageIds.length > 0) {
      const sourceMessages = await tx.message.findMany({
        where: {
          id: { in: sourceMessageIds },
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      const validIds = new Set(sourceMessages.map((msg) => msg.id));
      const invalid = sourceMessageIds.find((id) => !validIds.has(id));
      if (invalid) {
        throw new Error("Structured memory source message does not belong to the conversation.");
      }
    }

    const results: StructuredMemoryFactRecord[] = [];

    for (const fact of input.facts) {
      const valueText = normalizeValueText(fact.valueText);
      const existing = await tx.conversationFact.findFirst({
        where: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          key: fact.key,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
        },
      });

      const record = existing
        ? await tx.conversationFact.update({
            where: {
              id: existing.id,
            },
            data: {
              valueText,
              confidence: fact.confidence ?? null,
              sourceMessageId: fact.sourceMessageId ?? null,
            },
            select: {
              id: true,
              conversationId: true,
              sourceMessageId: true,
              key: true,
              valueText: true,
              confidence: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await tx.conversationFact.create({
            data: {
              workspaceId: input.workspaceId,
              conversationId: conversation.id,
              sourceMessageId: fact.sourceMessageId ?? null,
              key: fact.key,
              valueText,
              confidence: fact.confidence ?? null,
            },
            select: {
              id: true,
              conversationId: true,
              sourceMessageId: true,
              key: true,
              valueText: true,
              confidence: true,
              createdAt: true,
              updatedAt: true,
            },
          });

      results.push({
        id: record.id,
        conversationId: record.conversationId,
        sourceMessageId: record.sourceMessageId,
        key: record.key as StructuredMemoryFactKey,
        valueText: record.valueText,
        confidence: record.confidence,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }

    return results;
  });
}
