import "server-only";

import { getPrisma } from "@envoy/db";
import {
  ENVOY_EVENT_TYPES,
  type EnvoyEvent,
  type EnvoyEventType,
} from "@envoy/events";

import { sanitizeDiagnostics } from "@/lib/security";

export const CANONICAL_ACTION_LOG_TYPES = {
  INTEGRATION_CONNECTED: "INTEGRATION_CONNECTED",
  INTEGRATION_DISCONNECTED: "INTEGRATION_DISCONNECTED",
  INTEGRATION_SYNC_STARTED: "INTEGRATION_SYNC_STARTED",
  INTEGRATION_SYNC_COMPLETED: "INTEGRATION_SYNC_COMPLETED",
  INTEGRATION_SYNC_FAILED: "INTEGRATION_SYNC_FAILED",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGE_SENT: "MESSAGE_SENT",
  MESSAGE_SEND_FAILED: "MESSAGE_SEND_FAILED",
  MESSAGE_DRAFT_CREATED: "MESSAGE_DRAFT_CREATED",
  AGENT_ASSIGNED: "AGENT_ASSIGNED",
  AGENT_UNASSIGNED: "AGENT_UNASSIGNED",
  AGENT_RUN_REQUESTED: "AGENT_RUN_REQUESTED",
  AGENT_RUN_COMPLETED: "AGENT_RUN_COMPLETED",
  APPROVAL_REQUESTED: "APPROVAL_REQUESTED",
  APPROVAL_APPROVED: "APPROVAL_APPROVED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
} as const;

type ActorType = "USER" | "AGENT" | "SYSTEM" | "INTEGRATION";

type ActionLogActorContext = {
  actorType?: ActorType | null;
  actorUserId?: string | null;
  actorAgentAssignmentId?: string | null;
};

type AppendWorkspaceActionLogInput = {
  workspaceId: string;
  actionType: string;
  conversationId?: string | null;
  messageId?: string | null;
  approvalRequestId?: string | null;
  integrationId?: string | null;
  metadata?: Record<string, unknown> | null;
  actor?: ActionLogActorContext | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveActorType(actor?: ActionLogActorContext | null): ActorType {
  if (actor?.actorType) {
    return actor.actorType;
  }

  if (actor?.actorUserId) {
    return "USER";
  }

  if (actor?.actorAgentAssignmentId) {
    return "AGENT";
  }

  return "SYSTEM";
}

async function resolveAuditConversationId(input: {
  workspaceId: string;
  conversationId?: string | null;
  messageId?: string | null;
  approvalRequestId?: string | null;
  integrationId?: string | null;
}) {
  if (input.conversationId) {
    return input.conversationId;
  }

  const prisma = getPrisma();

  if (input.messageId) {
    const message = await prisma.message.findFirst({
      where: {
        id: input.messageId,
        workspaceId: input.workspaceId,
      },
      select: {
        conversationId: true,
      },
    });

    if (message?.conversationId) {
      return message.conversationId;
    }
  }

  if (input.approvalRequestId) {
    const approval = await prisma.approvalRequest.findFirst({
      where: {
        id: input.approvalRequestId,
        workspaceId: input.workspaceId,
      },
      select: {
        conversationId: true,
      },
    });

    if (approval?.conversationId) {
      return approval.conversationId;
    }
  }

  if (input.integrationId) {
    const byIntegration = await prisma.conversation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        deletedAt: null,
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
      },
    });

    if (byIntegration?.id) {
      return byIntegration.id;
    }
  }

  const fallback = await prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      deletedAt: null,
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
    },
  });

  return fallback?.id ?? null;
}

export async function appendWorkspaceActionLog(
  input: AppendWorkspaceActionLogInput,
) {
  const conversationId = await resolveAuditConversationId({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    approvalRequestId: input.approvalRequestId,
    integrationId: input.integrationId,
  });

  if (!conversationId) {
    return null;
  }

  const prisma = getPrisma();
  const metadataJson = sanitizeDiagnostics({
    ...(isObject(input.metadata) ? input.metadata : {}),
    linkage: {
      integrationId: input.integrationId ?? null,
      conversationId,
      messageId: input.messageId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      usedConversationFallback:
        input.conversationId !== conversationId ||
        (!input.conversationId && Boolean(input.integrationId)),
    },
  });

  return prisma.actionLog.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId,
      messageId: input.messageId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      actorType: resolveActorType(input.actor),
      actorUserId: input.actor?.actorUserId ?? null,
      actorAgentAssignmentId: input.actor?.actorAgentAssignmentId ?? null,
      actionType: input.actionType,
      metadataJson: metadataJson as never,
    },
    select: {
      id: true,
    },
  });
}

