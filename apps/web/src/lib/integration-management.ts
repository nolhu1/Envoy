import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import {
  listWorkspaceConnectorHealth,
  type ConnectorHealthSummary,
} from "@/lib/connector-health";
import { sanitizeUiErrorMessage } from "@/lib/security";

type IntegrationPlatform = "EMAIL" | "SLACK";
type IntegrationStatus =
  | "PENDING"
  | "CONNECTED"
  | "SYNC_IN_PROGRESS"
  | "ERROR"
  | "DISCONNECTED";

type IntegrationRecord = {
  id: string;
  platform: IntegrationPlatform;
  displayName: string | null;
  externalAccountId: string | null;
  status: IntegrationStatus;
  lastSyncedAt: Date | null;
  platformMetadataJson: unknown;
  deletedAt: Date | null;
};

export type ManagedIntegration = {
  provider: "gmail" | "slack";
  platform: IntegrationPlatform;
  integrationId: string | null;
  displayName: string;
  status: IntegrationStatus | null;
  statusLabel: string;
  lastSyncedAt: Date | null;
  diagnosticsSummary: string | null;
  statusSummary: string | null;
  isConnected: boolean;
  requiresReconnect: boolean;
  health: ConnectorHealthSummary;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProvider(value: unknown) {
  if (!isJsonObject(value) || typeof value.provider !== "string") {
    return null;
  }

  return value.provider === "gmail" || value.provider === "slack"
    ? value.provider
    : null;
}

function readCheckpointNumber(checkpoint: Record<string, unknown>, key: string) {
  const value = checkpoint[key];

  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

function readCheckpointString(checkpoint: Record<string, unknown>, key: string) {
  const value = checkpoint[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readGmailWatchSummary(metadata: Record<string, unknown> | null) {
  const gmailWatch = isJsonObject(metadata?.gmailWatch)
    ? metadata.gmailWatch
    : null;

  if (!gmailWatch) {
    return null;
  }

  const status =
    typeof gmailWatch.status === "string" && gmailWatch.status.trim()
      ? gmailWatch.status.trim()
      : "UNKNOWN";
  const expiration =
    typeof gmailWatch.expiration === "string" && gmailWatch.expiration.trim()
      ? gmailWatch.expiration.trim()
      : null;
  const lastRenewedAt =
    typeof gmailWatch.lastRenewedAt === "string" &&
    gmailWatch.lastRenewedAt.trim()
      ? gmailWatch.lastRenewedAt.trim()
      : null;
  const lastError =
    isJsonObject(gmailWatch.lastError) &&
    typeof gmailWatch.lastError.message === "string"
      ? sanitizeUiErrorMessage(gmailWatch.lastError.message)
      : null;
  const isExpired =
    expiration &&
    Number.isFinite(new Date(expiration).getTime()) &&
    new Date(expiration).getTime() <= Date.now();
  const parts = [
    `Gmail watch ${status.toLowerCase()}`,
    isExpired ? "expired" : null,
    expiration ? `expires ${expiration}` : null,
    lastRenewedAt ? `renewed ${lastRenewedAt}` : null,
    lastError ? `watch issue: ${lastError}` : null,
  ].filter(Boolean);

  return parts.join(" - ");
}

function readDiagnosticsSummary(record: IntegrationRecord) {
  const metadata = isJsonObject(record.platformMetadataJson)
    ? record.platformMetadataJson
    : null;

  if (!metadata) {
    return null;
  }

  if (typeof metadata.connectError === "string" && metadata.connectError) {
    return sanitizeUiErrorMessage(metadata.connectError);
  }

  if (
    typeof metadata.lastFailureCategory === "string" &&
    metadata.lastFailureCategory
  ) {
    return `Last sync issue: ${metadata.lastFailureCategory}`;
  }

  if (typeof metadata.connectedEmail === "string" && metadata.connectedEmail) {
    return sanitizeUiErrorMessage(metadata.connectedEmail);
  }

  const gmailWatch = isJsonObject(metadata.gmailWatch)
    ? metadata.gmailWatch
    : null;

  if (
    gmailWatch &&
    isJsonObject(gmailWatch.lastError) &&
    typeof gmailWatch.lastError.message === "string"
  ) {
    return sanitizeUiErrorMessage(gmailWatch.lastError.message);
  }

  if (typeof metadata.slackTeamName === "string" && metadata.slackTeamName) {
    return sanitizeUiErrorMessage(metadata.slackTeamName);
  }

  if (typeof metadata.slackWorkspaceUrl === "string" && metadata.slackWorkspaceUrl) {
    return sanitizeUiErrorMessage(metadata.slackWorkspaceUrl);
  }

  const checkpoint =
    isJsonObject(metadata.gmailSyncCheckpoint)
      ? metadata.gmailSyncCheckpoint
      : isJsonObject(metadata.slackSyncCheckpoint)
        ? metadata.slackSyncCheckpoint
        : null;

  if (
    checkpoint &&
    isJsonObject(checkpoint.diagnosticsSummary) &&
    typeof checkpoint.diagnosticsSummary.message === "string"
  ) {
    return sanitizeUiErrorMessage(checkpoint.diagnosticsSummary.message);
  }

  return null;
}

function readStatusSummary(record: IntegrationRecord) {
  if (record.status === "ERROR") {
    return "Integration needs reconnect or resync.";
  }

  if (record.status === "SYNC_IN_PROGRESS") {
    return "Sync is currently running.";
  }

  if (record.status === "DISCONNECTED") {
    return "Integration has been disconnected.";
  }

  const metadata = isJsonObject(record.platformMetadataJson)
    ? record.platformMetadataJson
    : null;
  const checkpoint =
    isJsonObject(metadata?.gmailSyncCheckpoint)
      ? metadata.gmailSyncCheckpoint
      : isJsonObject(metadata?.slackSyncCheckpoint)
        ? metadata.slackSyncCheckpoint
        : null;

  if (checkpoint && typeof checkpoint.status === "string") {
    const pagesProcessed = readCheckpointNumber(
      checkpoint,
      "totalPagesProcessed",
    );
    const threadsProcessed =
      readCheckpointNumber(checkpoint, "totalThreadsProcessed") ??
      readCheckpointNumber(checkpoint, "threadCount");
    const dmConversationsProcessed = readCheckpointNumber(
      checkpoint,
      "totalDmConversationsProcessed",
    );
    const canonicalConversationsProcessed = readCheckpointNumber(
      checkpoint,
      "totalCanonicalConversationsProcessed",
    );
    const messagesInserted =
      readCheckpointNumber(checkpoint, "totalMessagesInserted") ??
      readCheckpointNumber(checkpoint, "messageCount");
    const lastSuccessfulSyncAt = readCheckpointString(
      checkpoint,
      "lastSuccessfulSyncAt",
    );
    const hasMore = checkpoint.hasMore === true;
    const parts = [
      `Last checkpoint: ${checkpoint.status}`,
      pagesProcessed == null ? null : `pages ${pagesProcessed}`,
      dmConversationsProcessed == null
        ? null
        : `DMs ${dmConversationsProcessed}`,
      canonicalConversationsProcessed == null
        ? null
        : `canonical conversations ${canonicalConversationsProcessed}`,
      threadsProcessed == null ? null : `threads ${threadsProcessed}`,
      messagesInserted == null ? null : `messages ${messagesInserted}`,
      hasMore ? "more pages remain" : "no more pages",
      lastSuccessfulSyncAt ? `last success ${lastSuccessfulSyncAt}` : null,
    ].filter(Boolean);

    const watchSummary = readGmailWatchSummary(metadata);

    return [...parts, watchSummary].filter(Boolean).join(" - ");
  }

  const watchSummary = readGmailWatchSummary(metadata);

  if (watchSummary) {
    return watchSummary;
  }

  return null;
}

function toManagedIntegration(
  platform: IntegrationPlatform,
  record: IntegrationRecord | null,
  health: ConnectorHealthSummary,
): ManagedIntegration {
  const provider = platform === "EMAIL" ? "gmail" : "slack";

  if (!record) {
    return {
      provider,
      platform,
      integrationId: null,
      displayName: platform === "EMAIL" ? "Gmail" : "Slack",
      status: null,
      statusLabel: "Not connected",
      lastSyncedAt: null,
      diagnosticsSummary: null,
      statusSummary: "Not connected.",
      isConnected: false,
      requiresReconnect: false,
      health,
    };
  }

  return {
    provider,
    platform,
    integrationId: record.id,
    displayName:
      record.displayName ||
      record.externalAccountId ||
      (platform === "EMAIL" ? "Gmail" : "Slack"),
    status: record.status,
    statusLabel: record.status,
    lastSyncedAt: record.lastSyncedAt,
    diagnosticsSummary: readDiagnosticsSummary(record),
    statusSummary: readStatusSummary(record),
    isConnected: record.status !== "DISCONNECTED",
    requiresReconnect:
      record.status === "ERROR" || record.status === "DISCONNECTED",
    health,
  };
}

export async function getCurrentWorkspaceManagedIntegrations() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();
  const [integrations, healthSummaries] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: authContext.workspaceId,
        OR: [
          {
            deletedAt: null,
          },
          {
            status: "DISCONNECTED",
          },
        ],
        platform: {
          in: ["EMAIL", "SLACK"],
        },
      },
      select: {
        id: true,
        platform: true,
        displayName: true,
        externalAccountId: true,
        status: true,
        lastSyncedAt: true,
        platformMetadataJson: true,
        deletedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    listWorkspaceConnectorHealth({
      workspaceId: authContext.workspaceId,
      includeDisconnectedPlaceholders: true,
    }),
  ]);

  const byPlatform = new Map<IntegrationPlatform, IntegrationRecord>();
  const healthByIntegrationId = new Map(
    healthSummaries.flatMap((health) =>
      health.integrationId ? [[health.integrationId, health] as const] : [],
    ),
  );
  const healthByProvider = new Map(
    healthSummaries.map((health) => [health.provider, health] as const),
  );

  for (const integration of integrations) {
    const provider = readProvider(integration.platformMetadataJson);

    if (
      (integration.platform === "EMAIL" && provider !== "gmail") ||
      (integration.platform === "SLACK" && provider !== "slack")
    ) {
      continue;
    }

    if (!byPlatform.has(integration.platform)) {
      byPlatform.set(integration.platform, integration as IntegrationRecord);
    }
  }

  return [
    toManagedIntegration(
      "EMAIL",
      byPlatform.get("EMAIL") ?? null,
      healthByIntegrationId.get(byPlatform.get("EMAIL")?.id ?? "") ??
        healthByProvider.get("gmail")!,
    ),
    toManagedIntegration(
      "SLACK",
      byPlatform.get("SLACK") ?? null,
      healthByIntegrationId.get(byPlatform.get("SLACK")?.id ?? "") ??
        healthByProvider.get("slack")!,
    ),
  ];
}
