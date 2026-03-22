"use server";

import {
  buildGmailAuthorizationUrl,
  buildSlackAuthorizationUrl,
} from "@envoy/connectors";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";
import {
  getCurrentWorkspaceGmailIntegration,
  syncWorkspaceGmailIntegration,
} from "@/lib/gmail-ingestion";
import {
  getCurrentWorkspaceSlackIntegration,
  syncWorkspaceSlackIntegration,
} from "@/lib/slack-ingestion";

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

export async function syncGmailRecentThreadsAction() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  const integration = await getCurrentWorkspaceGmailIntegration();

  if (!integration || integration.workspaceId !== workspace.id) {
    throw new Error("No Gmail integration is connected for this workspace.");
  }

  try {
    const result = await syncWorkspaceGmailIntegration({
      workspaceId: workspace.id,
      integrationId: integration.id,
    });

    redirect(
      `/settings/workspace?gmailSync=completed&threadCount=${result.threadCount}&messageCount=${result.messageCount}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = toSyncErrorMessage(error);
    redirect(`/settings/workspace?gmailSync=error&message=${encodeURIComponent(message)}`);
  }
}

export async function syncSlackRecentDmsAction() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  const integration = await getCurrentWorkspaceSlackIntegration();

  if (!integration || integration.workspaceId !== workspace.id) {
    throw new Error("No Slack integration is connected for this workspace.");
  }

  try {
    const result = await syncWorkspaceSlackIntegration({
      workspaceId: workspace.id,
      integrationId: integration.id,
    });

    redirect(
      `/settings/workspace?slackSync=completed&dmConversationCount=${result.dmConversationCount}&messageCount=${result.messageCount}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = toSyncErrorMessage(error);
    redirect(`/settings/workspace?slackSync=error&message=${encodeURIComponent(message)}`);
  }
}
