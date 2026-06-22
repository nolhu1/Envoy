import {
  AGENT_PLANNER_ACTION_TYPES,
  buildAgentConversationContext,
  createApprovalRequestForAgentDraft,
  evaluateAgentEscalation,
  persistAgentEscalationDecision,
  planAgentResponse,
  upsertStructuredMemoryFacts,
  type AgentEscalationDecision,
  type AgentConversationContext,
  type AgentResponsePlan,
  type AgentTriggerContext,
  type DraftGenerationConfig,
  type DraftGenerationResult,
} from "../../../../packages/db/src/index";

import { generateDraftFromPlanner } from "./draft-generator";
import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "./event-publisher";
import {
  AGENT_RUN_ACTION_TYPES,
  buildAgentPromptInputSummary,
  buildSafeGenerationSummary,
  logAgentRunEvent,
  toSafeErrorSummary,
} from "./agent-run-logging";

const STRUCTURED_MEMORY_WRITE_CONFIDENCE_THRESHOLD = 0.7;
const MAX_STRUCTURED_MEMORY_VALUE_LENGTH = 500;

function classifyAgentRun(input: {
  planner: AgentResponsePlan;
  escalation?: AgentEscalationDecision | null;
}) {
  const reason = input.escalation?.escalationReasonCode;

  if (reason === "unsafe_content" || reason === "policy_violation") {
    return "unsafe_or_policy_blocked";
  }

  if (reason === "low_confidence" || input.planner.missingInformationQuestions?.length) {
    return "insufficient_context";
  }

  if (reason === "unsupported_request") {
    return "unsupported_request";
  }

  if (input.planner.actionType !== AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY) {
    return "needs_human";
  }

  return "normal_draft";
}

export type GeneratedDraftApprovalFlowResult = {
  status: "draft_created";
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  escalation: AgentEscalationDecision;
  generation: DraftGenerationResult;
  approval: Awaited<ReturnType<typeof createApprovalRequestForAgentDraft>>;
};

export type EscalatedDraftApprovalFlowResult = {
  status: "escalated";
  context: AgentConversationContext;
  planner: AgentResponsePlan;
  escalation: AgentEscalationDecision;
  generation: DraftGenerationResult | null;
  approval: null;
};

export async function createApprovalFromGeneratedDraftResult(input: {
  workspaceId: string;
  runId?: string | null;
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
        provider: input.generation.provider,
        model: input.generation.model,
        promptVersion: input.generation.promptVersion,
        generatorVersion: input.generation.generatorVersion,
        temperature: input.generation.temperature,
        maxOutputTokens: input.generation.maxOutputTokens,
        suggestedWorkflowStateChange:
          input.generation.suggestedWorkflowStateChange ?? null,
      },
      run: {
        runId: input.runId ?? null,
      },
    },
  });
}

async function persistStructuredFactsFromGeneration(input: {
  workspaceId: string;
  runId: string;
  context: AgentConversationContext;
  generation: DraftGenerationResult;
  sourceMessageId?: string | null;
}) {
  const safeFacts = input.generation.extractedStructuredData
    .filter((fact) => {
      const confidence = fact.confidence ?? 0;
      return (
        confidence >= STRUCTURED_MEMORY_WRITE_CONFIDENCE_THRESHOLD &&
        fact.valueText.trim().length > 0 &&
        fact.valueText.trim().length <= MAX_STRUCTURED_MEMORY_VALUE_LENGTH
      );
    })
    .map((fact) => ({
      key: fact.key,
      valueText: fact.valueText.trim(),
      confidence: fact.confidence,
      sourceMessageId: input.sourceMessageId ?? null,
    }));

  if (safeFacts.length === 0) {
    return [];
  }

  const records = await upsertStructuredMemoryFacts({
    workspaceId: input.workspaceId,
    conversationId: input.context.conversationId,
    facts: safeFacts,
  });

  await logAgentRunEvent({
    workspaceId: input.workspaceId,
    conversationId: input.context.conversationId,
    runId: input.runId,
    actionType: AGENT_RUN_ACTION_TYPES.MEMORY_UPDATED,
    actor: {
      actorAgentAssignmentId: input.context.assignment?.id ?? null,
    },
    metadata: {
      factCount: records.length,
      threshold: STRUCTURED_MEMORY_WRITE_CONFIDENCE_THRESHOLD,
      keys: records.map((record) => record.key),
    },
  });

  return records;
}