function resolveActionTypeFromEvent(
  eventType: EnvoyEventType,
) {
  switch (eventType) {
    case ENVOY_EVENT_TYPES.INTEGRATION_CONNECTED:
      return CANONICAL_ACTION_LOG_TYPES.INTEGRATION_CONNECTED;
    case ENVOY_EVENT_TYPES.INTEGRATION_DISCONNECTED:
      return CANONICAL_ACTION_LOG_TYPES.INTEGRATION_DISCONNECTED;
    case ENVOY_EVENT_TYPES.INTEGRATION_SYNC_STARTED:
      return CANONICAL_ACTION_LOG_TYPES.INTEGRATION_SYNC_STARTED;
    case ENVOY_EVENT_TYPES.INTEGRATION_SYNC_COMPLETED:
      return CANONICAL_ACTION_LOG_TYPES.INTEGRATION_SYNC_COMPLETED;
    case ENVOY_EVENT_TYPES.INTEGRATION_SYNC_FAILED:
      return CANONICAL_ACTION_LOG_TYPES.INTEGRATION_SYNC_FAILED;
    case ENVOY_EVENT_TYPES.MESSAGE_RECEIVED:
      return CANONICAL_ACTION_LOG_TYPES.MESSAGE_RECEIVED;
    case ENVOY_EVENT_TYPES.MESSAGE_SENT:
      return CANONICAL_ACTION_LOG_TYPES.MESSAGE_SENT;
    case ENVOY_EVENT_TYPES.MESSAGE_SEND_FAILED:
      return CANONICAL_ACTION_LOG_TYPES.MESSAGE_SEND_FAILED;
    case ENVOY_EVENT_TYPES.MESSAGE_DRAFT_CREATED:
      return CANONICAL_ACTION_LOG_TYPES.MESSAGE_DRAFT_CREATED;
    case ENVOY_EVENT_TYPES.AGENT_ASSIGNED:
      return CANONICAL_ACTION_LOG_TYPES.AGENT_ASSIGNED;
    case ENVOY_EVENT_TYPES.AGENT_UNASSIGNED:
      return CANONICAL_ACTION_LOG_TYPES.AGENT_UNASSIGNED;
    case ENVOY_EVENT_TYPES.AGENT_RUN_REQUESTED:
      return CANONICAL_ACTION_LOG_TYPES.AGENT_RUN_REQUESTED;
    case ENVOY_EVENT_TYPES.AGENT_RUN_COMPLETED:
      return CANONICAL_ACTION_LOG_TYPES.AGENT_RUN_COMPLETED;
    case ENVOY_EVENT_TYPES.APPROVAL_REQUESTED:
      return CANONICAL_ACTION_LOG_TYPES.APPROVAL_REQUESTED;
    case ENVOY_EVENT_TYPES.APPROVAL_APPROVED:
      return CANONICAL_ACTION_LOG_TYPES.APPROVAL_APPROVED;
    case ENVOY_EVENT_TYPES.APPROVAL_REJECTED:
      return CANONICAL_ACTION_LOG_TYPES.APPROVAL_REJECTED;
    default:
      return null;
  }
}

export async function appendActionLogForEnvoyEvent(event: EnvoyEvent) {
  const actionType = resolveActionTypeFromEvent(event.eventType);

  if (!actionType) {
    return null;
  }

  const payload: Record<string, unknown> = isObject(event.payload)
    ? event.payload
    : {};

  return appendWorkspaceActionLog({
    workspaceId: event.workspaceId,
    actionType,
    conversationId:
      typeof payload.conversationId === "string"
        ? payload.conversationId
        : null,
    messageId:
      typeof payload.messageId === "string" ? payload.messageId : null,
    approvalRequestId:
      typeof payload.approvalRequestId === "string"
        ? payload.approvalRequestId
        : null,
    integrationId:
      typeof payload.integrationId === "string"
        ? payload.integrationId
        : null,
    actor:
      event.source === "api" || event.source === "ui"
        ? {
            actorType: "USER",
          }
        : event.source === "connector"
          ? {
              actorType: "INTEGRATION",
            }
          : {
              actorType: "SYSTEM",
            },
    metadata: {
      eventId: event.eventId,
      eventType: event.eventType,
      eventSource: event.source,
      occurredAt: event.occurredAt,
      payload,
    },
  });
}
