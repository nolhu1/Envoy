import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormField,
  FormSection,
  MetadataList,
  PageContainer,
  PageHeader,
  Panel,
  PermissionState,
  ReconnectPrompt,
  SectionHeader,
  Select,
  StatusBadge,
  SubmitButton,
} from "@envoy/ui";
import { getPrisma, getRuntimeJobById } from "@envoy/db";

import { ProductShell } from "@/components/product-shell";
import {
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/lib/permissions";
import { getWorkspaceOperationalSnapshot } from "@/lib/observability";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  createTestApprovalRequestAction,
  disconnectIntegrationAction,
  previewDraftGeneratorAction,
  renewGmailWatchAction,
  startGmailConnectAction,
  syncIntegrationAction,
  toggleGmailLiveSyncAction,
} from "@/app/settings/workspace/actions";
import { SyncJobRefresh } from "@/app/settings/workspace/sync-job-refresh";
import { getCurrentWorkspaceManagedIntegrations } from "@/lib/integration-management";

export const dynamic = "force-dynamic";

type WorkspaceSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDurationMs(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }

  if (value < 1_000) {
    return `${Math.round(value)} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1_000).toFixed(1)} sec`;
  }

  return `${(value / 60_000).toFixed(1)} min`;
}

function formatIsoDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? formatDateTime(date) : value;
}

