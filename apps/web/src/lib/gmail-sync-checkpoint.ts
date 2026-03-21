import "server-only";

type GmailSyncCheckpointStatus = "IDLE" | "SYNC_IN_PROGRESS" | "SUCCEEDED" | "FAILED";
type GmailSyncFailureCategory =
  | "AUTH"
  | "CONNECTOR"
  | "NORMALIZATION"
  | "PERSISTENCE"
  | "UNKNOWN";

export type GmailSyncCheckpoint = {
  mode: "BOUNDED_RECENT_THREADS";
  status: GmailSyncCheckpointStatus;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRecentWindowStart: string | null;
  lastRecentWindowEnd: string | null;
  lastCursor: string | null;
  hasMore: boolean;
  threadCount: number;
  conversationCount: number;
  messageCount: number;
  attachmentCount: number;
  diagnosticsSummary: Record<string, unknown> | null;
  lastFailureCategory: GmailSyncFailureCategory | null;
  lastFailureAt: string | null;
};

export type GmailIntegrationMetadata = {
  provider: "gmail";
  gmailSyncCheckpoint?: GmailSyncCheckpoint;
  [key: string]: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toGmailMetadata(
  current: unknown,
): GmailIntegrationMetadata {
  if (isJsonObject(current)) {
    return {
      ...(current as Record<string, unknown>),
      provider: "gmail",
    };
  }

  return {
    provider: "gmail",
  };
}

function classifySyncFailure(error: unknown): GmailSyncFailureCategory {
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
    error.message.includes("Gmail API request failed") ||
    error.message.includes("connector")
  ) {
    return "CONNECTOR";
  }

  return "UNKNOWN";
}

export function buildSyncInProgressMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
}) {
  const metadata = toGmailMetadata(input.currentMetadata);
  const previousCheckpoint = metadata.gmailSyncCheckpoint;

  return {
    ...metadata,
    gmailSyncCheckpoint: {
      mode: "BOUNDED_RECENT_THREADS",
      status: "SYNC_IN_PROGRESS",
      lastSyncedAt: input.syncedAt.toISOString(),
      lastSuccessfulSyncAt: previousCheckpoint?.lastSuccessfulSyncAt ?? null,
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: previousCheckpoint?.lastCursor ?? null,
      hasMore: previousCheckpoint?.hasMore ?? false,
      threadCount: previousCheckpoint?.threadCount ?? 0,
      conversationCount: previousCheckpoint?.conversationCount ?? 0,
      messageCount: previousCheckpoint?.messageCount ?? 0,
      attachmentCount: previousCheckpoint?.attachmentCount ?? 0,
      diagnosticsSummary: previousCheckpoint?.diagnosticsSummary ?? null,
      lastFailureCategory: previousCheckpoint?.lastFailureCategory ?? null,
      lastFailureAt: previousCheckpoint?.lastFailureAt ?? null,
    } satisfies GmailSyncCheckpoint,
  } satisfies GmailIntegrationMetadata;
}

export function buildSuccessfulSyncMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  nextCursor: string | null;
  hasMore: boolean;
  threadCount: number;
  conversationCount: number;
  messageCount: number;
  attachmentCount: number;
  diagnosticsSummary: Record<string, unknown> | null;
}) {
  const metadata = toGmailMetadata(input.currentMetadata);

  return {
    ...metadata,
    gmailSyncCheckpoint: {
      mode: "BOUNDED_RECENT_THREADS",
      status: "SUCCEEDED",
      lastSyncedAt: input.syncedAt.toISOString(),
      lastSuccessfulSyncAt: input.syncedAt.toISOString(),
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: input.nextCursor,
      hasMore: input.hasMore,
      threadCount: input.threadCount,
      conversationCount: input.conversationCount,
      messageCount: input.messageCount,
      attachmentCount: input.attachmentCount,
      diagnosticsSummary: input.diagnosticsSummary,
      lastFailureCategory: null,
      lastFailureAt: null,
    } satisfies GmailSyncCheckpoint,
  } satisfies GmailIntegrationMetadata;
}

export function buildFailedSyncMetadata(input: {
  currentMetadata: unknown;
  failedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  error: unknown;
}) {
  const metadata = toGmailMetadata(input.currentMetadata);
  const previousCheckpoint = metadata.gmailSyncCheckpoint;

  return {
    ...metadata,
    gmailSyncCheckpoint: {
      mode: "BOUNDED_RECENT_THREADS",
      status: "FAILED",
      lastSyncedAt: input.failedAt.toISOString(),
      lastSuccessfulSyncAt: previousCheckpoint?.lastSuccessfulSyncAt ?? null,
      lastRecentWindowStart: input.recentWindowStart.toISOString(),
      lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
      lastCursor: previousCheckpoint?.lastCursor ?? null,
      hasMore: previousCheckpoint?.hasMore ?? false,
      threadCount: previousCheckpoint?.threadCount ?? 0,
      conversationCount: previousCheckpoint?.conversationCount ?? 0,
      messageCount: previousCheckpoint?.messageCount ?? 0,
      attachmentCount: previousCheckpoint?.attachmentCount ?? 0,
      diagnosticsSummary: {
        message:
          input.error instanceof Error ? input.error.message : "Unknown Gmail sync error",
      },
      lastFailureCategory: classifySyncFailure(input.error),
      lastFailureAt: input.failedAt.toISOString(),
    } satisfies GmailSyncCheckpoint,
  } satisfies GmailIntegrationMetadata;
}
