import {
  CONVERSATION_STATES,
  isTerminalConversationState,
  isValidConversationStateTransition,
  type ConversationState,
} from "../../events/src";

import type { AgentConversationContext } from "./agent-context";
import { STRUCTURED_MEMORY_FACT_KEYS } from "./structured-memory";

export const AGENT_PLANNER_ACTION_TYPES = {
  DRAFT_REPLY: "draft_reply",
  ASK_FOR_MISSING_INFORMATION: "ask_for_missing_information",
  WAIT: "wait",
  ESCALATE: "escalate",
} as const;

export type AgentPlannerActionType =
  (typeof AGENT_PLANNER_ACTION_TYPES)[keyof typeof AGENT_PLANNER_ACTION_TYPES];

export const AGENT_TRIGGER_TYPES = {
  INBOUND_MESSAGE: "inbound_message",
  FOLLOW_UP_DUE: "follow_up_due",
  APPROVAL_REJECTED: "approval_rejected",
  MANUAL_REGENERATE: "manual_regenerate",
} as const;

export type AgentTriggerType =
  (typeof AGENT_TRIGGER_TYPES)[keyof typeof AGENT_TRIGGER_TYPES];

export type AgentTriggerContext = {
  triggerType: AgentTriggerType;
  triggerReason?: string | null;
  sourceMessageId?: string | null;
  sourceApprovalRequestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentSuggestedWorkflowStateChange = {
  to: ConversationState;
  reason: string;
};

export type AgentResponsePlan = {
  actionType: AgentPlannerActionType;
  rationaleSummary: string;
  confidence: number;
  suggestedWorkflowStateChange?: AgentSuggestedWorkflowStateChange | null;
  missingInformationQuestions?: string[] | null;
  escalationReason?: string | null;
};

const ESCALATION_SIGNAL_WORDS = [
  "legal",
  "security",
  "compliance",
  "breach",
  "contract",
  "threat",
  "escalate",
] as const;

function normalizeConversationState(value: string): ConversationState {
  if (value in CONVERSATION_STATES) {
    return value as ConversationState;
  }

  return CONVERSATION_STATES.ACTIVE;
}

function getFactValues(
  context: AgentConversationContext,
  key: string,
): string[] {
  const values = context.facts
    .filter((fact) => fact.key === key)
    .map((fact) => fact.valueText.trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function isActionAllowed(
  assignment: AgentConversationContext["assignment"],
  actionType: AgentPlannerActionType,
) {
  if (!assignment || assignment.allowedActionsJson == null) {
    return true;
  }

  const config = assignment.allowedActionsJson;
  if (Array.isArray(config)) {
    return config
      .map((item) => (typeof item === "string" ? item : ""))
      .includes(actionType);
  }

  if (typeof config === "object") {
    const record = config as Record<string, unknown>;
    const allowedList = record.allowedActions;
    if (Array.isArray(allowedList)) {
      return allowedList
        .map((item) => (typeof item === "string" ? item : ""))
        .includes(actionType);
    }

    if (typeof record[actionType] === "boolean") {
      return Boolean(record[actionType]);
    }
  }

  return true;
}

function buildSuggestedStateChange(
  from: ConversationState,
  to: ConversationState,
  reason: string,
): AgentSuggestedWorkflowStateChange | null {
  if (from === to) {
    return null;
  }

  if (!isValidConversationStateTransition(from, to)) {
    return null;
  }

  return {
    to,
    reason,
  };
}

function extractEscalationReason(
  context: AgentConversationContext,
  trigger: AgentTriggerContext,
): string | null {
  const rejectionReason = context.recentApprovalOutcome?.rejectionReason?.toLowerCase();
  if (
    trigger.triggerType === AGENT_TRIGGER_TYPES.APPROVAL_REJECTED &&
    rejectionReason &&
    ESCALATION_SIGNAL_WORDS.some((word) => rejectionReason.includes(word))
  ) {
    return "Recent rejection feedback contains escalation-sensitive language.";
  }

  const latestInboundBody = context.recentMessages
    .slice()
    .reverse()
    .find((message) => message.direction === "INBOUND")
    ?.bodyText?.toLowerCase();

  if (
    latestInboundBody &&
    ESCALATION_SIGNAL_WORDS.some((word) => latestInboundBody.includes(word))
  ) {
    return "Latest inbound message appears escalation-sensitive.";
  }

  const nextMoveFact = getFactValues(
    context,
    STRUCTURED_MEMORY_FACT_KEYS.NEXT_SUGGESTED_MOVE,
  ).join(" ").toLowerCase();

  if (nextMoveFact.includes("escalate")) {
    return "Structured memory suggests escalation as the next move.";
  }

  return null;
}

function buildMissingInformationQuestions(context: AgentConversationContext) {
  return getFactValues(context, STRUCTURED_MEMORY_FACT_KEYS.UNANSWERED_QUESTION).slice(
    0,
    5,
  );
}

export function planAgentResponse(input: {
  context: AgentConversationContext;
  trigger: AgentTriggerContext;
}): AgentResponsePlan {
  const state = normalizeConversationState(input.context.state);
  const assignment = input.context.assignment;

  if (!assignment || !assignment.isActive) {
    return {
      actionType: AGENT_PLANNER_ACTION_TYPES.ESCALATE,
      rationaleSummary:
        "No active agent assignment is available for this conversation.",
      confidence: 0.99,
      escalationReason:
        "Cannot run draft-only planning without an active agent assignment.",
      suggestedWorkflowStateChange: buildSuggestedStateChange(
        state,
        CONVERSATION_STATES.ESCALATED,
        "Conversation requires human/operator handling until an assignment exists.",
      ),
    };
  }

  if (isTerminalConversationState(state)) {
    return {
      actionType: AGENT_PLANNER_ACTION_TYPES.WAIT,
      rationaleSummary:
        "Conversation is in a terminal workflow state; planner should not draft.",
      confidence: 0.97,
      suggestedWorkflowStateChange: null,
    };
  }

  if (
    state === CONVERSATION_STATES.AWAITING_APPROVAL &&
    input.trigger.triggerType !== AGENT_TRIGGER_TYPES.MANUAL_REGENERATE
  ) {
    return {
      actionType: AGENT_PLANNER_ACTION_TYPES.WAIT,
      rationaleSummary:
        "Conversation is awaiting approval; planner is suppressing duplicate draft paths.",
      confidence: 0.93,
      suggestedWorkflowStateChange: null,
    };
  }

  const escalationReason = extractEscalationReason(input.context, input.trigger);
  if (escalationReason) {
    if (isActionAllowed(assignment, AGENT_PLANNER_ACTION_TYPES.ESCALATE)) {
      return {
        actionType: AGENT_PLANNER_ACTION_TYPES.ESCALATE,
        rationaleSummary:
          "Detected escalation signal from recent workflow or memory context.",
        confidence: 0.86,
        escalationReason,
        suggestedWorkflowStateChange: buildSuggestedStateChange(
          state,
          CONVERSATION_STATES.ESCALATED,
          "Planner detected escalation-sensitive signal.",
        ),
      };
    }

    return {
      actionType: AGENT_PLANNER_ACTION_TYPES.WAIT,
      rationaleSummary:
        "Escalation signal detected, but assignment policy currently disallows escalation.",
      confidence: 0.81,
      escalationReason,
      suggestedWorkflowStateChange: null,
    };
  }

  const missingInformationQuestions = buildMissingInformationQuestions(input.context);
  if (missingInformationQuestions.length > 0) {
    if (
      isActionAllowed(
        assignment,
        AGENT_PLANNER_ACTION_TYPES.ASK_FOR_MISSING_INFORMATION,
      )
    ) {
      return {
        actionType: AGENT_PLANNER_ACTION_TYPES.ASK_FOR_MISSING_INFORMATION,
        rationaleSummary:
          "Structured memory indicates unresolved questions before a draft reply.",
        confidence: 0.78,
        missingInformationQuestions,
        suggestedWorkflowStateChange: buildSuggestedStateChange(
          state,
          CONVERSATION_STATES.WAITING,
          "Planner needs missing information before producing a reply draft.",
        ),
      };
    }
  }

  if (isActionAllowed(assignment, AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY)) {
    return {
      actionType: AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY,
      rationaleSummary:
        "Context and policy support producing a draft reply for review.",
      confidence: 0.8,
      suggestedWorkflowStateChange: buildSuggestedStateChange(
        state,
        CONVERSATION_STATES.ACTIVE,
        "Planner is preparing a draft response path.",
      ),
    };
  }

  return {
    actionType: AGENT_PLANNER_ACTION_TYPES.WAIT,
    rationaleSummary:
      "Assignment policy does not currently allow draft creation for this trigger.",
    confidence: 0.74,
    suggestedWorkflowStateChange: null,
  };
}
