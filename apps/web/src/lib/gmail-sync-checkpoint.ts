import { sanitizeErrorMessage } from "./security";

type GmailSyncCheckpointStatus =
  | "IDLE"
  | "SYNC_IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED";
type GmailSyncFailureCategory =
  | "AUTH"
  | "CONNECTOR"
  | "NORMALIZATION"
  | "PERSISTENCE"
  | "UNKNOWN";

export type GmailSyncErrorSummary = {
  message: string;
  category: GmailSyncFailureCategory;
  failedAt: string;
};

export type GmailWatchStatus =
  | "ACTIVE"
  | "ERROR"
  | "NOT_CONFIGURED"
  | "STOPPED";

export type GmailWatchMetadata = {
  topicName: string | null;
  historyId: string | null;
  expiration: string | null;
  lastRenewedAt: string | null;
  status: GmailWatchStatus;
  lastError: GmailSyncErrorSummary | null;
};

export type GmailSyncCheckpoint = {
  mode: "BOUNDED_RECENT_THREADS";
  status: GmailSyncCheckpointStatus;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastRecentWindowStart: string | null;
  lastRecentWindowEnd: string | null;
  lastCursor: string | null;
  currentCursor: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
  backfillWindowStart: string | null;
  backfillWindowEnd: string | null;
  lastProcessedThreadId: string | null;
  lastProcessedMessageId: string | null;
  totalPagesProcessed: number;
  totalThreadsProcessed: number;
  totalMessagesInserted: number;
  threadCount: number;
  conversationCount: number;
  messageCount: number;
  attachmentCount: number;
  lastNotificationAt: string | null;
  lastNotificationHistoryId: string | null;
  lastProcessedHistoryId: string | null;
  lastSuccessfulHistorySyncAt: string | null;
  lastHistoryAttemptedAt: string | null;
  historyHasGap: boolean;
  historyGapDetectedAt: string | null;
  lastPubSubMessageId: string | null;
  totalPushNotificationsReceived: number;
  totalHistoryPagesProcessed: number;
  totalThreadsFetchedFromHistory: number;
  lastPushError: GmailSyncErrorSummary | null;
  diagnosticsSummary: Record<string, unknown> | null;
  lastError: GmailSyncErrorSummary | null;
  lastFailureCategory: GmailSyncFailureCategory | null;
  lastFailureAt: string | null;
};

export type GmailIntegrationMetadata = {
  provider: "gmail";
  gmailLiveSyncEnabled?: boolean;
  gmailSyncCheckpoint?: GmailSyncCheckpoint;
  gmailWatch?: GmailWatchMetadata;
  [key: string]: unknown;
};

export type GmailCheckpointProgressInput = {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
  totalPagesProcessed: number;
  totalThreadsProcessed: number;
  conversationCount: number;
  totalMessagesInserted: number;
  attachmentCount: number;
  lastProcessedThreadId?: string | null;
  lastProcessedMessageId?: string | null;
  diagnosticsSummary: Record<string, unknown> | null;
};

export type GmailPushCheckpointMetadataInput = {
  currentMetadata: unknown;
  observedAt: Date;
  notificationHistoryId: string;
  processedHistoryId?: string | null;
  pubSubMessageId: string;
  historyPagesProcessed?: number;
  threadsFetchedFromHistory?: number;
  historyHasGap?: boolean;
  error?: unknown;
  markSuccessful?: boolean;
  incrementNotificationCount?: boolean;
};