function formatSyncLag(minutes: number | null) {
  if (minutes == null) {
    return "Unknown";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 48) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function healthBadgeVariant(severity: string) {
  if (severity === "success") {
    return "success" as const;
  }

  if (severity === "warning") {
    return "warning" as const;
  }

  if (severity === "critical") {
    return "critical" as const;
  }

  return "neutral" as const;
}

function formatHealthStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function formatElapsedSince(value: Date | null, now: Date) {
  if (!value) {
    return "unknown";
  }

  const elapsedMs = Math.max(0, now.getTime() - value.getTime());
  return formatDurationMs(elapsedMs);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRuntimeJobOutput(resultJson: unknown) {
  if (!isObject(resultJson) || !isObject(resultJson.output)) {
    return null;
  }

  return resultJson.output;
}

function readRuntimeJobError(errorJson: unknown) {
  if (!isObject(errorJson)) {
    return null;
  }

  return typeof errorJson.message === "string" && errorJson.message.trim()
    ? errorJson.message
    : null;
}

type MetricPanelProps = {
  label: string;
  value: string | number;
  description: string;
};

function MetricPanel({ label, value, description }: MetricPanelProps) {
  return (
    <Panel variant="subtle" className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-slate-950">
        {value}
      </p>
      <p className="text-xs leading-5 text-slate-600">{description}</p>
    </Panel>
  );
}

export default async function WorkspaceSettingsPage({
  searchParams,
}: WorkspaceSettingsPageProps) {
  const authContext = await requirePermission(
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
  );
  const canManageIntegrations = hasPermission(
    authContext.role,
    PERMISSIONS.CONNECT_INTEGRATIONS,
  );
  const canViewAuditLogs = hasPermission(
    authContext.role,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  );
  const canUseDevApprovalHelper =
    process.env.NODE_ENV !== "production" &&
    canManageIntegrations &&
    authContext.role === "ADMIN";
  const workspace = await getCurrentWorkspace();
  const managedIntegrations = canManageIntegrations
    ? await getCurrentWorkspaceManagedIntegrations()
    : null;
  const operationalSnapshot = canViewAuditLogs
    ? await getWorkspaceOperationalSnapshot({
        workspaceId: authContext.workspaceId,
      })
    : null;
  const devApprovalConversations = canUseDevApprovalHelper
    ? await getPrisma().conversation.findMany({
        where: {
          workspaceId: authContext.workspaceId,
          deletedAt: null,
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "asc" }],
        take: 25,
        select: {
          id: true,
          platform: true,
          subject: true,
          lastMessageAt: true,
          participants: {
            select: {
              displayName: true,
              email: true,
              handle: true,
            },
            orderBy: [{ createdAt: "asc" }],
            take: 2,
          },
        },
      })
    : [];
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const integrationName = readSearchParam(resolvedSearchParams?.integration);
  const integrationAction = readSearchParam(resolvedSearchParams?.action);
  const integrationStatus = readSearchParam(resolvedSearchParams?.status);
  const integrationMessage = readSearchParam(resolvedSearchParams?.message);
  const integrationRecovery = readSearchParam(resolvedSearchParams?.recovery);
  const syncJobId = readSearchParam(resolvedSearchParams?.jobId);
  const syncThreadCount = readSearchParam(resolvedSearchParams?.threadCount);
  const syncMessageCount = readSearchParam(resolvedSearchParams?.messageCount);
  const previewConversationId = readSearchParam(
    resolvedSearchParams?.conversationId,
  );
  const previewPlannerAction = readSearchParam(
    resolvedSearchParams?.plannerAction,
  );
  const previewPlannerConfidence = readSearchParam(
    resolvedSearchParams?.plannerConfidence,
  );
  const previewPlannerRationale = readSearchParam(
    resolvedSearchParams?.plannerRationale,
  );
  const previewGenerationConfidence = readSearchParam(
    resolvedSearchParams?.generationConfidence,
  );
  const previewGenerationRationale = readSearchParam(
    resolvedSearchParams?.generationRationale,
  );
  const previewSuggestedState = readSearchParam(
    resolvedSearchParams?.suggestedState,
  );
  const previewExtractedKeys = readSearchParam(
    resolvedSearchParams?.extractedKeys,
  );
  const previewMessageText = readSearchParam(
    resolvedSearchParams?.proposedMessageText,
  );
  const syncRuntimeJob = syncJobId
    ? await getRuntimeJobById(syncJobId).catch(() => null)
    : null;
  const visibleSyncRuntimeJob =
    syncRuntimeJob?.workspaceId === authContext.workspaceId &&
    syncRuntimeJob.queueName === "sync" &&
    syncRuntimeJob.jobType === "sync.gmail_integration"
      ? syncRuntimeJob
      : null;
  const visibleWatchRuntimeJob =
    syncRuntimeJob?.workspaceId === authContext.workspaceId &&
    syncRuntimeJob.queueName === "maintenance" &&
    syncRuntimeJob.jobType === "maintenance.renew_gmail_watch"
      ? syncRuntimeJob
      : null;
  const snapshotNow = operationalSnapshot
    ? new Date(operationalSnapshot.observedAt)
    : new Date();
  const workerMetricsUpdatedAt = operationalSnapshot?.workerQueueDepth.updatedAt
    ? new Date(operationalSnapshot.workerQueueDepth.updatedAt)
    : null;
  const workerMetricsAgeMs = workerMetricsUpdatedAt
    ? snapshotNow.getTime() - workerMetricsUpdatedAt.getTime()
    : null;
  const workerHeartbeatIsFresh =
    workerMetricsAgeMs != null &&
    Number.isFinite(workerMetricsAgeMs) &&
    workerMetricsAgeMs <= 20_000;

  const conversationOptions = devApprovalConversations.map((conversation) => {
    const fallbackLabel =
      conversation.participants
        .map(
          (participant) =>
            participant.displayName || participant.email || participant.handle,
        )
        .filter(Boolean)
        .join(", ") || "Untitled conversation";

    return {
      value: conversation.id,
      label: `Gmail - ${
        conversation.subject?.trim() || fallbackLabel
      }`,
    };
  });

  function renderIntegrationBanner() {
    if (
      integrationAction === "live-sync" &&
      integrationName === "gmail" &&
      integrationStatus === "enabled"
    ) {
      return (
        <Alert severity="success" title="Gmail live sync enabled">
          Real-time Gmail syncing is on. New Pub/Sub notifications will be
          processed automatically.
        </Alert>
      );
    }

    if (
      integrationAction === "live-sync" &&
      integrationName === "gmail" &&
      integrationStatus === "disabled"
    ) {
      return (
        <Alert severity="neutral" title="Gmail live sync disabled">
          Real-time Gmail syncing is off. Existing messages remain available,
          and you can still use Sync once now whenever you want.
        </Alert>
      );
    }

    if (
      integrationStatus === "queued" &&
      integrationAction === "watch" &&
      integrationName === "gmail"
    ) {
      const runtimeJob = visibleWatchRuntimeJob;

      if (runtimeJob?.status === "COMPLETED") {
        return (
          <Alert severity="success" title="Gmail watch renewed">
            Gmail Pub/Sub watch is active. Polling remains available as a
            fallback.
          </Alert>
        );
      }

      if (
        runtimeJob?.status === "FAILED" ||
        runtimeJob?.status === "DEAD_LETTERED"
      ) {
        return (
          <Alert severity="warning" title="Gmail watch renewal failed">
            {readRuntimeJobError(runtimeJob.lastErrorJson) ??
              "Gmail watch could not be renewed. Bounded polling remains active."}
          </Alert>
        );
      }

      if (runtimeJob?.status === "RUNNING") {
        return (
          <Alert severity="info" title="Gmail watch renewal running">
            <SyncJobRefresh />
            The worker is renewing Gmail Pub/Sub watch now. Polling remains
            active while this runs.
          </Alert>
        );
      }

      return (
        <Alert severity="info" title="Gmail watch renewal queued">
          <SyncJobRefresh />
          The watch renewal job is queued. Polling remains active while the
          worker handles the provider request.
        </Alert>
      );
    }

    if (
      integrationStatus === "queued" &&
      integrationAction === "sync" &&
      integrationName === "gmail"
    ) {
      const providerLabel = "Gmail";
      const runtimeJob = visibleSyncRuntimeJob;

      if (runtimeJob?.status === "COMPLETED") {
        const output = readRuntimeJobOutput(runtimeJob.resultJson);
        const messageCount = readNumber(output?.messageCount);
        const threadCount = readNumber(output?.threadCount);
        const pagesProcessed = readNumber(output?.pagesProcessed);
        const hasMore = output?.hasMore === true;

        return (
          <Alert severity="success" title={`${providerLabel} sync completed`}>
            Pages processed: {pagesProcessed ?? "n/a"}. Threads fetched:{" "}
            {threadCount ?? "n/a"}. Messages written:{" "}
            {messageCount ?? "n/a"}.{" "}
            {hasMore
              ? "More pages remain for the next run."
              : "No more pages remain."}
          </Alert>
        );
      }

      if (
        runtimeJob?.status === "FAILED" ||
        runtimeJob?.status === "DEAD_LETTERED"
      ) {
        return (
          <Alert severity="critical" title={`${providerLabel} sync failed`}>
            {readRuntimeJobError(runtimeJob.lastErrorJson) ??
              "The worker could not complete this sync job."}
          </Alert>
        );
      }

      if (runtimeJob?.status === "RUNNING") {
        return (
          <Alert severity="info" title={`${providerLabel} sync running`}>
            <SyncJobRefresh />
            The worker is syncing this integration now. This page will refresh
            automatically until the job completes.
          </Alert>
        );
      }

      if (runtimeJob?.status === "QUEUED" && !workerHeartbeatIsFresh) {
        return (
          <Alert severity="warning" title={`${providerLabel} sync waiting for worker`}>
            <SyncJobRefresh />
            This sync job has been queued for{" "}
            {formatElapsedSince(runtimeJob.queuedAt, snapshotNow)}.
            The worker heartbeat is{" "}
            {workerMetricsUpdatedAt
              ? `${formatElapsedSince(workerMetricsUpdatedAt, snapshotNow)} old`
              : "unavailable"}
            , so the worker is probably not running or cannot write health
            metrics. Start the worker process and this queued job should run.
          </Alert>
        );
      }

      if (runtimeJob?.status === "CANCELLED") {
        return (
          <Alert severity="warning" title={`${providerLabel} sync cancelled`}>
            This sync job was cancelled before it completed.
          </Alert>
        );
      }

      return (
        <Alert
          severity="info"
          title={`${providerLabel} sync queued`}
        >
          <SyncJobRefresh />
          The sync job is waiting for the worker. Queued for{" "}
          {runtimeJob
            ? formatElapsedSince(runtimeJob.queuedAt, snapshotNow)
            : "unknown"}. This page will refresh automatically and show
          completion or failure when the worker finishes.
        </Alert>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "sync" &&
      integrationName === "gmail"
    ) {
      return (
        <Alert severity="success" title="Gmail sync completed">
          Threads fetched: {syncThreadCount ?? "0"}. Messages written:{" "}
          {syncMessageCount ?? "0"}.
        </Alert>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "create" &&
      integrationName === "approval-test"
    ) {
      return (
        <Alert severity="success" title="Approval created">
          Approval request created successfully.
        </Alert>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "preview" &&
      integrationName === "draft-preview"
    ) {
      return (
        <Alert severity="success" title="Draft preview generated">
          Draft preview generated successfully.
        </Alert>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "disconnect" &&
      integrationName
    ) {
      return (
      <Alert severity="neutral" title="Integration disconnected">
          Gmail disconnected successfully.
        </Alert>
      );
    }

    if (
      integrationStatus === "connected" &&
      integrationName === "gmail"
    ) {
      const providerLabel = "Gmail";
      const reconnected = integrationAction === "reconnect";
      const recoveryCopy =
        integrationRecovery === "queued"
          ? "Recovery sync and Gmail watch renewal were queued in the worker. Existing conversations and messages were preserved. Bounded polling remains active if watch renewal cannot run."
          : integrationRecovery === "partial"
            ? "Credentials were updated and history was preserved, but one recovery job could not be queued. Use the recovery actions below if needed."
            : integrationRecovery === "failed"
              ? "Credentials were updated and history was preserved, but recovery work could not be queued. Use Resume sync below after the worker is available."
              : "Credentials were updated and existing history was preserved.";

      return (
        <Alert
          severity={integrationRecovery === "failed" ? "warning" : "success"}
          title={`${providerLabel} ${reconnected ? "reconnected" : "connected"}`}
        >
          {recoveryCopy}
        </Alert>
      );
    }

    if (
      integrationStatus === "error" &&
      integrationMessage &&
        (integrationName === "gmail" ||
        integrationName === "approval-test" ||
        integrationName === "draft-preview")
    ) {
      return (
        <Alert
          severity="critical"
          title={
            integrationAction === "sync"
              ? "Gmail sync failed"
              : integrationAction === "watch"
                ? "Gmail watch renewal failed"
              : integrationAction === "live-sync"
                ? "Gmail live sync update failed"
              : integrationName === "approval-test"
                ? "Approval request creation failed"
              : integrationName === "draft-preview"
                  ? "Draft preview generation failed"
                  : "Gmail connect failed"
          }
        >
          {integrationMessage}
        </Alert>
      );
    }

    return null;
  }

  return (
    <ProductShell activeSection="settings">
      <PageContainer width="wide">
        <PageHeader
          title="Workspace settings"
          description="Manage workspace metadata, connector operations, and administrative diagnostics."
        />

        <div className="flex flex-col gap-6">
          {renderIntegrationBanner()}

          <section className="order-3 space-y-4">
            <SectionHeader
              title="Workspace metadata"
              description="Workspace identity and current operator context."
            />

            {workspace ? (
              <MetadataList
                items={[
                  { label: "Workspace name", value: workspace.name },
                  {
                    label: "Created",
                    value: formatDateTime(workspace.createdAt),
                  },
                  { label: "Current user", value: authContext.email },
                  { label: "Current role", value: authContext.role },
                  {
                    label: "Workspace ID",
                    value: workspace.id,
                    copyValue: workspace.id,
                  },
                ]}
              />
            ) : (
              <Alert severity="warning" title="Workspace unavailable">
                The current workspace could not be loaded for this session. The
                authenticated user context is still available, but the workspace
                record lookup returned no result.
              </Alert>
            )}
          </section>

          <section className="order-1 space-y-4">
            <SectionHeader
              title="Integrations"
              description="Connect, reconnect, sync, and disconnect the canonical Gmail integration."
            />

            {canManageIntegrations ? (
              <div className="grid gap-4 lg:grid-cols-1">
                {managedIntegrations?.map((integration) => {
                  const hasGmailWatchProblem =
                    integration.provider === "gmail" &&
                    (
                      integration.health.watchStatus?.includes("ERROR") ||
                      integration.health.watchStatus?.includes("expired") ||
                      integration.health.reason
                        .toLowerCase()
                        .includes("gmail watch")
                    );
                  const needsReconnect =
                    integration.health.authProblem ||
                    (
                      integration.health.status === "action_required" &&
                      !hasGmailWatchProblem
                    ) ||
                    integration.health.status === "disconnected" ||
                    integration.status === "DISCONNECTED";
                  const canRunSync =
                    Boolean(integration.integrationId) &&
                    !needsReconnect &&
                    (
                      integration.status === "ERROR" ||
                      integration.status === "CONNECTED" ||
                      integration.status === "SYNC_IN_PROGRESS"
                    );
                  const showGmailWatchRecovery =
                    integration.provider === "gmail" &&
                    Boolean(integration.integrationId) &&
                    integration.liveSyncEnabled &&
                    !integration.health.authProblem &&
                    integration.status !== "DISCONNECTED" &&
                    (
                      hasGmailWatchProblem
                    );
                  const connectLabel =
                    integration.integrationId ? "Reconnect Gmail" : "Connect Gmail";
                  const syncLabel = "Sync once now";

                  return (
                  <Panel key={integration.platform} className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <Badge variant="platform">
                          Gmail
                        </Badge>
                        <h2 className="mt-2 break-all text-lg font-semibold text-slate-950">
                          {integration.displayName}
                        </h2>
                      </div>
                      <StatusBadge
                        className="self-start"
                        domain="integration"
                        status={integration.status ?? "DISCONNECTED"}
                        labelOverride={integration.statusLabel}
                      />
                      <Badge
                        className="self-start"
                        variant={healthBadgeVariant(integration.health.severity)}
                      >
                        {formatHealthStatus(integration.health.status)}
                      </Badge>
                    </div>

                    <MetadataList
                      items={[
                        { label: "Source", value: "Gmail" },
                        {
                          label: "Health reason",
                          value: integration.health.reason,
                        },
                        {
                          label: "Recommended action",
                          value: integration.health.recommendedAction,
                        },
                        {
                          label: "Last successful sync",
                          value: formatIsoDateTime(
                            integration.health.lastSuccessfulSyncAt,
                          ),
                        },
                        {
                          label: "Last attempted sync",
                          value: formatIsoDateTime(
                            integration.health.lastAttemptedSyncAt,
                          ),
                        },
                        {
                          label: "Sync lag",
                          value: formatSyncLag(
                            integration.health.syncLagMinutes,
                          ),
                        },
                        {
                          label: "More pages",
                          value: integration.health.hasMoreSyncPages
                            ? "Yes"
                            : "No",
                        },
                        {
                          label: "Auth problem",
                          value: integration.health.authProblem ? "Yes" : "No",
                        },
                        {
                          label: "Rate limited",
                          value: integration.health.rateLimited ? "Yes" : "No",
                        },
                        ...(integration.provider === "gmail"
                          ? [
                        {
                          label: "Live sync",
                          value: integration.liveSyncEnabled ? "On" : "Off",
                        },
                        {
                          label: "Gmail watch",
                          value:
                            integration.health.watchStatus ??
                                  "Unavailable",
                              },
                            ]
                          : []),
                        {
                          label: "Last connector error",
                          value:
                            integration.health.lastError ??
                            "No connector error recorded.",
                        },
                        {
                          label: "Last synced",
                          value: formatDateTime(integration.lastSyncedAt),
                        },
                        {
                          label: "Diagnostics",
                          value:
                            integration.diagnosticsSummary ??
                            "No diagnostics available.",
                        },
                        {
                          label: "Status detail",
                          value:
                            integration.statusSummary ??
                            "No additional status detail.",
                        },
                      ]}
                    />

                    {needsReconnect ? (
                      <ReconnectPrompt
                        description="Reconnect this integration before sync or send operations continue. Existing conversations and messages will be preserved."
                      />
                    ) : null}

                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={startGmailConnectAction}>
                          <Button
                            type="submit"
                            variant={
                              needsReconnect || !integration.integrationId
                                ? "primary"
                                : "secondary"
                            }
                          >
                            {connectLabel}
                          </Button>
                        </form>

                        {canRunSync ? (
                          <form action={syncIntegrationAction}>
                            <input
                              type="hidden"
                              name="integrationId"
                              value={integration.integrationId ?? ""}
                            />
                            <Button
                              type="submit"
                              variant={
                                integration.health.hasMoreSyncPages
                                  ? "primary"
                                  : "accent"
                              }
                            >
                              {syncLabel}
                            </Button>
                          </form>
                        ) : null}
                        {integration.integrationId ? (
                          <form action={toggleGmailLiveSyncAction}>
                            <input
                              type="hidden"
                              name="integrationId"
                              value={integration.integrationId}
                            />
                            <input
                              type="hidden"
                              name="enabled"
                              value={integration.liveSyncEnabled ? "false" : "true"}
                            />
                            <Button type="submit" variant="secondary">
                              {integration.liveSyncEnabled
                                ? "Turn off live Gmail sync"
                                : "Turn on live Gmail sync"}
                            </Button>
                          </form>
                        ) : null}
                        {showGmailWatchRecovery ? (
                          <form action={renewGmailWatchAction}>
                            <input
                              type="hidden"
                              name="integrationId"
                              value={integration.integrationId ?? ""}
                            />
                            <Button type="submit" variant="secondary">
                              Renew Gmail watch
                            </Button>
                          </form>
                        ) : null}
                      </div>

                      {integration.integrationId &&
                      integration.status !== "DISCONNECTED" ? (
                        <div className="border-t border-slate-200 pt-3">
                          <form action={disconnectIntegrationAction}>
                            <input
                              type="hidden"
                              name="integrationId"
                              value={integration.integrationId}
                            />
                            <Button type="submit" variant="danger">
                              Disconnect
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                  );
                })}
              </div>
            ) : (
              <PermissionState
                title="Integration permission required"
                description="You can view workspace settings, but your current role cannot manage connector setup or sync actions."
                requiredPermission={PERMISSIONS.CONNECT_INTEGRATIONS}
                currentRole={authContext.role}
              />
            )}
          </section>

          {canViewAuditLogs && operationalSnapshot ? (
            <section className="order-2 space-y-4">
              <SectionHeader
                title="Operational snapshot"
                description="Dashboard-ready metrics derived from canonical operational data for this workspace."
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricPanel
                  label="Sync failures"
                  value={
                    operationalSnapshot.connectorSyncFailures
                      .activeErrorIntegrations
                  }
                  description="Active integration errors"
                />
                <MetricPanel
                  label="Send failure rate"
                  value={`${(
                    operationalSnapshot.sendFailureRate.failureRate * 100
                  ).toFixed(1)}%`}
                  description={`${operationalSnapshot.sendFailureRate.failedOutboundAttempts}/${operationalSnapshot.sendFailureRate.totalOutboundAttempts} outbound attempts`}
                />
                <MetricPanel
                  label="Worker queue depth"
                  value={
                    operationalSnapshot.workerQueueDepth.queuedJobCount ?? "n/a"
                  }
                  description={`in-flight ${
                    operationalSnapshot.workerQueueDepth.inFlightJobCount ?? "n/a"
                  } / dead-letter ${
                    operationalSnapshot.workerQueueDepth.deadLetterCount ?? "n/a"
                  }`}
                />
                <MetricPanel
                  label="Avg agent latency"
                  value={formatDurationMs(
                    operationalSnapshot.averageAgentLatency.averageLatencyMs,
                  )}
                  description={`${operationalSnapshot.averageAgentLatency.sampleCount} samples`}
                />
                <MetricPanel
                  label="Approval turnaround"
                  value={formatDurationMs(
                    operationalSnapshot.approvalTurnaroundTime
                      .averageTurnaroundMs,
                  )}
                  description={`${operationalSnapshot.approvalTurnaroundTime.sampleCount} reviewed approvals`}
                />
              </div>

              <Alert severity="neutral" title="Snapshot window">
                Window starts{" "}
                {formatDateTime(new Date(operationalSnapshot.windowStartedAt))}.
                Snapshot captured{" "}
                {formatDateTime(new Date(operationalSnapshot.observedAt))}.
                {operationalSnapshot.workerQueueDepth.updatedAt
                  ? ` Worker metrics updated ${formatDateTime(
                      new Date(operationalSnapshot.workerQueueDepth.updatedAt),
                    )}.`
                  : " Worker metrics unavailable."}
              </Alert>
            </section>
          ) : null}

          {canUseDevApprovalHelper ? (
            <FormSection
              title="Review tools"
              description="Admin-only tools for reviewing approval and draft-generation flows in this workspace."
              className="order-4 border-amber-200 bg-amber-50"
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <form
                  action={createTestApprovalRequestAction}
                  className="space-y-4"
                >
                  <SectionHeader
                    title="Approval review draft"
                    description="Create a draft and approval request for an existing conversation."
                  />
                  {devApprovalConversations.length > 0 ? (
                    <FormField label="Conversation">
                      <Select
                        name="conversationId"
                        defaultValue=""
                        placeholder="Auto-pick most recent conversation"
                        options={conversationOptions}
                      />
                    </FormField>
                  ) : (
                    <EmptyState
                      variant="noData"
                      title="No conversations"
                      description="There are no conversations available for the helper to use."
                    />
                  )}
                  <SubmitButton variant="secondary">
                    Create approval request
                  </SubmitButton>
                </form>

                <form
                  action={previewDraftGeneratorAction}
                  className="space-y-4"
                >
                  <SectionHeader
                    title="Draft preview"
                    description="Run planner and draft generation for a selected conversation without saving."
                  />
                  {devApprovalConversations.length > 0 ? (
                    <FormField label="Conversation">
                      <Select
                        name="conversationId"
                        defaultValue=""
                        placeholder="Auto-pick most recent conversation"
                        options={conversationOptions}
                      />
                    </FormField>
                  ) : (
                    <EmptyState
                      variant="noData"
                      title="No conversations"
                      description="There are no conversations available for the helper to use."
                    />
                  )}
                  <SubmitButton variant="secondary">
                    Preview draft
                  </SubmitButton>
                </form>
              </div>

              {integrationName === "draft-preview" &&
              integrationAction === "preview" ? (
                <Panel className="space-y-4">
                  <SectionHeader title="Draft preview result" />
                  <MetadataList
                    items={[
                      {
                        label: "Conversation",
                        value: previewConversationId ?? "Unavailable",
                      },
                      {
                        label: "Planner action",
                        value: `${previewPlannerAction ?? "Unavailable"} (${
                          previewPlannerConfidence ?? "n/a"
                        })`,
                      },
                      {
                        label: "Generation confidence",
                        value: previewGenerationConfidence ?? "n/a",
                      },
                      {
                        label: "Suggested state",
                        value: previewSuggestedState || "none",
                      },
                      {
                        label: "Extracted keys",
                        value: previewExtractedKeys ?? "none",
                      },
                      {
                        label: "Planner rationale",
                        value: previewPlannerRationale ?? "Unavailable",
                      },
                      {
                        label: "Generation rationale",
                        value: previewGenerationRationale ?? "Unavailable",
                      },
                    ]}
                  />
                  <Panel variant="subtle">
                    <p className="text-xs font-medium text-slate-500">
                      Proposed message text
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                      {previewMessageText ?? "No proposed text available."}
                    </pre>
                  </Panel>
                </Panel>
              ) : null}
            </FormSection>
          ) : null}
        </div>
      </PageContainer>
    </ProductShell>
  );
}
