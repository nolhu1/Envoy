import { AUTH_MATERIAL_TYPES, type OAuthAuthMaterial } from "./credentials";
import { GMAIL_PROVIDER } from "./gmail";
import type { ConnectorContext, JsonValue, SyncInput, SyncResult } from "./types";

export const GMAIL_THREADS_LIST_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/threads";
export const GMAIL_MESSAGES_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export const GMAIL_HISTORY_LIST_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/history";
export const GMAIL_WATCH_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/watch";
export const GMAIL_STOP_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/stop";
export const GMAIL_PUBSUB_TOPIC_ENV = "GMAIL_PUBSUB_TOPIC";
export const GMAIL_THREAD_DETAIL_FORMAT = "full";
export const GMAIL_RECENT_SYNC_DEFAULT_MAX_RESULTS = 25;
export const GMAIL_RECENT_SYNC_MAX_RESULTS_LIMIT = 100;
export const GMAIL_RECENT_SYNC_DEFAULT_WINDOW_DAYS = 14;
export const GMAIL_HISTORY_SYNC_DEFAULT_MAX_RESULTS = 100;
export const GMAIL_HISTORY_SYNC_MAX_RESULTS_LIMIT = 500;
export const GMAIL_HISTORY_SYNC_DEFAULT_MAX_PAGES = 5;

type JsonObject = Record<string, JsonValue>;

export type GmailThreadListItem = {
  id: string;
  snippet?: string;
  historyId?: string;
};

export type GmailMessageHeader = {
  name: string;
  value: string;
};

export type GmailMessagePayload = {
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePayload[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePayload;
  sizeEstimate?: number;
};

export type GmailThread = {
  id: string;
  historyId?: string;
  snippet?: string;
  messages?: GmailMessage[];
};

export type GmailHistoryMessageReference = {
  id?: string;
  threadId?: string;
};

export type GmailHistoryRecord = {
  id?: string;
  messages?: GmailHistoryMessageReference[];
  messagesAdded?: Array<{
    message?: GmailHistoryMessageReference;
  }>;
};

export type GmailRecentThreadSyncInput = {
  context: ConnectorContext;
  cursor?: string | null;
  maxResults?: number;
  recentWindowDays?: number;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  includeSpamTrash?: boolean;
};

export type GmailRecentThreadSyncResult = {
  threads: GmailThread[];
  nextCursor?: string | null;
  hasMore: boolean;
  diagnosticsJson?: JsonValue | null;
  rawPayloadJson: JsonValue;
};

export type GmailHistorySyncInput = {
  context: ConnectorContext;
  startHistoryId: string;
  cursor?: string | null;
  maxResults?: number | null;
  maxPages?: number | null;
  historyTypes?: string[];
};

export type GmailHistorySyncResult = {
  threads: GmailThread[];
  threadIds: string[];
  messageIds: string[];
  nextCursor?: string | null;
  hasMore: boolean;
  historyId: string | null;
  pagesProcessed: number;
  historyRecords: GmailHistoryRecord[];
  diagnosticsJson?: JsonValue | null;
  rawPayloadJson: JsonValue;
};

export type GmailWatchInput = {
  context: ConnectorContext;
  topicName?: string | null;
  labelIds?: string[] | null;
  labelFilterBehavior?: "INCLUDE" | "EXCLUDE" | null;
};

export type GmailWatchResult = {
  historyId: string;
  expiration: string | null;
  topicName: string;
  rawPayloadJson: JsonValue;
};

export type GmailStopWatchInput = {
  context: ConnectorContext;
};

export type GmailAttachmentDownloadInput = {
  context: ConnectorContext;
  messageId: string;
  attachmentId: string;
};

export type GmailAttachmentDownloadResult = {
  data: Uint8Array;
  size: number | null;
};

export class GmailApiRequestError extends Error {
  status: number;

  constructor(status: number) {
    super(`Gmail API request failed with status ${status}.`);
    this.name = "GmailApiRequestError";
    this.status = status;
  }
}

export class GmailHistoryUnavailableError extends Error {
  status: number;

  constructor(status: number, startHistoryId: string) {
    super(
      `Gmail history is unavailable for startHistoryId ${startHistoryId}; Gmail API returned status ${status}.`,
    );
    this.name = "GmailHistoryUnavailableError";
    this.status = status;
  }
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown) {
  return isJsonObject(value as JsonValue) ? (value as JsonObject) : null;
}

function getRequiredAccessToken(context: ConnectorContext) {
  const authMaterial = context.authMaterial;

  if (!authMaterial || authMaterial.type !== AUTH_MATERIAL_TYPES.OAUTH) {
    throw new Error("Gmail sync requires resolved OAuth auth material.");
  }

  return authMaterial.accessToken;
}

function clampMaxResults(value?: number | null) {
  if (!value || value <= 0) {
    return GMAIL_RECENT_SYNC_DEFAULT_MAX_RESULTS;
  }

  return Math.min(Math.floor(value), GMAIL_RECENT_SYNC_MAX_RESULTS_LIMIT);
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function clampHistoryMaxResults(value?: number | null) {
  if (!value || value <= 0) {
    return GMAIL_HISTORY_SYNC_DEFAULT_MAX_RESULTS;
  }

  return Math.min(Math.floor(value), GMAIL_HISTORY_SYNC_MAX_RESULTS_LIMIT);
}

function clampHistoryMaxPages(value?: number | null) {
  if (!value || value <= 0) {
    return GMAIL_HISTORY_SYNC_DEFAULT_MAX_PAGES;
  }

  return Math.min(Math.floor(value), 25);
}

function formatGmailQueryDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function buildRecentThreadsQuery(input: {
  recentWindowDays: number;
  windowStart?: Date | null;
  windowEnd?: Date | null;
}) {
  if (
    input.windowStart instanceof Date &&
    Number.isFinite(input.windowStart.getTime()) &&
    input.windowEnd instanceof Date &&
    Number.isFinite(input.windowEnd.getTime())
  ) {
    return [
      `after:${formatGmailQueryDate(input.windowStart)}`,
      `before:${formatGmailQueryDate(addUtcDays(input.windowEnd, 1))}`,
    ].join(" ");
  }

  return `newer_than:${input.recentWindowDays}d`;
}

async function fetchGmailJson<T>(
  url: URL,
  accessToken: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GmailApiRequestError(response.status);
  }

  return (await response.json()) as T;
}

async function postGmailJson<T>(
  url: URL,
  accessToken: string,
  body?: JsonValue,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GmailApiRequestError(response.status);
  }

  const text = await response.text();

  return (text ? JSON.parse(text) : {}) as T;
}