export type GmailWatchMetadataInput = {
  currentMetadata: unknown;
  observedAt: Date;
  topicName?: string | null;
  historyId?: string | null;
  expiration?: string | null;
  status: GmailWatchStatus;
  error?: unknown;
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readWatchStatus(value: unknown): GmailWatchStatus | null {
  return value === "ACTIVE" ||
    value === "ERROR" ||
    value === "NOT_CONFIGURED" ||
    value === "STOPPED"
    ? value
    : null;
}

function readExistingGmailWatch(
  currentMetadata: unknown,
): Partial<GmailWatchMetadata> {
  const metadata = isJsonObject(currentMetadata) ? currentMetadata : null;
  const gmailWatch = isJsonObject(metadata?.gmailWatch)
    ? metadata.gmailWatch
    : null;

  if (!gmailWatch) {
    return {};
  }

  return {
    topicName: readString(gmailWatch.topicName),
    historyId: readString(gmailWatch.historyId),
    expiration: readString(gmailWatch.expiration),
    lastRenewedAt: readString(gmailWatch.lastRenewedAt),
    status: readWatchStatus(gmailWatch.status) ?? "NOT_CONFIGURED",
    lastError: isJsonObject(gmailWatch.lastError)
      ? {
          message:
            readString(gmailWatch.lastError.message) ??
            "Unknown Gmail watch error",
          category:
            readFailureCategory(gmailWatch.lastError.category) ?? "UNKNOWN",
          failedAt:
            readString(gmailWatch.lastError.failedAt) ??
            new Date(0).toISOString(),
        }
      : null,
  };
}

function readExistingCheckpoint(
  currentMetadata: unknown,
): Partial<GmailSyncCheckpoint> {
  const metadata = isJsonObject(currentMetadata) ? currentMetadata : null;
  const checkpoint = isJsonObject(metadata?.gmailSyncCheckpoint)
    ? metadata.gmailSyncCheckpoint
    : null;

  if (!checkpoint) {
    return {};
  }

  return {
    status:
      checkpoint.status === "IDLE" ||
      checkpoint.status === "SYNC_IN_PROGRESS" ||
      checkpoint.status === "SUCCEEDED" ||
      checkpoint.status === "FAILED"
        ? checkpoint.status
        : undefined,
    lastSyncedAt: readString(checkpoint.lastSyncedAt),
    lastSuccessfulSyncAt: readString(checkpoint.lastSuccessfulSyncAt),
    lastAttemptedSyncAt: readString(checkpoint.lastAttemptedSyncAt),
    lastRecentWindowStart: readString(checkpoint.lastRecentWindowStart),
    lastRecentWindowEnd: readString(checkpoint.lastRecentWindowEnd),
    lastCursor: readString(checkpoint.lastCursor),
    currentCursor: readString(checkpoint.currentCursor),
    nextPageToken:
      readString(checkpoint.nextPageToken) ?? readString(checkpoint.lastCursor),
    hasMore: readBoolean(checkpoint.hasMore),
    backfillWindowStart:
      readString(checkpoint.backfillWindowStart) ??
      readString(checkpoint.lastRecentWindowStart),
    backfillWindowEnd:
      readString(checkpoint.backfillWindowEnd) ??
      readString(checkpoint.lastRecentWindowEnd),
    lastProcessedThreadId: readString(checkpoint.lastProcessedThreadId),
    lastProcessedMessageId: readString(checkpoint.lastProcessedMessageId),
    totalPagesProcessed: readNumber(checkpoint.totalPagesProcessed) ?? 0,
    totalThreadsProcessed:
      readNumber(checkpoint.totalThreadsProcessed) ??
      readNumber(checkpoint.threadCount) ??
      0,
    totalMessagesInserted:
      readNumber(checkpoint.totalMessagesInserted) ??
      readNumber(checkpoint.messageCount) ??
      0,
    threadCount: readNumber(checkpoint.threadCount) ?? 0,
    conversationCount: readNumber(checkpoint.conversationCount) ?? 0,
    messageCount: readNumber(checkpoint.messageCount) ?? 0,
    attachmentCount: readNumber(checkpoint.attachmentCount) ?? 0,
    lastNotificationAt: readString(checkpoint.lastNotificationAt),
    lastNotificationHistoryId: readString(checkpoint.lastNotificationHistoryId),
    lastProcessedHistoryId: readString(checkpoint.lastProcessedHistoryId),
    lastSuccessfulHistorySyncAt: readString(
      checkpoint.lastSuccessfulHistorySyncAt,
    ),
    lastHistoryAttemptedAt: readString(checkpoint.lastHistoryAttemptedAt),
    historyHasGap: readBoolean(checkpoint.historyHasGap),
    historyGapDetectedAt: readString(checkpoint.historyGapDetectedAt),
    lastPubSubMessageId: readString(checkpoint.lastPubSubMessageId),
    totalPushNotificationsReceived:
      readNumber(checkpoint.totalPushNotificationsReceived) ?? 0,
    totalHistoryPagesProcessed:
      readNumber(checkpoint.totalHistoryPagesProcessed) ?? 0,
    totalThreadsFetchedFromHistory:
      readNumber(checkpoint.totalThreadsFetchedFromHistory) ?? 0,
    lastPushError: isJsonObject(checkpoint.lastPushError)
      ? {
          message:
            readString(checkpoint.lastPushError.message) ??
            "Unknown Gmail push error",
          category:
            readFailureCategory(checkpoint.lastPushError.category) ?? "UNKNOWN",
          failedAt:
            readString(checkpoint.lastPushError.failedAt) ??
            new Date(0).toISOString(),
        }
      : null,
    diagnosticsSummary: isJsonObject(checkpoint.diagnosticsSummary)
      ? checkpoint.diagnosticsSummary
      : null,
    lastError: isJsonObject(checkpoint.lastError)
      ? {
          message:
            readString(checkpoint.lastError.message) ??
            "Unknown Gmail sync error",
          category:
            readFailureCategory(checkpoint.lastError.category) ?? "UNKNOWN",
          failedAt:
            readString(checkpoint.lastError.failedAt) ??
            new Date(0).toISOString(),
        }
      : null,
    lastFailureCategory: readFailureCategory(checkpoint.lastFailureCategory),
    lastFailureAt: readString(checkpoint.lastFailureAt),
  };
}

export function readGmailSyncCheckpoint(
  currentMetadata: unknown,
): Partial<GmailSyncCheckpoint> | null {
  const checkpoint = readExistingCheckpoint(currentMetadata);

  return Object.keys(checkpoint).length > 0 ? checkpoint : null;
}

export function readGmailLiveSyncEnabled(currentMetadata: unknown) {
  const metadata = isJsonObject(currentMetadata) ? currentMetadata : null;

  return typeof metadata?.gmailLiveSyncEnabled === "boolean"
    ? metadata.gmailLiveSyncEnabled
    : true;
}

function readFailureCategory(value: unknown): GmailSyncFailureCategory | null {
  return value === "AUTH" ||
    value === "CONNECTOR" ||
    value === "NORMALIZATION" ||
    value === "PERSISTENCE" ||
    value === "UNKNOWN"
    ? value
    : null;
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

function buildCheckpoint(input: {
  status: GmailSyncCheckpointStatus;
  currentMetadata: unknown;
  observedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextPageToken?: string | null;
  hasMore?: boolean;
  totalPagesProcessed?: number;
  totalThreadsProcessed?: number;
  conversationCount?: number;
  totalMessagesInserted?: number;
  attachmentCount?: number;
  lastProcessedThreadId?: string | null;
  lastProcessedMessageId?: string | null;
  diagnosticsSummary?: Record<string, unknown> | null;
  lastError?: GmailSyncErrorSummary | null;
  markSuccessful?: boolean;
}) {
  const previous = readExistingCheckpoint(input.currentMetadata);
  const nextPageToken =
    input.nextPageToken === undefined
      ? previous.nextPageToken ?? null
      : input.nextPageToken;
  const currentCursor =
    input.currentCursor === undefined
      ? previous.currentCursor ?? null
      : input.currentCursor;
  const totalThreadsProcessed =
    input.totalThreadsProcessed ?? previous.totalThreadsProcessed ?? 0;
  const totalMessagesInserted =
    input.totalMessagesInserted ?? previous.totalMessagesInserted ?? 0;

  return {
    mode: "BOUNDED_RECENT_THREADS",
    status: input.status,
    lastSyncedAt: input.observedAt.toISOString(),
    lastSuccessfulSyncAt: input.markSuccessful
      ? input.observedAt.toISOString()
      : previous.lastSuccessfulSyncAt ?? null,
    lastAttemptedSyncAt: input.observedAt.toISOString(),
    lastRecentWindowStart: input.recentWindowStart.toISOString(),
    lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
    lastCursor: nextPageToken ?? null,
    currentCursor: currentCursor ?? null,
    nextPageToken: nextPageToken ?? null,
    hasMore: input.hasMore ?? previous.hasMore ?? false,
    backfillWindowStart: input.recentWindowStart.toISOString(),
    backfillWindowEnd: input.recentWindowEnd.toISOString(),
    lastProcessedThreadId:
      input.lastProcessedThreadId === undefined
        ? previous.lastProcessedThreadId ?? null
        : input.lastProcessedThreadId,
    lastProcessedMessageId:
      input.lastProcessedMessageId === undefined
        ? previous.lastProcessedMessageId ?? null
        : input.lastProcessedMessageId,
    totalPagesProcessed:
      input.totalPagesProcessed ?? previous.totalPagesProcessed ?? 0,
    totalThreadsProcessed,
    totalMessagesInserted,
    threadCount: totalThreadsProcessed,
    conversationCount: input.conversationCount ?? previous.conversationCount ?? 0,
    messageCount: totalMessagesInserted,
    attachmentCount: input.attachmentCount ?? previous.attachmentCount ?? 0,
    lastNotificationAt: previous.lastNotificationAt ?? null,
    lastNotificationHistoryId: previous.lastNotificationHistoryId ?? null,
    lastProcessedHistoryId: previous.lastProcessedHistoryId ?? null,
    lastSuccessfulHistorySyncAt: previous.lastSuccessfulHistorySyncAt ?? null,
    lastHistoryAttemptedAt: previous.lastHistoryAttemptedAt ?? null,
    historyHasGap: previous.historyHasGap ?? false,
    historyGapDetectedAt: previous.historyGapDetectedAt ?? null,
    lastPubSubMessageId: previous.lastPubSubMessageId ?? null,
    totalPushNotificationsReceived:
      previous.totalPushNotificationsReceived ?? 0,
    totalHistoryPagesProcessed: previous.totalHistoryPagesProcessed ?? 0,
    totalThreadsFetchedFromHistory:
      previous.totalThreadsFetchedFromHistory ?? 0,
    lastPushError: previous.lastPushError ?? null,
    diagnosticsSummary:
      input.diagnosticsSummary === undefined
        ? previous.diagnosticsSummary ?? null
        : input.diagnosticsSummary,
    lastError:
      input.lastError === undefined ? previous.lastError ?? null : input.lastError,
    lastFailureCategory: input.lastError
      ? input.lastError.category
      : previous.lastFailureCategory ?? null,
    lastFailureAt: input.lastError
      ? input.lastError.failedAt
      : previous.lastFailureAt ?? null,
  } satisfies GmailSyncCheckpoint;
}

function buildCheckpointFromPrevious(currentMetadata: unknown): GmailSyncCheckpoint {
  const previous = readExistingCheckpoint(currentMetadata);

  return {
    mode: "BOUNDED_RECENT_THREADS",
    status: previous.status ?? "IDLE",
    lastSyncedAt: previous.lastSyncedAt ?? null,
    lastSuccessfulSyncAt: previous.lastSuccessfulSyncAt ?? null,
    lastAttemptedSyncAt: previous.lastAttemptedSyncAt ?? null,
    lastRecentWindowStart: previous.lastRecentWindowStart ?? null,
    lastRecentWindowEnd: previous.lastRecentWindowEnd ?? null,
    lastCursor: previous.lastCursor ?? null,
    currentCursor: previous.currentCursor ?? null,
    nextPageToken: previous.nextPageToken ?? null,
    hasMore: previous.hasMore ?? false,
    backfillWindowStart: previous.backfillWindowStart ?? null,
    backfillWindowEnd: previous.backfillWindowEnd ?? null,
    lastProcessedThreadId: previous.lastProcessedThreadId ?? null,
    lastProcessedMessageId: previous.lastProcessedMessageId ?? null,
    totalPagesProcessed: previous.totalPagesProcessed ?? 0,
    totalThreadsProcessed: previous.totalThreadsProcessed ?? 0,
    totalMessagesInserted: previous.totalMessagesInserted ?? 0,
    threadCount: previous.threadCount ?? 0,
    conversationCount: previous.conversationCount ?? 0,
    messageCount: previous.messageCount ?? 0,
    attachmentCount: previous.attachmentCount ?? 0,
    lastNotificationAt: previous.lastNotificationAt ?? null,
    lastNotificationHistoryId: previous.lastNotificationHistoryId ?? null,
    lastProcessedHistoryId: previous.lastProcessedHistoryId ?? null,
    lastSuccessfulHistorySyncAt: previous.lastSuccessfulHistorySyncAt ?? null,
    lastHistoryAttemptedAt: previous.lastHistoryAttemptedAt ?? null,
    historyHasGap: previous.historyHasGap ?? false,
    historyGapDetectedAt: previous.historyGapDetectedAt ?? null,
    lastPubSubMessageId: previous.lastPubSubMessageId ?? null,
    totalPushNotificationsReceived:
      previous.totalPushNotificationsReceived ?? 0,
    totalHistoryPagesProcessed: previous.totalHistoryPagesProcessed ?? 0,
    totalThreadsFetchedFromHistory:
      previous.totalThreadsFetchedFromHistory ?? 0,
    lastPushError: previous.lastPushError ?? null,
    diagnosticsSummary: previous.diagnosticsSummary ?? null,
    lastError: previous.lastError ?? null,
    lastFailureCategory: previous.lastFailureCategory ?? null,
    lastFailureAt: previous.lastFailureAt ?? null,
  };
}

export function buildSyncInProgressMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextPageToken?: string | null;
  hasMore?: boolean;
}) {
  const metadata = toGmailMetadata(input.currentMetadata);

  return {
    ...metadata,
    gmailSyncCheckpoint: buildCheckpoint({
      status: "SYNC_IN_PROGRESS",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextPageToken: input.nextPageToken,
      hasMore: input.hasMore,
      lastError: null,
    }),
  } satisfies GmailIntegrationMetadata;
}

