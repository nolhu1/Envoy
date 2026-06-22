import "server-only";

import { getPrisma } from "@envoy/db";

import { sanitizeUiText } from "@/lib/security";

export type ConnectorHealthStatus =
  | "healthy"
  | "degraded"
  | "action_required"
  | "disconnected"
  | "unknown";

export type ConnectorHealthSeverity =
  | "success"
  | "warning"
  | "critical"
  | "neutral";

export type ConnectorHealthSummary = {
  integrationId: string | null;
  provider: "gmail";
  platform: "EMAIL";
  displayName: string;
  lifecycleStatus: string | null;
  status: ConnectorHealthStatus;
  reason: string;
  severity: ConnectorHealthSeverity;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  syncLagMinutes: number | null;
  hasMoreSyncPages: boolean;
  authProblem: boolean;
  rateLimited: boolean;
  liveSyncEnabled: boolean;
  watchStatus: string | null;
  lastError: string | null;
  recommendedAction: string;
  recentRuntimeFailureCount: number;
};

type IntegrationRecord = {
  id: string;
  platform: "EMAIL";
  displayName: string | null;
  externalAccountId: string | null;
  status: string;
  lastSyncedAt: Date | null;
  platformMetadataJson: unknown;
};

type RuntimeFailureRecord = {
  jobType: string;
  status: string;
  payloadJson: unknown;
  lastErrorJson: unknown;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
};

const SYNC_LAG_DEGRADED_MINUTES = 24 * 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProvider(value: unknown) {
  if (!isObject(value) || typeof value.provider !== "string") {
    return null;
  }

  return value.provider === "gmail" ? value.provider : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readErrorMessage(value: unknown) {
  if (!isObject(value)) {
    return typeof value === "string" ? sanitizeUiText(value) : null;
  }

  return readString(value.message) ? sanitizeUiText(value.message) : null;
}

function readCheckpoint(metadata: Record<string, unknown> | null) {
  if (isObject(metadata?.gmailSyncCheckpoint)) {
    return metadata.gmailSyncCheckpoint;
  }

  return null;
}

function readWatch(metadata: Record<string, unknown> | null) {
  return isObject(metadata?.gmailWatch) ? metadata.gmailWatch : null;
}

function readDateIso(value: unknown) {
  const candidate = readString(value);

  if (!candidate) {
    return null;
  }

  const date = new Date(candidate);

  return Number.isFinite(date.getTime()) ? date.toISOString() : candidate;
}

function readLiveSyncEnabled(metadata: Record<string, unknown> | null) {
  return typeof metadata?.gmailLiveSyncEnabled === "boolean"
    ? metadata.gmailLiveSyncEnabled
    : true;
}

function minutesSince(value: string | null, now: Date) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}

function looksAuthProblem(message: string | null, category: string | null) {
  const text = `${category ?? ""} ${message ?? ""}`.toLowerCase();

  return (
    text.includes("auth") ||
    text.includes("oauth") ||
    text.includes("401") ||
    text.includes("unauthorized") ||
    text.includes("reconnect")
  );
}

function looksRateLimited(message: string | null) {
  const text = (message ?? "").toLowerCase();

  return (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("ratelimit") ||
    text.includes("quota")
  );
}

function getRuntimeFailureIntegrationId(record: RuntimeFailureRecord) {
  return isObject(record.payloadJson) ? readString(record.payloadJson.integrationId) : null;
}

function getRuntimeFailureMessage(records: RuntimeFailureRecord[]) {
  const latest = records[0];

  return latest ? readErrorMessage(latest.lastErrorJson) : null;
}

function createNoIntegrationHealth(
  platform: "EMAIL",
): ConnectorHealthSummary {
  const provider = "gmail";

  return {
    integrationId: null,
    provider,
    platform,
    displayName: "Gmail",
    lifecycleStatus: null,
    status: "disconnected",
    reason: "Integration is not connected.",
    severity: "neutral",
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    syncLagMinutes: null,
    hasMoreSyncPages: false,
    authProblem: false,
    rateLimited: false,
    liveSyncEnabled: true,
    watchStatus: null,
    lastError: null,
    recommendedAction: "Connect Gmail.",
    recentRuntimeFailureCount: 0,
  };
}