async function fetchGmailThreadDetail(
  threadId: string,
  accessToken: string,
) {
  const detailUrl = new URL(`${GMAIL_THREADS_LIST_URL}/${threadId}`);

  detailUrl.searchParams.set("format", GMAIL_THREAD_DETAIL_FORMAT);

  return fetchGmailJson<GmailThread>(detailUrl, accessToken);
}

export async function fetchGmailAttachmentBody(
  input: GmailAttachmentDownloadInput,
): Promise<GmailAttachmentDownloadResult> {
  const accessToken = getRequiredAccessToken(input.context);
  const detailUrl = new URL(
    `${GMAIL_MESSAGES_URL}/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(
      input.attachmentId,
    )}`,
  );
  const response = await fetchGmailJson<{
    data?: string;
    size?: number;
  }>(detailUrl, accessToken);

  if (!response.data) {
    throw new Error("Gmail attachment response did not include data.");
  }

  return {
    data: Buffer.from(response.data, "base64url"),
    size: response.size ?? null,
  };
}

function extractHeaderValue(
  payload: GmailMessagePayload | undefined,
  headerName: string,
) {
  const header = payload?.headers?.find(
    (item) => item.name.toLowerCase() === headerName.toLowerCase(),
  );

  return header?.value ?? null;
}

export function getGmailThreadSubject(thread: GmailThread) {
  const firstMessage = thread.messages?.[0];

  return extractHeaderValue(firstMessage?.payload, "subject") ?? thread.snippet ?? null;
}