export function buildPageSyncCheckpointMetadata(
  input: GmailCheckpointProgressInput,
) {
  const metadata = toGmailMetadata(input.currentMetadata);

  return {
    ...metadata,
    gmailSyncCheckpoint: buildCheckpoint({
      status: input.hasMore ? "SYNC_IN_PROGRESS" : "SUCCEEDED",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextPageToken: input.nextPageToken,
      hasMore: input.hasMore,
      totalPagesProcessed: input.totalPagesProcessed,
      totalThreadsProcessed: input.totalThreadsProcessed,
      conversationCount: input.conversationCount,
      totalMessagesInserted: input.totalMessagesInserted,
      attachmentCount: input.attachmentCount,
      lastProcessedThreadId: input.lastProcessedThreadId ?? null,
      lastProcessedMessageId: input.lastProcessedMessageId ?? null,
      diagnosticsSummary: input.diagnosticsSummary,
      lastError: null,
      markSuccessful: !input.hasMore,
    }),
  } satisfies GmailIntegrationMetadata;
}

export function buildSuccessfulSyncMetadata(
  input: GmailCheckpointProgressInput,
) {
  const metadata = toGmailMetadata(input.currentMetadata);

  return {
    ...metadata,
    gmailSyncCheckpoint: buildCheckpoint({
      status: "SUCCEEDED",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextPageToken: input.nextPageToken,
      hasMore: input.hasMore,
      totalPagesProcessed: input.totalPagesProcessed,
      totalThreadsProcessed: input.totalThreadsProcessed,
      conversationCount: input.conversationCount,
      totalMessagesInserted: input.totalMessagesInserted,
      attachmentCount: input.attachmentCount,
      lastProcessedThreadId: input.lastProcessedThreadId ?? null,
      lastProcessedMessageId: input.lastProcessedMessageId ?? null,
      diagnosticsSummary: input.diagnosticsSummary,
      lastError: null,
      markSuccessful: true,
    }),
  } satisfies GmailIntegrationMetadata;
}