export function evaluateConnectorHealth(input: {
  integration: IntegrationRecord;
  recentRuntimeFailures?: RuntimeFailureRecord[];
  now?: Date;
}): ConnectorHealthSummary {
  const now = input.now ?? new Date();
  const metadata = isObject(input.integration.platformMetadataJson)
    ? input.integration.platformMetadataJson
    : null;
  const provider = "gmail";
  const checkpoint = readCheckpoint(metadata);
  const gmailWatch = provider === "gmail" ? readWatch(metadata) : null;
  const recentRuntimeFailures = input.recentRuntimeFailures ?? [];
  const checkpointLastError =
    checkpoint && isObject(checkpoint.lastError) ? checkpoint.lastError : null;
  const pushLastError =
    checkpoint && isObject(checkpoint.lastPushError)
      ? checkpoint.lastPushError
      : null;
  const watchLastError =
    gmailWatch && isObject(gmailWatch.lastError) ? gmailWatch.lastError : null;
  const runtimeLastError = getRuntimeFailureMessage(recentRuntimeFailures);
  const lastError =
    readErrorMessage(watchLastError) ??
    readErrorMessage(pushLastError) ??
    readErrorMessage(checkpointLastError) ??
    runtimeLastError;
  const lastErrorCategory =
    readString(watchLastError?.category) ??
    readString(pushLastError?.category) ??
    readString(checkpointLastError?.category);
  const lastSuccessfulSyncAt =
    readDateIso(checkpoint?.lastSuccessfulSyncAt) ??
    (input.integration.lastSyncedAt
      ? input.integration.lastSyncedAt.toISOString()
      : null);
  const lastAttemptedSyncAt =
    readDateIso(checkpoint?.lastAttemptedSyncAt) ??
    readDateIso(checkpoint?.lastHistoryAttemptedAt) ??
    null;
  const syncLagMinutes = minutesSince(lastSuccessfulSyncAt, now);
  const hasMoreSyncPages = checkpoint?.hasMore === true;
  const historyHasGap = checkpoint?.historyHasGap === true;
  const liveSyncEnabled = readLiveSyncEnabled(metadata);
  const watchStatus = readString(gmailWatch?.status);
  const watchExpiration = readDateIso(gmailWatch?.expiration);
  const watchExpired =
    Boolean(watchExpiration) &&
    new Date(watchExpiration ?? "").getTime() <= now.getTime();
  const rateLimited = looksRateLimited(lastError);
  const authProblem =
    !rateLimited && looksAuthProblem(lastError, lastErrorCategory);
  const runtimeFailureCount = recentRuntimeFailures.length;

  let status: ConnectorHealthStatus = "healthy";
  let severity: ConnectorHealthSeverity = "success";
  let reason = "Connector is operating normally.";
  let recommendedAction = "No action needed.";

  if (input.integration.status === "DISCONNECTED") {
    status = "disconnected";
    severity = "neutral";
    reason = "Integration is disconnected.";
    recommendedAction = "Reconnect Gmail.";
  } else if (authProblem) {
    status = "action_required";
    severity = "critical";
    reason = "Connector requires reauthorization or operator action.";
    recommendedAction = "Reconnect Gmail.";
  } else if (rateLimited) {
    status = "degraded";
    severity = "warning";
    reason = "Provider rate limiting or quota pressure was detected.";
    recommendedAction = "Wait for provider limits to recover, then retry sync.";
  } else if (
    liveSyncEnabled &&
    (
      watchStatus === "ERROR" ||
      watchStatus === "NOT_CONFIGURED" ||
      watchExpired
    )
  ) {
    status = provider === "gmail" && watchStatus === "ERROR"
      ? "action_required"
      : "degraded";
    severity = status === "action_required" ? "critical" : "warning";
    reason = watchExpired
      ? "Gmail watch has expired; bounded polling remains available."
      : "Gmail watch is not healthy; bounded polling remains available.";
    recommendedAction = "Renew Gmail watch and verify Pub/Sub configuration.";
  } else if (historyHasGap) {
    status = "degraded";
    severity = "warning";
    reason = "Gmail history has a gap; bounded polling is needed to converge.";
    recommendedAction = "Run bounded Gmail sync.";
  } else if (runtimeFailureCount > 0) {
    status = "degraded";
    severity = "warning";
    reason = "Recent connector runtime job failures were detected.";
    recommendedAction = "Inspect runtime failures and retry after the cause is fixed.";
  } else if (input.integration.status === "SYNC_IN_PROGRESS") {
    status = "degraded";
    severity = "warning";
    reason = "Connector sync is currently in progress.";
    recommendedAction = "Monitor the worker job until it completes.";
  } else if (hasMoreSyncPages) {
    status = "degraded";
    severity = "warning";
    reason = "More sync pages remain.";
    recommendedAction = "Run another Gmail sync.";
  } else if (
    syncLagMinutes != null &&
    syncLagMinutes > SYNC_LAG_DEGRADED_MINUTES
  ) {
    status = "degraded";
    severity = "warning";
    reason = "Last successful sync is stale.";
    recommendedAction = "Run Gmail sync.";
  } else if (!lastSuccessfulSyncAt && input.integration.status === "CONNECTED") {
    status = "unknown";
    severity = "neutral";
    reason = "No successful sync has been recorded yet.";
    recommendedAction = "Run initial Gmail sync.";
  } else if (!liveSyncEnabled) {
    reason = "Live sync is turned off. Manual sync remains available.";
    recommendedAction = "Use Sync once now or turn live sync back on.";
  }

  return {
    integrationId: input.integration.id,
    provider,
    platform: input.integration.platform,
    displayName:
      input.integration.displayName ||
      input.integration.externalAccountId ||
      "Gmail",
    lifecycleStatus: input.integration.status,
    status,
    reason,
    severity,
    lastSuccessfulSyncAt,
    lastAttemptedSyncAt,
    syncLagMinutes,
    hasMoreSyncPages,
    authProblem,
    rateLimited,
    liveSyncEnabled,
    watchStatus:
      provider === "gmail"
        ? !liveSyncEnabled
          ? "Disabled"
          : [
              watchStatus ?? "UNKNOWN",
              watchExpired ? "expired" : null,
              watchExpiration ? `expires ${watchExpiration}` : null,
            ].filter(Boolean).join(" - ")
        : null,
    lastError,
    recommendedAction,
    recentRuntimeFailureCount: runtimeFailureCount,
  };
}