export async function fetchGmailRecentThreads(
  input: GmailRecentThreadSyncInput,
): Promise<GmailRecentThreadSyncResult> {
  const accessToken = getRequiredAccessToken(input.context);
  const maxResults = clampMaxResults(input.maxResults);
  const recentWindowDays =
    input.recentWindowDays && input.recentWindowDays > 0
      ? Math.floor(input.recentWindowDays)
      : GMAIL_RECENT_SYNC_DEFAULT_WINDOW_DAYS;
  const listUrl = new URL(GMAIL_THREADS_LIST_URL);

  listUrl.searchParams.set("maxResults", String(maxResults));
  listUrl.searchParams.set(
    "q",
    buildRecentThreadsQuery({
      recentWindowDays,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
    }),
  );

  if (input.cursor) {
    listUrl.searchParams.set("pageToken", input.cursor);
  }

  if (input.includeSpamTrash) {
    listUrl.searchParams.set("includeSpamTrash", "true");
  }

  const listResponse = await fetchGmailJson<{
    threads?: GmailThreadListItem[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(listUrl, accessToken);
  const threadList = listResponse.threads ?? [];
  const threads = await Promise.all(
    threadList.map(async (thread) => {
      return fetchGmailThreadDetail(thread.id, accessToken);
    }),
  );

  return {
    threads,
    nextCursor: listResponse.nextPageToken ?? null,
    hasMore: Boolean(listResponse.nextPageToken),
    diagnosticsJson: {
      provider: GMAIL_PROVIDER,
      threadCount: threads.length,
      recentWindowDays,
      windowStart: input.windowStart?.toISOString() ?? null,
      windowEnd: input.windowEnd?.toISOString() ?? null,
      maxResults,
      resultSizeEstimate: listResponse.resultSizeEstimate ?? null,
    },
    rawPayloadJson: {
      provider: GMAIL_PROVIDER,
      list: listResponse,
      threads,
    },
  };
}

function collectHistoryMessageReferences(records: GmailHistoryRecord[]) {
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const record of records) {
    const references = [
      ...(record.messages ?? []),
      ...(record.messagesAdded ?? []).flatMap((entry) =>
        entry.message ? [entry.message] : [],
      ),
    ];

    for (const reference of references) {
      if (reference.threadId) {
        threadIds.add(reference.threadId);
      }

      if (reference.id) {
        messageIds.add(reference.id);
      }
    }
  }

  return {
    threadIds: [...threadIds],
    messageIds: [...messageIds],
  };
}

export function isGmailHistoryUnavailableError(error: unknown) {
  return (
    error instanceof GmailHistoryUnavailableError ||
    (
      error instanceof GmailApiRequestError &&
      (error.status === 404 || error.status === 400)
    )
  );
}

export async function fetchGmailHistorySince(
  input: GmailHistorySyncInput,
): Promise<GmailHistorySyncResult> {
  const accessToken = getRequiredAccessToken(input.context);
  const maxResults = clampHistoryMaxResults(input.maxResults);
  const maxPages = clampHistoryMaxPages(input.maxPages);
  const historyTypes = input.historyTypes?.length
    ? input.historyTypes
    : ["messageAdded"];
  const historyRecords: GmailHistoryRecord[] = [];
  const rawPages: JsonValue[] = [];
  let cursor = input.cursor ?? null;
  let nextCursor: string | null = cursor;
  let hasMore = Boolean(cursor);
  let latestHistoryId: string | null = null;
  let pagesProcessed = 0;

  while (pagesProcessed < maxPages) {
    const historyUrl = new URL(GMAIL_HISTORY_LIST_URL);

    historyUrl.searchParams.set("startHistoryId", input.startHistoryId);
    historyUrl.searchParams.set("maxResults", String(maxResults));

    for (const historyType of historyTypes) {
      historyUrl.searchParams.append("historyTypes", historyType);
    }

    if (cursor) {
      historyUrl.searchParams.set("pageToken", cursor);
    }

    let page;
    try {
      page = await fetchGmailJson<{
        history?: GmailHistoryRecord[];
        historyId?: string;
        nextPageToken?: string;
      }>(historyUrl, accessToken);
    } catch (error) {
      if (
        error instanceof GmailApiRequestError &&
        (error.status === 404 || error.status === 400)
      ) {
        throw new GmailHistoryUnavailableError(
          error.status,
          input.startHistoryId,
        );
      }

      throw error;
    }

    pagesProcessed += 1;
    historyRecords.push(...(page.history ?? []));
    rawPages.push(page as JsonValue);
    latestHistoryId = page.historyId ?? latestHistoryId;
    nextCursor = page.nextPageToken ?? null;
    hasMore = Boolean(nextCursor);
    cursor = nextCursor;

    if (!hasMore) {
      break;
    }
  }

  const { threadIds, messageIds } = collectHistoryMessageReferences(historyRecords);
  const threads = await Promise.all(
    threadIds.map((threadId) => fetchGmailThreadDetail(threadId, accessToken)),
  );

  return {
    threads,
    threadIds,
    messageIds,
    nextCursor,
    hasMore,
    historyId: latestHistoryId,
    pagesProcessed,
    historyRecords,
    diagnosticsJson: {
      provider: GMAIL_PROVIDER,
      startHistoryId: input.startHistoryId,
      latestHistoryId,
      historyRecordCount: historyRecords.length,
      affectedThreadCount: threadIds.length,
      affectedMessageCount: messageIds.length,
      pagesProcessed,
      maxResults,
      maxPages,
      hasMore,
    },
    rawPayloadJson: {
      provider: GMAIL_PROVIDER,
      startHistoryId: input.startHistoryId,
      pages: rawPages,
      threadIds,
      messageIds,
      threads,
    },
  };
}

function readGmailPubSubTopic(input?: string | null) {
  const topicName = input ?? process.env[GMAIL_PUBSUB_TOPIC_ENV] ?? "";

  if (!topicName.trim()) {
    throw new Error(`${GMAIL_PUBSUB_TOPIC_ENV} is not set.`);
  }

  return topicName.trim();
}

function normalizeGmailWatchExpiration(value: string | number | null | undefined) {
  if (value == null) {
    return null;
  }

  const timestampMs =
    typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isFinite(timestampMs)) {
    return String(value);
  }

  return new Date(timestampMs).toISOString();
}