export function buildPushCheckpointMetadata(
  input: GmailPushCheckpointMetadataInput,
) {
  const metadata = toGmailMetadata(input.currentMetadata);
  const previous = readExistingCheckpoint(input.currentMetadata);
  const checkpoint = buildCheckpointFromPrevious(input.currentMetadata);
  const errorSummary = input.error
    ? {
        message: sanitizeErrorMessage(
          input.error,
          "Unknown Gmail push error",
        ),
        category: classifySyncFailure(input.error),
        failedAt: input.observedAt.toISOString(),
      } satisfies GmailSyncErrorSummary
    : null;
  const historyHasGap = input.historyHasGap ?? checkpoint.historyHasGap;

  return {
    ...metadata,
    gmailSyncCheckpoint: {
      ...checkpoint,
      lastNotificationAt: input.observedAt.toISOString(),
      lastNotificationHistoryId: input.notificationHistoryId,
      lastProcessedHistoryId:
        input.processedHistoryId === undefined
          ? checkpoint.lastProcessedHistoryId
          : input.processedHistoryId,
      lastSuccessfulHistorySyncAt: input.markSuccessful
        ? input.observedAt.toISOString()
        : checkpoint.lastSuccessfulHistorySyncAt,
      lastHistoryAttemptedAt: input.observedAt.toISOString(),
      historyHasGap,
      historyGapDetectedAt:
        historyHasGap && !previous.historyHasGap
          ? input.observedAt.toISOString()
          : checkpoint.historyGapDetectedAt,
      lastPubSubMessageId: input.pubSubMessageId,
      totalPushNotificationsReceived:
        checkpoint.totalPushNotificationsReceived +
        (input.incrementNotificationCount === false ? 0 : 1),
      totalHistoryPagesProcessed:
        checkpoint.totalHistoryPagesProcessed +
        (input.historyPagesProcessed ?? 0),
      totalThreadsFetchedFromHistory:
        checkpoint.totalThreadsFetchedFromHistory +
        (input.threadsFetchedFromHistory ?? 0),
      lastPushError: errorSummary,
      diagnosticsSummary: {
        ...(isJsonObject(checkpoint.diagnosticsSummary)
          ? checkpoint.diagnosticsSummary
          : {}),
        lastPushNotificationHistoryId: input.notificationHistoryId,
        lastPushPubSubMessageId: input.pubSubMessageId,
        lastPushHistoryPagesProcessed: input.historyPagesProcessed ?? 0,
        lastPushThreadsFetchedFromHistory:
          input.threadsFetchedFromHistory ?? 0,
        historyHasGap,
      },
      lastError: errorSummary ?? checkpoint.lastError,
      lastFailureCategory: errorSummary
        ? errorSummary.category
        : checkpoint.lastFailureCategory,
      lastFailureAt: errorSummary
        ? errorSummary.failedAt
        : checkpoint.lastFailureAt,
    },
  } satisfies GmailIntegrationMetadata;
}

