import {
  CONVERSATION_STATES,
  CONVERSATION_WORKFLOW_TRIGGER_TYPES,
  isValidConversationStateTransition,
  transitionConversationState,
  type ConversationState,
} from "../../events/src";

import type { AgentConversationContext } from "./agent-context";
import { getPrisma } from "./client";
import { AGENT_PLANNER_ACTION_TYPES, type AgentResponsePlan, type AgentTriggerContext } from "./response-planner";
import type { DraftGenerationResult } from "./draft-generator";

export const AGENT_ESCALATION_REASON_CODES = {
  LOW_CONFIDENCE: "low_confidence",
  UNSUPPORTED_REQUEST: "unsupported_request",
  POLICY_VIOLATION: "policy_violation",
  UNSAFE_CONTENT: "unsafe_content",
} as const;

export type AgentEscalationReasonCode =
  (typeof AGENT_ESCALATION_REASON_CODES)[keyof typeof AGENT_ESCALATION_REASON_CODES];

export type AgentEscalationDecision = {
  shouldEscalate: boolean;
  escalationReasonCode: AgentEscalationReasonCode | null;
  escalationSummary: string | null;
  suggestedWorkflowStateChange?: {
    to: ConversationState;
    reason: string;
  } | null;
  confidence?: number | null;
};

export type EvaluateAgentEscalationInput = {
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  trigger: AgentTriggerContext;
  generation?: DraftGenerationResult | null;
};

export type PersistAgentEscalationDecisionInput = {
  workspaceId: string;
  conversationId: string;
  actorAgentAssignmentId?: string | null;
  actorUserId?: string | null;
  trigger: AgentTriggerContext;
  planner: AgentResponsePlan;
  generation?: DraftGenerationResult | null;
  escalation: AgentEscalationDecision;
};

export type PersistAgentEscalationDecisionResult = {
  applied: boolean;
  workflowState: ConversationState;
  previousWorkflowState: ConversationState;
  actionLogIds: string[];
};

const UNSAFE_SIGNAL_WORDS = [
  "threat",
  "lawsuit",
  "legal action",
  "self-harm",
  "violence",
  "attack",
  "refund immediately or else",
] as const;

function normalizeConversationState(value: string): ConversationState {
  if (value in CONVERSATION_STATES) {
    return value as ConversationState;
  }

  return CONVERSATION_STATES.ACTIVE;
}

function getEscalationRulesConfig(
  assignment: AgentConversationContext["assignment"],
) {
  if (!assignment || assignment.escalationRulesJson == null) {
    return null;
  }

  if (
    typeof assignment.escalationRulesJson === "object" &&
    !Array.isArray(assignment.escalationRulesJson)
  ) {
    return assignment.escalationRulesJson as Record<string, unknown>;
  }

  return null;
}

function hasDraftReplyPermission(
  assignment: AgentConversationContext["assignment"],
) {
  if (!assignment || assignment.allowedActionsJson == null) {
    return true;
  }

  const value = assignment.allowedActionsJson;
  if (Array.isArray(value)) {
    return value.some((item) => item === AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.allowedActions)) {
      return record.allowedActions.some(
        (item) => item === AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY,
      );
    }

    if (typeof record.draft_reply === "boolean") {
      return record.draft_reply;
    }
  }

  return false;
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function createEscalationDecision(input: {
  context: AgentConversationContext;
  code: AgentEscalationReasonCode;
  summary: string;
  confidence?: number | null;
}) {
  const fromState = normalizeConversationState(input.context.state);
  const canEscalateState = isValidConversationStateTransition(
    fromState,
    CONVERSATION_STATES.ESCALATED,
  );

  return {
    shouldEscalate: true as const,
    escalationReasonCode: input.code,
    escalationSummary: input.summary,
    suggestedWorkflowStateChange: canEscalateState
      ? {
          to: CONVERSATION_STATES.ESCALATED,
          reason: input.summary,
        }
      : null,
    confidence: input.confidence ?? null,
  };
}

