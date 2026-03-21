import "server-only";

import {
  buildGmailRecentThreadSyncInput,
  createCanonicalWriteHandler,
  fetchGmailRecentThreads,
  GmailConnector,
  InMemoryIdempotencyService,
  normalizeGmailThread,
  runInboundOrchestration,
  type ConnectorContext,
  type GmailThread,
  type InboundOrchestrationResult,
  type OAuthAuthMaterial,
} from "@envoy/connectors";
import {
  createPrismaCanonicalPersistenceWriter,
  getPrisma,
  rotateSecret,
  resolveConnectorContextForWorkspaceIntegration,
} from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import {
  buildFailedSyncMetadata,
  buildSuccessfulSyncMetadata,
  buildSyncInProgressMetadata,
} from "@/lib/gmail-sync-checkpoint";

type WorkspaceGmailIntegration = {
  id: string;
  workspaceId: string;
  externalAccountId: string | null;
  displayName: string | null;
  status: string;
  lastSyncedAt: Date | null;
  platformMetadataJson: unknown;
  updatedAt: Date;
};

type SyncWorkspaceGmailIntegrationResult = {
  integrationId: string;
  threadCount: number;
  conversationCount: number;
  messageCount: number;
  attachmentCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

const gmailSyncIdempotencyService = new InMemoryIdempotencyService();
const gmailConnector = new GmailConnector();

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGmailIntegration(
  integration: WorkspaceGmailIntegration,
) {
  const metadata = isJsonObject(integration.platformMetadataJson)
    ? integration.platformMetadataJson
    : null;

  return metadata?.provider === "gmail";
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function readRecentWindowDays(
  connectorContext: ConnectorContext,
) {
  const config =
    isJsonObject(connectorContext.config) ? connectorContext.config : null;

  return typeof config?.recentSyncWindowDays === "number" && config.recentSyncWindowDays > 0
    ? Math.floor(config.recentSyncWindowDays)
    : 14;
}

function isOauthAuthMaterial(
  authMaterial: ConnectorContext["authMaterial"],
): authMaterial is OAuthAuthMaterial {
  return authMaterial?.type === "oauth";
}

function shouldRefreshOAuthMaterial(
  authMaterial: OAuthAuthMaterial,
) {
  if (!authMaterial.expiresAt) {
    return false;
  }

  const expiresAt =
    authMaterial.expiresAt instanceof Date
      ? authMaterial.expiresAt
      : new Date(authMaterial.expiresAt);

  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now() + 60_000;
}

function isGmailUnauthorizedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Gmail API request failed with status 401")
  );
}

async function refreshGmailConnectorContext(
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >,
) {
  if (!connectorContext.secretRef?.id) {
    throw new Error("Gmail integration secret reference could not be resolved.");
  }

  const refreshed = await gmailConnector.refreshAuth({
    context: connectorContext,
  });

  if (!refreshed.authMaterial || !isOauthAuthMaterial(refreshed.authMaterial)) {
    throw new Error("Gmail OAuth refresh did not return valid auth material.");
  }

  await rotateSecret({
    secretRef: connectorContext.secretRef.id,
    workspaceId: connectorContext.workspaceId,
    integrationId: connectorContext.integrationId ?? null,
    secretType: "gmail_oauth",
    payload: refreshed.authMaterial,
  });

  return {
    ...connectorContext,
    authMaterial: refreshed.authMaterial,
    secretRef: connectorContext.secretRef,
  };
}

export async function getCurrentWorkspaceGmailIntegration() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return null;
  }

  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      deletedAt: null,
      platform: "EMAIL",
    },
    select: {
      id: true,
      workspaceId: true,
      externalAccountId: true,
      displayName: true,
      status: true,
      lastSyncedAt: true,
      platformMetadataJson: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return integrations.find(isGmailIntegration) ?? null;
}

function buildThreadEnvelope(input: {
  workspaceId: string;
  integrationId: string;
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >;
  thread: GmailThread;
}) {
  const lastMessageId =
    input.thread.messages?.[input.thread.messages.length - 1]?.id ?? null;

  return {
    sourceType: "sync" as const,
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    platform: input.connectorContext.platform,
    connectorContext: input.connectorContext,
    rawInput: input.thread,
    receivedAt: new Date(),
    externalEventId: input.thread.historyId ?? null,
    idempotencyKey: [
      "gmail",
      "sync",
      input.integrationId,
      input.thread.id,
      input.thread.historyId ?? lastMessageId ?? "thread",
    ].join(":"),
  };
}

