import "server-only";

type SlackSyncCheckpointStatus = "IDLE" | "SYNC_IN_PROGRESS" | "SUCCEEDED" | "FAILED";
type SlackSyncFailureCategory =
  | "AUTH"
  | "CONNECTOR"
  | "NORMALIZATION"
  | "PERSISTENCE"
  | "UNKNOWN";

export type SlackSyncCheckpoint = {
  mode: "BOUNDED_RECENT_DMS";
  status: SlackSyncCheckpointStatus;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRecentWindowStart: string | null;
  lastRecentWindowEnd: string | null;
  lastCursor: string | null;
  hasMore: boolean;
  dmConversationCount: number;
  canonicalConversationCount: number;
  participantCount: number;
  messageCount: number;
  attachmentCount: number;
  diagnosticsSummary: Record<string, unknown> | null;
  lastFailureCategory: SlackSyncFailureCategory | null;
  lastFailureAt: string | null;
};

export type SlackIntegrationMetadata = {
  provider: "slack";
  slackSyncCheckpoint?: SlackSyncCheckpoint;
  [key: string]: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSlackMetadata(current: unknown): SlackIntegrationMetadata {
  if (isJsonObject(current)) {
    return {
      ...(current as Record<string, unknown>),
      provider: "slack",
    };
  }

  return {
    provider: "slack",
  };
}

function classifySyncFailure(error: unknown): SlackSyncFailureCategory {
  if (!(error instanceof Error)) {
    return "UNKNOWN";
  }

  if (
    error.message.includes("401") ||
    error.message.includes("OAuth") ||
    error.message.includes("auth")
  ) {
    return "AUTH";
  }

  if (error.message.includes("normalize")) {
    return "NORMALIZATION";
  }

  if (
    error.message.includes("persist") ||
    error.message.includes("Prisma") ||
    error.message.includes("update") ||
    error.message.includes("create")
  ) {
    return "PERSISTENCE";
  }

  if (
    error.message.includes("Slack API request failed") ||
    error.message.includes("connector")
  ) {
    return "CONNECTOR";
  }

  return "UNKNOWN";
}

export function buildSlackSyncInProgressMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
}) {
  const metadata = toSlackMetadata(input.currentMetadata);
  const previousCheckpoint = metadata.slackSyncCheckpoint;

  return {
    ...metadata,
    slackSyncCheckpoint: {
      mode: "BOUNDED_RECENT_DMS",
      status: "SYNC_IN_PROGRESS",
      lastSyncedAt: input.syncedAt.toISOString(),
      lastSuccessfulSyncAt: previousCheckpoint?.lastSuccessfulSyncAt ?? null,
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: previousCheckpoint?.lastCursor ?? null,
      hasMore: previousCheckpoint?.hasMore ?? false,
      dmConversationCount: previousCheckpoint?.dmConversationCount ?? 0,
      canonicalConversationCount: previousCheckpoint?.canonicalConversationCount ?? 0,
      participantCount: previousCheckpoint?.participantCount ?? 0,
      messageCount: previousCheckpoint?.messageCount ?? 0,
      attachmentCount: previousCheckpoint?.attachmentCount ?? 0,
      diagnosticsSummary: previousCheckpoint?.diagnosticsSummary ?? null,
      lastFailureCategory: previousCheckpoint?.lastFailureCategory ?? null,
      lastFailureAt: previousCheckpoint?.lastFailureAt ?? null,
    } satisfies SlackSyncCheckpoint,
  } satisfies SlackIntegrationMetadata;
}

export function buildSlackSuccessfulSyncMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  nextCursor: string | null;
  hasMore: boolean;
  dmConversationCount: number;
  canonicalConversationCount: number;
  participantCount: number;
  messageCount: number;
  attachmentCount: number;
  diagnosticsSummary: Record<string, unknown> | null;
}) {
  const metadata = toSlackMetadata(input.currentMetadata);

  return {
    ...metadata,
    slackSyncCheckpoint: {
      mode: "BOUNDED_RECENT_DMS",
      status: "SUCCEEDED",
      lastSyncedAt: input.syncedAt.toISOString(),
      lastSuccessfulSyncAt: input.syncedAt.toISOString(),
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: input.nextCursor,
      hasMore: input.hasMore,
      dmConversationCount: input.dmConversationCount,
      canonicalConversationCount: input.canonicalConversationCount,
      participantCount: input.participantCount,
      messageCount: input.messageCount,
      attachmentCount: input.attachmentCount,
      diagnosticsSummary: input.diagnosticsSummary,
      lastFailureCategory: null,
      lastFailureAt: null,
    } satisfies SlackSyncCheckpoint,
  } satisfies SlackIntegrationMetadata;
}

export function buildSlackFailedSyncMetadata(input: {
  currentMetadata: unknown;
  failedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  error: unknown;
}) {
  const metadata = toSlackMetadata(input.currentMetadata);
  const previousCheckpoint = metadata.slackSyncCheckpoint;

  return {
    ...metadata,
    slackSyncCheckpoint: {
      mode: "BOUNDED_RECENT_DMS",
      status: "FAILED",
      lastSyncedAt: input.failedAt.toISOString(),
      lastSuccessfulSyncAt: previousCheckpoint?.lastSuccessfulSyncAt ?? null,
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: previousCheckpoint?.lastCursor ?? null,
      hasMore: previousCheckpoint?.hasMore ?? false,
      dmConversationCount: previousCheckpoint?.dmConversationCount ?? 0,
      canonicalConversationCount: previousCheckpoint?.canonicalConversationCount ?? 0,
      participantCount: previousCheckpoint?.participantCount ?? 0,
      messageCount: previousCheckpoint?.messageCount ?? 0,
      attachmentCount: previousCheckpoint?.attachmentCount ?? 0,
      diagnosticsSummary: {
        message:
          input.error instanceof Error ? input.error.message : "Unknown Slack sync error",
      },
      lastFailureCategory: classifySyncFailure(input.error),
      lastFailureAt: input.failedAt.toISOString(),
    } satisfies SlackSyncCheckpoint,
  } satisfies SlackIntegrationMetadata;
}
