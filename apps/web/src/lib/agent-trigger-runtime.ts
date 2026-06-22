import {
  createPrismaIdempotencyService,
  getPrisma,
  type AgentTriggerContext,
} from "../../../../packages/db/src/index";
import {
  CONVERSATION_STATES,
  isTerminalConversationState,
  type EnvoyEvent,
} from "../../../../packages/events/src/index";
import type { AgentRunFromTriggerJobPayload } from "../../../worker/src/jobs";

import { generateDraftAndCreateApprovalForWorkspace } from "./agent-draft-flow";
import {
  isAgentTriggerEnabled,
} from "./agent-trigger-rules";
import { toSafeErrorSummary } from "./agent-run-logging";
import {
  buildAutomaticTriggerIdempotencyKey,
  parseAutomaticAgentTriggerFromEvent,
  type AutomaticAgentTriggerEventContext,
} from "./agent-trigger-contract";

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

const agentTriggerIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "worker:auto-agent-trigger",
});

type AutomaticAgentTriggerSuppressionReason =
  (typeof AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS)[keyof typeof AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS];

export type AutomaticAgentTriggerExecutionResult =
  | {
      status: "ignored";
      reason: string;
    }
  | {
      status: "suppressed";
      reason: string;
    }
  | {
      status: "executed";
      flowStatus: string;
      approvalRequestId: string | null;
      draftMessageId: string | null;
      escalationReasonCode: string | null;
      provider: string | null;
      model: string | null;
      promptVersion: string | null;
    }
  | {
      status: "failed";
      error: unknown;
    };

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

async function completeAutomaticTriggerIdempotency(input: {
  context: AutomaticAgentTriggerEventContext;
  resultSummaryJson: Record<string, unknown>;
}) {
  await agentTriggerIdempotencyService.complete({
    key: buildAutomaticTriggerIdempotencyKey(input.context),
    resultSummaryJson: {
      workspaceId: input.context.workspaceId,
      conversationId: input.context.conversationId,
      triggerType: input.context.triggerType,
      sourceEventId: input.context.sourceEventId,
      ...input.resultSummaryJson,
    },
  });
}

function toEnvoyEventFromJournalRecord(record: {
  eventId: string;
  workspaceId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  source: string;
  version: number;
  occurredAt: Date;
  payloadJson: unknown;
}): EnvoyEvent {
  return {
    eventId: record.eventId,
    workspaceId: record.workspaceId,
    eventType: record.eventType,
    entityType: record.entityType,
    entityId: record.entityId,
    source: record.source,
    version: record.version,
    occurredAt: record.occurredAt.toISOString(),
    payload: record.payloadJson,
  } as EnvoyEvent;
}

export async function executeAutomaticAgentTriggerFromJob(
  payload: AgentRunFromTriggerJobPayload,
): Promise<AutomaticAgentTriggerExecutionResult> {
  if (payload.triggerType === "follow_up_due") {
    return executeAutomaticAgentTriggerForContext({
      workspaceId: payload.workspaceId,
      conversationId: payload.conversationId,
      triggerType: payload.triggerType,
      sourceEventId: payload.sourceEventId,
      sourceEventType: null,
      sourceEventSource: "follow_up_scheduler",
      trigger: {
        triggerType: payload.triggerType,
        triggerReason: "Follow-up due evaluation requested a draft.",
        metadata: {
          automatic: true,
          requestedAt: payload.requestedAt,
          runtimeTrigger: "follow_up_due",
          dedupeBucket: payload.requestedAt.slice(0, 13),
        },
      },
    });
  }

  if (!payload.sourceEventId) {
    throw new Error("Agent trigger job requires a source event for this trigger type.");
  }

  const prisma = getPrisma();
  const eventJournal = await prisma.eventJournal.findUnique({
    where: {
      eventId: payload.sourceEventId,
    },
    select: {
      eventId: true,
      workspaceId: true,
      eventType: true,
      entityType: true,
      entityId: true,
      source: true,
      version: true,
      occurredAt: true,
      payloadJson: true,
    },
  });

  if (!eventJournal) {
    throw new Error("Source event journal record could not be loaded.");
  }

  if (eventJournal.workspaceId !== payload.workspaceId) {
    throw new Error("Source event workspace does not match agent job payload.");
  }

  const parsed = parseAutomaticAgentTriggerFromEvent(
    toEnvoyEventFromJournalRecord(eventJournal),
  );

  if (parsed.status === "ignored") {
    return parsed;
  }

  if (
    parsed.workspaceId !== payload.workspaceId ||
    parsed.conversationId !== payload.conversationId ||
    parsed.triggerType !== payload.triggerType ||
    (parsed.trigger.sourceMessageId ?? null) !== payload.sourceMessageId ||
    (parsed.trigger.sourceApprovalRequestId ?? null) !==
      payload.sourceApprovalRequestId
  ) {
    throw new Error("Source event does not match agent trigger job payload.");
  }

  return executeAutomaticAgentTriggerForContext(parsed);
}