export function buildGmailWatchMetadata(
  input: GmailWatchMetadataInput,
) {
  const metadata = toGmailMetadata(input.currentMetadata);
  const previousWatch = readExistingGmailWatch(input.currentMetadata);
  const errorSummary = input.error
    ? {
        message: sanitizeErrorMessage(
          input.error,
          "Unknown Gmail watch error",
        ),
        category: classifySyncFailure(input.error),
        failedAt: input.observedAt.toISOString(),
      } satisfies GmailSyncErrorSummary
    : null;
  const topicName =
    input.topicName === undefined
      ? previousWatch.topicName ?? null
      : input.topicName;
  const historyId =
    input.historyId === undefined
      ? previousWatch.historyId ?? null
      : input.historyId;
  const expiration =
    input.expiration === undefined
      ? previousWatch.expiration ?? null
      : input.expiration;

  return {
    ...metadata,
    gmailHistoryId: historyId ?? metadata.gmailHistoryId ?? null,
    gmailWatch: {
      topicName,
      historyId,
      expiration,
      lastRenewedAt:
        input.status === "ACTIVE"
          ? input.observedAt.toISOString()
          : previousWatch.lastRenewedAt ?? null,
      status: input.status,
      lastError:
        input.status === "ACTIVE"
          ? null
          : errorSummary ?? previousWatch.lastError ?? null,
    },
  } satisfies GmailIntegrationMetadata;
}

