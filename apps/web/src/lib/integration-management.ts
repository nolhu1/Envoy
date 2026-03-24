import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";

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
  isConnected: boolean;
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

function readDiagnosticsSummary(record: IntegrationRecord) {
  const metadata = isJsonObject(record.platformMetadataJson)
    ? record.platformMetadataJson
    : null;

  if (!metadata) {
    return null;
  }

  if (typeof metadata.connectError === "string" && metadata.connectError) {
    return metadata.connectError;
  }

  if (
    typeof metadata.lastFailureCategory === "string" &&
    metadata.lastFailureCategory
  ) {
    return `Last sync issue: ${metadata.lastFailureCategory}`;
  }

  if (typeof metadata.connectedEmail === "string" && metadata.connectedEmail) {
    return metadata.connectedEmail;
  }

  if (typeof metadata.slackTeamName === "string" && metadata.slackTeamName) {
    return metadata.slackTeamName;
  }

  if (typeof metadata.slackWorkspaceUrl === "string" && metadata.slackWorkspaceUrl) {
    return metadata.slackWorkspaceUrl;
  }

  return null;
}

function toManagedIntegration(
  platform: IntegrationPlatform,
  record: IntegrationRecord | null,
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
      isConnected: false,
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
    isConnected: true,
  };
}

export async function getCurrentWorkspaceManagedIntegrations() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      deletedAt: null,
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
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const byPlatform = new Map<IntegrationPlatform, IntegrationRecord>();

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
    toManagedIntegration("EMAIL", byPlatform.get("EMAIL") ?? null),
    toManagedIntegration("SLACK", byPlatform.get("SLACK") ?? null),
  ];
}
