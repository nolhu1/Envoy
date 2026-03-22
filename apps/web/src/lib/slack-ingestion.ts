import "server-only";

import {
  buildSlackRecentDmSyncInput,
  createCanonicalWriteHandler,
  fetchSlackRecentDms,
  InMemoryIdempotencyService,
  normalizeSlackConversationGroups,
  runInboundOrchestration,
  type ConnectorContext,
  type InboundOrchestrationResult,
  type SlackDmConversationSyncItem,
} from "@envoy/connectors";
import {
  createPrismaCanonicalPersistenceWriter,
  getPrisma,
  resolveConnectorContextForWorkspaceIntegration,
} from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import {
  buildSlackFailedSyncMetadata,
  buildSlackSuccessfulSyncMetadata,
  buildSlackSyncInProgressMetadata,
} from "@/lib/slack-sync-checkpoint";

type WorkspaceSlackIntegration = {
  id: string;
  workspaceId: string;
  externalAccountId: string | null;
  displayName: string | null;
  status: string;
  lastSyncedAt: Date | null;
  platformMetadataJson: unknown;
  updatedAt: Date;
};

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

const slackSyncIdempotencyService = new InMemoryIdempotencyService();

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlackIntegration(integration: WorkspaceSlackIntegration) {
  const metadata = isJsonObject(integration.platformMetadataJson)
    ? integration.platformMetadataJson
    : null;

  return metadata?.provider === "slack";
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function readRecentWindowDays(connectorContext: ConnectorContext) {
  const config =
    isJsonObject(connectorContext.config) ? connectorContext.config : null;

  return typeof config?.recentSyncWindowDays === "number" && config.recentSyncWindowDays > 0
    ? Math.floor(config.recentSyncWindowDays)
    : 14;
}

export async function getCurrentWorkspaceSlackIntegration() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return null;
  }

  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      deletedAt: null,
      platform: "SLACK",
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

  return integrations.find(isSlackIntegration) ?? null;
}

function buildSlackEnvelope(input: {
  workspaceId: string;
  integrationId: string;
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

  try {
    const slackSync = await fetchSlackRecentDms(
      buildSlackRecentDmSyncInput({
        context: connectorContext,
      }),
    );
    const results: InboundOrchestrationResult[] = [];
    let normalizedConversationGroupCount = 0;

    for (const syncItem of slackSync.conversations) {
      const normalizedGroups = normalizeSlackConversationGroups(
        connectorContext,
        syncItem,
        slackSync.users,
      );

      normalizedConversationGroupCount += normalizedGroups.length;

      for (const normalizedGroup of normalizedGroups) {
        results.push(
          await runSlackConversationIngestion({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
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
