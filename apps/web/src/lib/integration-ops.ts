import "server-only";

import { getPrisma } from "@envoy/db";

import {
  listWorkspaceConnectorHealth,
  type ConnectorHealthSummary,
} from "@/lib/connector-health";
import {
  isOperatorObject,
  readErrorSummary,
  readOperatorString,
  sanitizeOperatorMetadata,
  summarizeOperatorMetadata,
} from "@/lib/operator-utils";

export type IntegrationOpsRow = {
  integrationId: string;
  provider: "gmail" | "slack";
  platform: "EMAIL" | "SLACK";
  displayName: string;
  externalAccountId: string | null;
  lifecycleStatus: string;
  health: ConnectorHealthSummary;
  checkpoint: {
    lastSuccessfulSyncAt: string | null;
    lastAttemptedSyncAt: string | null;
    hasMore: boolean;
    cursorPresent: boolean;
    pagesProcessed: number | null;
    threadsProcessed: number | null;
    dmConversationsProcessed: number | null;
    canonicalConversationsProcessed: number | null;
    messagesInserted: number | null;
    lastError: string | null;
    historyHasGap: boolean;
  };
  gmailWatch: {
    status: string | null;
    expiration: string | null;
    lastRenewedAt: string | null;
    lastError: string | null;
  } | null;
  recentJobs: Array<{
    id: string;
    queueName: string;
    jobType: string;
    status: string;
    queuedAt: Date;
    completedAt: Date | null;
    failedAt: Date | null;
    deadLetteredAt: Date | null;
    attemptsMade: number;
    lastError: string | null;
  }>;
  deadLetters: Array<{
    id: string;
    kind: string;
    queueName: string | null;
    reason: string;
    createdAt: Date;
    runtimeJobId: string | null;
    errorSummary: string | null;
  }>;
  metadataSummary: string;
};

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function readCheckpoint(metadata: unknown, provider: "gmail" | "slack") {
  if (!isOperatorObject(metadata)) {
    return null;
  }

  const key =
    provider === "gmail" ? "gmailSyncCheckpoint" : "slackSyncCheckpoint";

  return isOperatorObject(metadata[key]) ? metadata[key] : null;
}

function readGmailWatch(metadata: unknown) {
  if (!isOperatorObject(metadata) || !isOperatorObject(metadata.gmailWatch)) {
    return null;
  }

  const watch = metadata.gmailWatch;

  return {
    status: readOperatorString(watch.status),
    expiration: readOperatorString(watch.expiration),
    lastRenewedAt: readOperatorString(watch.lastRenewedAt),
    lastError: readErrorSummary(watch.lastError),
  };
}

function toCheckpointSummary(
  metadata: unknown,
  provider: "gmail" | "slack",
): IntegrationOpsRow["checkpoint"] {
  const checkpoint = readCheckpoint(metadata, provider);

  return {
    lastSuccessfulSyncAt: readOperatorString(checkpoint?.lastSuccessfulSyncAt),
    lastAttemptedSyncAt: readOperatorString(checkpoint?.lastAttemptedSyncAt),
    hasMore: checkpoint?.hasMore === true,
    cursorPresent: Boolean(
      readOperatorString(checkpoint?.nextPageToken) ??
        readOperatorString(checkpoint?.nextCursor) ??
        readOperatorString(checkpoint?.currentCursor) ??
        readOperatorString(checkpoint?.lastCursor),
    ),
    pagesProcessed: readNumber(checkpoint?.totalPagesProcessed),
    threadsProcessed:
      readNumber(checkpoint?.totalThreadsProcessed) ??
      readNumber(checkpoint?.threadCount),
    dmConversationsProcessed: readNumber(
      checkpoint?.totalDmConversationsProcessed,
    ),
    canonicalConversationsProcessed: readNumber(
      checkpoint?.totalCanonicalConversationsProcessed,
    ),
    messagesInserted:
      readNumber(checkpoint?.totalMessagesInserted) ??
      readNumber(checkpoint?.messageCount),
    lastError: readErrorSummary(checkpoint?.lastError),
    historyHasGap: checkpoint?.historyHasGap === true,
  };
}

