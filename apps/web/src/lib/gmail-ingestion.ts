import {
  buildGmailRecentThreadSyncInput,
  createCanonicalWriteHandler,
  fetchGmailHistorySince,
  fetchGmailRecentThreads,
  GmailConnector,
  isGmailHistoryUnavailableError,
  normalizeGmailThread,
  runInboundOrchestration,
  startGmailWatch,
  type ConnectorContext,
  type GmailThread,
  type InboundOrchestrationResult,
  type InboundSourceType,
  type OAuthAuthMaterial,
} from "../../../../packages/connectors/src/index";
import {
  beginIdempotencyOperation,
  completeIdempotencyOperation,
  createPrismaCanonicalPersistenceWriter,
  createPrismaIdempotencyService,
  failIdempotencyOperation,
  getIdempotencyRecord,
  getPrisma,
  rotateSecret,
  resolveConnectorContextForWorkspaceIntegration,
  type PrismaIdempotencyKey,
} from "../../../../packages/db/src/index";

import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
  publishEnvoyEvents,
} from "./event-publisher";
import {
  buildGmailLiveSyncPreferenceMetadata,
  buildPageSyncCheckpointMetadata,
  buildFailedSyncMetadata,
  buildGmailWatchMetadata,
  buildPushCheckpointMetadata,
  buildSuccessfulSyncMetadata,
  buildSyncInProgressMetadata,
  readGmailLiveSyncEnabled,
  readGmailSyncCheckpoint,
} from "./gmail-sync-checkpoint";
import { sanitizeErrorMessage } from "./security";

type SyncWorkspaceGmailIntegrationResult = {
  integrationId: string;
  pagesProcessed: number;
  threadCount: number;
  conversationCount: number;
  messageCount: number;
  attachmentCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  stoppedReason: "complete" | "page_limit" | "thread_limit" | "runtime_limit";
};

export type IngestGmailPushNotificationInput = {
  workspaceId: string;
  integrationId: string;
  emailAddress: string;
  pubSubMessageId: string;
  notificationHistoryId: string;
  receivedAt?: Date;
  rawPayloadJson: Record<string, unknown>;
};

export type IngestGmailPushNotificationResult = {
  status: "processed" | "duplicate" | "gap";
  integrationId: string;
  threadCount: number;
  messageCount: number;
  insertedEventCount: number;
  startHistoryId: string | null;
  processedHistoryId: string | null;
};

export type RenewGmailWatchForIntegrationResult = {
  integrationId: string;
  status: "active" | "error" | "skipped";
  topicName: string | null;
  historyId: string | null;
  expiration: string | null;
  error: string | null;
};

const GMAIL_SYNC_DEFAULT_MAX_PAGES_PER_RUN = 5;
const GMAIL_SYNC_DEFAULT_MAX_THREADS_PER_RUN = 125;
const GMAIL_SYNC_DEFAULT_MAX_RUNTIME_MS = 55_000;

const gmailSyncIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "web:gmail-sync",
});
const gmailConnector = new GmailConnector();

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readPositiveConfigInteger(input: {
  connectorContext: ConnectorContext;
  key: string;
  defaultValue: number;
  maxValue: number;
}) {
  const config = isJsonObject(input.connectorContext.config)
    ? input.connectorContext.config
    : null;
  const value = config?.[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return input.defaultValue;
  }

  return Math.min(Math.floor(value), input.maxValue);
}

function parseCheckpointDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) ? parsed : null;
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

