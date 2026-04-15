import {
  CONVERSATION_STATES,
  isValidConversationStateTransition,
  type ConversationState,
} from "../../events/src";

import type { AgentConversationContext } from "./agent-context";
import {
  AGENT_PLANNER_ACTION_TYPES,
  type AgentResponsePlan,
  type AgentSuggestedWorkflowStateChange,
  type AgentTriggerContext,
} from "./response-planner";
import type { StructuredMemoryFactKey } from "./structured-memory";

export const DRAFT_GENERATION_PROVIDERS = {
  OPENAI: "openai",
} as const;

export type DraftGenerationProvider =
  (typeof DRAFT_GENERATION_PROVIDERS)[keyof typeof DRAFT_GENERATION_PROVIDERS];

export type DraftGenerationConfig = {
  provider?: DraftGenerationProvider | null;
  model?: string | null;
  temperature?: number | null;
  maxOutputTokens?: number | null;
};

export type DraftGeneratorInput = {
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  trigger: AgentTriggerContext;
  config?: DraftGenerationConfig | null;
};

export type DraftGenerationStructuredDatum = {
  key: StructuredMemoryFactKey;
  valueText: string;
  confidence: number | null;
};

export type DraftGenerationResult = {
  proposedMessageText: string;
  rationaleSummary: string;
  extractedStructuredData: DraftGenerationStructuredDatum[];
  confidenceScore: number;
  suggestedWorkflowStateChange: AgentSuggestedWorkflowStateChange | null;
  provider: DraftGenerationProvider;
  model: string;
};

export function assertDraftGenerationAllowed(input: {
  planner: AgentResponsePlan;
}) {
  if (input.planner.actionType !== AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY) {
    throw new Error(
      `Draft generation requires planner action "${AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY}", received "${input.planner.actionType}".`,
    );
  }
}

export function clampDraftConfidenceScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

export function sanitizeSuggestedWorkflowStateChange(input: {
  fromState: AgentConversationContext["state"];
  suggested: AgentSuggestedWorkflowStateChange | null | undefined;
}) {
  if (!input.suggested) {
    return null;
  }

  const fromState: ConversationState =
    typeof input.fromState === "string" &&
    Object.values(CONVERSATION_STATES).includes(input.fromState as never)
      ? (input.fromState as ConversationState)
      : CONVERSATION_STATES.ACTIVE;

  if (!isValidConversationStateTransition(fromState, input.suggested.to)) {
    return null;
  }

  return input.suggested;
}
