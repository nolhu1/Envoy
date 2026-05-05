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
import {
  listWorkspaceAuditLogs,
  type WorkspaceAuditLogRow,
} from "@/lib/audit-log-viewer";
import { getWorkspaceOperationalSnapshot } from "@/lib/observability";
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

function formatNullableCount(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Unknown";
}

function formatDurationMs(value: number | null) {
  if (value == null) {
    return "None queued";
  }

  const minutes = Math.floor(value / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
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
  const operationalSnapshot = await getWorkspaceOperationalSnapshot({
    workspaceId: authContext.workspaceId,
  });
  const runtimeHealth = operationalSnapshot.runtimeHealth;

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Workspace audit trail"
          description="Append-only operational actions for integrations, sends, approvals, and agent lifecycle events."
        />

        <QueueContainer
          title="Runtime health"
          description="Durable worker queues, stuck jobs, dead letters, and recent runtime failures."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">
                Redis
              </p>
              <div className="mt-2">
                <Badge
                  variant={
                    runtimeHealth.redisConnected === true
                      ? "success"
                      : runtimeHealth.redisConnected === false
                        ? "critical"
                        : "neutral"
                  }
                >
                  {runtimeHealth.redisConnected === true
                    ? "Connected"
                    : runtimeHealth.redisConnected === false
                      ? "Disconnected"
                      : "Unknown"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {runtimeHealth.queuesRegistered.length > 0
                  ? runtimeHealth.queuesRegistered.join(", ")
                  : "Queue list unavailable"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">
                Queue depth
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {runtimeHealth.queuedJobCount.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Running {runtimeHealth.runningJobCount.toLocaleString("en-US")}
                {" - "}Oldest {formatDurationMs(runtimeHealth.oldestQueuedJobAgeMs)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">
                Failures
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {runtimeHealth.recentFailureCount.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Failed {runtimeHealth.failedJobCount.toLocaleString("en-US")}
                {" - "}Dead-lettered{" "}
                {runtimeHealth.deadLetteredJobCount.toLocaleString("en-US")}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">
                Recovery
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {runtimeHealth.stuckJobCount.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Stuck jobs - Dead letters{" "}
                {runtimeHealth.deadLetterCount.toLocaleString("en-US")}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <span className="font-medium text-slate-700">Completed:</span>{" "}
              {runtimeHealth.completedJobCount.toLocaleString("en-US")}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <span className="font-medium text-slate-700">Cancelled:</span>{" "}
              {runtimeHealth.cancelledJobCount.toLocaleString("en-US")}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <span className="font-medium text-slate-700">
                Worker metrics:
              </span>{" "}
              {formatNullableCount(
                operationalSnapshot.workerQueueDepth.executionCount,
              )}{" "}
              executions
            </div>
          </div>
        </QueueContainer>

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
          <QueueTable<WorkspaceAuditLogRow>
            rows={logs}
            getRowId={(log: WorkspaceAuditLogRow) => log.id}
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
                cell: (log: WorkspaceAuditLogRow) => (
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
                cell: (log: WorkspaceAuditLogRow) => (
                  <Badge className="max-w-full truncate" variant="neutral">
                    {formatAuditLabel(log.actionType)}
                  </Badge>
                ),
              },
              {
                id: "actor",
                header: "Actor",
                mobileLabel: "Actor",
                cell: (log: WorkspaceAuditLogRow) => (
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
                cell: (log: WorkspaceAuditLogRow) => (
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
