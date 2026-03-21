import { AUTH_MATERIAL_TYPES, type OAuthAuthMaterial } from "./credentials";
import { GMAIL_PROVIDER } from "./gmail";
import type { ConnectorContext, JsonValue, SyncInput, SyncResult } from "./types";

export const GMAIL_THREADS_LIST_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/threads";
export const GMAIL_THREAD_DETAIL_FORMAT = "full";
export const GMAIL_RECENT_SYNC_DEFAULT_MAX_RESULTS = 25;
export const GMAIL_RECENT_SYNC_MAX_RESULTS_LIMIT = 100;
export const GMAIL_RECENT_SYNC_DEFAULT_WINDOW_DAYS = 14;

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

export type GmailRecentThreadSyncInput = {
  context: ConnectorContext;
  cursor?: string | null;
  maxResults?: number;
  recentWindowDays?: number;
  includeSpamTrash?: boolean;
};

export type GmailRecentThreadSyncResult = {
  threads: GmailThread[];
  nextCursor?: string | null;
  hasMore: boolean;
  diagnosticsJson?: JsonValue | null;
  rawPayloadJson: JsonValue;
};

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

function buildRecentThreadsQuery(recentWindowDays: number) {
  return `newer_than:${recentWindowDays}d`;
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
    throw new Error(`Gmail API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
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
  listUrl.searchParams.set("q", buildRecentThreadsQuery(recentWindowDays));

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
      const detailUrl = new URL(`${GMAIL_THREADS_LIST_URL}/${thread.id}`);

      detailUrl.searchParams.set("format", GMAIL_THREAD_DETAIL_FORMAT);

      return fetchGmailJson<GmailThread>(detailUrl, accessToken);
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
    includeSpamTrash:
      typeof config?.includeSpamTrash === "boolean"
        ? config.includeSpamTrash
        : false,
  } satisfies GmailRecentThreadSyncInput;
}
