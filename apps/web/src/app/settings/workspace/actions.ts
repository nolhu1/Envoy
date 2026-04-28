"use server";

import {
  buildGmailAuthorizationUrl,
  buildSlackAuthorizationUrl,
} from "@envoy/connectors";
import {
  AGENT_TRIGGER_TYPES,
  createApprovalRequestForAgentDraft,
  getPrisma,
  revokeSecret,
} from "@envoy/db";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { PERMISSIONS } from "@/lib/permissions";
import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "@/lib/event-publisher";
import { sanitizeUiErrorMessage } from "@/lib/security";
import { getCurrentWorkspace } from "@/lib/workspace";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";
import { generateDraftFromPlanner } from "@/lib/draft-generator";
import { syncWorkspaceGmailIntegration } from "@/lib/gmail-ingestion";
import { planAgentResponseForWorkspace } from "@/lib/response-planner";
import { syncWorkspaceSlackIntegration } from "@/lib/slack-ingestion";

export async function startGmailConnectAction() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  const { authorizationUrl } = buildGmailAuthorizationUrl({
    workspaceId: workspace.id,
    initiatingUserId: authContext.userId,
    loginHint: authContext.email,
  });

  redirect(authorizationUrl);
}

export async function startSlackConnectAction() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  const { authorizationUrl } = buildSlackAuthorizationUrl({
    workspaceId: workspace.id,
    initiatingUserId: authContext.userId,
  });

  redirect(authorizationUrl);
}

function toSyncErrorMessage(error: unknown) {
  return sanitizeUiErrorMessage(error) || "Unable to sync integration.";
}

async function requireWorkspaceForIntegrationManagement() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  return {
    authContext,
    workspace,
  };
}

async function requireAdminWorkspaceDevAccess() {
  const { authContext, workspace } =
    await requireWorkspaceForIntegrationManagement();

  if (authContext.role !== "ADMIN") {
    throw new Error("Only admins can use temporary dev helpers.");
  }

  return {
    authContext,
    workspace,
  };
}

async function getManagedIntegration(input: {
  workspaceId: string;
  integrationId: string;
}) {
  const prisma = getPrisma();

  return prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: {
        in: ["EMAIL", "SLACK"],
      },
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      displayName: true,
      externalAccountId: true,
      status: true,
      platformMetadataJson: true,
    },
  });
}

async function resolveDevConversation(input: {
  workspaceId: string;
  requestedConversationId: string;
}) {
  const prisma = getPrisma();

  return input.requestedConversationId
    ? prisma.conversation.findFirst({
        where: {
          id: input.requestedConversationId,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          subject: true,
          assignedAgentId: true,
          assignedAgent: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      })
    : prisma.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          platform: true,
          subject: true,
          assignedAgentId: true,
          assignedAgent: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      });
}

async function ensureActiveDevAgentAssignment(input: {
  workspaceId: string;
  conversationId: string;
  assignedByUserId: string;
  assignedAgentId: string | null;
  assignedAgentIsActive: boolean;
  requireDraftReplyAction?: boolean;
}) {
  const prisma = getPrisma();
  const existingActiveAssignment =
    input.assignedAgentIsActive && input.assignedAgentId
      ? await prisma.agentAssignment.findFirst({
          where: {
            id: input.assignedAgentId,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            isActive: true,
          },
          select: {
            id: true,
            allowedActionsJson: true,
          },
        })
      : null;

  const requiresDraftReply = Boolean(input.requireDraftReplyAction);
  const hasDraftReplyPermission = isDraftReplyAllowed(
    existingActiveAssignment?.allowedActionsJson,
  );

  let agentAssignmentId =
    existingActiveAssignment &&
    (!requiresDraftReply || hasDraftReplyPermission)
      ? existingActiveAssignment.id
      : null;

  if (!agentAssignmentId) {
    await prisma.agentAssignment.updateMany({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        isActive: true,
      },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    const agentAssignment = await prisma.agentAssignment.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        goal: "Temporary dev-only agent planning and draft preview",
        instructions:
          "TODO(remove-after-testing): temporary assignment used only for draft generator preview testing.",
        tone: "Clear and concise",
        allowedActionsJson: ["draft_reply", "ask_for_missing_information", "wait", "escalate"],
        escalationRulesJson: {
          temporary: true,
          createdFor: "draft_generator_dev_testing",
        } as never,
        assignedByUserId: input.assignedByUserId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    agentAssignmentId = agentAssignment.id;

    await prisma.conversation.update({
      where: {
        id: input.conversationId,
      },
      data: {
        assignedAgentId: agentAssignment.id,
      },
    });
  }

  return agentAssignmentId;
}

function isDraftReplyAllowed(value: unknown) {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => item === "draft_reply");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const allowedActions = record.allowedActions;
    if (Array.isArray(allowedActions)) {
      return allowedActions.some((item) => item === "draft_reply");
    }

    if (typeof record.draft_reply === "boolean") {
      return record.draft_reply;
    }
  }

  return false;
}

