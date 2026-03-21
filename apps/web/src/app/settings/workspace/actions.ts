"use server";

import { buildGmailAuthorizationUrl } from "@envoy/connectors";
import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";

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
