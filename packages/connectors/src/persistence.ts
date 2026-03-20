import type {
  DedupeDecision,
  InboundDiagnostic,
  InboundEnvelope,
  InboundInsertedCounts,
} from "./inbound";
import type {
  IngestionBatch,
  JsonValue,
  NormalizedParticipantCandidate,
} from "./types";

export type ParticipantResolution = {
  participantId: string;
  externalParticipantId?: string | null;
  matched?: boolean;
  candidate?: Pick<
    NormalizedParticipantCandidate,
    "email" | "handle" | "displayName" | "platform"
  >;
};

export type ParticipantResolutionMap = Record<string, ParticipantResolution>;

export type CanonicalWriteMatchedCounts = {
  conversations: number;
  participants: number;
  messages: number;
  attachments: number;
};

export type ConversationParticipantsWriteResult = {
  conversationId: string;
  participantResolutionMap: ParticipantResolutionMap;
  insertedCounts: Pick<InboundInsertedCounts, "conversations" | "participants">;
  matchedCounts?: Pick<CanonicalWriteMatchedCounts, "conversations" | "participants">;
  diagnostics?: InboundDiagnostic[];
};

export type MessageAttachmentWriteResult = {
  messageIds: string[];
  attachmentIds: string[];
  insertedCounts: Pick<InboundInsertedCounts, "messages" | "attachments">;
  matchedCounts?: Pick<CanonicalWriteMatchedCounts, "messages" | "attachments">;
  diagnostics?: InboundDiagnostic[];
};

export type CanonicalWriteResult = {
  conversationId?: string | null;
  participantResolutionMap: ParticipantResolutionMap;
  messageIds: string[];
  attachmentIds: string[];
  insertedCounts: InboundInsertedCounts;
  matchedCounts?: CanonicalWriteMatchedCounts;
  diagnostics?: InboundDiagnostic[];
};

export type ConversationParticipantsWriteHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
  batch: IngestionBatch;
  dedupeDecision: DedupeDecision;
}) => Promise<ConversationParticipantsWriteResult>;

export type MessageAttachmentWriteHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
  batch: IngestionBatch;
  dedupeDecision: DedupeDecision;
  conversationParticipantsResult: ConversationParticipantsWriteResult;
}) => Promise<MessageAttachmentWriteResult>;

export interface CanonicalPersistenceWriter<TParsedPayload = unknown> {
  upsertConversationAndParticipants: ConversationParticipantsWriteHandler<TParsedPayload>;
  upsertMessagesAndAttachments: MessageAttachmentWriteHandler<TParsedPayload>;
}

export type CanonicalWriteHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
  batch: IngestionBatch;
  dedupeDecision: DedupeDecision;
}) => Promise<CanonicalWriteResult>;

export function buildCanonicalWriteResult(input: {
  conversationParticipantsResult: ConversationParticipantsWriteResult;
  messageAttachmentResult: MessageAttachmentWriteResult;
  diagnostics?: InboundDiagnostic[];
}) {
  const diagnostics = [
    ...(input.conversationParticipantsResult.diagnostics ?? []),
    ...(input.messageAttachmentResult.diagnostics ?? []),
    ...(input.diagnostics ?? []),
  ];

  return {
    conversationId: input.conversationParticipantsResult.conversationId,
    participantResolutionMap:
      input.conversationParticipantsResult.participantResolutionMap,
    messageIds: input.messageAttachmentResult.messageIds,
    attachmentIds: input.messageAttachmentResult.attachmentIds,
    insertedCounts: {
      conversations: input.conversationParticipantsResult.insertedCounts.conversations,
      participants: input.conversationParticipantsResult.insertedCounts.participants,
      messages: input.messageAttachmentResult.insertedCounts.messages,
      attachments: input.messageAttachmentResult.insertedCounts.attachments,
    },
    matchedCounts: {
      conversations:
        input.conversationParticipantsResult.matchedCounts?.conversations ?? 0,
      participants:
        input.conversationParticipantsResult.matchedCounts?.participants ?? 0,
      messages: input.messageAttachmentResult.matchedCounts?.messages ?? 0,
      attachments:
        input.messageAttachmentResult.matchedCounts?.attachments ?? 0,
    },
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  } satisfies CanonicalWriteResult;
}

export function createNoOpCanonicalPersistenceWriter<
  TParsedPayload = unknown,
>(): CanonicalPersistenceWriter<TParsedPayload> {
  return {
    async upsertConversationAndParticipants() {
      return {
        conversationId: "",
        participantResolutionMap: {},
        insertedCounts: {
          conversations: 0,
          participants: 0,
        },
      };
    },
    async upsertMessagesAndAttachments() {
      return {
        messageIds: [],
        attachmentIds: [],
        insertedCounts: {
          messages: 0,
          attachments: 0,
        },
      };
    },
  };
}

export function createCanonicalWriteHandler<TParsedPayload = unknown>(
  writer: CanonicalPersistenceWriter<TParsedPayload>,
): CanonicalWriteHandler<TParsedPayload> {
  return async (input) => {
    const conversationParticipantsResult =
      await writer.upsertConversationAndParticipants(input);
    const messageAttachmentResult =
      await writer.upsertMessagesAndAttachments({
        ...input,
        conversationParticipantsResult,
      });

    return buildCanonicalWriteResult({
      conversationParticipantsResult,
      messageAttachmentResult,
    });
  };
}
