"use server";

import {
  buildGmailAuthorizationUrl,
  buildSlackAuthorizationUrl,
} from "@envoy/connectors";
import { createApprovalRequestForAgentDraft, getPrisma, revokeSecret } from "@envoy/db";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";
import { syncWorkspaceGmailIntegration } from "@/lib/gmail-ingestion";
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
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to sync integration.";
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
      platformMetadataJson: true,
    },
  });
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

  redirect(
    `/settings/workspace?integration=${
      integration.platform === "EMAIL" ? "gmail" : "slack"
    }&action=disconnect&status=completed`,
  );
}

export async function createTestApprovalRequestAction(formData: FormData) {
  const { authContext, workspace } = await requireAdminWorkspaceDevAccess();
  const prisma = getPrisma();
  const requestedConversationId = String(
    formData.get("conversationId") ?? "",
  ).trim();

  const conversation = requestedConversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: requestedConversationId,
          workspaceId: workspace.id,
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
    : await prisma.conversation.findFirst({
        where: {
          workspaceId: workspace.id,
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

  if (!conversation) {
    redirect(
      "/settings/workspace?integration=approval-test&action=create&status=error&message=No+eligible+conversation+was+found+for+test+approval+creation.",
    );
  }

  let agentAssignmentId =
    conversation.assignedAgent?.isActive && conversation.assignedAgentId
      ? conversation.assignedAgentId
      : null;

  if (!agentAssignmentId) {
    const agentAssignment = await prisma.agentAssignment.create({
      data: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        goal: "Temporary dev-only approval queue testing",
        instructions:
          "TODO(remove-after-testing): temporary agent assignment used only for approval queue testing.",
        tone: "Clear and concise",
        allowedActionsJson: ["reply_draft"],
        escalationRulesJson: {
          temporary: true,
          createdFor: "approval_queue_dev_testing",
        } as never,
        assignedByUserId: authContext.userId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    agentAssignmentId = agentAssignment.id;

    await prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        assignedAgentId: agentAssignment.id,
      },
    });
  }

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
