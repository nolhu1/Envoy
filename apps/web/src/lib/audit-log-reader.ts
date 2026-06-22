import "server-only";

import { getPrisma } from "@envoy/db";

import {
  formatOperatorType,
  parsePositiveLimit,
  readOperatorDate,
  readOperatorString,
  readPayloadString,
  sanitizeOperatorMetadata,
  summarizeOperatorMetadata,
} from "@/lib/operator-utils";

export type AuditLogReaderFilters = {
  actorType?: string | null;
  actionType?: string | null;
  resourceType?: string | null;
  platform?: string | null;
  conversationId?: string | null;
  approvalRequestId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number | string | null;
};

export type OperatorAuditRow = {
  id: string;
  kind: "action" | "event";
  timestamp: Date;
  actor: string;
  actionOrEventType: string;
  resourceType: string | null;
  resourceId: string | null;
  platform: "EMAIL" | null;
  status: string | null;
  severity: "critical" | "warning" | "success" | "info" | "neutral";
  conversationId: string | null;
  messageId: string | null;
  approvalRequestId: string | null;
  runtimeJobId: string | null;
  summary: string;
  metadataSummary: string;
  metadataJson: Record<string, unknown>;
  attemptSummary: string | null;
};

function normalizePlatform(
  value: string | null | undefined,
): "EMAIL" | null {
  const normalized = value?.toUpperCase();

  return normalized === "EMAIL" ? normalized : null;
}

function normalizeDateRange(filters: AuditLogReaderFilters) {
  const from = readOperatorDate(filters.from);
  const to = readOperatorDate(filters.to);

  return {
    gte: from ?? undefined,
    lte: to ?? undefined,
  };
}

function statusSeverity(status: string | null): OperatorAuditRow["severity"] {
  if (!status) {
    return "neutral";
  }

  if (["FAILED", "DEAD_LETTERED", "REJECTED", "ERROR"].includes(status)) {
    return "critical";
  }

  if (["PENDING", "PROCESSING", "RUNNING", "QUEUED"].includes(status)) {
    return "warning";
  }

  if (["PROCESSED", "SUCCEEDED", "COMPLETED", "APPROVED"].includes(status)) {
    return "success";
  }

  return "neutral";
}

function actionActor(row: {
  actorType: string;
  actorUserId: string | null;
  actorAgentAssignmentId: string | null;
}) {
  if (row.actorUserId) {
    return `${formatOperatorType(row.actorType)} user:${row.actorUserId}`;
  }

  if (row.actorAgentAssignmentId) {
    return `${formatOperatorType(row.actorType)} assignment:${row.actorAgentAssignmentId}`;
  }

  return formatOperatorType(row.actorType);
}

function eventAttemptSummary(
  attempts: Array<{
    consumer: string;
    status: string;
    attempt: number;
  }>,
) {
  if (attempts.length === 0) {
    return null;
  }

  return attempts
    .slice(0, 3)
    .map((attempt) => `${attempt.consumer}: ${attempt.status} #${attempt.attempt}`)
    .join(" | ");
}

