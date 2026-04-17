import "server-only";

import {
  AGENT_TRIGGER_TYPES,
  getPrisma,
  type AgentTriggerContext,
  type AgentTriggerType,
} from "@envoy/db";
import {
  CONVERSATION_STATES,
  ENVOY_EVENT_TYPES,
  isTerminalConversationState,
  type EnvoyEvent,
} from "@envoy/events";

import { generateDraftAndCreateApprovalForWorkspace } from "@/lib/agent-draft-flow";
import {
  isAgentTriggerEnabled,
} from "@/lib/agent-trigger-rules";
import { toSafeErrorSummary } from "@/lib/agent-run-logging";

const AUTOMATIC_AGENT_TRIGGER_ACTION_TYPES = {
  TRIGGER_RECEIVED: "AGENT_AUTO_TRIGGER_RECEIVED",
  TRIGGER_SUPPRESSED: "AGENT_AUTO_TRIGGER_SUPPRESSED",
  TRIGGER_EXECUTED: "AGENT_AUTO_TRIGGER_EXECUTED",
  TRIGGER_FAILED: "AGENT_AUTO_TRIGGER_FAILED",
} as const;

const AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS = {
  CONVERSATION_NOT_FOUND: "conversation_not_found",
  NO_ACTIVE_ASSIGNMENT: "no_active_assignment",
  TERMINAL_STATE: "terminal_state",
  DUPLICATE_IN_PROGRESS: "duplicate_trigger_in_progress",
  UNRESOLVED_APPROVAL_PATH: "unresolved_approval_path",
  TRIGGER_DISABLED: "trigger_disabled",
  DUPLICATE_SOURCE_ALREADY_PROCESSED: "duplicate_source_already_processed",
} as const;

type AutomaticAgentTriggerSuppressionReason =
  (typeof AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS)[keyof typeof AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS];

type AutomaticAgentTriggerEventContext = {
  workspaceId: string;
  conversationId: string;
  triggerType: AgentTriggerType;
  trigger: AgentTriggerContext;
  sourceEventId: string;
  sourceEventType: string;
  sourceEventSource: string;
};

type AutomaticAgentTriggerParseResult =
  | {
      status: "ignored";
      reason: string;
    }
  | ({
      status: "accepted";
    } & AutomaticAgentTriggerEventContext);

const globalForAutomaticAgentRuntime = globalThis as typeof globalThis & {
  envoyAutomaticAgentTriggerLocks?: Set<string>;
};

function getAutomaticAgentRuntimeLocks() {
  if (!globalForAutomaticAgentRuntime.envoyAutomaticAgentTriggerLocks) {
    globalForAutomaticAgentRuntime.envoyAutomaticAgentTriggerLocks = new Set();
  }

  return globalForAutomaticAgentRuntime.envoyAutomaticAgentTriggerLocks;
}

function buildAutomaticTriggerLockKey(
  context: AutomaticAgentTriggerEventContext,
) {
  return [
    context.workspaceId,
    context.conversationId,
    context.triggerType,
    context.trigger.sourceMessageId ?? "none",
    context.trigger.sourceApprovalRequestId ?? "none",
  ].join(":");
}

function parseAutomaticAgentTriggerFromEvent(
  event: EnvoyEvent,
): AutomaticAgentTriggerParseResult {
  if (event.eventType === ENVOY_EVENT_TYPES.MESSAGE_RECEIVED) {
    const payload = event.payload;
    const conversationId = payload.conversationId?.trim();
    const messageId = payload.messageId?.trim();

    if (!conversationId || !messageId) {
      return {
        status: "ignored",
        reason: "message_received event is missing canonical ids.",
      };
    }

    if (payload.direction && payload.direction !== "INBOUND") {
      return {
        status: "ignored",
        reason: "message_received event is not inbound.",
      };
    }

    return {
      status: "accepted",
      workspaceId: event.workspaceId,
      conversationId,
      triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
      sourceEventId: event.eventId,
      sourceEventType: event.eventType,
      sourceEventSource: event.source,
      trigger: {
        triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
        triggerReason:
          "Automatic run after canonical inbound message ingestion.",
        sourceMessageId: messageId,
        metadata: {
          automatic: true,
          sourceEventId: event.eventId,
          sourceEventType: event.eventType,
          sourceEventSource: event.source,
        },
      },
    };
  }

  if (event.eventType === ENVOY_EVENT_TYPES.APPROVAL_REJECTED) {
    const payload = event.payload;
    const conversationId = payload.conversationId?.trim();
    const approvalRequestId = payload.approvalRequestId?.trim();

    if (!conversationId || !approvalRequestId) {
      return {
        status: "ignored",
        reason: "approval_rejected event is missing canonical ids.",
      };
    }

    return {
      status: "accepted",
      workspaceId: event.workspaceId,
      conversationId,
      triggerType: AGENT_TRIGGER_TYPES.APPROVAL_REJECTED,
      sourceEventId: event.eventId,
      sourceEventType: event.eventType,
      sourceEventSource: event.source,
      trigger: {
        triggerType: AGENT_TRIGGER_TYPES.APPROVAL_REJECTED,
        triggerReason:
          "Automatic run after approval rejection for draft revision.",
        sourceApprovalRequestId: approvalRequestId,
        metadata: {
          automatic: true,
          rejectionReason: payload.rejectionReason ?? null,
          reviewedByUserId: payload.reviewedByUserId ?? null,
          sourceEventId: event.eventId,
          sourceEventType: event.eventType,
          sourceEventSource: event.source,
        },
      },
    };
  }

  return {
    status: "ignored",
    reason: `Unsupported event type ${event.eventType}.`,
  };
}

