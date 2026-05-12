import { sanitizeErrorMessage } from "./security";

type SlackSyncCheckpointStatus =
  | "IDLE"
  | "SYNC_IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED";
type SlackSyncFailureCategory =
  | "AUTH"
  | "CONNECTOR"
  | "NORMALIZATION"
  | "PERSISTENCE"
  | "UNKNOWN";

export type SlackSyncErrorSummary = {
  message: string;
  category: SlackSyncFailureCategory;
  failedAt: string;
};

export type SlackSyncCheckpoint = {
  mode: "BOUNDED_RECENT_DMS";
  status: SlackSyncCheckpointStatus;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastRecentWindowStart: string | null;
  lastRecentWindowEnd: string | null;
  lastCursor: string | null;
  currentCursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  lastProcessedChannelId: string | null;
  lastProcessedThreadTs: string | null;
  lastProcessedMessageTs: string | null;
  totalPagesProcessed: number;
  totalDmConversationsProcessed: number;
  totalCanonicalConversationsProcessed: number;
  totalMessagesInserted: number;
  totalThreadsProcessed: number;
  dmConversationCount: number;
  canonicalConversationCount: number;
  participantCount: number;
  messageCount: number;
  attachmentCount: number;
  diagnosticsSummary: Record<string, unknown> | null;
  lastError: SlackSyncErrorSummary | null;
  lastFailureCategory: SlackSyncFailureCategory | null;
  lastFailureAt: string | null;
};

export type SlackIntegrationMetadata = {
  provider: "slack";
  slackSyncCheckpoint?: SlackSyncCheckpoint;
  [key: string]: unknown;
};

