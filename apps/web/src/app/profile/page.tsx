import {
  Alert,
  Badge,
  MetadataList,
  PageContainer,
  PageHeader,
  Panel,
  SectionHeader,
  StatusBadge,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import { requireAppAuthContext } from "@/lib/app-auth";
import { getCurrentSignedInUser } from "@/lib/user";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "Unavailable";
}

export default async function ProfilePage() {
  const authContext = await requireAppAuthContext();
  const user = await getCurrentSignedInUser();

  return (
    <ProductShell activeSection="profile">
      <PageContainer width="standard">
        <PageHeader
          title="Profile"
          description="Signed-in account details and workspace role context."
        />

        {user ? (
          <div className="space-y-6">
            <Panel className="space-y-4">
              <SectionHeader
                title={user.name || user.email}
                description="Primary account identity for the current session."
                actions={<Badge variant="neutral">{user.role}</Badge>}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">Name</p>
                  <p className="mt-1 text-base font-semibold text-slate-950">
                    {user.name || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Email</p>
                  <p className="mt-1 break-all text-base font-semibold text-slate-950">
                    {user.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Role</p>
                  <p className="mt-1">
                    <StatusBadge
                      domain="severity"
                      status="info"
                      labelOverride={user.role}
                    />
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Created</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {formatDateTime(user.createdAt)}
                  </p>
                </div>
              </div>
            </Panel>

            <section className="space-y-4">
              <SectionHeader
                title="Account metadata"
                description="Raw identifiers are available for support and diagnostics."
              />
              <MetadataList
                items={[
                  {
                    label: "User ID",
                    value: user.id,
                    copyValue: user.id,
                  },
                  {
                    label: "Workspace ID",
                    value: user.workspaceId,
                    copyValue: user.workspaceId,
                  },
                  {
                    label: "Session email",
                    value: authContext.email,
                  },
                ]}
              />
            </section>
          </div>
        ) : (
          <Alert severity="warning" title="Profile unavailable">
            The signed-in account context is present, but the user record could
            not be loaded. Current session user: {authContext.email}.
          </Alert>
        )}
      </PageContainer>
    </ProductShell>
  );
}
