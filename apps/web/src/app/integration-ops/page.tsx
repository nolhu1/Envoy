import {
  Alert,
  Badge,
  Button,
  EmptyState,
  MetadataList,
  PageContainer,
  PageHeader,
  Panel,
  QueueContainer,
  QueueTable,
  StatusBadge,
} from "@envoy/ui";

import {
  disconnectIntegrationAction,
  renewGmailWatchAction,
  startGmailConnectAction,
  startSlackConnectAction,
  syncIntegrationAction,
} from "@/app/settings/workspace/actions";
import { ProductShell } from "@/components/product-shell";
import { listIntegrationOps, type IntegrationOpsRow } from "@/lib/integration-ops";
import { formatOperatorType } from "@/lib/operator-utils";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : String(value);
}

function healthVariant(severity: string) {
  if (severity === "success") return "success" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "critical") return "critical" as const;
  return "neutral" as const;
}

function reconnectForm(row: IntegrationOpsRow) {
  return row.provider === "gmail" ? (
    <form action={startGmailConnectAction}>
      <Button type="submit" size="sm" variant="primary">
        Reconnect Gmail
      </Button>
    </form>
  ) : (
    <form action={startSlackConnectAction}>
      <Button type="submit" size="sm" variant="primary">
        Reconnect Slack
      </Button>
    </form>
  );
}

function syncForm(row: IntegrationOpsRow) {
  if (
    row.lifecycleStatus !== "CONNECTED" &&
    row.lifecycleStatus !== "SYNC_IN_PROGRESS"
  ) {
    return null;
  }

  return (
    <form action={syncIntegrationAction}>
      <input type="hidden" name="integrationId" value={row.integrationId} />
      <Button type="submit" size="sm" variant="accent">
        {row.checkpoint.hasMore ? "Resume sync" : "Resync"}
      </Button>
    </form>
  );
}

function watchForm(row: IntegrationOpsRow) {
  if (row.provider !== "gmail" || row.lifecycleStatus === "DISCONNECTED") {
    return null;
  }

  return (
    <form action={renewGmailWatchAction}>
      <input type="hidden" name="integrationId" value={row.integrationId} />
      <Button type="submit" size="sm" variant="secondary">
        Renew Gmail watch
      </Button>
    </form>
  );
}

function disconnectForm(row: IntegrationOpsRow) {
  if (row.lifecycleStatus === "DISCONNECTED") {
    return null;
  }

  return (
    <form action={disconnectIntegrationAction}>
      <input type="hidden" name="integrationId" value={row.integrationId} />
      <Button type="submit" size="sm" variant="danger">
        Disconnect
      </Button>
    </form>
  );
}