async function runThreadIngestion(input: {
  workspaceId: string;
  integrationId: string;
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >;
  thread: GmailThread;
}) {
  const writer = createPrismaCanonicalPersistenceWriter({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    platform: "EMAIL",
  });
  const writeCanonicalData = createCanonicalWriteHandler(writer);

  return runInboundOrchestration(
    buildThreadEnvelope(input),
    {
      async parsePayload(envelope) {
        return {
          parsedPayload: envelope.rawInput,
          externalEventId: envelope.rawInput.historyId ?? null,
        };
      },
      async normalize({ envelope, parsedPayload }) {
        const normalized = normalizeGmailThread(
          envelope.connectorContext,
          parsedPayload,
        );

        return {
          batch: {
            eventType: "gmail.recent_thread_sync",
            externalEventId: parsedPayload.historyId ?? null,
            conversations: [normalized.conversation],
            participants: normalized.participants,
            messages: normalized.messages,
            attachments: normalized.attachments,
            rawPayloadJson: parsedPayload,
            platformMetadataJson: {
              provider: "gmail",
              threadId: parsedPayload.id,
              historyId: parsedPayload.historyId ?? null,
            },
          },
        };
      },
      writeCanonicalData,
      async emitDownstreamEvents() {
        return [];
      },
    },
    {
      idempotencyService: gmailSyncIdempotencyService,
    },
  );
}

export async function syncWorkspaceGmailIntegration(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<SyncWorkspaceGmailIntegrationResult> {
  const prisma = getPrisma();
  const resolvedConnectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
  });

  if (!resolvedConnectorContext) {
    throw new Error("Gmail integration context could not be resolved.");
  }

  let connectorContext = resolvedConnectorContext;
  const syncStartedAt = new Date();
  const recentWindowDays = readRecentWindowDays(connectorContext);
  const recentWindowStart = new Date(syncStartedAt);
  recentWindowStart.setDate(recentWindowStart.getDate() - recentWindowDays);

  await prisma.integration.update({
    where: { id: input.integrationId },
    data: {
      status: "SYNC_IN_PROGRESS",
      platformMetadataJson: toPrismaJsonValue(buildSyncInProgressMetadata({
        currentMetadata: (
          await prisma.integration.findUnique({
            where: { id: input.integrationId },
            select: { platformMetadataJson: true },
          })
        )?.platformMetadataJson,
        syncedAt: syncStartedAt,
        recentWindowStart,
        recentWindowEnd: syncStartedAt,
      })),
    },
  });

  try {
    if (
      isOauthAuthMaterial(connectorContext.authMaterial) &&
      shouldRefreshOAuthMaterial(connectorContext.authMaterial)
    ) {
      connectorContext = await refreshGmailConnectorContext(connectorContext);
    }

    const syncInput = buildGmailRecentThreadSyncInput({
      context: connectorContext,
    });
    let gmailSync;

    try {
      gmailSync = await fetchGmailRecentThreads(syncInput);
    } catch (error) {
      if (
        !isGmailUnauthorizedError(error) ||
        !isOauthAuthMaterial(connectorContext.authMaterial) ||
        !connectorContext.authMaterial.refreshToken
      ) {
        throw error;
      }

      connectorContext = await refreshGmailConnectorContext(connectorContext);
      gmailSync = await fetchGmailRecentThreads(
        buildGmailRecentThreadSyncInput({
          context: connectorContext,
        }),
      );
    }

    const results: InboundOrchestrationResult[] = [];

    for (const thread of gmailSync.threads) {
      results.push(
        await runThreadIngestion({
          workspaceId: input.workspaceId,
          integrationId: input.integrationId,
          connectorContext,
          thread,
        }),
      );
    }

    const conversationCount = results.reduce(
      (total, result) => total + result.insertedCounts.conversations,
      0,
    );
    const messageCount = results.reduce(
      (total, result) => total + result.insertedCounts.messages,
      0,
    );
    const attachmentCount = results.reduce(
      (total, result) => total + result.insertedCounts.attachments,
      0,
    );
    const now = new Date();

    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        status: "CONNECTED",
        lastSyncedAt: now,
        platformMetadataJson: toPrismaJsonValue(buildSuccessfulSyncMetadata({
          currentMetadata: (
            await prisma.integration.findUnique({
              where: { id: input.integrationId },
              select: { platformMetadataJson: true },
            })
          )?.platformMetadataJson,
          syncedAt: now,
          recentWindowStart,
          recentWindowEnd: now,
          nextCursor: gmailSync.nextCursor ?? null,
          hasMore: gmailSync.hasMore,
          threadCount: gmailSync.threads.length,
          conversationCount,
          messageCount,
          attachmentCount,
          diagnosticsSummary: isJsonObject(gmailSync.diagnosticsJson)
            ? gmailSync.diagnosticsJson
            : null,
        })),
      },
    });

    return {
      integrationId: input.integrationId,
      threadCount: gmailSync.threads.length,
      conversationCount,
      messageCount,
      attachmentCount,
      nextCursor: gmailSync.nextCursor ?? null,
      hasMore: gmailSync.hasMore,
    };
  } catch (error) {
    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        status: "ERROR",
        platformMetadataJson: toPrismaJsonValue(buildFailedSyncMetadata({
          currentMetadata: (
            await prisma.integration.findUnique({
              where: { id: input.integrationId },
              select: { platformMetadataJson: true },
            })
          )?.platformMetadataJson,
          failedAt: new Date(),
          recentWindowStart,
          recentWindowEnd: new Date(),
          error,
        })),
      },
    });

    throw error;
  }
}
