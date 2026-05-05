import Link from "next/link";

import {
  Alert,
  Badge,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  PermissionState,
  QueueContainer,
  QueueTable,
  Select,
  StatusBadge,
  SubmitButton,
  FormField,
  FormSection,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import { createInviteAction } from "@/app/members/actions";
import { listInvitesForCurrentWorkspace } from "@/lib/invite";
import {
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/lib/permissions";
import { getCurrentWorkspaceMembers } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type WorkspaceMemberRow = Awaited<
  ReturnType<typeof getCurrentWorkspaceMembers>
>[number];
type WorkspaceInviteRow = Awaited<
  ReturnType<typeof listInvitesForCurrentWorkspace>
>[number];

type MembersPageProps = {
  searchParams?: Promise<{
    error?: string;
    invite?: string;
  }>;
};

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
      }).format(value)
    : "Unavailable";
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_MEMBERS);
  const canManageInvites = hasPermission(
    authContext.role,
    PERMISSIONS.CREATE_INVITES,
  );
  const members = await getCurrentWorkspaceMembers();
  const invites = canManageInvites
    ? await listInvitesForCurrentWorkspace()
    : [];
  const params = searchParams ? await searchParams : undefined;
  const errorMessage = params?.error;
  const inviteCreated = params?.invite === "created";

  return (
    <ProductShell activeSection="members">
      <PageContainer width="wide">
        <PageHeader
          title="Members"
          description="Review workspace access, roles, and pending invitations."
        />

        <div className="space-y-6">
          {inviteCreated ? (
            <Alert severity="success" title="Invite created">
              The invitation was created for this workspace.
            </Alert>
          ) : null}

          {errorMessage ? (
            <Alert severity="critical" title="Invite error">
              {errorMessage}
            </Alert>
          ) : null}

          <QueueContainer
            title="Workspace members"
            description={
              members.length === 0
                ? "No workspace members are visible yet."
                : `${members.length} workspace members`
            }
          >
            <QueueTable<WorkspaceMemberRow>
              rows={members}
              getRowId={(member: WorkspaceMemberRow) => member.id}
              gridTemplateColumns="minmax(16rem,1.7fr) minmax(7rem,0.7fr) minmax(7rem,0.7fr) minmax(9rem,0.8fr)"
              emptyState={
                <EmptyState
                  variant="noData"
                  title="No members"
                  description="This workspace does not have any visible members yet."
                />
              }
              columns={[
                {
                  id: "identity",
                  header: "Member",
                  mobileLabel: "Member",
                  cell: (member: WorkspaceMemberRow) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {member.name || "Unnamed user"}
                      </p>
                      <p className="mt-1 break-all text-sm text-slate-600">
                        {member.email}
                      </p>
                    </div>
                  ),
                },
                {
                  id: "role",
                  header: "Role",
                  mobileLabel: "Role",
                  cell: (member: WorkspaceMemberRow) => (
                    <Badge variant="neutral">{member.role}</Badge>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  mobileLabel: "Status",
                  cell: () => (
                    <StatusBadge
                      domain="severity"
                      status="success"
                      labelOverride="Active"
                    />
                  ),
                },
                {
                  id: "created",
                  header: "Created",
                  mobileLabel: "Created",
                  cell: (member: WorkspaceMemberRow) =>
                    formatDate(member.createdAt),
                },
              ]}
            />
          </QueueContainer>

          <FormSection
            title="Invite a member"
            description="Invite creation is workspace-scoped and limited to roles with invite permission."
            actions={<Badge variant="platform">{authContext.role}</Badge>}
          >
            {canManageInvites ? (
              <form
                action={createInviteAction}
                className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_auto]"
              >
                <FormField label="Email" required>
                  <Input
                    required
                    type="email"
                    name="email"
                    autoComplete="email"
                  />
                </FormField>

                <FormField label="Role" required>
                  <Select
                    name="role"
                    defaultValue="MEMBER"
                    options={[
                      { value: "ADMIN", label: "Admin" },
                      { value: "MEMBER", label: "Member" },
                      { value: "VIEWER", label: "Viewer" },
                    ]}
                  />
                </FormField>

                <div className="flex items-end">
                  <SubmitButton className="w-full">Create invite</SubmitButton>
                </div>
              </form>
            ) : (
              <PermissionState
                title="Invite permission required"
                description="You can view workspace members, but your current role cannot create invitations."
                requiredPermission={PERMISSIONS.CREATE_INVITES}
                currentRole={authContext.role}
              />
            )}
          </FormSection>

          {canManageInvites ? (
            <QueueContainer
              title="Pending invites"
              description={
                invites.length === 0
                  ? "No pending invitations."
                  : `${invites.length} pending invitations`
              }
            >
              <QueueTable<WorkspaceInviteRow>
                rows={invites}
                getRowId={(invite: WorkspaceInviteRow) => invite.id}
                gridTemplateColumns="minmax(18rem,1.8fr) minmax(7rem,0.7fr) minmax(9rem,0.8fr) minmax(8rem,0.7fr)"
                emptyState={
                  <EmptyState
                    variant="noData"
                    title="No pending invites"
                    description="Pending invitations will appear here after they are created."
                  />
                }
                columns={[
                  {
                    id: "invitee",
                    header: "Invitee",
                    mobileLabel: "Invitee",
                    cell: (invite: WorkspaceInviteRow) => (
                      <div className="min-w-0">
                        <p className="break-all font-semibold text-slate-950">
                          {invite.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Invited by{" "}
                          {invite.invitedByUser.name ||
                            invite.invitedByUser.email}
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: "role",
                    header: "Role",
                    mobileLabel: "Role",
                    cell: (invite: WorkspaceInviteRow) => (
                      <Badge variant="neutral">{invite.role}</Badge>
                    ),
                  },
                  {
                    id: "expires",
                    header: "Expires",
                    mobileLabel: "Expires",
                    cell: (invite: WorkspaceInviteRow) =>
                      formatDate(invite.expiresAt),
                  },
                ]}
                renderRowActions={(invite: WorkspaceInviteRow) => (
                  <Link
                    href={`/invite/${invite.token}`}
                    className="text-sm font-medium text-slate-950 underline decoration-slate-300 underline-offset-4"
                  >
                    Open invite
                  </Link>
                )}
              />
            </QueueContainer>
          ) : null}
        </div>
      </PageContainer>
    </ProductShell>
  );
}