function buildThreadEnvelope(input: {
  workspaceId: string;
  integrationId: string;
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >;
  thread: GmailThread;
  sourceType?: InboundSourceType;
}) {
  const lastMessageId =
    input.thread.messages?.[input.thread.messages.length - 1]?.id ?? null;

  return {
    sourceType: input.sourceType ?? "sync",
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    platform: input.connectorContext.platform,
    connectorContext: input.connectorContext,
    rawInput: input.thread,
    receivedAt: new Date(),
    externalEventId: input.thread.historyId ?? null,
    idempotencyKey: [
      "gmail",
      "thread",
      input.workspaceId,
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
  sourceType?: InboundSourceType;
  eventType?: string;
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
            eventType: input.eventType ?? "gmail.recent_thread_sync",
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInitialGmailHistoryId(metadata: unknown) {
  if (!isJsonObject(metadata)) {
    return null;
  }

  return readString(metadata.gmailHistoryId);
}

function buildGmailPushIdempotencyKey(input: {
  workspaceId: string;
  integrationId: string;
  emailAddress: string;
  pubSubMessageId: string;
}) {
  return {
    scope: "inbound",
    key: [
      "gmail",
      "pubsub",
      input.emailAddress.toLowerCase(),
      input.pubSubMessageId,
    ].join(":"),
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    operationType: "gmail_pubsub_notification",
    resourceType: "integration",
    resourceId: input.integrationId,
    externalEventId: input.pubSubMessageId,
  } satisfies PrismaIdempotencyKey;
}

function buildGmailHistoryIdempotencyKey(input: {
  workspaceId: string;
  integrationId: string;
  startHistoryId: string;
  notificationHistoryId: string;
}) {
  return {
    scope: "inbound",
    key: [
      "gmail",
      "history",
      input.workspaceId,
      input.integrationId,
      input.startHistoryId,
      input.notificationHistoryId,
    ].join(":"),
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    operationType: "gmail_history_push",
    resourceType: "integration",
    resourceId: input.integrationId,
    externalEventId: input.notificationHistoryId,
  } satisfies PrismaIdempotencyKey;
}

async function updateGmailPushCheckpoint(input: {
  integrationId: string;
  notificationHistoryId: string;
  pubSubMessageId: string;
  observedAt: Date;
  processedHistoryId?: string | null;
  historyPagesProcessed?: number;
  threadsFetchedFromHistory?: number;
  historyHasGap?: boolean;
  error?: unknown;
  markSuccessful?: boolean;
  incrementNotificationCount?: boolean;
}) {
  const prisma = getPrisma();
  const integration = await prisma.integration.findUnique({
    where: { id: input.integrationId },
    select: { platformMetadataJson: true },
  });

  await prisma.integration.update({
    where: { id: input.integrationId },
    data: {
      platformMetadataJson: toPrismaJsonValue(buildPushCheckpointMetadata({
        currentMetadata: integration?.platformMetadataJson,
        observedAt: input.observedAt,
        notificationHistoryId: input.notificationHistoryId,
        processedHistoryId: input.processedHistoryId,
        pubSubMessageId: input.pubSubMessageId,
        historyPagesProcessed: input.historyPagesProcessed,
        threadsFetchedFromHistory: input.threadsFetchedFromHistory,
        historyHasGap: input.historyHasGap,
        error: input.error,
        markSuccessful: input.markSuccessful,
        incrementNotificationCount: input.incrementNotificationCount,
      })),
    },
  });
}

async function completeGmailPushIdempotency(input: {
  key: PrismaIdempotencyKey;
  result: IngestGmailPushNotificationResult;
}) {
  await completeIdempotencyOperation({
    key: input.key,
    resultSummaryJson: input.result,
  });
}

export async function setGmailLiveSyncEnabledForIntegration(input: {
  workspaceId: string;
  integrationId: string;
  enabled: boolean;
}) {
  const prisma = getPrisma();
  const integration = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: "EMAIL",
    },
    select: {
      id: true,
      platformMetadataJson: true,
    },
  });

  if (!integration) {
    throw new Error("Gmail integration could not be loaded.");
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      platformMetadataJson: toPrismaJsonValue(
        buildGmailLiveSyncPreferenceMetadata({
          currentMetadata: integration.platformMetadataJson,
          enabled: input.enabled,
        }),
      ),
    },
  });
}

