import "server-only";

import { getPrisma } from "@envoy/db";

import { requireAppAuthContext } from "@/lib/app-auth";
import type { AppPermission } from "@/lib/permissions";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export class TenantAccessError extends Error {
  constructor(message = "You do not have access to this workspace resource.") {
    super(message);
    this.name = "TenantAccessError";
  }
}

export async function requireWorkspaceAccess(options?: {
  permission?: AppPermission;
}) {
  const authContext = await requireAppAuthContext();

  if (options?.permission && !hasPermission(authContext.role, options.permission)) {
    throw new TenantAccessError("You do not have permission to perform this action.");
  }

  return authContext;
}

export function requireOperatorAccess() {
  return requireWorkspaceAccess({
    permission: PERMISSIONS.VIEW_AUDIT_LOGS,
  });
}

export async function requireConversationWorkspace(conversationId: string) {
  const authContext = await requireWorkspaceAccess();
  const prisma = getPrisma();
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!conversation) {
    throw new TenantAccessError("Conversation does not belong to this workspace.");
  }

  return {
    authContext,
    conversation,
  };
}

export async function requireIntegrationWorkspace(integrationId: string) {
  const authContext = await requireWorkspaceAccess({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const prisma = getPrisma();
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      workspaceId: authContext.workspaceId,
      OR: [{ deletedAt: null }, { status: "DISCONNECTED" }],
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      status: true,
    },
  });

  if (!integration) {
    throw new TenantAccessError("Integration does not belong to this workspace.");
  }

  return {
    authContext,
    integration,
  };
}