export async function syncIntegrationAction(formData: FormData) {
  const { workspace } = await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration) {
    throw new Error("No managed integration is connected for this workspace.");
  }

  try {
    if (integration.platform === "EMAIL") {
      const result = await syncWorkspaceGmailIntegration({
        workspaceId: workspace.id,
        integrationId: integration.id,
      });

      redirect(
        `/settings/workspace?integration=gmail&action=sync&status=completed&threadCount=${result.threadCount}&messageCount=${result.messageCount}`,
      );
    }

    const result = await syncWorkspaceSlackIntegration({
      workspaceId: workspace.id,
      integrationId: integration.id,
    });

    redirect(
      `/settings/workspace?integration=slack&action=sync&status=completed&dmConversationCount=${result.dmConversationCount}&messageCount=${result.messageCount}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = toSyncErrorMessage(error);
    redirect(
      `/settings/workspace?integration=${
        integration.platform === "EMAIL" ? "gmail" : "slack"
      }&action=sync&status=error&message=${encodeURIComponent(message)}`,
    );
  }
}

export async function disconnectIntegrationAction(formData: FormData) {
  const { workspace } = await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration) {
    throw new Error("No managed integration is connected for this workspace.");
  }

  const prisma = getPrisma();
  const activeSecret = await prisma.connectorSecret.findFirst({
    where: {
      workspaceId: workspace.id,
      integrationId: integration.id,
      revokedAt: null,
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    select: {
      secretRef: true,
    },
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: "DISCONNECTED",
      deletedAt: new Date(),
      platformMetadataJson: {
        provider: integration.platform === "EMAIL" ? "gmail" : "slack",
        disconnectedAt: new Date().toISOString(),
      },
    },
  });

  if (activeSecret?.secretRef) {
    await revokeSecret({
      workspaceId: workspace.id,
      secretRef: activeSecret.secretRef,
    });
  }

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.INTEGRATION_DISCONNECTED,
      workspaceId: workspace.id,
      entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
      entityId: integration.id,
      source: ENVOY_EVENT_SOURCES.UI,
      payload: {
        integrationId: integration.id,
        platform: integration.platform,
        externalAccountId: integration.externalAccountId ?? null,
        status: "DISCONNECTED",
        metadata: {
          provider: integration.platform === "EMAIL" ? "gmail" : "slack",
          displayName: integration.displayName ?? null,
        },
      },
    }),
  );

  redirect(
    `/settings/workspace?integration=${
      integration.platform === "EMAIL" ? "gmail" : "slack"
    }&action=disconnect&status=completed`,
  );
}

export async function createTestApprovalRequestAction(formData: FormData) {
  const { authContext, workspace } = await requireAdminWorkspaceDevAccess();
  const requestedConversationId = String(
    formData.get("conversationId") ?? "",
  ).trim();
  const conversation = await resolveDevConversation({
    workspaceId: workspace.id,
    requestedConversationId,
  });

  if (!conversation) {
    redirect(
      "/settings/workspace?integration=approval-test&action=create&status=error&message=No+eligible+conversation+was+found+for+test+approval+creation.",
    );
  }

  const agentAssignmentId = await ensureActiveDevAgentAssignment({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    assignedByUserId: authContext.userId,
    assignedAgentId: conversation.assignedAgentId,
    assignedAgentIsActive: Boolean(conversation.assignedAgent?.isActive),
  });

  // TODO(remove-after-testing): temporary admin-only approval seed helper.
  const result = await createApprovalRequestForAgentDraft({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    proposedByAgentAssignmentId: agentAssignmentId,
    bodyText:
      conversation.platform === "SLACK"
        ? "Hi there,\n\nThis is a temporary Slack approval test draft created from workspace settings so Phase J approval-to-send can be exercised before the AI drafting UI exists.\n\nBest,\nEnvoy"
        : "Hi there,\n\nThis is a temporary Gmail approval test draft created from workspace settings so Phase J approval-to-send can be exercised before the AI drafting UI exists.\n\nBest,\nEnvoy",
    actorContext: {
      actorType: "AGENT",
      actorAgentAssignmentId: agentAssignmentId,
    },
    platformMetadataJson: {
      temporary: true,
      createdFor: "approval_queue_dev_testing",
      createdByUserId: authContext.userId,
      sourceConversationId: conversation.id,
    },
  });

  redirect(`/approvals/${result.approvalRequestId}`);
}

export async function previewDraftGeneratorAction(formData: FormData) {
  const { authContext, workspace } = await requireAdminWorkspaceDevAccess();
  const requestedConversationId = String(
    formData.get("conversationId") ?? "",
  ).trim();

  const conversation = await resolveDevConversation({
    workspaceId: workspace.id,
    requestedConversationId,
  });

  if (!conversation) {
    redirect(
      "/settings/workspace?integration=draft-preview&action=preview&status=error&message=No+eligible+conversation+was+found+for+draft+preview.",
    );
  }

  await ensureActiveDevAgentAssignment({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    assignedByUserId: authContext.userId,
    assignedAgentId: conversation.assignedAgentId,
    assignedAgentIsActive: Boolean(conversation.assignedAgent?.isActive),
    requireDraftReplyAction: true,
  });

  try {
    const trigger = {
      triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
      triggerReason:
        "TODO(remove-after-testing): temporary draft generator preview in workspace settings.",
    } as const;

    const { context, plan } = await planAgentResponseForWorkspace({
      conversationId: conversation.id,
      trigger,
    });

    if (plan.actionType !== "draft_reply") {
      redirect(
        `/settings/workspace?integration=draft-preview&action=preview&status=error&message=${encodeURIComponent(
          `Planner selected "${plan.actionType}" instead of "draft_reply". ${plan.rationaleSummary}`,
        )}`,
      );
    }

    const generation = await generateDraftFromPlanner({
      context,
      planner: plan,
      trigger,
    });

    const previewParams = new URLSearchParams({
      integration: "draft-preview",
      action: "preview",
      status: "completed",
      conversationId: conversation.id,
      plannerAction: plan.actionType,
      plannerConfidence: plan.confidence.toFixed(2),
      plannerRationale: plan.rationaleSummary,
      generationConfidence: generation.confidenceScore.toFixed(2),
      generationRationale: generation.rationaleSummary,
      suggestedState: generation.suggestedWorkflowStateChange?.to ?? "",
      extractedKeys:
        generation.extractedStructuredData
          .map((item) => item.key)
          .join(", ") || "none",
      proposedMessageText: generation.proposedMessageText.slice(0, 1600),
    });

    redirect(`/settings/workspace?${previewParams.toString()}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = sanitizeUiErrorMessage(error);
    redirect(
      `/settings/workspace?integration=draft-preview&action=preview&status=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }
}