export async function ingestGmailPushNotification(
  input: IngestGmailPushNotificationInput,
): Promise<IngestGmailPushNotificationResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const pubSubKey = buildGmailPushIdempotencyKey(input);
  const existingPubSubRecord = await getIdempotencyRecord(pubSubKey);

  if (existingPubSubRecord) {
    return {
      status: "duplicate",
      integrationId: input.integrationId,
      threadCount: 0,
      messageCount: 0,
      insertedEventCount: 0,
      startHistoryId: null,
      processedHistoryId: null,
    };
  }

  const pubSubRecord = await beginIdempotencyOperation({
    key: pubSubKey,
    lockOwner: "web:gmail-push",
  });
  let historyKeyForFailure: PrismaIdempotencyKey | null = null;

  if (pubSubRecord.status !== "in_progress") {
    return {
      status: "duplicate",
      integrationId: input.integrationId,
      threadCount: 0,
      messageCount: 0,
      insertedEventCount: 0,
      startHistoryId: null,
      processedHistoryId: null,
    };
  }

  try {
    const prisma = getPrisma();
    const integrationSnapshot = await prisma.integration.findFirst({
      where: {
        id: input.integrationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
        platform: "EMAIL",
      },
      select: {
        platformMetadataJson: true,
      },
    });

    if (!integrationSnapshot) {
      throw new Error("Gmail integration could not be loaded for push.");
    }

    if (!readGmailLiveSyncEnabled(integrationSnapshot.platformMetadataJson)) {
      const result = {
        status: "duplicate",
        integrationId: input.integrationId,
        threadCount: 0,
        messageCount: 0,
        insertedEventCount: 0,
        startHistoryId: null,
        processedHistoryId: null,
      } satisfies IngestGmailPushNotificationResult;

      await completeGmailPushIdempotency({ key: pubSubKey, result });

      return result;
    }

    const checkpoint = readGmailSyncCheckpoint(
      integrationSnapshot.platformMetadataJson,
    );
    const startHistoryId =
      checkpoint?.lastProcessedHistoryId ??
      checkpoint?.lastNotificationHistoryId ??
      readInitialGmailHistoryId(integrationSnapshot.platformMetadataJson);

    if (!startHistoryId) {
      const gapError = new Error("Gmail push cannot run without a history checkpoint.");
      const result = {
        status: "gap",
        integrationId: input.integrationId,
        threadCount: 0,
        messageCount: 0,
        insertedEventCount: 0,
        startHistoryId: null,
        processedHistoryId: null,
      } satisfies IngestGmailPushNotificationResult;

      await updateGmailPushCheckpoint({
        integrationId: input.integrationId,
        notificationHistoryId: input.notificationHistoryId,
        pubSubMessageId: input.pubSubMessageId,
        observedAt: receivedAt,
        historyHasGap: true,
        error: gapError,
      });
      await completeGmailPushIdempotency({ key: pubSubKey, result });

      return result;
    }

    const historyKey = buildGmailHistoryIdempotencyKey({
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      startHistoryId,
      notificationHistoryId: input.notificationHistoryId,
    });
    historyKeyForFailure = historyKey;
    const existingHistoryRecord = await getIdempotencyRecord(historyKey);

    if (existingHistoryRecord) {
      const result = {
        status: "duplicate",
        integrationId: input.integrationId,
        threadCount: 0,
        messageCount: 0,
        insertedEventCount: 0,
        startHistoryId,
        processedHistoryId: null,
      } satisfies IngestGmailPushNotificationResult;

      await updateGmailPushCheckpoint({
        integrationId: input.integrationId,
        notificationHistoryId: input.notificationHistoryId,
        pubSubMessageId: input.pubSubMessageId,
        observedAt: receivedAt,
        incrementNotificationCount: false,
      });
      await completeGmailPushIdempotency({ key: pubSubKey, result });

      return result;
    }

    const historyRecord = await beginIdempotencyOperation({
      key: historyKey,
      lockOwner: "web:gmail-push",
    });

    if (historyRecord.status !== "in_progress") {
      const result = {
        status: "duplicate",
        integrationId: input.integrationId,
        threadCount: 0,
        messageCount: 0,
        insertedEventCount: 0,
        startHistoryId,
        processedHistoryId: null,
      } satisfies IngestGmailPushNotificationResult;

      await updateGmailPushCheckpoint({
        integrationId: input.integrationId,
        notificationHistoryId: input.notificationHistoryId,
        pubSubMessageId: input.pubSubMessageId,
        observedAt: receivedAt,
        incrementNotificationCount: false,
      });
      await completeGmailPushIdempotency({ key: pubSubKey, result });

      return result;
    }

    let connectorContext =
      await resolveConnectorContextForWorkspaceIntegration({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
      });

    if (!connectorContext) {
      throw new Error("Gmail integration context could not be resolved.");
    }

    if (
      isOauthAuthMaterial(connectorContext.authMaterial) &&
      shouldRefreshOAuthMaterial(connectorContext.authMaterial)
    ) {
      connectorContext = await refreshGmailConnectorContext(connectorContext);
    }

    let historySync;
    try {
      historySync = await fetchGmailHistorySince({
        context: connectorContext,
        startHistoryId,
      });
    } catch (error) {
      if (
        isGmailUnauthorizedError(error) &&
        isOauthAuthMaterial(connectorContext.authMaterial) &&
        connectorContext.authMaterial.refreshToken
      ) {
        connectorContext = await refreshGmailConnectorContext(connectorContext);
        historySync = await fetchGmailHistorySince({
          context: connectorContext,
          startHistoryId,
        });
      } else {
        throw error;
      }
    }

    const results: InboundOrchestrationResult[] = [];

    for (const thread of historySync.threads) {
      results.push(
        await runThreadIngestion({
          workspaceId: input.workspaceId,
          integrationId: input.integrationId,
          connectorContext,
          thread,
          sourceType: "webhook",
          eventType: "gmail.push_history",
        }),
      );
    }

    const receivedEvents = results.flatMap((result) =>
      (result.insertedMessageIndexes ?? []).flatMap((messageIndex) => {
        const messageId = result.messageIds[messageIndex];
        const message = result.batch?.messages[messageIndex];

        if (!messageId || !message) {
          return [];
        }

        return [
          buildEnvoyEvent({
            eventType: ENVOY_EVENT_TYPES.MESSAGE_RECEIVED,
            workspaceId: input.workspaceId,
            entityType: ENVOY_EVENT_ENTITY_TYPES.MESSAGE,
            entityId: messageId,
            source: ENVOY_EVENT_SOURCES.CONNECTOR,
            payload: {
              conversationId: result.conversationId ?? "",
              messageId,
              integrationId: input.integrationId,
              platform: "EMAIL",
              externalMessageId: message.externalMessageId ?? null,
              senderType: message.senderType ?? null,
              direction: message.direction ?? null,
              status: message.status ?? "RECEIVED",
              metadata: {
                provider: "gmail",
                source: "pubsub",
                pubSubMessageId: input.pubSubMessageId,
                notificationHistoryId: input.notificationHistoryId,
                startHistoryId,
              },
            },
          }),
        ];
      }),
    );
    const processedHistoryId =
      historySync.hasMore
        ? null
        : historySync.historyId ?? input.notificationHistoryId;

    await publishEnvoyEvents(receivedEvents);

    const result = {
      status: historySync.hasMore ? "gap" : "processed",
      integrationId: input.integrationId,
      threadCount: historySync.threads.length,
      messageCount: results.reduce(
        (total, item) => total + item.insertedCounts.messages,
        0,
      ),
      insertedEventCount: receivedEvents.length,
      startHistoryId,
      processedHistoryId,
    } satisfies IngestGmailPushNotificationResult;

    await updateGmailPushCheckpoint({
      integrationId: input.integrationId,
      notificationHistoryId: input.notificationHistoryId,
      pubSubMessageId: input.pubSubMessageId,
      observedAt: receivedAt,
      processedHistoryId,
      historyPagesProcessed: historySync.pagesProcessed,
      threadsFetchedFromHistory: historySync.threads.length,
      historyHasGap: historySync.hasMore,
      error: historySync.hasMore
        ? new Error("Gmail history page limit reached before completion.")
        : undefined,
      markSuccessful: !historySync.hasMore,
    });
    await completeIdempotencyOperation({
      key: historyKey,
      resultSummaryJson: {
        ...result,
        threadIds: historySync.threadIds,
      },
    });
    await completeGmailPushIdempotency({ key: pubSubKey, result });

    return result;
  } catch (error) {
    if (isGmailHistoryUnavailableError(error)) {
      const result = {
        status: "gap",
        integrationId: input.integrationId,
        threadCount: 0,
        messageCount: 0,
        insertedEventCount: 0,
        startHistoryId: null,
        processedHistoryId: null,
      } satisfies IngestGmailPushNotificationResult;

      await updateGmailPushCheckpoint({
        integrationId: input.integrationId,
        notificationHistoryId: input.notificationHistoryId,
        pubSubMessageId: input.pubSubMessageId,
        observedAt: receivedAt,
        historyHasGap: true,
        error,
      });
      if (historyKeyForFailure) {
        await completeIdempotencyOperation({
          key: historyKeyForFailure,
          resultSummaryJson: result,
        });
      }
      await completeGmailPushIdempotency({ key: pubSubKey, result });

      return result;
    }

    if (historyKeyForFailure) {
      await failIdempotencyOperation({
        key: historyKeyForFailure,
        error,
        resultSummaryJson: {
          integrationId: input.integrationId,
          notificationHistoryId: input.notificationHistoryId,
        },
      });
    }
    await failIdempotencyOperation({
      key: pubSubKey,
      error,
      resultSummaryJson: {
        integrationId: input.integrationId,
        notificationHistoryId: input.notificationHistoryId,
      },
    });

    throw error;
  }
}