export function evaluateAgentEscalation(
  input: EvaluateAgentEscalationInput,
): AgentEscalationDecision {
  const rules = getEscalationRulesConfig(input.context.assignment);
  const plannerThreshold = Math.max(
    0,
    Math.min(1, toNumber(rules?.plannerLowConfidenceThreshold, 0.65)),
  );
  const generationThreshold = Math.max(
    0,
    Math.min(1, toNumber(rules?.generationLowConfidenceThreshold, 0.7)),
  );

  if (!hasDraftReplyPermission(input.context.assignment)) {
    return createEscalationDecision({
      context: input.context,
      code: AGENT_ESCALATION_REASON_CODES.UNSUPPORTED_REQUEST,
      summary:
        "Active assignment policy does not allow draft replies for this conversation.",
      confidence: input.planner.confidence,
    });
  }

  if (
    input.planner.actionType !== AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY &&
    input.planner.actionType !== AGENT_PLANNER_ACTION_TYPES.WAIT &&
    input.planner.actionType !== AGENT_PLANNER_ACTION_TYPES.ASK_FOR_MISSING_INFORMATION
  ) {
    return createEscalationDecision({
      context: input.context,
      code: AGENT_ESCALATION_REASON_CODES.UNSUPPORTED_REQUEST,
      summary: `Planner action "${input.planner.actionType}" is outside draft-only flow support.`,
      confidence: input.planner.confidence,
    });
  }

  if (Array.isArray(rules?.alwaysEscalateOnTriggers)) {
    const triggerMatch = rules.alwaysEscalateOnTriggers.some(
      (value) => value === input.trigger.triggerType,
    );
    if (triggerMatch) {
      return createEscalationDecision({
        context: input.context,
        code: AGENT_ESCALATION_REASON_CODES.POLICY_VIOLATION,
        summary: "Escalation rules require human handling for this trigger type.",
        confidence: input.planner.confidence,
      });
    }
  }

  const generatedText = (input.generation?.proposedMessageText || "").toLowerCase();
  if (
    generatedText &&
    UNSAFE_SIGNAL_WORDS.some((phrase) => generatedText.includes(phrase))
  ) {
    return createEscalationDecision({
      context: input.context,
      code: AGENT_ESCALATION_REASON_CODES.UNSAFE_CONTENT,
      summary:
        "Generated draft contains unsafe or high-risk language requiring human review.",
      confidence: input.generation?.confidenceScore ?? input.planner.confidence,
    });
  }

  if (Array.isArray(rules?.blockedTerms)) {
    const blockedTerms = rules.blockedTerms
      .map((item) => (typeof item === "string" ? item.toLowerCase() : ""))
      .filter(Boolean);
    const blockedMatch = blockedTerms.find((term) => generatedText.includes(term));
    if (blockedMatch) {
      return createEscalationDecision({
        context: input.context,
        code: AGENT_ESCALATION_REASON_CODES.POLICY_VIOLATION,
        summary: `Generated draft includes blocked policy term "${blockedMatch}".`,
        confidence: input.generation?.confidenceScore ?? input.planner.confidence,
      });
    }
  }

  if (input.generation && input.generation.confidenceScore < generationThreshold) {
    return createEscalationDecision({
      context: input.context,
      code: AGENT_ESCALATION_REASON_CODES.LOW_CONFIDENCE,
      summary:
        "Generated draft confidence is below threshold and requires escalation.",
      confidence: input.generation.confidenceScore,
    });
  }

  if (input.planner.confidence < plannerThreshold) {
    return createEscalationDecision({
      context: input.context,
      code: AGENT_ESCALATION_REASON_CODES.LOW_CONFIDENCE,
      summary:
        "Planner confidence is below threshold and requires escalation before drafting.",
      confidence: input.planner.confidence,
    });
  }

  return {
    shouldEscalate: false,
    escalationReasonCode: null,
    escalationSummary: null,
    suggestedWorkflowStateChange: null,
    confidence: input.generation?.confidenceScore ?? input.planner.confidence,
  };
}