export function buildGmailLiveSyncPreferenceMetadata(input: {
  currentMetadata: unknown;
  enabled: boolean;
}) {
  const metadata = toGmailMetadata(input.currentMetadata);
  const previousWatch = readExistingGmailWatch(input.currentMetadata);

  return {
    ...metadata,
    gmailLiveSyncEnabled: input.enabled,
    gmailWatch: input.enabled
      ? {
          topicName: previousWatch.topicName ?? null,
          historyId: previousWatch.historyId ?? null,
          expiration: previousWatch.expiration ?? null,
          lastRenewedAt: previousWatch.lastRenewedAt ?? null,
          status: previousWatch.status ?? "NOT_CONFIGURED",
          lastError: previousWatch.lastError ?? null,
        }
      : {
          topicName: previousWatch.topicName ?? null,
          historyId: previousWatch.historyId ?? null,
          expiration: previousWatch.expiration ?? null,
          lastRenewedAt: previousWatch.lastRenewedAt ?? null,
          status: "STOPPED",
          lastError: null,
        },
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
  const category = classifySyncFailure(input.error);
  const errorSummary = {
    message: sanitizeErrorMessage(
      input.error,
      "Unknown Gmail sync error",
    ),
    category,
    failedAt: input.failedAt.toISOString(),
  } satisfies GmailSyncErrorSummary;

  return {
    ...metadata,
    gmailSyncCheckpoint: buildCheckpoint({
      status: "FAILED",
      currentMetadata: input.currentMetadata,
      observedAt: input.failedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      diagnosticsSummary: {
        message: errorSummary.message,
      },
      lastError: errorSummary,
    }),
  } satisfies GmailIntegrationMetadata;
}