export async function listOperatorAuditRows(input: {
  workspaceId: string;
  filters?: AuditLogReaderFilters;
}) {
  const prisma = getPrisma();
  const filters = input.filters ?? {};
  const limit = parsePositiveLimit(filters.limit, 150, 500);
  const dateRange = normalizeDateRange(filters);
  const platform = normalizePlatform(filters.platform);
  const actorType = readOperatorString(filters.actorType);
  const eventStatus = readOperatorString(filters.status);
  const [actions, events] = await Promise.all([
    prisma.actionLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        actorType: actorType ? (actorType as never) : undefined,
        actionType: readOperatorString(filters.actionType) ?? undefined,
        conversationId: readOperatorString(filters.conversationId) ?? undefined,
        approvalRequestId:
          readOperatorString(filters.approvalRequestId) ?? undefined,
        createdAt:
          dateRange.gte || dateRange.lte ? dateRange : undefined,
        conversation: { platform: platform ?? "EMAIL" },
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        actionType: true,
        actorType: true,
        actorUserId: true,
        actorAgentAssignmentId: true,
        conversationId: true,
        messageId: true,
        approvalRequestId: true,
        metadataJson: true,
        conversation: {
          select: {
            platform: true,
            subject: true,
          },
        },
      },
    }),
    prisma.eventJournal.findMany({
      where: {
        workspaceId: input.workspaceId,
        eventType: readOperatorString(filters.actionType) ?? undefined,
        entityType: readOperatorString(filters.resourceType) ?? undefined,
        status: eventStatus ? (eventStatus as never) : undefined,
        occurredAt:
          dateRange.gte || dateRange.lte ? dateRange : undefined,
      },
      orderBy: [{ occurredAt: "desc" }],
      take: limit,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        entityType: true,
        entityId: true,
        source: true,
        status: true,
        occurredAt: true,
        payloadJson: true,
        metadataJson: true,
        processingAttempts: {
          orderBy: [{ startedAt: "desc" }],
          take: 4,
          select: {
            consumer: true,
            status: true,
            attempt: true,
            workerJobId: true,
          },
        },
      },
    }),
  ]);
  const rows: OperatorAuditRow[] = [
    ...actions.map((row) => {
      const metadata = sanitizeOperatorMetadata(row.metadataJson);
      return {
        id: row.id,
        kind: "action" as const,
        timestamp: row.createdAt,
        actor: actionActor(row),
        actionOrEventType: row.actionType,
        resourceType: "conversation",
        resourceId: row.conversationId,
        platform: "EMAIL",
        status: null,
        severity: "neutral" as const,
        conversationId: row.conversationId,
        messageId: row.messageId,
        approvalRequestId: row.approvalRequestId,
        runtimeJobId: readPayloadString(metadata, "runtimeJobId"),
        summary:
          row.conversation.subject ??
          `${formatOperatorType(row.actionType)} action log`,
        metadataSummary: summarizeOperatorMetadata(metadata),
        metadataJson: metadata,
        attemptSummary: null,
      };
    }),
    ...events.map((row) => {
      const payload = sanitizeOperatorMetadata(row.payloadJson);
      const rawPlatform = readPayloadString(payload, "platform")?.toUpperCase();
      const metadata = sanitizeOperatorMetadata(row.metadataJson);
      const messageId =
        readPayloadString(payload, "messageId") ??
        (row.entityType === "message" ? row.entityId : null);
      const approvalRequestId =
        readPayloadString(payload, "approvalRequestId") ??
        (row.entityType === "approval_request" ? row.entityId : null);
      const runtimeJobId =
        row.processingAttempts.find((attempt) => attempt.workerJobId)
          ?.workerJobId ??
        readPayloadString(payload, "runtimeJobId");

      return {
        id: row.id,
        kind: "event" as const,
        timestamp: row.occurredAt,
        actor: formatOperatorType(row.source),
        actionOrEventType: row.eventType,
        resourceType: row.entityType,
        resourceId: row.entityId,
        platform: normalizePlatform(rawPlatform),
        status: row.status,
        severity: statusSeverity(row.status),
        conversationId:
          readPayloadString(payload, "conversationId") ??
          (row.entityType === "conversation" ? row.entityId : null),
        messageId,
        approvalRequestId,
        runtimeJobId,
        summary: `${formatOperatorType(row.eventType)} on ${formatOperatorType(
          row.entityType,
        )}`,
        metadataSummary: summarizeOperatorMetadata({
          ...metadata,
          payload,
        }),
        metadataJson: {
          ...metadata,
          payload,
        },
        attemptSummary: eventAttemptSummary(row.processingAttempts),
      };
    }),
  ]
    .filter((row) => {
      if (platform && row.platform !== platform) {
        return false;
      }

      if (
        row.metadataJson.payload &&
        typeof row.metadataJson.payload === "object" &&
        !Array.isArray(row.metadataJson.payload)
      ) {
        const payloadPlatform = readPayloadString(
          row.metadataJson.payload,
          "platform",
        )?.toUpperCase();

        if (payloadPlatform && payloadPlatform !== "EMAIL") {
          return false;
        }
      }

      if (
        filters.conversationId &&
        row.conversationId !== readOperatorString(filters.conversationId)
      ) {
        return false;
      }

      if (
        filters.approvalRequestId &&
        row.approvalRequestId !== readOperatorString(filters.approvalRequestId)
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, limit);

  return rows;
}