async function createAutomaticTriggerAuditLog(input: {
  workspaceId: string;
  conversationId: string;
  actorAgentAssignmentId?: string | null;
  actionType: string;
  metadata: Record<string, unknown>;
  messageId?: string | null;
  approvalRequestId?: string | null;
}) {
  const prisma = getPrisma();

  return prisma.actionLog.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      actorType: "SYSTEM",
      actorAgentAssignmentId: input.actorAgentAssignmentId ?? null,
      actionType: input.actionType,
      metadataJson: input.metadata as never,
    },
    select: {
      id: true,
    },
  });
}

async function logSuppressedAutomaticTrigger(input: {
  context: AutomaticAgentTriggerEventContext;
  reason: AutomaticAgentTriggerSuppressionReason;
  summary: string;
  actorAgentAssignmentId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await createAutomaticTriggerAuditLog({
    workspaceId: input.context.workspaceId,
    conversationId: input.context.conversationId,
    actorAgentAssignmentId: input.actorAgentAssignmentId ?? null,
    actionType: AUTOMATIC_AGENT_TRIGGER_ACTION_TYPES.TRIGGER_SUPPRESSED,
    metadata: {
      triggerType: input.context.triggerType,
      reason: input.reason,
      summary: input.summary,
      sourceEventId: input.context.sourceEventId,
      sourceEventType: input.context.sourceEventType,
      sourceEventSource: input.context.sourceEventSource,
      sourceMessageId: input.context.trigger.sourceMessageId ?? null,
      sourceApprovalRequestId:
        input.context.trigger.sourceApprovalRequestId ?? null,
      ...(input.metadata ?? {}),
    },
  });
}

async function hasExistingDraftFromTriggerSource(input: {
  workspaceId: string;
  conversationId: string;
  trigger: AgentTriggerContext;
}) {
  const prisma = getPrisma();

  if (input.trigger.sourceMessageId) {
    const existingByMessage = await prisma.message.findFirst({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        senderType: "AGENT",
        direction: "OUTBOUND",
        deletedAt: null,
        platformMetadataJson: {
          path: ["generationMetadata", "trigger", "sourceMessageId"],
          equals: input.trigger.sourceMessageId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingByMessage) {
      return true;
    }
  }

  if (input.trigger.sourceApprovalRequestId) {
    const existingByApproval = await prisma.message.findFirst({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        senderType: "AGENT",
        direction: "OUTBOUND",
        deletedAt: null,
        platformMetadataJson: {
          path: ["generationMetadata", "trigger", "sourceApprovalRequestId"],
          equals: input.trigger.sourceApprovalRequestId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingByApproval) {
      return true;
    }
  }

  return false;
}

export async function executeAutomaticAgentTriggerForEvent(
  event: EnvoyEvent,
) {
  const parsed = parseAutomaticAgentTriggerFromEvent(event);

  if (parsed.status === "ignored") {
    return parsed;
  }

  const lockKey = buildAutomaticTriggerLockKey(parsed);
  const runtimeLocks = getAutomaticAgentRuntimeLocks();

  if (runtimeLocks.has(lockKey)) {
    await logSuppressedAutomaticTrigger({
      context: parsed,
      reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_IN_PROGRESS,
      summary:
        "Automatic trigger suppressed because an equivalent run is already in progress.",
    });
    return {
      status: "suppressed" as const,
      reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_IN_PROGRESS,
    };
  }

  runtimeLocks.add(lockKey);

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parsed.conversationId,
        workspaceId: parsed.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        state: true,
        assignedAgentId: true,
        assignedAgent: {
          select: {
            id: true,
            isActive: true,
            allowedActionsJson: true,
            escalationRulesJson: true,
          },
        },
        approvalRequests: {
          where: {
            status: "PENDING",
          },
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (!conversation) {
      return {
        status: "suppressed" as const,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.CONVERSATION_NOT_FOUND,
      };
    }

    if (!conversation.assignedAgent || !conversation.assignedAgent.isActive) {
      await logSuppressedAutomaticTrigger({
        context: parsed,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.NO_ACTIVE_ASSIGNMENT,
        summary:
          "Automatic trigger suppressed because no active assignment exists.",
        actorAgentAssignmentId: conversation.assignedAgentId ?? null,
      });
      return {
        status: "suppressed" as const,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.NO_ACTIVE_ASSIGNMENT,
      };
    }

    if (
      !isAgentTriggerEnabled({
        escalationRulesJson: conversation.assignedAgent.escalationRulesJson,
        triggerType: parsed.triggerType,
        fallbackEnabled: true,
      })
    ) {
      await logSuppressedAutomaticTrigger({
        context: parsed,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TRIGGER_DISABLED,
        summary:
          "Automatic trigger suppressed because assignment trigger rules disable this trigger type.",
        actorAgentAssignmentId: conversation.assignedAgent.id,
      });
      return {
        status: "suppressed" as const,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TRIGGER_DISABLED,
      };
    }

    if (isTerminalConversationState(conversation.state)) {
      await logSuppressedAutomaticTrigger({
        context: parsed,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TERMINAL_STATE,
        summary:
          "Automatic trigger suppressed because the conversation is in a terminal state.",
        actorAgentAssignmentId: conversation.assignedAgent.id,
        metadata: {
          conversationState: conversation.state,
        },
      });
      return {
        status: "suppressed" as const,
        reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TERMINAL_STATE,
      };
    }

    if (
      conversation.state === CONVERSATION_STATES.AWAITING_APPROVAL ||
      conversation.approvalRequests.length > 0
    ) {
      await logSuppressedAutomaticTrigger({
        context: parsed,
        reason:
          AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.UNRESOLVED_APPROVAL_PATH,
        summary:
          "Automatic trigger suppressed because this conversation already has an unresolved approval path.",
        actorAgentAssignmentId: conversation.assignedAgent.id,
      });
      return {
        status: "suppressed" as const,
        reason:
          AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.UNRESOLVED_APPROVAL_PATH,
      };
    }

    const alreadyProcessedSource = await hasExistingDraftFromTriggerSource({
      workspaceId: parsed.workspaceId,
      conversationId: parsed.conversationId,
      trigger: parsed.trigger,
    });

    if (alreadyProcessedSource) {
      await logSuppressedAutomaticTrigger({
        context: parsed,
        reason:
          AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_SOURCE_ALREADY_PROCESSED,
        summary:
          "Automatic trigger suppressed because this source trigger already produced a draft path.",
        actorAgentAssignmentId: conversation.assignedAgent.id,
      });
      return {
        status: "suppressed" as const,
        reason:
          AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_SOURCE_ALREADY_PROCESSED,
      };
    }

    await createAutomaticTriggerAuditLog({
      workspaceId: parsed.workspaceId,
      conversationId: parsed.conversationId,
      actorAgentAssignmentId: conversation.assignedAgent.id,
      actionType: AUTOMATIC_AGENT_TRIGGER_ACTION_TYPES.TRIGGER_RECEIVED,
      metadata: {
        triggerType: parsed.triggerType,
        sourceEventId: parsed.sourceEventId,
        sourceEventType: parsed.sourceEventType,
        sourceEventSource: parsed.sourceEventSource,
        sourceMessageId: parsed.trigger.sourceMessageId ?? null,
        sourceApprovalRequestId: parsed.trigger.sourceApprovalRequestId ?? null,
      },
    });

    const flowResult = await generateDraftAndCreateApprovalForWorkspace({
      workspaceId: parsed.workspaceId,
      actorUserId: null,
      conversationId: parsed.conversationId,
      trigger: parsed.trigger,
      skipPermissionCheck: true,
    });

    await createAutomaticTriggerAuditLog({
      workspaceId: parsed.workspaceId,
      conversationId: parsed.conversationId,
      actorAgentAssignmentId: conversation.assignedAgent.id,
      actionType: AUTOMATIC_AGENT_TRIGGER_ACTION_TYPES.TRIGGER_EXECUTED,
      messageId: flowResult.approval?.draftMessageId ?? null,
      approvalRequestId: flowResult.approval?.approvalRequestId ?? null,
      metadata: {
        triggerType: parsed.triggerType,
        sourceEventId: parsed.sourceEventId,
        sourceEventType: parsed.sourceEventType,
        sourceEventSource: parsed.sourceEventSource,
        flowStatus: flowResult.status,
        escalationReasonCode: flowResult.escalation.escalationReasonCode ?? null,
      },
    });

    return {
      status: "executed" as const,
      flowStatus: flowResult.status,
      approvalRequestId: flowResult.approval?.approvalRequestId ?? null,
    };
  } catch (error) {
    const safeError = toSafeErrorSummary(error);
    await createAutomaticTriggerAuditLog({
      workspaceId: parsed.workspaceId,
      conversationId: parsed.conversationId,
      actionType: AUTOMATIC_AGENT_TRIGGER_ACTION_TYPES.TRIGGER_FAILED,
      metadata: {
        triggerType: parsed.triggerType,
        sourceEventId: parsed.sourceEventId,
        sourceEventType: parsed.sourceEventType,
        sourceEventSource: parsed.sourceEventSource,
        error: safeError,
      },
    });

    return {
      status: "failed" as const,
      error: safeError,
    };
  } finally {
    runtimeLocks.delete(lockKey);
  }
}
