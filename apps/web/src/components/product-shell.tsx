import type { ReactNode } from "react";

import { AppShell, Badge, type NavItem } from "@envoy/ui";

import { requireAppAuthContext } from "@/lib/app-auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getCurrentSignedInUser } from "@/lib/user";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SignOutButton } from "@/components/sign-out-button";

export type ProductShellSection =
  | "inbox"
  | "approvals"
  | "members"
  | "settings"
  | "operator"
  | "profile";

type ProductShellProps = {
  activeSection: ProductShellSection;
  children: ReactNode;
};

export async function ProductShell({
  activeSection,
  children,
}: ProductShellProps) {
  const authContext = await requireAppAuthContext();
  const [workspace, user] = await Promise.all([
    getCurrentWorkspace(),
    getCurrentSignedInUser(),
  ]);
  const canApprove = hasPermission(authContext.role, PERMISSIONS.APPROVE_DRAFTS);
  const canViewAudit = hasPermission(
    authContext.role,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  );

  const navItems: NavItem[] = [
    { label: "Inbox", href: "/", active: activeSection === "inbox" },
    ...(canApprove
      ? [
          {
            label: "Approvals",
            href: "/approvals",
            active: activeSection === "approvals",
          },
        ]
      : []),
    { label: "Members", href: "/members", active: activeSection === "members" },
    {
      label: "Settings",
      href: "/settings/workspace",
      active: activeSection === "settings",
    },
    { label: "Profile", href: "/profile", active: activeSection === "profile" },
    ...(canViewAudit
      ? [
          {
            label: "Audit",
            href: "/settings/audit",
            active: activeSection === "operator",
          },
          {
            label: "Agent Runs",
            href: "/agent-runs",
            active: activeSection === "operator",
          },
          {
            label: "Approval History",
            href: "/approval-history",
            active: activeSection === "operator",
          },
        ]
      : []),
  ];

  return (
    <AppShell
      navItems={navItems}
      workspace={{
        name: workspace?.name ?? "Workspace unavailable",
        status: workspace ? null : <Badge variant="warning">Unavailable</Badge>,
      }}
      user={{
        name: user?.name,
        email: user?.email ?? authContext.email,
        role: user?.role ?? authContext.role,
        profileHref: "/profile",
        signOut: <SignOutButton />,
      }}
    >
      {children}
    </AppShell>
  );
}
