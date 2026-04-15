import "server-only";

import {
  AGENT_PLANNER_ACTION_TYPES,
  buildAgentConversationContext,
  createApprovalRequestForAgentDraft,
  planAgentResponse,
  type AgentConversationContext,
  type AgentResponsePlan,
  type AgentTriggerContext,
  type DraftGenerationConfig,
  type DraftGenerationResult,
} from "@envoy/db";

import { generateDraftFromPlanner } from "@/lib/draft-generator";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export type GeneratedDraftApprovalFlowResult = {
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  generation: DraftGenerationResult;
  approval: Awaited<ReturnType<typeof createApprovalRequestForAgentDraft>>;
};

export async function createApprovalFromGeneratedDraftResult(input: {
  workspaceId: string;
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  trigger: AgentTriggerContext;
  generation: DraftGenerationResult;
}) {
  const assignmentId = input.context.assignment?.id;
  const assignmentIsActive = Boolean(input.context.assignment?.isActive);

  if (!assignmentId || !assignmentIsActive) {
    throw new Error(
      "An active agent assignment is required to create an approval draft from generation output.",
    );
  }

  return createApprovalRequestForAgentDraft({
    workspaceId: input.workspaceId,
    conversationId: input.context.conversationId,
    proposedByAgentAssignmentId: assignmentId,
    bodyText: input.generation.proposedMessageText,
    actorContext: {
      actorType: "AGENT",
      actorAgentAssignmentId: assignmentId,
    },
    platformMetadataJson: {
      draftOrigin: "agent_generation",
      generationProvider: input.generation.provider,
      generationModel: input.generation.model,
    },
    generationMetadataJson: {
      planner: {
        actionType: input.planner.actionType,
        rationaleSummary: input.planner.rationaleSummary,
        confidence: input.planner.confidence,
        suggestedWorkflowStateChange:
          input.planner.suggestedWorkflowStateChange ?? null,
        missingInformationQuestions:
          input.planner.missingInformationQuestions ?? null,
        escalationReason: input.planner.escalationReason ?? null,
      },
      trigger: {
        triggerType: input.trigger.triggerType,
        triggerReason: input.trigger.triggerReason ?? null,
        sourceMessageId: input.trigger.sourceMessageId ?? null,
        sourceApprovalRequestId: input.trigger.sourceApprovalRequestId ?? null,
        metadata: input.trigger.metadata ?? null,
      },
      generation: {
        rationaleSummary: input.generation.rationaleSummary,
        extractedStructuredData: input.generation.extractedStructuredData,
        confidenceScore: input.generation.confidenceScore,
        suggestedWorkflowStateChange:
          input.generation.suggestedWorkflowStateChange ?? null,
      },
    },
  });
}

export async function generateDraftAndCreateApprovalForWorkspace(input: {
  conversationId: string;
  trigger: AgentTriggerContext;
  generationConfig?: DraftGenerationConfig | null;
  messageLimit?: number;
  factLimit?: number;
}): Promise<GeneratedDraftApprovalFlowResult> {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  const context = await buildAgentConversationContext({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    messageLimit: input.messageLimit,
    factLimit: input.factLimit,
  });

  const planner = planAgentResponse({
    context,
    trigger: input.trigger,
  });

  if (planner.actionType !== AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY) {
    throw new Error(
      `Planner selected "${planner.actionType}" instead of "${AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY}". ${planner.rationaleSummary}`,
    );
  }

  const generation = await generateDraftFromPlanner({
    context,
    planner,
    trigger: input.trigger,
    config: input.generationConfig ?? null,
  });

  const approval = await createApprovalFromGeneratedDraftResult({
    workspaceId: authContext.workspaceId,
    context,
    planner,
    trigger: input.trigger,
    generation,
  });

  return {
    context,
    planner,
    generation,
    approval,
  };
}
