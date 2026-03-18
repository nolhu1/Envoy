import "server-only";

import { requireAppAuthContext } from "@/lib/app-auth";
import type { AppAuthContext, AppUserRole } from "@/lib/auth-types";

export const PERMISSIONS = {
  CONNECT_INTEGRATIONS: "connect_integrations",
  SEND_MESSAGES: "send_messages",
  APPROVE_DRAFTS: "approve_drafts",
  ASSIGN_AGENTS: "assign_agents",
  VIEW_AUDIT_LOGS: "view_audit_logs",
  CREATE_INVITES: "create_invites",
  VIEW_WORKSPACE_SETTINGS: "view_workspace_settings",
  VIEW_MEMBERS: "view_members",
} as const;

export type AppPermission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<AppUserRole, readonly AppPermission[]> = {
  ADMIN: [
    PERMISSIONS.CONNECT_INTEGRATIONS,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.APPROVE_DRAFTS,
    PERMISSIONS.ASSIGN_AGENTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.CREATE_INVITES,
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
    PERMISSIONS.VIEW_MEMBERS,
  ],
  MEMBER: [
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.APPROVE_DRAFTS,
    PERMISSIONS.ASSIGN_AGENTS,
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
    PERMISSIONS.VIEW_MEMBERS,
  ],
  VIEWER: [
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
    PERMISSIONS.VIEW_MEMBERS,
  ],
};

export function hasPermission(role: AppUserRole, permission: AppPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function requirePermission(
  permission: AppPermission,
): Promise<AppAuthContext> {
  const authContext = await requireAppAuthContext();

  if (!hasPermission(authContext.role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return authContext;
}
