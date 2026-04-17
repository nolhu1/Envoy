import "server-only";

import { getPrisma } from "@envoy/db";

import type { AgentConversationContext, AgentResponsePlan, AgentTriggerContext, DraftGenerationResult } from "@envoy/db";

export const AGENT_RUN_ACTION_TYPES = {
  RUN_REQUESTED: "AGENT_RUN_REQUESTED",
  CONTEXT_BUILT: "AGENT_CONTEXT_BUILT",
  PLAN_DECIDED: "AGENT_PLAN_DECIDED",
  GENERATION_ATTEMPTED: "AGENT_GENERATION_ATTEMPTED",
  GENERATION_SUCCEEDED: "AGENT_GENERATION_SUCCEEDED",
  ESCALATION_DECIDED: "AGENT_ESCALATION_DECIDED",
  DRAFT_CREATED: "AGENT_DRAFT_CREATED",
  APPROVAL_REQUESTED: "AGENT_APPROVAL_REQUESTED",
  RUN_COMPLETED: "AGENT_RUN_COMPLETED",
  RUN_FAILED: "AGENT_RUN_FAILED",
} as const;

type AgentRunLogActor = {
  actorUserId?: string | null;
  actorAgentAssignmentId?: string | null;
};

type AgentRunLogInput = {
  workspaceId: string;
  conversationId: string;
  runId: string;
  actionType: string;
  metadata: Record<string, unknown>;
  actor?: AgentRunLogActor | null;
  messageId?: string | null;
  approvalRequestId?: string | null;
};

function resolveActorType(actor?: AgentRunLogActor | null) {
  if (actor?.actorUserId) {
    return "USER" as const;
  }

  if (actor?.actorAgentAssignmentId) {
    return "AGENT" as const;
  }

  return "SYSTEM" as const;
}

export async function logAgentRunEvent(input: AgentRunLogInput) {
  const prisma = getPrisma();

  return prisma.actionLog.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      actorType: resolveActorType(input.actor),
      actorUserId: input.actor?.actorUserId ?? null,
      actorAgentAssignmentId: input.actor?.actorAgentAssignmentId ?? null,
      actionType: input.actionType,
      metadataJson: {
        runId: input.runId,
        ...input.metadata,
      } as never,
    },
    select: {
      id: true,
    },
  });
}

export function buildAgentPromptInputSummary(input: {
  trigger: AgentTriggerContext;
  context: AgentConversationContext;
  planner: AgentResponsePlan;
}) {
  const latestInboundMessage = input.context.recentMessages
    .slice()
    .reverse()
    .find((message) => message.direction === "INBOUND");

  return {
    triggerType: input.trigger.triggerType,
    triggerReason: input.trigger.triggerReason ?? null,
    plannerActionType: input.planner.actionType,
    participantCount: input.context.participants.length,
    recentMessageCount: input.context.recentMessages.length,
    factCount: input.context.facts.length,
    assignmentGoal: input.context.assignment?.goal ?? null,
    latestInboundMessageChars: latestInboundMessage?.bodyText?.length ?? 0,
  };
}

export function buildSafeGenerationSummary(generation: DraftGenerationResult) {
  const boundedDraftText = generation.proposedMessageText.slice(0, 4000);

  return {
    rationaleSummary: generation.rationaleSummary,
    confidenceScore: generation.confidenceScore,
    extractedStructuredDataSummary: generation.extractedStructuredData.map(
      (item) => ({
        key: item.key,
        valueText: item.valueText,
        confidence: item.confidence,
      }),
    ),
    extractedStructuredDataCount: generation.extractedStructuredData.length,
    suggestedWorkflowStateChange: generation.suggestedWorkflowStateChange ?? null,
    proposedMessageText: boundedDraftText,
    proposedMessagePreview: boundedDraftText.slice(0, 500),
    proposedMessageLength: generation.proposedMessageText.length,
    provider: generation.provider,
    model: generation.model,
  };
}

export function toSafeErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 500),
    };
  }

  return {
    name: "UnknownError",
    message: String(error).slice(0, 500),
  };
}