export async function persistAgentEscalationDecision(
  input: PersistAgentEscalationDecisionInput,
): Promise<PersistAgentEscalationDecisionResult> {
  const prisma = getPrisma();

  if (!input.escalation.shouldEscalate) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
      },
      select: {
        state: true,
      },
    });

    if (!conversation) {
      throw new Error("Conversation not found while persisting escalation.");
    }

    return {
      applied: false,
      workflowState: conversation.state,
      previousWorkflowState: conversation.state,
      actionLogIds: [],
    };
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
        state: true,
      },
    });

    if (!conversation) {
      throw new Error("Conversation not found while persisting escalation.");
    }

    const fromState = normalizeConversationState(conversation.state);
    const requestedToState =
      input.escalation.suggestedWorkflowStateChange?.to ??
      CONVERSATION_STATES.ESCALATED;
    const toState = isValidConversationStateTransition(fromState, requestedToState)
      ? requestedToState
      : fromState;
    const transition = transitionConversationState({
      conversationId: conversation.id,
      from: fromState,
      to: toState,
      event: {
        triggerType: CONVERSATION_WORKFLOW_TRIGGER_TYPES.ESCALATION_REQUESTED,
        source: "agent_escalation",
        metadata: {
          triggerType: input.trigger.triggerType,
          escalationReasonCode: input.escalation.escalationReasonCode,
        },
      },
      reason:
        input.escalation.escalationSummary ||
        "Escalation recommended by agent runtime safety checks.",
    });

    if (transition.changed) {
      await tx.conversation.update({
        where: {
          id: conversation.id,
        },
        data: {
          state: transition.to,
        },
      });
    }

    const actionLogIds: string[] = [];
    const escalationLog = await tx.actionLog.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        actorType: input.actorUserId ? "USER" : "AGENT",
        actorUserId: input.actorUserId ?? null,
        actorAgentAssignmentId: input.actorAgentAssignmentId ?? null,
        actionType: "AGENT_ESCALATION_FLAGGED",
        metadataJson: {
          shouldEscalate: input.escalation.shouldEscalate,
          escalationReasonCode: input.escalation.escalationReasonCode,
          escalationSummary: input.escalation.escalationSummary,
          confidence: input.escalation.confidence ?? null,
          triggerType: input.trigger.triggerType,
          triggerReason: input.trigger.triggerReason ?? null,
          planner: {
            actionType: input.planner.actionType,
            confidence: input.planner.confidence,
            rationaleSummary: input.planner.rationaleSummary,
          },
          generation: input.generation
            ? {
                confidenceScore: input.generation.confidenceScore,
                rationaleSummary: input.generation.rationaleSummary,
                suggestedWorkflowStateChange:
                  input.generation.suggestedWorkflowStateChange ?? null,
              }
            : null,
        } as never,
      },
      select: {
        id: true,
      },
    });
    actionLogIds.push(escalationLog.id);

    if (transition.changed) {
      const stateLog = await tx.actionLog.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          actorType: input.actorUserId ? "USER" : "AGENT",
          actorUserId: input.actorUserId ?? null,
          actorAgentAssignmentId: input.actorAgentAssignmentId ?? null,
          actionType: "STATE_CHANGED",
          metadataJson: {
            previousState: transition.from,
            nextState: transition.to,
            triggerType: transition.event.triggerType,
            reason: transition.reason,
          } as never,
        },
        select: {
          id: true,
        },
      });
      actionLogIds.push(stateLog.id);
    }

    return {
      applied: true,
      workflowState: transition.to,
      previousWorkflowState: transition.from,
      actionLogIds,
    };
  });
}