export async function renewGmailWatchForIntegration(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<RenewGmailWatchForIntegrationResult> {
  const prisma = getPrisma();
  const integration = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: "EMAIL",
    },
    select: {
      id: true,
      platformMetadataJson: true,
    },
  });

  if (!integration) {
    throw new Error("Gmail integration could not be loaded for watch renewal.");
  }

  if (!readGmailLiveSyncEnabled(integration.platformMetadataJson)) {
    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        platformMetadataJson: toPrismaJsonValue(
          buildGmailLiveSyncPreferenceMetadata({
            currentMetadata: integration.platformMetadataJson,
            enabled: false,
          }),
        ),
      },
    });

    return {
      integrationId: input.integrationId,
      status: "skipped",
      topicName: null,
      historyId: null,
      expiration: null,
      error: null,
    };
  }

  let connectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
  });

  if (!connectorContext) {
    throw new Error("Gmail integration context could not be resolved.");
  }

  const observedAt = new Date();

  try {
    if (
      isOauthAuthMaterial(connectorContext.authMaterial) &&
      shouldRefreshOAuthMaterial(connectorContext.authMaterial)
    ) {
      connectorContext = await refreshGmailConnectorContext(connectorContext);
    }

    const watch = await startGmailWatch({
      context: connectorContext,
    });
    const latestIntegration = await prisma.integration.findUnique({
      where: { id: input.integrationId },
      select: { platformMetadataJson: true },
    });

    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        platformMetadataJson: toPrismaJsonValue(buildGmailWatchMetadata({
          currentMetadata:
            latestIntegration?.platformMetadataJson ??
            integration.platformMetadataJson,
          observedAt,
          topicName: watch.topicName,
          historyId: watch.historyId,
          expiration: watch.expiration,
          status: "ACTIVE",
        })),
      },
    });

    return {
      integrationId: input.integrationId,
      status: "active",
      topicName: watch.topicName,
      historyId: watch.historyId,
      expiration: watch.expiration,
      error: null,
    };
  } catch (error) {
    const latestIntegration = await prisma.integration.findUnique({
      where: { id: input.integrationId },
      select: { platformMetadataJson: true },
    });
    const currentMetadata =
      latestIntegration?.platformMetadataJson ?? integration.platformMetadataJson;

    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        platformMetadataJson: toPrismaJsonValue(buildGmailWatchMetadata({
          currentMetadata,
          observedAt,
          status:
            error instanceof Error &&
            error.message.includes("GMAIL_PUBSUB_TOPIC")
              ? "NOT_CONFIGURED"
              : "ERROR",
          error,
        })),
      },
    });

    return {
      integrationId: input.integrationId,
      status: "error",
      topicName: null,
      historyId: null,
      expiration: null,
      error: sanitizeErrorMessage(error, "Unknown Gmail watch error."),
    };
  }
}

