import {
  buildSlackRecentDmSyncInput,
  createCanonicalWriteHandler,
  fetchSlackRecentDms,
  normalizeSlackConversationGroups,
  runInboundOrchestration,
  type ConnectorContext,
  type InboundOrchestrationResult,
  type JsonValue,
  type SlackDmConversationSyncItem,
  type SlackMessage,
} from "../../../../packages/connectors/src/index";
import {
  createPrismaCanonicalPersistenceWriter,
  createPrismaIdempotencyService,
  getPrisma,
  resolveConnectorContextForWorkspaceIntegration,
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
  buildSlackPageSyncCheckpointMetadata,
  buildSlackFailedSyncMetadata,
  buildSlackSuccessfulSyncMetadata,
  buildSlackSyncInProgressMetadata,
  readSlackSyncCheckpoint,
} from "./slack-sync-checkpoint";
import { sanitizeDiagnostics, sanitizeErrorMessage } from "./security";

type SyncWorkspaceSlackIntegrationResult = {
  integrationId: string;
  pagesProcessed: number;
  dmConversationCount: number;
  canonicalConversationCount: number;
  participantCount: number;
  messageCount: number;
  attachmentCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  stoppedReason: "complete" | "page_limit" | "dm_limit" | "runtime_limit";
};

export type SlackWebhookMessageEventInput = {
  workspaceId: string;
  integrationId: string;
  teamId: string;
  eventId: string | null;
  eventTime: number | null;
  event: SlackMessage;
  rawPayloadJson: JsonValue;
};

const slackSyncIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "web:slack-sync",
});
const DEFAULT_SLACK_RECENT_WINDOW_DAYS = 14;
const INITIAL_SLACK_RECENT_WINDOW_DAYS = 90;
const SLACK_SYNC_DEFAULT_MAX_PAGES_PER_RUN = 5;
const SLACK_SYNC_DEFAULT_MAX_DM_CONVERSATIONS_PER_RUN = 50;
const SLACK_SYNC_DEFAULT_MAX_RUNTIME_MS = 55_000;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function readRecentWindowDays(connectorContext: ConnectorContext) {
  const config =
    isJsonObject(connectorContext.config) ? connectorContext.config : null;
  const metadata =
    isJsonObject(connectorContext.platformMetadataJson)
      ? connectorContext.platformMetadataJson
      : null;
  const checkpoint =
    metadata && isJsonObject(metadata.slackSyncCheckpoint)
      ? metadata.slackSyncCheckpoint
      : null;
  const hasSuccessfulSync =
    typeof checkpoint?.lastSuccessfulSyncAt === "string" &&
    checkpoint.lastSuccessfulSyncAt.length > 0;

  return typeof config?.recentSyncWindowDays === "number" && config.recentSyncWindowDays > 0
    ? Math.floor(config.recentSyncWindowDays)
    : hasSuccessfulSync
      ? DEFAULT_SLACK_RECENT_WINDOW_DAYS
      : INITIAL_SLACK_RECENT_WINDOW_DAYS;
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

function getMessageTsFromExternalMessageId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parts = value.split(":");

  return parts[parts.length - 1] ?? null;
}

function readSlackGroupIdentity(
  normalizedGroup: ReturnType<typeof normalizeSlackConversationGroups>[number],
) {
  const metadata = isJsonObject(normalizedGroup.conversation.platformMetadataJson)
    ? normalizedGroup.conversation.platformMetadataJson
    : null;
  const channelId =
    typeof metadata?.channelId === "string" ? metadata.channelId : null;
  const threadTs =
    typeof metadata?.threadTs === "string" ? metadata.threadTs : null;
  const latestMessage =
    normalizedGroup.messages[normalizedGroup.messages.length - 1] ?? null;

  return {
    channelId,
    threadTs,
    latestMessageTs: getMessageTsFromExternalMessageId(
      latestMessage?.externalMessageId,
    ),
  };
}