export async function listWorkspaceConnectorHealth(input: {
  workspaceId: string;
  includeDisconnectedPlaceholders?: boolean;
}) {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [integrations, runtimeFailures] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          {
            deletedAt: null,
          },
          {
            status: "DISCONNECTED",
          },
        ],
        platform: {
          in: ["EMAIL"],
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
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.runtimeJob.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: {
          in: ["FAILED", "DEAD_LETTERED"],
        },
        jobType: {
          in: [
            "sync.gmail_integration",
            "outbound.send_message",
            "maintenance.renew_gmail_watch",
          ],
        },
        OR: [
          {
            failedAt: {
              gte: since,
            },
          },
          {
            deadLetteredAt: {
              gte: since,
            },
          },
        ],
      },
      select: {
        jobType: true,
        status: true,
        payloadJson: true,
        lastErrorJson: true,
        failedAt: true,
        deadLetteredAt: true,
      },
      orderBy: [{ failedAt: "desc" }, { deadLetteredAt: "desc" }],
      take: 100,
    }),
  ]);
  const runtimeFailuresByIntegrationId = new Map<string, RuntimeFailureRecord[]>();

  for (const failure of runtimeFailures as RuntimeFailureRecord[]) {
    const integrationId = getRuntimeFailureIntegrationId(failure);

    if (!integrationId) {
      continue;
    }

    const bucket = runtimeFailuresByIntegrationId.get(integrationId) ?? [];
    bucket.push(failure);
    runtimeFailuresByIntegrationId.set(integrationId, bucket);
  }

  const byPlatform = new Map<"EMAIL", ConnectorHealthSummary>();

  for (const integration of integrations) {
    const provider = readProvider(integration.platformMetadataJson);

    if (integration.platform !== "EMAIL" || provider !== "gmail") {
      continue;
    }

    if (byPlatform.has(integration.platform)) {
      continue;
    }

    byPlatform.set(
      integration.platform,
      evaluateConnectorHealth({
        integration: integration as IntegrationRecord,
        recentRuntimeFailures:
          runtimeFailuresByIntegrationId.get(integration.id) ?? [],
      }),
    );
  }

  const result = [...byPlatform.values()];

  if (input.includeDisconnectedPlaceholders) {
    if (!byPlatform.has("EMAIL")) {
      result.push(createNoIntegrationHealth("EMAIL"));
    }
  }

  return result;
}