export async function startGmailWatch(
  input: GmailWatchInput,
): Promise<GmailWatchResult> {
  const accessToken = getRequiredAccessToken(input.context);
  const topicName = readGmailPubSubTopic(input.topicName);
  const body: JsonObject = {
    topicName,
  };

  if (input.labelIds?.length) {
    body.labelIds = input.labelIds;
  }

  if (input.labelFilterBehavior) {
    body.labelFilterBehavior = input.labelFilterBehavior;
  }

  const response = await postGmailJson<{
    historyId?: string;
    expiration?: string | number;
  }>(new URL(GMAIL_WATCH_URL), accessToken, body);
  const historyId =
    typeof response.historyId === "string" && response.historyId.trim()
      ? response.historyId.trim()
      : null;

  if (!historyId) {
    throw new Error("Gmail watch response did not include historyId.");
  }

  return {
    historyId,
    expiration: normalizeGmailWatchExpiration(response.expiration),
    topicName,
    rawPayloadJson: response as JsonValue,
  };
}

export async function stopGmailWatch(input: GmailStopWatchInput) {
  const accessToken = getRequiredAccessToken(input.context);
  await postGmailJson<Record<string, never>>(
    new URL(GMAIL_STOP_URL),
    accessToken,
  );

  return {
    stopped: true,
  };
}

export function toGmailSyncResult(
  syncResult: GmailRecentThreadSyncResult,
): SyncResult {
  return {
    batch: {
      conversations: [],
      participants: [],
      messages: [],
      attachments: [],
      rawPayloadJson: syncResult.rawPayloadJson,
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        syncThreadCount: syncResult.threads.length,
      },
    },
    nextCursor: syncResult.nextCursor ?? null,
    hasMore: syncResult.hasMore,
    diagnosticsJson: syncResult.diagnosticsJson ?? null,
  };
}

export function buildGmailRecentThreadSyncInput(input: SyncInput) {
  const config = asJsonObject(input.context.config);
  const maxResults =
    typeof config?.recentSyncMaxResults === "number"
      ? config.recentSyncMaxResults
      : input.limit;
  const recentWindowDays =
    typeof config?.recentSyncWindowDays === "number"
      ? config.recentSyncWindowDays
      : undefined;

  return {
    context: input.context,
    cursor: input.cursor ?? null,
    maxResults,
    recentWindowDays,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
    includeSpamTrash:
      typeof config?.includeSpamTrash === "boolean"
        ? config.includeSpamTrash
        : false,
  } satisfies GmailRecentThreadSyncInput;
}