function buildSlackEnvelope(input: {
  workspaceId: string;
  integrationId: string;
  syncRunId: string;
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >;
  syncItem: SlackDmConversationSyncItem;
  normalizedGroup: ReturnType<typeof normalizeSlackConversationGroups>[number];
}) {
  const lastMessage =
    input.normalizedGroup.messages[input.normalizedGroup.messages.length - 1];
  const identity = readSlackGroupIdentity(input.normalizedGroup);

  return {
    sourceType: "sync" as const,
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    platform: input.connectorContext.platform,
    connectorContext: input.connectorContext,
    rawInput: input.syncItem,
    receivedAt: new Date(),
    externalEventId: lastMessage?.externalMessageId ?? input.normalizedGroup.conversation.externalConversationId,
    idempotencyKey: [
      "slack",
      "dm",
      input.workspaceId,
      input.integrationId,
      identity.channelId ?? input.syncItem.conversation.id,
      identity.threadTs ?? "root",
      identity.latestMessageTs ?? lastMessage?.externalMessageId ?? "conversation",
      String(input.normalizedGroup.messages.length),
    ].join(":"),
  };
}

async function runSlackConversationIngestion(input: {
  workspaceId: string;
  integrationId: string;
  syncRunId: string;
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >;
  syncItem: SlackDmConversationSyncItem;
  normalizedGroup: ReturnType<typeof normalizeSlackConversationGroups>[number];
}) {
  const writer = createPrismaCanonicalPersistenceWriter({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    platform: "SLACK",
  });
  const writeCanonicalData = createCanonicalWriteHandler(writer);

  return runInboundOrchestration(
    buildSlackEnvelope(input),
    {
      async parsePayload(envelope) {
        return {
          parsedPayload: envelope.rawInput,
          externalEventId: envelope.externalEventId ?? null,
        };
      },
      async normalize() {
        return {
          batch: {
            eventType: "slack.recent_dm_sync",
            externalEventId:
              input.normalizedGroup.messages[input.normalizedGroup.messages.length - 1]
                ?.externalMessageId ?? null,
            conversations: [input.normalizedGroup.conversation],
            participants: input.normalizedGroup.participants,
            messages: input.normalizedGroup.messages,
            attachments: input.normalizedGroup.attachments,
            rawPayloadJson: input.syncItem.rawPayloadJson,
            platformMetadataJson: {
              provider: "slack",
              externalConversationId:
                input.normalizedGroup.conversation.externalConversationId,
              channelId: input.syncItem.conversation.id,
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
      idempotencyService: slackSyncIdempotencyService,
    },
  );
}

function buildSlackWebhookIdempotencyKey(input: {
  teamId: string;
  eventId: string | null;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
}) {
  if (input.eventId) {
    return ["slack", "event", input.teamId, input.eventId].join(":");
  }

  return [
    "slack",
    "event",
    input.teamId,
    input.channelId,
    input.messageTs,
    input.threadTs ?? "root",
  ].join(":");
}

function buildSlackWebhookSyncItem(input: SlackWebhookMessageEventInput) {
  const threadTs =
    input.event.thread_ts && input.event.thread_ts !== input.event.ts
      ? input.event.thread_ts
      : null;
  const messages = threadTs ? [] : [input.event];
  const threads = threadTs
    ? [
        {
          parentMessageTs: threadTs,
          replies: [input.event],
          rawPayloadJson: input.rawPayloadJson,
        },
      ]
    : [];
  const participantUserIds = [
    input.event.user,
  ].filter((userId): userId is string => typeof userId === "string");

  return {
    conversation: {
      id: input.event.channel ?? "",
      is_im: true,
      is_open: true,
      user: input.event.user,
      latest: input.event,
    },
    messages,
    threads,
    participantUserIds,
    rawPayloadJson: input.rawPayloadJson,
  } satisfies SlackDmConversationSyncItem;
}

export async function ingestSlackWebhookMessageEvent(
  input: SlackWebhookMessageEventInput,
) {
  const connectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
  });

  if (!connectorContext) {
    throw new Error("Slack integration context could not be resolved.");
  }

  const channelId = input.event.channel;
  const messageTs = input.event.ts;

  if (!channelId || !messageTs) {
    throw new Error("Slack message event is missing channel or timestamp.");
  }

  const syncItem = buildSlackWebhookSyncItem(input);
  const relevantUsers: never[] = [];
  const normalizedGroups = normalizeSlackConversationGroups(
    connectorContext,
    syncItem,
    relevantUsers,
  ).filter((group) => group.messages.length > 0);
  const results: InboundOrchestrationResult[] = [];

  for (const normalizedGroup of normalizedGroups) {
    const identity = readSlackGroupIdentity(normalizedGroup);
    const idempotencyKey = buildSlackWebhookIdempotencyKey({
      teamId: input.teamId,
      eventId: input.eventId,
      channelId,
      messageTs,
      threadTs: identity.threadTs,
    });
    const writer = createPrismaCanonicalPersistenceWriter({
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      platform: "SLACK",
    });
    const writeCanonicalData = createCanonicalWriteHandler(writer);
    const lastMessage =
      normalizedGroup.messages[normalizedGroup.messages.length - 1];
    const result = await runInboundOrchestration(
      {
        sourceType: "webhook",
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        platform: connectorContext.platform,
        connectorContext,
        rawInput: input.rawPayloadJson,
        receivedAt: new Date(),
        externalEventId: input.eventId ?? lastMessage?.externalMessageId ?? null,
        idempotencyKey,
      },
      {
        async parsePayload(envelope) {
          return {
            parsedPayload: envelope.rawInput,
            externalEventId: envelope.externalEventId ?? null,
          };
        },
        async normalize() {
          return {
            batch: {
              eventType: "slack.message_event",
              externalEventId:
                input.eventId ?? lastMessage?.externalMessageId ?? null,
              conversations: [normalizedGroup.conversation],
              participants: normalizedGroup.participants,
              messages: normalizedGroup.messages,
              attachments: normalizedGroup.attachments,
              rawPayloadJson: input.rawPayloadJson,
              platformMetadataJson: {
                provider: "slack",
                externalConversationId:
                  normalizedGroup.conversation.externalConversationId,
                channelId,
                eventId: input.eventId,
                eventTime: input.eventTime,
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
        idempotencyService: slackSyncIdempotencyService,
      },
    );

    results.push(result);
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
            platform: "SLACK",
            externalMessageId: message.externalMessageId ?? null,
            senderType: message.senderType ?? null,
            direction: message.direction ?? null,
            status: message.status ?? "RECEIVED",
            metadata: {
              provider: "slack",
              eventId: input.eventId,
              eventTime: input.eventTime,
            },
          },
        }),
      ];
    }),
  );

  await publishEnvoyEvents(receivedEvents);

  return {
    results,
    insertedMessageCount: results.reduce(
      (total, result) => total + result.insertedCounts.messages,
      0,
    ),
    insertedEventCount: receivedEvents.length,
  };
}