function readPayloadIntegrationId(value: unknown) {
  return isOperatorObject(value) ? readOperatorString(value.integrationId) : null;
}

export async function listIntegrationOps(input: { workspaceId: string }) {
  const prisma = getPrisma();
  const [integrations, health, jobs, deadLetters] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [{ deletedAt: null }, { status: "DISCONNECTED" }],
        platform: { in: ["EMAIL", "SLACK"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        platform: true,
        displayName: true,
        externalAccountId: true,
        status: true,
        platformMetadataJson: true,
      },
    }),
    listWorkspaceConnectorHealth({
      workspaceId: input.workspaceId,
      includeDisconnectedPlaceholders: false,
    }),
    prisma.runtimeJob.findMany({
      where: {
        workspaceId: input.workspaceId,
        jobType: {
          in: [
            "sync.gmail_integration",
            "sync.slack_integration",
            "maintenance.renew_gmail_watch",
          ],
        },
      },
      orderBy: [{ queuedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        queueName: true,
        jobType: true,
        status: true,
        payloadJson: true,
        queuedAt: true,
        completedAt: true,
        failedAt: true,
        deadLetteredAt: true,
        attemptsMade: true,
        lastErrorJson: true,
      },
    }),
    prisma.deadLetterRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        kind: true,
        runtimeJobId: true,
        queueName: true,
        reason: true,
        payloadJson: true,
        errorJson: true,
        createdAt: true,
      },
    }),
  ]);
  const healthByIntegrationId = new Map(
    health.flatMap((item) =>
      item.integrationId ? [[item.integrationId, item] as const] : [],
    ),
  );

  return integrations
    .map((integration): IntegrationOpsRow | null => {
      const provider = integration.platform === "EMAIL" ? "gmail" : "slack";
      const integrationHealth = healthByIntegrationId.get(integration.id);

      if (!integrationHealth) {
        return null;
      }

      const relatedJobs = jobs.filter(
        (job) => readPayloadIntegrationId(job.payloadJson) === integration.id,
      );
      const relatedJobIds = new Set(relatedJobs.map((job) => job.id));

      return {
        integrationId: integration.id,
        provider,
        platform: integration.platform,
        displayName:
          integration.displayName ??
          integration.externalAccountId ??
          (provider === "gmail" ? "Gmail" : "Slack"),
        externalAccountId: integration.externalAccountId,
        lifecycleStatus: integration.status,
        health: integrationHealth,
        checkpoint: toCheckpointSummary(
          integration.platformMetadataJson,
          provider,
        ),
        gmailWatch:
          provider === "gmail"
            ? readGmailWatch(integration.platformMetadataJson)
            : null,
        recentJobs: relatedJobs.slice(0, 8).map((job) => ({
          id: job.id,
          queueName: job.queueName,
          jobType: job.jobType,
          status: job.status,
          queuedAt: job.queuedAt,
          completedAt: job.completedAt,
          failedAt: job.failedAt,
          deadLetteredAt: job.deadLetteredAt,
          attemptsMade: job.attemptsMade,
          lastError: readErrorSummary(job.lastErrorJson),
        })),
        deadLetters: deadLetters
          .filter(
            (record) =>
              (record.runtimeJobId && relatedJobIds.has(record.runtimeJobId)) ||
              readPayloadIntegrationId(record.payloadJson) === integration.id,
          )
          .slice(0, 5)
          .map((record) => ({
            id: record.id,
            kind: record.kind,
            queueName: record.queueName,
            reason: record.reason,
            createdAt: record.createdAt,
            runtimeJobId: record.runtimeJobId,
            errorSummary: readErrorSummary(record.errorJson),
          })),
        metadataSummary: summarizeOperatorMetadata(
          sanitizeOperatorMetadata(integration.platformMetadataJson),
        ),
      };
    })
    .filter((row): row is IntegrationOpsRow => Boolean(row));
}