export async function executeAutomaticAgentTriggerForEvent(
  event: EnvoyEvent,
): Promise<AutomaticAgentTriggerExecutionResult> {
  const parsed = parseAutomaticAgentTriggerFromEvent(event);

  if (parsed.status === "ignored") {
    return parsed;
  }

  return executeAutomaticAgentTriggerForContext(parsed);
}

async function executeAutomaticAgentTriggerForContext(
  parsed: AutomaticAgentTriggerEventContext,
): Promise<AutomaticAgentTriggerExecutionResult> {
  const idempotencyKey = buildAutomaticTriggerIdempotencyKey(parsed);
  const beginRecord = await agentTriggerIdempotencyService.begin({
    key: idempotencyKey,
  });

  if (beginRecord.status !== "in_progress") {
    return {
      status: "suppressed" as const,
      reason:
        beginRecord.status === "duplicate"
          ? AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_IN_PROGRESS
          : AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_SOURCE_ALREADY_PROCESSED,
    };
  }

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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason:
            AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.CONVERSATION_NOT_FOUND,
        },
      });
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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason:
            AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.NO_ACTIVE_ASSIGNMENT,
          actorAgentAssignmentId: conversation.assignedAgentId ?? null,
        },
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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TRIGGER_DISABLED,
          actorAgentAssignmentId: conversation.assignedAgent.id,
        },
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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason: AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.TERMINAL_STATE,
          actorAgentAssignmentId: conversation.assignedAgent.id,
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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason:
            AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.UNRESOLVED_APPROVAL_PATH,
          actorAgentAssignmentId: conversation.assignedAgent.id,
        },
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
      await completeAutomaticTriggerIdempotency({
        context: parsed,
        resultSummaryJson: {
          status: "suppressed",
          reason:
            AUTOMATIC_AGENT_TRIGGER_SUPPRESSION_REASONS.DUPLICATE_SOURCE_ALREADY_PROCESSED,
          actorAgentAssignmentId: conversation.assignedAgent.id,
        },
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

    await completeAutomaticTriggerIdempotency({
      context: parsed,
      resultSummaryJson: {
        status: "executed",
        flowStatus: flowResult.status,
        approvalRequestId: flowResult.approval?.approvalRequestId ?? null,
        draftMessageId: flowResult.approval?.draftMessageId ?? null,
        actorAgentAssignmentId: conversation.assignedAgent.id,
      },
    });

    return {
      status: "executed" as const,
      flowStatus: flowResult.status,
      approvalRequestId: flowResult.approval?.approvalRequestId ?? null,
      draftMessageId: flowResult.approval?.draftMessageId ?? null,
      escalationReasonCode: flowResult.escalation.escalationReasonCode ?? null,
      provider: flowResult.generation?.provider ?? null,
      model: flowResult.generation?.model ?? null,
      promptVersion: flowResult.generation?.promptVersion ?? null,
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

    await agentTriggerIdempotencyService.fail({
      key: idempotencyKey,
      resultSummaryJson: {
        workspaceId: parsed.workspaceId,
        conversationId: parsed.conversationId,
        triggerType: parsed.triggerType,
        sourceEventId: parsed.sourceEventId,
        error: safeError,
      },
    });

    return {
      status: "failed" as const,
      error: safeError,
    };
  }
}