export async function syncWorkspaceSlackIntegration(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<SyncWorkspaceSlackIntegrationResult> {
  const prisma = getPrisma();
  const integrationSnapshot = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: "SLACK",
    },
    select: {
      platformMetadataJson: true,
    },
  });

  if (!integrationSnapshot) {
    throw new Error("Slack integration could not be loaded for sync.");
  }

  const resolvedConnectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
  });

  if (!resolvedConnectorContext) {
    throw new Error("Slack integration context could not be resolved.");
  }

  const connectorContext = resolvedConnectorContext;
  const syncStartedAt = new Date();
  const syncRunId = syncStartedAt.toISOString();
  const recentWindowDays = readRecentWindowDays(connectorContext);
  const previousCheckpoint = readSlackSyncCheckpoint(
    integrationSnapshot.platformMetadataJson,
  );
  const resumeCursor =
    previousCheckpoint?.hasMore === true
      ? previousCheckpoint.nextCursor ??
        previousCheckpoint.currentCursor ??
        previousCheckpoint.lastCursor ??
        null
      : null;
  const resumeWindowStart =
    resumeCursor
      ? parseCheckpointDate(
          previousCheckpoint?.windowStart ??
            previousCheckpoint?.lastRecentWindowStart,
        )
      : null;
  const resumeWindowEnd =
    resumeCursor
      ? parseCheckpointDate(
          previousCheckpoint?.windowEnd ??
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
    key: "slackSyncMaxPagesPerRun",
    defaultValue: SLACK_SYNC_DEFAULT_MAX_PAGES_PER_RUN,
    maxValue: 25,
  });
  const maxDmConversationsPerRun = readPositiveConfigInteger({
    connectorContext,
    key: "slackSyncMaxDmConversationsPerRun",
    defaultValue: SLACK_SYNC_DEFAULT_MAX_DM_CONVERSATIONS_PER_RUN,
    maxValue: 500,
  });
  const maxRuntimeMs = readPositiveConfigInteger({
    connectorContext,
    key: "slackSyncMaxRuntimeMs",
    defaultValue: SLACK_SYNC_DEFAULT_MAX_RUNTIME_MS,
    maxValue: 5 * 60_000,
  });

  await prisma.integration.update({
    where: { id: input.integrationId },
    data: {
      status: "SYNC_IN_PROGRESS",
      platformMetadataJson: toPrismaJsonValue(buildSlackSyncInProgressMetadata({
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
        nextCursor: resumeCursor,
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
        platform: "SLACK",
        status: "SYNC_IN_PROGRESS",
        metadata: {
          provider: "slack",
          recentWindowStart: recentWindowStart.toISOString(),
          recentWindowEnd: recentWindowEnd.toISOString(),
          resumedFromCursor: Boolean(resumeCursor),
        },
      },
    }),
  );

  try {
    const startedAtMs = syncStartedAt.getTime();
    let cursor = shouldResumeCheckpoint ? resumeCursor : null;
    let nextCursor: string | null = cursor;
    let hasMore = Boolean(cursor);
    let pagesProcessedThisRun = 0;
    let dmConversationsProcessedThisRun = 0;
    let totalPagesProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalPagesProcessed ?? 0
      : 0;
    let totalDmConversationsProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalDmConversationsProcessed ??
        previousCheckpoint?.dmConversationCount ??
        0
      : 0;
    let totalCanonicalConversationsProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalCanonicalConversationsProcessed ??
        previousCheckpoint?.canonicalConversationCount ??
        0
      : 0;
    let participantCount = shouldResumeCheckpoint
      ? previousCheckpoint?.participantCount ?? 0
      : 0;
    let messageCount = shouldResumeCheckpoint
      ? previousCheckpoint?.totalMessagesInserted ??
        previousCheckpoint?.messageCount ??
        0
      : 0;
    let attachmentCount = shouldResumeCheckpoint
      ? previousCheckpoint?.attachmentCount ?? 0
      : 0;
    let totalThreadsProcessed = shouldResumeCheckpoint
      ? previousCheckpoint?.totalThreadsProcessed ?? 0
      : 0;
    let lastProcessedChannelId = shouldResumeCheckpoint
      ? previousCheckpoint?.lastProcessedChannelId ?? null
      : null;
    let lastProcessedThreadTs = shouldResumeCheckpoint
      ? previousCheckpoint?.lastProcessedThreadTs ?? null
      : null;
    let lastProcessedMessageTs = shouldResumeCheckpoint
      ? previousCheckpoint?.lastProcessedMessageTs ?? null
      : null;
    let lastDiagnosticsSummary: Record<string, unknown> | null = null;
    let stoppedReason: SyncWorkspaceSlackIntegrationResult["stoppedReason"] =
      "complete";

    while (pagesProcessedThisRun < maxPagesPerRun) {
      if (Date.now() - startedAtMs >= maxRuntimeMs) {
        stoppedReason = "runtime_limit";
        break;
      }

      const remainingDmConversations =
        maxDmConversationsPerRun - dmConversationsProcessedThisRun;

      if (remainingDmConversations <= 0) {
        stoppedReason = "dm_limit";
        break;
      }

      const pageCursor = cursor;
      const slackSync = await fetchSlackRecentDms(
        buildSlackRecentDmSyncInput({
          context: connectorContext,
          cursor: pageCursor,
          windowStart: recentWindowStart,
          windowEnd: recentWindowEnd,
          limit: remainingDmConversations,
        }),
      );

      if (
        isJsonObject(slackSync.diagnosticsJson) &&
        typeof slackSync.diagnosticsJson.dmConversationCount === "number" &&
        typeof slackSync.diagnosticsJson.topLevelMessageCount === "number" &&
        slackSync.diagnosticsJson.dmConversationCount > 0 &&
        slackSync.diagnosticsJson.topLevelMessageCount === 0
      ) {
        console.warn(
          "[slack-sync] No Slack DM messages returned by Web API",
          JSON.stringify({
            integrationId: input.integrationId,
            workspaceId: input.workspaceId,
            diagnostics: sanitizeDiagnostics(slackSync.diagnosticsJson),
          }),
        );
      }

      const results: InboundOrchestrationResult[] = [];
      let pageCanonicalConversationGroupCount = 0;
      let pageThreadCount = 0;

      for (const syncItem of slackSync.conversations) {
        const relevantUsers = slackSync.users.filter((user) =>
          syncItem.participantUserIds.includes(user.id),
        );
        const normalizedGroups = normalizeSlackConversationGroups(
          connectorContext,
          syncItem,
          relevantUsers,
        );

        pageCanonicalConversationGroupCount += normalizedGroups.length;
        pageThreadCount += syncItem.threads.length;
        lastProcessedChannelId = syncItem.conversation.id;

        for (const normalizedGroup of normalizedGroups) {
          const groupIdentity = readSlackGroupIdentity(normalizedGroup);

          lastProcessedThreadTs =
            groupIdentity.threadTs ?? lastProcessedThreadTs;
          lastProcessedMessageTs =
            groupIdentity.latestMessageTs ?? lastProcessedMessageTs;
          results.push(
            await runSlackConversationIngestion({
              workspaceId: input.workspaceId,
              integrationId: input.integrationId,
              syncRunId,
              connectorContext,
              syncItem,
              normalizedGroup,
            }),
          );
        }
      }

      const pageParticipantCount = results.reduce(
        (total, result) => total + result.insertedCounts.participants,
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
                platform: "SLACK",
                externalMessageId: message.externalMessageId ?? null,
                senderType: message.senderType ?? null,
                direction: message.direction ?? null,
                status: message.status ?? "RECEIVED",
                metadata: {
                  provider: "slack",
                  pageCursor,
                },
              },
            }),
          ];
        }),
      );

      pagesProcessedThisRun += 1;
      dmConversationsProcessedThisRun += slackSync.conversations.length;
      totalPagesProcessed += 1;
      totalDmConversationsProcessed += slackSync.conversations.length;
      totalCanonicalConversationsProcessed += pageCanonicalConversationGroupCount;
      participantCount += pageParticipantCount;
      messageCount += pageMessageCount;
      attachmentCount += pageAttachmentCount;
      totalThreadsProcessed += pageThreadCount;
      nextCursor = slackSync.nextCursor ?? null;
      hasMore = slackSync.hasMore;
      lastDiagnosticsSummary = isJsonObject(slackSync.diagnosticsJson)
        ? slackSync.diagnosticsJson
        : null;

      const checkpointedAt = new Date();

      await prisma.integration.update({
        where: { id: input.integrationId },
        data: {
          status: hasMore ? "SYNC_IN_PROGRESS" : "CONNECTED",
          lastSyncedAt: checkpointedAt,
          platformMetadataJson: toPrismaJsonValue(buildSlackPageSyncCheckpointMetadata({
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
            nextCursor,
            hasMore,
            totalPagesProcessed,
            totalDmConversationsProcessed,
            totalCanonicalConversationsProcessed,
            totalMessagesInserted: messageCount,
            totalThreadsProcessed,
            participantCount,
            attachmentCount,
            lastProcessedChannelId,
            lastProcessedThreadTs,
            lastProcessedMessageTs,
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

      if (dmConversationsProcessedThisRun >= maxDmConversationsPerRun) {
        stoppedReason = "dm_limit";
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
      ? buildSlackPageSyncCheckpointMetadata
      : buildSlackSuccessfulSyncMetadata;

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
          nextCursor,
          hasMore,
          totalPagesProcessed,
          totalDmConversationsProcessed,
          totalCanonicalConversationsProcessed,
          totalMessagesInserted: messageCount,
          totalThreadsProcessed,
          participantCount,
          attachmentCount,
          lastProcessedChannelId,
          lastProcessedThreadTs,
          lastProcessedMessageTs,
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
          platform: "SLACK",
          status: "CONNECTED",
          messageCount,
          attachmentCount,
          hasMore,
          metadata: {
            provider: "slack",
            pagesProcessed: pagesProcessedThisRun,
            stoppedReason,
            dmConversationCount: totalDmConversationsProcessed,
            canonicalConversationCount: totalCanonicalConversationsProcessed,
            participantCount,
            totalThreadsProcessed,
            nextCursor,
            resumedFromCursor: Boolean(resumeCursor),
          },
        },
      }),
    );

    return {
      integrationId: input.integrationId,
      pagesProcessed: pagesProcessedThisRun,
      dmConversationCount: totalDmConversationsProcessed,
      canonicalConversationCount: totalCanonicalConversationsProcessed,
      participantCount,
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
        platformMetadataJson: toPrismaJsonValue(buildSlackFailedSyncMetadata({
          currentMetadata: (
            await prisma.integration.findUnique({
              where: { id: input.integrationId },
              select: { platformMetadataJson: true },
            })
          )?.platformMetadataJson,
          failedAt,
          recentWindowStart,
          recentWindowEnd,
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
          platform: "SLACK",
          status: "ERROR",
          metadata: {
            provider: "slack",
            error: sanitizeErrorMessage(error, "Unknown Slack sync error."),
            recentWindowStart: recentWindowStart.toISOString(),
            recentWindowEnd: recentWindowEnd.toISOString(),
          },
        },
      }),
    );

    throw error;
  }
}
