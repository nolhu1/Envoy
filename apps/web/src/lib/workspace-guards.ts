import "server-only";

import { requireAppAuthContext } from "@/lib/app-auth";
import { hasPermission } from "@/lib/permissions";
import type { AppAuthContext } from "@/lib/auth-types";
import type { AppPermission } from "@/lib/permissions";

type GuardOptions = {
  permission?: AppPermission;
};

function applyPermissionGuard(
  authContext: AppAuthContext,
  permission?: AppPermission,
) {
  if (permission && !hasPermission(authContext.role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
}

export async function requireAuthenticatedEntryPoint(
  options?: GuardOptions,
): Promise<AppAuthContext> {
  const authContext = await requireAppAuthContext();

  applyPermissionGuard(authContext, options?.permission);

  return authContext;
}

export async function requireCurrentWorkspaceMatch(
  workspaceId: string,
  options?: GuardOptions,
): Promise<AppAuthContext> {
  const authContext = await requireAuthenticatedEntryPoint(options);

  if (authContext.workspaceId !== workspaceId) {
    throw new Error("You do not have access to this workspace resource.");
  }

  return authContext;
}

export async function requireCurrentWorkspaceResourceAccess<
  T extends { workspaceId: string },
>(
  resource: T,
  options?: GuardOptions,
): Promise<{ authContext: AppAuthContext; resource: T }> {
  const authContext = await requireCurrentWorkspaceMatch(
    resource.workspaceId,
    options,
  );

  return {
    authContext,
    resource,
  };
}