export async function syncWorkspaceGmailIntegration(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<SyncWorkspaceGmailIntegrationResult> {
  const prisma = getPrisma();
  const integrationSnapshot = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: "EMAIL",
    },
    select: {
      platformMetadataJson: true,
    },
  });

  if (!integrationSnapshot) {
    throw new Error("Gmail integration could not be loaded for sync.");
  }

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
  const previousCheckpoint = readGmailSyncCheckpoint(
    integrationSnapshot.platformMetadataJson,
  );
  const resumeCursor =
    previousCheckpoint?.hasMore === true
      ? previousCheckpoint.nextPageToken ??
        previousCheckpoint.currentCursor ??
        previousCheckpoint.lastCursor ??
        null
      : null;
  const resumeWindowStart =
    resumeCursor
      ? parseCheckpointDate(
          previousCheckpoint?.backfillWindowStart ??
            previousCheckpoint?.lastRecentWindowStart,
        )
      : null;
  const resumeWindowEnd =
    resumeCursor
      ? parseCheckpointDate(
          previousCheckpoint?.backfillWindowEnd ??
            previousCheckpoint?.lastRecentWindowEnd,
        )
      : null;
  const shouldResumeCheckpoint = Boolean(
    resumeCursor && resumeWindowStart && resumeWindowEnd,
  );
  const recentWindowStart = shouldResumeCheckpoint && resumeWindowStart
    ? resumeWindowStart
    : new Date(syncStartedAt);
  const recentWindowEnd = shouldResumeCheckpoint && resumeWindowEnd
    ? resumeWindowEnd
    : syncStartedAt;

  if (!shouldResumeCheckpoint) {
    recentWindowStart.setDate(recentWindowStart.getDate() - recentWindowDays);
  }

  const maxPagesPerRun = readPositiveConfigInteger({
    connectorContext,
    key: "gmailSyncMaxPagesPerRun",
    defaultValue: GMAIL_SYNC_DEFAULT_MAX_PAGES_PER_RUN,
    maxValue: 25,
  });
  const maxThreadsPerRun = readPositiveConfigInteger({
    connectorContext,
    key: "gmailSyncMaxThreadsPerRun",
    defaultValue: GMAIL_SYNC_DEFAULT_MAX_THREADS_PER_RUN,
    maxValue: 500,
  });
  const maxRuntimeMs = readPositiveConfigInteger({
    connectorContext,
    key: "gmailSyncMaxRuntimeMs",
    defaultValue: GMAIL_SYNC_DEFAULT_MAX_RUNTIME_MS,
    maxValue: 5 * 60_000,
  });

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
        recentWindowEnd,
        currentCursor: resumeCursor,
        nextPageToken: resumeCursor,
        hasMore: Boolean(resumeCursor),
      })),
    },
  });

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.INTEGRATION_SYNC_STARTED,
      workspaceId: input.workspaceId,
      entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
      entityId: input.integrationId,
      source: ENVOY_EVENT_SOURCES.WORKFLOW,
      occurredAt: syncStartedAt,
      payload: {
        integrationId: input.integrationId,
        platform: "EMAIL",
        status: "SYNC_IN_PROGRESS",
        metadata: {
          provider: "gmail",
          recentWindowStart: recentWindowStart.toISOString(),
          recentWindowEnd: recentWindowEnd.toISOString(),
          resumedFromCursor: Boolean(resumeCursor),
        },
      },
    }),
  );

  try {
    if (
      isOauthAuthMaterial(connectorContext.authMaterial) &&
      shouldRefreshOAuthMaterial(connectorContext.authMaterial)
    ) {
      connectorContext = await refreshGmailConnectorContext(connectorContext);
    }

    const startedAtMs = syncStartedAt.getTime();
    let cursor = shouldResumeCheckpoint ? resumeCursor : null;
    let nextCursor: string | null = cursor;
    let hasMore = Boolean(cursor);
    let pagesProcessedThisRun = 0;
    let threadsProcessedThisRun = 0;
    let totalPagesProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalPagesProcessed ?? 0
      : 0;
    let totalThreadsProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalThreadsProcessed ??
        previousCheckpoint?.threadCount ??
        0
      : 0;
    let conversationCount = shouldResumeCheckpoint
      ? previousCheckpoint?.conversationCount ?? 0
      : 0;
    let messageCount = shouldResumeCheckpoint
      ? previousCheckpoint?.totalMessagesInserted ??
        previousCheckpoint?.messageCount ??
        0
      : 0;
    let attachmentCount = shouldResumeCheckpoint
      ? previousCheckpoint?.attachmentCount ?? 0
      : 0;
    let lastProcessedThreadId = shouldResumeCheckpoint
      ? previousCheckpoint?.lastProcessedThreadId ?? null
      : null;
    let lastProcessedMessageId = shouldResumeCheckpoint
      ? previousCheckpoint?.lastProcessedMessageId ?? null
      : null;
    let lastDiagnosticsSummary: Record<string, unknown> | null = null;
    let stoppedReason: SyncWorkspaceGmailIntegrationResult["stoppedReason"] =
      "complete";

    while (pagesProcessedThisRun < maxPagesPerRun) {
      if (Date.now() - startedAtMs >= maxRuntimeMs) {
        stoppedReason = "runtime_limit";
        break;
      }

      const remainingThreads = maxThreadsPerRun - threadsProcessedThisRun;

      if (remainingThreads <= 0) {
        stoppedReason = "thread_limit";
        break;
      }

      const pageCursor = cursor;
      const syncInput = buildGmailRecentThreadSyncInput({
        context: connectorContext,
        cursor: pageCursor,
        windowStart: recentWindowStart,
        windowEnd: recentWindowEnd,
        limit: remainingThreads,
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
            cursor: pageCursor,
            windowStart: recentWindowStart,
            windowEnd: recentWindowEnd,
            limit: remainingThreads,
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

      const pageConversationCount = results.reduce(
        (total, result) => total + result.insertedCounts.conversations,
        0,
      );
      const pageMessageCount = results.reduce(
        (total, result) => total + result.insertedCounts.messages,
        0,
      );
      const pageAttachmentCount = results.reduce(
        (total, result) => total + result.insertedCounts.attachments,
        0,
      );
      const lastThread = gmailSync.threads[gmailSync.threads.length - 1] ?? null;
      const lastMessage =
        lastThread?.messages?.[lastThread.messages.length - 1] ?? null;
      const pageReceivedEvents = results.flatMap((result) =>
        (result.insertedMessageIndexes ?? []).flatMap((messageIndex) => {
          const messageId = result.messageIds[messageIndex];
          const message = result.batch?.messages[messageIndex];

          if (!messageId || !message) {
            return [];
          }

          return [
            buildEnvoyEvent({
              eventType: ENVOY_EVENT_TYPES.MESSAGE_RECEIVED,
              workspaceId: input.workspaceId,
              entityType: ENVOY_EVENT_ENTITY_TYPES.MESSAGE,
              entityId: messageId,
              source: ENVOY_EVENT_SOURCES.CONNECTOR,
              payload: {
                conversationId: result.conversationId ?? "",
                messageId,
                integrationId: input.integrationId,
                platform: "EMAIL",
                externalMessageId: message.externalMessageId ?? null,
                senderType: message.senderType ?? null,
                direction: message.direction ?? null,
                status: message.status ?? "RECEIVED",
                metadata: {
                  provider: "gmail",
                  pageCursor,
                },
              },
            }),
          ];
        }),
      );

      pagesProcessedThisRun += 1;
      threadsProcessedThisRun += gmailSync.threads.length;
      totalPagesProcessed += 1;
      totalThreadsProcessed += gmailSync.threads.length;
      conversationCount += pageConversationCount;
      messageCount += pageMessageCount;
      attachmentCount += pageAttachmentCount;
      lastProcessedThreadId = lastThread?.id ?? lastProcessedThreadId;
      lastProcessedMessageId = lastMessage?.id ?? lastProcessedMessageId;
      nextCursor = gmailSync.nextCursor ?? null;
      hasMore = gmailSync.hasMore;
      lastDiagnosticsSummary = isJsonObject(gmailSync.diagnosticsJson)
        ? gmailSync.diagnosticsJson
        : null;

      const checkpointedAt = new Date();

      await prisma.integration.update({
        where: { id: input.integrationId },
        data: {
          status: hasMore ? "SYNC_IN_PROGRESS" : "CONNECTED",
          lastSyncedAt: checkpointedAt,
          platformMetadataJson: toPrismaJsonValue(buildPageSyncCheckpointMetadata({
            currentMetadata: (
              await prisma.integration.findUnique({
                where: { id: input.integrationId },
                select: { platformMetadataJson: true },
              })
            )?.platformMetadataJson,
            syncedAt: checkpointedAt,
            recentWindowStart,
            recentWindowEnd,
            currentCursor: pageCursor,
            nextPageToken: nextCursor,
            hasMore,
            totalPagesProcessed,
            totalThreadsProcessed,
            conversationCount,
            totalMessagesInserted: messageCount,
            attachmentCount,
            lastProcessedThreadId,
            lastProcessedMessageId,
            diagnosticsSummary: lastDiagnosticsSummary,
          })),
        },
      });

      await publishEnvoyEvents(pageReceivedEvents);

      cursor = nextCursor;

      if (!hasMore) {
        stoppedReason = "complete";
        break;
      }

      if (threadsProcessedThisRun >= maxThreadsPerRun) {
        stoppedReason = "thread_limit";
        break;
      }
    }

    if (hasMore && stoppedReason === "complete") {
      stoppedReason = pagesProcessedThisRun >= maxPagesPerRun
        ? "page_limit"
        : "runtime_limit";
    }

    const now = new Date();
    const metadataBuilder = hasMore
      ? buildPageSyncCheckpointMetadata
      : buildSuccessfulSyncMetadata;

    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        status: "CONNECTED",
        lastSyncedAt: now,
        platformMetadataJson: toPrismaJsonValue(metadataBuilder({
          currentMetadata: (
            await prisma.integration.findUnique({
              where: { id: input.integrationId },
              select: { platformMetadataJson: true },
            })
          )?.platformMetadataJson,
          syncedAt: now,
          recentWindowStart,
          recentWindowEnd,
          currentCursor: cursor,
          nextPageToken: nextCursor,
          hasMore,
          totalPagesProcessed,
          totalThreadsProcessed,
          conversationCount,
          totalMessagesInserted: messageCount,
          attachmentCount,
          lastProcessedThreadId,
          lastProcessedMessageId,
          diagnosticsSummary: lastDiagnosticsSummary,
        })),
      },
    });

    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.INTEGRATION_SYNC_COMPLETED,
        workspaceId: input.workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
        entityId: input.integrationId,
        source: ENVOY_EVENT_SOURCES.WORKFLOW,
        occurredAt: now,
        payload: {
          integrationId: input.integrationId,
          platform: "EMAIL",
          status: "CONNECTED",
          threadCount: totalThreadsProcessed,
          messageCount,
          attachmentCount,
          hasMore,
          metadata: {
            provider: "gmail",
            nextCursor,
            conversationCount,
            pagesProcessed: pagesProcessedThisRun,
            stoppedReason,
            totalPagesProcessed,
            resumedFromCursor: Boolean(resumeCursor),
          },
        },
      }),
    );

    return {
      integrationId: input.integrationId,
      pagesProcessed: pagesProcessedThisRun,
      threadCount: totalThreadsProcessed,
      conversationCount,
      messageCount,
      attachmentCount,
      nextCursor,
      hasMore,
      stoppedReason,
    };
  } catch (error) {
    const failedAt = new Date();

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
          failedAt,
          recentWindowStart,
          recentWindowEnd: failedAt,
          error,
        })),
      },
    });

    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.INTEGRATION_SYNC_FAILED,
        workspaceId: input.workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
        entityId: input.integrationId,
        source: ENVOY_EVENT_SOURCES.WORKFLOW,
        occurredAt: failedAt,
        payload: {
          integrationId: input.integrationId,
          platform: "EMAIL",
          status: "ERROR",
          metadata: {
            provider: "gmail",
            error: sanitizeErrorMessage(error, "Unknown Gmail sync error."),
            recentWindowStart: recentWindowStart.toISOString(),
            recentWindowEnd: failedAt.toISOString(),
          },
        },
      }),
    );

    throw error;
  }
}
