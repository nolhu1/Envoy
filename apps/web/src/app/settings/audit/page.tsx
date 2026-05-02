import {
  Badge,
  EmptyState,
  FilterBar,
  FilterField,
  Input,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueTable,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import { listWorkspaceAuditLogs } from "@/lib/audit-log-viewer";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatMetadataSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No metadata";
  }

  const keys = Object.keys(value);
  return keys.length > 0 ? keys.slice(0, 5).join(", ") : "No metadata";
}

function formatAuditLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

export default async function WorkspaceAuditPage({
  searchParams,
}: AuditPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const actionTypeFilter = readSearchParam(resolvedSearchParams?.actionType);
  const logs = await listWorkspaceAuditLogs({
    workspaceId: authContext.workspaceId,
    actionType: actionTypeFilter ?? null,
    limit: 250,
  });

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Workspace audit trail"
          description="Append-only operational actions for integrations, sends, approvals, and agent lifecycle events."
        />

        <QueueContainer
          title="Audit records"
          description={
            logs.length === 0
              ? "No audit records match the current filter."
              : `${logs.length} most recent audit records`
          }
          filters={
            <FilterBar resetHref="/settings/audit">
              <FilterField label="Action type">
                <Input
                  name="actionType"
                  defaultValue={actionTypeFilter ?? ""}
                  placeholder="Ex: MESSAGE_SENT"
                />
              </FilterField>
            </FilterBar>
          }
        >
          <QueueTable
            rows={logs}
            getRowId={(log) => log.id}
            gridTemplateColumns="minmax(7.5rem,0.75fr) minmax(10rem,0.95fr) minmax(6.5rem,0.65fr) minmax(13rem,1.5fr)"
            emptyState={
              <EmptyState
                variant={actionTypeFilter ? "filtered" : "noData"}
                title="No audit records"
                description={
                  actionTypeFilter
                    ? "Clear the filter or search for another action type."
                    : "Audit records will appear here after workspace actions are logged."
                }
              />
            }
            columns={[
              {
                id: "when",
                header: "When",
                mobileLabel: "When",
                cell: (log) => (
                  <div>
                    <p>{formatTimestamp(log.createdAt)}</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">
                      {log.id}
                    </p>
                  </div>
                ),
              },
              {
                id: "action",
                header: "Action",
                mobileLabel: "Action",
                cell: (log) => (
                  <Badge className="max-w-full truncate" variant="neutral">
                    {formatAuditLabel(log.actionType)}
                  </Badge>
                ),
              },
              {
                id: "actor",
                header: "Actor",
                mobileLabel: "Actor",
                cell: (log) => (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-950">{log.actorType}</p>
                    {log.actorUserId ? (
                      <p className="truncate font-mono text-xs text-slate-500">
                        user:{log.actorUserId}
                      </p>
                    ) : null}
                    {log.actorAgentAssignmentId ? (
                      <p className="truncate font-mono text-xs text-slate-500">
                        assignment:{log.actorAgentAssignmentId}
                      </p>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "context",
                header: "Context",
                mobileLabel: "Context",
                cell: (log) => (
                  <div className="space-y-1 text-xs leading-5">
                    <p className="truncate">
                      <span className="font-medium text-slate-600">
                        Conversation:
                      </span>{" "}
                      {log.conversationId}
                    </p>
                    {log.messageId ? (
                      <p className="truncate">
                        <span className="font-medium text-slate-600">
                          Message:
                        </span>{" "}
                        {log.messageId}
                      </p>
                    ) : null}
                    {log.approvalRequestId ? (
                      <p className="truncate">
                        <span className="font-medium text-slate-600">
                          Approval:
                        </span>{" "}
                        {log.approvalRequestId}
                      </p>
                    ) : null}
                    <p className="line-clamp-2">
                      <span className="font-medium text-slate-600">
                        Metadata:
                      </span>{" "}
                      {formatMetadataSummary(log.metadataJson)}
                    </p>
                  </div>
                ),
              },
            ]}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