export async function generateDraftAndCreateApprovalForWorkspace(input: {
  workspaceId?: string;
  actorUserId?: string | null;
  skipPermissionCheck?: boolean;
  conversationId: string;
  trigger: AgentTriggerContext;
  generationConfig?: DraftGenerationConfig | null;
  messageLimit?: number;
  factLimit?: number;
}): Promise<GeneratedDraftApprovalFlowResult | EscalatedDraftApprovalFlowResult> {
  const shouldSkipPermissionCheck = Boolean(input.skipPermissionCheck);
  const authContext = shouldSkipPermissionCheck
    ? null
    : await requireAgentDraftFlowPermission();
  const workspaceId = shouldSkipPermissionCheck
    ? input.workspaceId
    : (input.workspaceId ?? authContext?.workspaceId);
  const actorUserId = shouldSkipPermissionCheck
    ? (input.actorUserId ?? null)
    : (input.actorUserId ?? authContext?.userId ?? null);

  if (!workspaceId) {
    throw new Error("Agent draft flow requires a workspace id.");
  }

  if (!shouldSkipPermissionCheck) {
    if (workspaceId !== authContext?.workspaceId) {
      throw new Error("Agent draft flow workspace does not match the current auth context.");
    }

    if (!actorUserId || actorUserId !== authContext?.userId) {
      throw new Error("Agent draft flow actor does not match the current auth context.");
    }
  }

  const runId = crypto.randomUUID();
  let currentStage = "run_requested";

  await logAgentRunEvent({
    workspaceId,
    conversationId: input.conversationId,
    runId,
    actionType: AGENT_RUN_ACTION_TYPES.RUN_REQUESTED,
    actor: {
      actorUserId: actorUserId ?? undefined,
    },
    metadata: {
      status: "started",
      triggerType: input.trigger.triggerType,
      triggerReason: input.trigger.triggerReason ?? null,
      sourceMessageId: input.trigger.sourceMessageId ?? null,
      sourceApprovalRequestId: input.trigger.sourceApprovalRequestId ?? null,
    },
  });

  try {
    currentStage = "context_built";
    const context = await buildAgentConversationContext({
      workspaceId,
      conversationId: input.conversationId,
      messageLimit: input.messageLimit,
      factLimit: input.factLimit,
    });

    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.CONTEXT_BUILT,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      metadata: {
        platform: context.platform,
        state: context.state,
        hasActiveAssignment: Boolean(context.assignment?.isActive),
        assignmentGoal: context.assignment?.goal ?? null,
        participantCount: context.participants.length,
        recentMessageCount: context.recentMessages.length,
        factCount: context.facts.length,
        recentApprovalStatus: context.recentApprovalOutcome?.status ?? null,
      },
    });

    if (context.assignment?.id) {
      await publishEnvoyEvent(
        buildEnvoyEvent({
          eventType: ENVOY_EVENT_TYPES.AGENT_RUN_REQUESTED,
          workspaceId,
          entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
          entityId: context.assignment.id,
          source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
          payload: {
            agentAssignmentId: context.assignment.id,
            conversationId: context.conversationId,
            requestedByUserId: actorUserId,
            runId,
            metadata: {
              triggerType: input.trigger.triggerType,
            },
          },
        }),
      );
    }

    currentStage = "planner_decided";
    const planner = planAgentResponse({
      context,
      trigger: input.trigger,
    });

    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.PLAN_DECIDED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      metadata: {
        actionType: planner.actionType,
        rationaleSummary: planner.rationaleSummary,
        confidence: planner.confidence,
        suggestedWorkflowStateChange:
          planner.suggestedWorkflowStateChange ?? null,
        missingInformationQuestions: planner.missingInformationQuestions ?? null,
        escalationReason: planner.escalationReason ?? null,
        classification: classifyAgentRun({ planner }),
      },
    });

    const preGenerationEscalation = evaluateAgentEscalation({
      context,
      planner,
      trigger: input.trigger,
      generation: null,
    });

    if (preGenerationEscalation.shouldEscalate) {
      currentStage = "pre_generation_escalated";
      await logAgentRunEvent({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actionType: AGENT_RUN_ACTION_TYPES.ESCALATION_DECIDED,
        actor: {
          actorUserId: actorUserId ?? undefined,
          actorAgentAssignmentId: context.assignment?.id ?? null,
        },
        metadata: {
          escalation: preGenerationEscalation,
          stage: "pre_generation",
          classification: classifyAgentRun({
            planner,
            escalation: preGenerationEscalation,
          }),
        },
      });

      await persistAgentEscalationDecision({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actorAgentAssignmentId: context.assignment?.id ?? null,
        actorUserId,
        trigger: input.trigger,
        planner,
        generation: null,
        escalation: preGenerationEscalation,
      });

      await logAgentRunEvent({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actionType: AGENT_RUN_ACTION_TYPES.RUN_COMPLETED,
        actor: {
          actorUserId: actorUserId ?? undefined,
          actorAgentAssignmentId: context.assignment?.id ?? null,
        },
        metadata: {
          status: "escalated",
          stage: "pre_generation",
          escalationReasonCode: preGenerationEscalation.escalationReasonCode,
          classification: classifyAgentRun({
            planner,
            escalation: preGenerationEscalation,
          }),
        },
      });

      if (context.assignment?.id) {
        await publishEnvoyEvent(
          buildEnvoyEvent({
            eventType: ENVOY_EVENT_TYPES.AGENT_RUN_COMPLETED,
            workspaceId,
            entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
            entityId: context.assignment.id,
            source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
            payload: {
              agentAssignmentId: context.assignment.id,
              conversationId: context.conversationId,
              requestedByUserId: actorUserId,
              runId,
              metadata: {
                status: "escalated",
                stage: "pre_generation",
                escalationReasonCode:
                  preGenerationEscalation.escalationReasonCode ?? null,
                classification: classifyAgentRun({
                  planner,
                  escalation: preGenerationEscalation,
                }),
              },
            },
          }),
        );
      }

      return {
        status: "escalated",
        context,
        planner,
        escalation: preGenerationEscalation,
        generation: null,
        approval: null,
      };
    }

    if (planner.actionType !== AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY) {
      throw new Error(
        `Planner selected "${planner.actionType}" instead of "${AGENT_PLANNER_ACTION_TYPES.DRAFT_REPLY}". ${planner.rationaleSummary}`,
      );
    }

    currentStage = "generation_attempted";
    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.GENERATION_ATTEMPTED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      metadata: {
        promptInputSummary: buildAgentPromptInputSummary({
          trigger: input.trigger,
          context,
          planner,
        }),
      },
    });

    const generation = await generateDraftFromPlanner({
      context,
      planner,
      trigger: input.trigger,
      config: input.generationConfig ?? null,
    });

    currentStage = "generation_succeeded";
    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.GENERATION_SUCCEEDED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      metadata: buildSafeGenerationSummary(generation),
    });

    const postGenerationEscalation = evaluateAgentEscalation({
      context,
      planner,
      trigger: input.trigger,
      generation,
    });

    if (postGenerationEscalation.shouldEscalate) {
      currentStage = "post_generation_escalated";
      await logAgentRunEvent({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actionType: AGENT_RUN_ACTION_TYPES.ESCALATION_DECIDED,
        actor: {
          actorUserId: actorUserId ?? undefined,
          actorAgentAssignmentId: context.assignment?.id ?? null,
        },
        metadata: {
          escalation: postGenerationEscalation,
          stage: "post_generation",
          classification: classifyAgentRun({
            planner,
            escalation: postGenerationEscalation,
          }),
        },
      });

      await persistAgentEscalationDecision({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actorAgentAssignmentId: context.assignment?.id ?? null,
        actorUserId,
        trigger: input.trigger,
        planner,
        generation,
        escalation: postGenerationEscalation,
      });

      await logAgentRunEvent({
        workspaceId,
        conversationId: context.conversationId,
        runId,
        actionType: AGENT_RUN_ACTION_TYPES.RUN_COMPLETED,
        actor: {
          actorUserId: actorUserId ?? undefined,
          actorAgentAssignmentId: context.assignment?.id ?? null,
        },
        metadata: {
          status: "escalated",
          stage: "post_generation",
          escalationReasonCode: postGenerationEscalation.escalationReasonCode,
          classification: classifyAgentRun({
            planner,
            escalation: postGenerationEscalation,
          }),
        },
      });

      if (context.assignment?.id) {
        await publishEnvoyEvent(
          buildEnvoyEvent({
            eventType: ENVOY_EVENT_TYPES.AGENT_RUN_COMPLETED,
            workspaceId,
            entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
            entityId: context.assignment.id,
            source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
            payload: {
              agentAssignmentId: context.assignment.id,
              conversationId: context.conversationId,
              requestedByUserId: actorUserId,
              runId,
              metadata: {
                status: "escalated",
                stage: "post_generation",
                escalationReasonCode:
                  postGenerationEscalation.escalationReasonCode ?? null,
                classification: classifyAgentRun({
                  planner,
                  escalation: postGenerationEscalation,
                }),
              },
            },
          }),
        );
      }

      return {
        status: "escalated",
        context,
        planner,
        escalation: postGenerationEscalation,
        generation,
        approval: null,
      };
    }

    currentStage = "draft_and_approval_created";
    const approval = await createApprovalFromGeneratedDraftResult({
      workspaceId,
      runId,
      context,
      planner,
      trigger: input.trigger,
      generation,
    });
    const persistedFacts = await persistStructuredFactsFromGeneration({
      workspaceId,
      runId,
      context,
      generation,
      sourceMessageId: input.trigger.sourceMessageId ?? null,
    });

    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.DRAFT_CREATED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      messageId: approval.draftMessageId,
      approvalRequestId: approval.approvalRequestId,
      metadata: {
        messageId: approval.draftMessageId,
        approvalRequestId: approval.approvalRequestId,
        plannerAction: planner.actionType,
        confidence: generation.confidenceScore,
        classification: classifyAgentRun({
          planner,
          escalation: postGenerationEscalation,
        }),
        persistedFactCount: persistedFacts.length,
      },
    });

    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.MESSAGE_DRAFT_CREATED,
        workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.MESSAGE,
        entityId: approval.draftMessageId,
        source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
        payload: {
          conversationId: context.conversationId,
          messageId: approval.draftMessageId,
          platform: context.platform,
          senderType: "AGENT",
          direction: "OUTBOUND",
          status: "PENDING_APPROVAL",
          metadata: {
            provider: generation.provider,
            runId,
          },
        },
      }),
    );

    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.APPROVAL_REQUESTED,
        workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST,
        entityId: approval.approvalRequestId,
        source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
        payload: {
          approvalRequestId: approval.approvalRequestId,
          conversationId: context.conversationId,
          draftMessageId: approval.draftMessageId,
          agentAssignmentId: context.assignment?.id ?? null,
          metadata: {
            provider: "gmail",
            runId,
          },
        },
      }),
    );

    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.APPROVAL_REQUESTED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      messageId: approval.draftMessageId,
      approvalRequestId: approval.approvalRequestId,
      metadata: {
        approvalRequestId: approval.approvalRequestId,
        messageId: approval.draftMessageId,
        approvalStatus: approval.approvalStatus,
      },
    });

    if (context.assignment?.id) {
      await publishEnvoyEvent(
        buildEnvoyEvent({
          eventType: ENVOY_EVENT_TYPES.AGENT_RUN_COMPLETED,
          workspaceId,
          entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
          entityId: context.assignment.id,
          source: ENVOY_EVENT_SOURCES.AGENT_RUNTIME,
          payload: {
            agentAssignmentId: context.assignment.id,
            conversationId: context.conversationId,
            requestedByUserId: actorUserId,
            runId,
            metadata: {
              status: "draft_created",
              confidence: generation.confidenceScore,
              classification: classifyAgentRun({
                planner,
                escalation: postGenerationEscalation,
              }),
              provider: generation.provider,
              model: generation.model,
              promptVersion: generation.promptVersion,
            },
          },
        }),
      );
    }

    await logAgentRunEvent({
      workspaceId,
      conversationId: context.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.RUN_COMPLETED,
      actor: {
        actorUserId: actorUserId ?? undefined,
        actorAgentAssignmentId: context.assignment?.id ?? null,
      },
      messageId: approval.draftMessageId,
      approvalRequestId: approval.approvalRequestId,
      metadata: {
        status: "draft_created",
        plannerAction: planner.actionType,
        confidence: generation.confidenceScore,
        classification: classifyAgentRun({
          planner,
          escalation: postGenerationEscalation,
        }),
        provider: generation.provider,
        model: generation.model,
        promptVersion: generation.promptVersion,
        generatorVersion: generation.generatorVersion,
        persistedFactCount: persistedFacts.length,
      },
    });

    return {
      status: "draft_created",
      context,
      planner,
      escalation: postGenerationEscalation,
      generation,
      approval,
    };
  } catch (error) {
    await logAgentRunEvent({
      workspaceId,
      conversationId: input.conversationId,
      runId,
      actionType: AGENT_RUN_ACTION_TYPES.RUN_FAILED,
      actor: {
        actorUserId: actorUserId ?? undefined,
      },
      metadata: {
        stage: currentStage,
        error: toSafeErrorSummary(error),
        triggerType: input.trigger.triggerType,
      },
    });

    throw error;
  }
}

async function requireAgentDraftFlowPermission() {
  const permissionsPath = "./permissions";
  const importPermissions = (specifier: string) => import(specifier) as Promise<{
    PERMISSIONS: {
      ASSIGN_AGENTS: "assign_agents";
    };
    requirePermission: (permission: "assign_agents") => Promise<{
      workspaceId: string;
      userId: string;
    }>;
  }>;
  const { PERMISSIONS, requirePermission } = await importPermissions(
    permissionsPath,
  );

  return requirePermission(PERMISSIONS.ASSIGN_AGENTS);
}
