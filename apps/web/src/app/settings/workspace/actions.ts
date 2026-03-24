"use server";

import {
  buildGmailAuthorizationUrl,
  buildSlackAuthorizationUrl,
} from "@envoy/connectors";
import { getPrisma, revokeSecret } from "@envoy/db";
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
