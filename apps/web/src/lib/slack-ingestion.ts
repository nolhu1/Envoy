import {
  buildSlackRecentDmSyncInput,
  createCanonicalWriteHandler,
  fetchSlackRecentDms,
  normalizeSlackConversationGroups,
  runInboundOrchestration,
  type ConnectorContext,
  type InboundOrchestrationResult,
  type SlackDmConversationSyncItem,
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
  buildSlackFailedSyncMetadata,
  buildSlackSuccessfulSyncMetadata,
  buildSlackSyncInProgressMetadata,
} from "./slack-sync-checkpoint";
import { sanitizeDiagnostics, sanitizeErrorMessage } from "./security";

type SyncWorkspaceSlackIntegrationResult = {
  integrationId: string;
  dmConversationCount: number;
  canonicalConversationCount: number;
  participantCount: number;
  messageCount: number;
  attachmentCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

const slackSyncIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "web:slack-sync",
});
const DEFAULT_SLACK_RECENT_WINDOW_DAYS = 14;
const INITIAL_SLACK_RECENT_WINDOW_DAYS = 90;

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
      "sync",
      input.integrationId,
      input.normalizedGroup.conversation.externalConversationId,
      lastMessage?.externalMessageId ?? "conversation",
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

export async function syncWorkspaceSlackIntegration(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<SyncWorkspaceSlackIntegrationResult> {
  const prisma = getPrisma();
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
  const recentWindowStart = new Date(syncStartedAt);
  recentWindowStart.setDate(recentWindowStart.getDate() - recentWindowDays);

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
        recentWindowEnd: syncStartedAt,
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
          recentWindowEnd: syncStartedAt.toISOString(),
        },
      },
    }),
  );

  try {
    const slackSync = await fetchSlackRecentDms(
      buildSlackRecentDmSyncInput({
        context: connectorContext,
        windowStart: recentWindowStart,
        windowEnd: syncStartedAt,
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
    let normalizedConversationGroupCount = 0;

    for (const syncItem of slackSync.conversations) {
      const relevantUsers = slackSync.users.filter((user) =>
        syncItem.participantUserIds.includes(user.id),
      );
      const normalizedGroups = normalizeSlackConversationGroups(
        connectorContext,
        syncItem,
        relevantUsers,
      );

      normalizedConversationGroupCount += normalizedGroups.length;

      for (const normalizedGroup of normalizedGroups) {
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

    const participantCount = results.reduce(
      (total, result) => total + result.insertedCounts.participants,
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
              },
            },
          }),
        ];
      }),
    );

    await prisma.integration.update({
      where: { id: input.integrationId },
      data: {
        status: "CONNECTED",
        lastSyncedAt: now,
        platformMetadataJson: toPrismaJsonValue(buildSlackSuccessfulSyncMetadata({
          currentMetadata: (
            await prisma.integration.findUnique({
              where: { id: input.integrationId },
              select: { platformMetadataJson: true },
            })
          )?.platformMetadataJson,
          syncedAt: now,
          recentWindowStart,
          recentWindowEnd: now,
          nextCursor: slackSync.nextCursor ?? null,
          hasMore: slackSync.hasMore,
          dmConversationCount: slackSync.conversations.length,
          canonicalConversationCount: normalizedConversationGroupCount,
          participantCount,
          messageCount,
          attachmentCount,
          diagnosticsSummary: isJsonObject(slackSync.diagnosticsJson)
            ? slackSync.diagnosticsJson
            : null,
        })),
      },
    });

    await publishEnvoyEvents(receivedEvents);
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
          hasMore: slackSync.hasMore,
          metadata: {
            provider: "slack",
            dmConversationCount: slackSync.conversations.length,
            canonicalConversationCount: normalizedConversationGroupCount,
            participantCount,
            nextCursor: slackSync.nextCursor ?? null,
          },
        },
      }),
    );

    return {
      integrationId: input.integrationId,
      dmConversationCount: slackSync.conversations.length,
      canonicalConversationCount: normalizedConversationGroupCount,
      participantCount,
      messageCount,
      attachmentCount,
      nextCursor: slackSync.nextCursor ?? null,
      hasMore: slackSync.hasMore,
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
          platform: "SLACK",
          status: "ERROR",
          metadata: {
            provider: "slack",
            error: sanitizeErrorMessage(error, "Unknown Slack sync error."),
            recentWindowStart: recentWindowStart.toISOString(),
            recentWindowEnd: failedAt.toISOString(),
          },
        },
      }),
    );

    throw error;
  }
}