export type SlackCheckpointProgressInput = {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  totalPagesProcessed: number;
  totalDmConversationsProcessed: number;
  totalCanonicalConversationsProcessed: number;
  totalMessagesInserted: number;
  totalThreadsProcessed: number;
  participantCount: number;
  attachmentCount: number;
  lastProcessedChannelId?: string | null;
  lastProcessedThreadTs?: string | null;
  lastProcessedMessageTs?: string | null;
  diagnosticsSummary: Record<string, unknown> | null;
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readFailureCategory(value: unknown): SlackSyncFailureCategory | null {
  return value === "AUTH" ||
    value === "CONNECTOR" ||
    value === "NORMALIZATION" ||
    value === "PERSISTENCE" ||
    value === "UNKNOWN"
    ? value
    : null;
}

function readExistingCheckpoint(
  currentMetadata: unknown,
): Partial<SlackSyncCheckpoint> {
  const metadata = isJsonObject(currentMetadata) ? currentMetadata : null;
  const checkpoint = isJsonObject(metadata?.slackSyncCheckpoint)
    ? metadata.slackSyncCheckpoint
    : null;

  if (!checkpoint) {
    return {};
  }

  return {
    lastSuccessfulSyncAt: readString(checkpoint.lastSuccessfulSyncAt),
    lastAttemptedSyncAt: readString(checkpoint.lastAttemptedSyncAt),
    lastRecentWindowStart: readString(checkpoint.lastRecentWindowStart),
    lastRecentWindowEnd: readString(checkpoint.lastRecentWindowEnd),
    lastCursor: readString(checkpoint.lastCursor),
    currentCursor: readString(checkpoint.currentCursor),
    nextCursor:
      readString(checkpoint.nextCursor) ?? readString(checkpoint.lastCursor),
    hasMore: readBoolean(checkpoint.hasMore),
    windowStart:
      readString(checkpoint.windowStart) ??
      readString(checkpoint.lastRecentWindowStart),
    windowEnd:
      readString(checkpoint.windowEnd) ??
      readString(checkpoint.lastRecentWindowEnd),
    lastProcessedChannelId: readString(checkpoint.lastProcessedChannelId),
    lastProcessedThreadTs: readString(checkpoint.lastProcessedThreadTs),
    lastProcessedMessageTs: readString(checkpoint.lastProcessedMessageTs),
    totalPagesProcessed: readNumber(checkpoint.totalPagesProcessed) ?? 0,
    totalDmConversationsProcessed:
      readNumber(checkpoint.totalDmConversationsProcessed) ??
      readNumber(checkpoint.dmConversationCount) ??
      0,
    totalCanonicalConversationsProcessed:
      readNumber(checkpoint.totalCanonicalConversationsProcessed) ??
      readNumber(checkpoint.canonicalConversationCount) ??
      0,
    totalMessagesInserted:
      readNumber(checkpoint.totalMessagesInserted) ??
      readNumber(checkpoint.messageCount) ??
      0,
    totalThreadsProcessed: readNumber(checkpoint.totalThreadsProcessed) ?? 0,
    dmConversationCount: readNumber(checkpoint.dmConversationCount) ?? 0,
    canonicalConversationCount:
      readNumber(checkpoint.canonicalConversationCount) ?? 0,
    participantCount: readNumber(checkpoint.participantCount) ?? 0,
    messageCount: readNumber(checkpoint.messageCount) ?? 0,
    attachmentCount: readNumber(checkpoint.attachmentCount) ?? 0,
    diagnosticsSummary: isJsonObject(checkpoint.diagnosticsSummary)
      ? checkpoint.diagnosticsSummary
      : null,
    lastError: isJsonObject(checkpoint.lastError)
      ? {
          message:
            readString(checkpoint.lastError.message) ??
            "Unknown Slack sync error",
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

export function readSlackSyncCheckpoint(
  currentMetadata: unknown,
): Partial<SlackSyncCheckpoint> | null {
  const checkpoint = readExistingCheckpoint(currentMetadata);

  return Object.keys(checkpoint).length > 0 ? checkpoint : null;
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

function buildCheckpoint(input: {
  status: SlackSyncCheckpointStatus;
  currentMetadata: unknown;
  observedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextCursor?: string | null;
  hasMore?: boolean;
  totalPagesProcessed?: number;
  totalDmConversationsProcessed?: number;
  totalCanonicalConversationsProcessed?: number;
  totalMessagesInserted?: number;
  totalThreadsProcessed?: number;
  participantCount?: number;
  attachmentCount?: number;
  lastProcessedChannelId?: string | null;
  lastProcessedThreadTs?: string | null;
  lastProcessedMessageTs?: string | null;
  diagnosticsSummary?: Record<string, unknown> | null;
  lastError?: SlackSyncErrorSummary | null;
  markSuccessful?: boolean;
}) {
  const previous = readExistingCheckpoint(input.currentMetadata);
  const nextCursor =
    input.nextCursor === undefined
      ? previous.nextCursor ?? null
      : input.nextCursor;
  const currentCursor =
    input.currentCursor === undefined
      ? previous.currentCursor ?? null
      : input.currentCursor;
  const totalDmConversationsProcessed =
    input.totalDmConversationsProcessed ??
    previous.totalDmConversationsProcessed ??
    0;
  const totalCanonicalConversationsProcessed =
    input.totalCanonicalConversationsProcessed ??
    previous.totalCanonicalConversationsProcessed ??
    0;
  const totalMessagesInserted =
    input.totalMessagesInserted ?? previous.totalMessagesInserted ?? 0;

  return {
    mode: "BOUNDED_RECENT_DMS",
    status: input.status,
    lastSyncedAt: input.observedAt.toISOString(),
    lastSuccessfulSyncAt: input.markSuccessful
      ? input.observedAt.toISOString()
      : previous.lastSuccessfulSyncAt ?? null,
    lastAttemptedSyncAt: input.observedAt.toISOString(),
    lastRecentWindowStart: input.recentWindowStart.toISOString(),
    lastRecentWindowEnd: input.recentWindowEnd.toISOString(),
    lastCursor: nextCursor ?? null,
    currentCursor: currentCursor ?? null,
    nextCursor: nextCursor ?? null,
    hasMore: input.hasMore ?? previous.hasMore ?? false,
    windowStart: input.recentWindowStart.toISOString(),
    windowEnd: input.recentWindowEnd.toISOString(),
    lastProcessedChannelId:
      input.lastProcessedChannelId === undefined
        ? previous.lastProcessedChannelId ?? null
        : input.lastProcessedChannelId,
    lastProcessedThreadTs:
      input.lastProcessedThreadTs === undefined
        ? previous.lastProcessedThreadTs ?? null
        : input.lastProcessedThreadTs,
    lastProcessedMessageTs:
      input.lastProcessedMessageTs === undefined
        ? previous.lastProcessedMessageTs ?? null
        : input.lastProcessedMessageTs,
    totalPagesProcessed:
      input.totalPagesProcessed ?? previous.totalPagesProcessed ?? 0,
    totalDmConversationsProcessed,
    totalCanonicalConversationsProcessed,
    totalMessagesInserted,
    totalThreadsProcessed:
      input.totalThreadsProcessed ?? previous.totalThreadsProcessed ?? 0,
    dmConversationCount: totalDmConversationsProcessed,
    canonicalConversationCount: totalCanonicalConversationsProcessed,
    participantCount: input.participantCount ?? previous.participantCount ?? 0,
    messageCount: totalMessagesInserted,
    attachmentCount: input.attachmentCount ?? previous.attachmentCount ?? 0,
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
  } satisfies SlackSyncCheckpoint;
}

export function buildSlackSyncInProgressMetadata(input: {
  currentMetadata: unknown;
  syncedAt: Date;
  recentWindowStart: Date;
  recentWindowEnd: Date;
  currentCursor?: string | null;
  nextCursor?: string | null;
  hasMore?: boolean;
}) {
  const metadata = toSlackMetadata(input.currentMetadata);

  return {
    ...metadata,
    slackSyncCheckpoint: buildCheckpoint({
      status: "SYNC_IN_PROGRESS",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextCursor: input.nextCursor,
      hasMore: input.hasMore,
      lastError: null,
    }),
  } satisfies SlackIntegrationMetadata;
}

export function buildSlackPageSyncCheckpointMetadata(
  input: SlackCheckpointProgressInput,
) {
  const metadata = toSlackMetadata(input.currentMetadata);

  return {
    ...metadata,
    slackSyncCheckpoint: buildCheckpoint({
      status: input.hasMore ? "SYNC_IN_PROGRESS" : "SUCCEEDED",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextCursor: input.nextCursor,
      hasMore: input.hasMore,
      totalPagesProcessed: input.totalPagesProcessed,
      totalDmConversationsProcessed: input.totalDmConversationsProcessed,
      totalCanonicalConversationsProcessed:
        input.totalCanonicalConversationsProcessed,
      totalMessagesInserted: input.totalMessagesInserted,
      totalThreadsProcessed: input.totalThreadsProcessed,
      participantCount: input.participantCount,
      attachmentCount: input.attachmentCount,
      lastProcessedChannelId: input.lastProcessedChannelId ?? null,
      lastProcessedThreadTs: input.lastProcessedThreadTs ?? null,
      lastProcessedMessageTs: input.lastProcessedMessageTs ?? null,
      diagnosticsSummary: input.diagnosticsSummary,
      lastError: null,
      markSuccessful: !input.hasMore,
    }),
  } satisfies SlackIntegrationMetadata;
}

export function buildSlackSuccessfulSyncMetadata(
  input: SlackCheckpointProgressInput,
) {
  const metadata = toSlackMetadata(input.currentMetadata);

  return {
    ...metadata,
    slackSyncCheckpoint: buildCheckpoint({
      status: "SUCCEEDED",
      currentMetadata: input.currentMetadata,
      observedAt: input.syncedAt,
      recentWindowStart: input.recentWindowStart,
      recentWindowEnd: input.recentWindowEnd,
      currentCursor: input.currentCursor ?? null,
      nextCursor: input.nextCursor,
      hasMore: input.hasMore,
      totalPagesProcessed: input.totalPagesProcessed,
      totalDmConversationsProcessed: input.totalDmConversationsProcessed,
      totalCanonicalConversationsProcessed:
        input.totalCanonicalConversationsProcessed,
      totalMessagesInserted: input.totalMessagesInserted,
      totalThreadsProcessed: input.totalThreadsProcessed,
      participantCount: input.participantCount,
      attachmentCount: input.attachmentCount,
      lastProcessedChannelId: input.lastProcessedChannelId ?? null,
      lastProcessedThreadTs: input.lastProcessedThreadTs ?? null,
      lastProcessedMessageTs: input.lastProcessedMessageTs ?? null,
      diagnosticsSummary: input.diagnosticsSummary,
      lastError: null,
      markSuccessful: true,
    }),
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
  const category = classifySyncFailure(input.error);
  const errorSummary = {
    message: sanitizeErrorMessage(
      input.error,
      "Unknown Slack sync error",
    ),
    category,
    failedAt: input.failedAt.toISOString(),
  } satisfies SlackSyncErrorSummary;

  return {
    ...metadata,
    slackSyncCheckpoint: buildCheckpoint({
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
  } satisfies SlackIntegrationMetadata;
}