export default async function IntegrationOpsPage() {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const rows = await listIntegrationOps({ workspaceId: authContext.workspaceId });

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Integration Ops"
          description="Connector health, checkpoint progress, worker sync jobs, and safe recovery actions."
        />

        {rows.length === 0 ? (
          <EmptyState
            variant="noData"
            title="No integrations"
            description="Gmail and Slack integrations will appear here after they are connected."
          />
        ) : null}

        <div className="space-y-6">
          {rows.map((row) => (
            <Panel key={row.integrationId} className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <Badge variant="platform">
                    {row.provider === "gmail" ? "Gmail" : "Slack"}
                  </Badge>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">
                    {row.displayName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {row.externalAccountId ?? "External account not recorded"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge domain="integration" status={row.lifecycleStatus} />
                  <Badge variant={healthVariant(row.health.severity)}>
                    {formatOperatorType(row.health.status)}
                  </Badge>
                </div>
              </div>

              <Alert
                severity={
                  row.health.severity === "critical"
                    ? "critical"
                    : row.health.severity === "warning"
                      ? "warning"
                      : "neutral"
                }
                title={row.health.reason}
              >
                {row.health.recommendedAction}
              </Alert>

              <div className="grid gap-4 lg:grid-cols-2">
                <MetadataList
                  items={[
                    { label: "Last successful sync", value: formatDate(row.checkpoint.lastSuccessfulSyncAt) },
                    { label: "Last attempted sync", value: formatDate(row.checkpoint.lastAttemptedSyncAt) },
                    { label: "More pages", value: row.checkpoint.hasMore ? "Yes" : "No" },
                    { label: "Cursor present", value: row.checkpoint.cursorPresent ? "Yes" : "No" },
                    { label: "Pages processed", value: row.checkpoint.pagesProcessed ?? "Not recorded" },
                    { label: "Messages inserted", value: row.checkpoint.messagesInserted ?? "Not recorded" },
                    { label: "Threads processed", value: row.checkpoint.threadsProcessed ?? "Not recorded" },
                    { label: "DM conversations", value: row.checkpoint.dmConversationsProcessed ?? "Not recorded" },
                    { label: "Canonical conversations", value: row.checkpoint.canonicalConversationsProcessed ?? "Not recorded" },
                    { label: "History gap", value: row.checkpoint.historyHasGap ? "Yes" : "No" },
                    { label: "Checkpoint error", value: row.checkpoint.lastError ?? "None recorded" },
                  ]}
                />
                <MetadataList
                  items={[
                    { label: "Integration ID", value: row.integrationId, copyValue: row.integrationId },
                    { label: "Metadata summary", value: row.metadataSummary },
                    { label: "Gmail watch status", value: row.gmailWatch?.status ?? "Not applicable" },
                    { label: "Gmail watch expiration", value: formatDate(row.gmailWatch?.expiration ?? null) },
                    { label: "Gmail watch renewed", value: formatDate(row.gmailWatch?.lastRenewedAt ?? null) },
                    { label: "Gmail watch error", value: row.gmailWatch?.lastError ?? "None recorded" },
                  ]}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {row.health.authProblem || row.lifecycleStatus === "DISCONNECTED"
                  ? reconnectForm(row)
                  : null}
                {syncForm(row)}
                {watchForm(row)}
                {disconnectForm(row)}
              </div>

              <QueueContainer
                title="Recent sync/runtime jobs"
                description="Worker-backed jobs related to this integration."
              >
                <QueueTable
                  rows={row.recentJobs}
                  getRowId={(job) => job.id}
                  gridTemplateColumns="minmax(10rem,1fr) minmax(7rem,.6fr) minmax(8rem,.7fr) minmax(14rem,1.4fr)"
                  emptyState={
                    <EmptyState
                      variant="noData"
                      title="No runtime jobs"
                      description="No sync or watch renewal jobs have been recorded for this integration."
                    />
                  }
                  columns={[
                    {
                      id: "job",
                      header: "Job",
                      cell: (job) => (
                        <div>
                          <p>{formatOperatorType(job.jobType)}</p>
                          <p className="font-mono text-xs text-slate-500">{job.id}</p>
                        </div>
                      ),
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (job) => <Badge variant="neutral">{job.status}</Badge>,
                    },
                    {
                      id: "queued",
                      header: "Queued",
                      cell: (job) => formatDate(job.queuedAt),
                    },
                    {
                      id: "result",
                      header: "Result",
                      cell: (job) =>
                        job.lastError ??
                        `Attempts ${job.attemptsMade}; completed ${formatDate(job.completedAt)}`,
                    },
                  ]}
                />
              </QueueContainer>

              {row.deadLetters.length > 0 ? (
                <QueueContainer
                  title="Dead letters"
                  description="Failed records connected to recent integration work."
                >
                  <QueueTable
                    rows={row.deadLetters}
                    getRowId={(record) => record.id}
                    columns={[
                      { id: "created", header: "Created", cell: (record) => formatDate(record.createdAt) },
                      { id: "reason", header: "Reason", cell: (record) => record.reason },
                      { id: "error", header: "Error", cell: (record) => record.errorSummary ?? "Not recorded" },
                    ]}
                  />
                </QueueContainer>
              ) : null}
            </Panel>
          ))}
        </div>
      </PageContainer>
    </ProductShell>
  );
}
