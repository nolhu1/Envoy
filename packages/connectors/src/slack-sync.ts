import { AUTH_MATERIAL_TYPES } from "./credentials";
import { SLACK_PROVIDER } from "./slack";
import type { ConnectorContext, JsonValue, SyncInput, SyncResult } from "./types";

export const SLACK_CONVERSATIONS_LIST_URL =
  "https://slack.com/api/conversations.list";
export const SLACK_CONVERSATIONS_HISTORY_URL =
  "https://slack.com/api/conversations.history";
export const SLACK_CONVERSATIONS_REPLIES_URL =
  "https://slack.com/api/conversations.replies";
export const SLACK_USERS_INFO_URL = "https://slack.com/api/users.info";
export const SLACK_DM_CONVERSATION_TYPES = "im";
export const SLACK_RECENT_SYNC_DEFAULT_CONVERSATION_LIMIT = 10;
export const SLACK_RECENT_SYNC_MAX_CONVERSATION_LIMIT = 100;
export const SLACK_RECENT_SYNC_DEFAULT_MESSAGE_LIMIT = 25;
export const SLACK_RECENT_SYNC_MAX_MESSAGE_LIMIT = 100;
export const SLACK_RECENT_SYNC_DEFAULT_REPLY_LIMIT = 25;
export const SLACK_RECENT_SYNC_MAX_REPLY_LIMIT = 100;
export const SLACK_RECENT_SYNC_DEFAULT_WINDOW_DAYS = 14;

type JsonObject = Record<string, JsonValue>;

type SlackApiCursor = {
  next_cursor?: string;
};

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  response_metadata?: SlackApiCursor;
};

export type SlackDmConversation = {
  id: string;
  created?: number;
  is_im?: boolean;
  is_open?: boolean;
  user?: string;
  priority?: number;
  latest?: SlackMessage;
  unread_count?: number;
  unread_count_display?: number;
};

export type SlackMessageFile = {
  id?: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  size?: number;
  url_private?: string;
  permalink?: string;
};

export type SlackMessage = {
  type?: string;
  subtype?: string;
  ts: string;
  thread_ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  team?: string;
  files?: SlackMessageFile[];
  reply_count?: number;
  reply_users_count?: number;
  reply_users?: string[];
  latest_reply?: string;
  client_msg_id?: string;
};

export type SlackUserProfile = {
  real_name?: string;
  display_name?: string;
  email?: string;
  image_72?: string;
};

export type SlackUser = {
  id: string;
  team_id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
  profile?: SlackUserProfile;
};

export type SlackDmThread = {
  parentMessageTs: string;
  replies: SlackMessage[];
  rawPayloadJson: JsonValue;
};

export type SlackDmConversationSyncItem = {
  conversation: SlackDmConversation;
  messages: SlackMessage[];
  threads: SlackDmThread[];
  participantUserIds: string[];
  rawPayloadJson: JsonValue;
};

export type SlackRecentDmSyncInput = {
  context: ConnectorContext;
  cursor?: string | null;
  conversationLimit?: number;
  messageLimit?: number;
  replyLimit?: number;
  includeThreadReplies?: boolean;
  recentWindowDays?: number;
  windowStart?: Date | null;
  windowEnd?: Date | null;
};

export type SlackRecentDmSyncResult = {
  conversations: SlackDmConversationSyncItem[];
  users: SlackUser[];
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
    throw new Error("Slack sync requires resolved OAuth auth material.");
  }

  return authMaterial.accessToken;
}

function clampLimit(
  value: number | undefined | null,
  defaultValue: number,
  maxValue: number,
) {
  if (!value || value <= 0) {
    return defaultValue;
  }

  return Math.min(Math.floor(value), maxValue);
}

function resolveOldestTimestamp(input: SlackRecentDmSyncInput) {
  if (input.windowStart) {
    return String(input.windowStart.getTime() / 1000);
  }

  const recentWindowDays =
    input.recentWindowDays && input.recentWindowDays > 0
      ? Math.floor(input.recentWindowDays)
      : SLACK_RECENT_SYNC_DEFAULT_WINDOW_DAYS;

  return String(Date.now() / 1000 - recentWindowDays * 24 * 60 * 60);
}

function resolveLatestTimestamp(input: SlackRecentDmSyncInput) {
  return input.windowEnd ? String(input.windowEnd.getTime() / 1000) : undefined;
}

async function fetchSlackJson<TResponse extends SlackApiResponse>(
  url: string,
  accessToken: string,
  params: Record<string, string | undefined>,
): Promise<TResponse> {
  const requestUrl = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      requestUrl.searchParams.set(key, value);
    }
  }

  const response = await fetch(requestUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Slack API request failed with status ${response.status}.`);
  }

  const json = (await response.json()) as TResponse;

  if (!json.ok) {
    throw new Error(
      `Slack API request failed: ${json.error ?? "unknown_error"}.`,
    );
  }

  return json;
}

function collectParticipantUserIds(
  conversation: SlackDmConversation,
  messages: SlackMessage[],
  threads: SlackDmThread[],
) {
  const userIds = new Set<string>();

  if (conversation.user) {
    userIds.add(conversation.user);
  }

  for (const message of messages) {
    if (message.user) {
      userIds.add(message.user);
    }
  }

  for (const thread of threads) {
    for (const reply of thread.replies) {
      if (reply.user) {
        userIds.add(reply.user);
      }
    }
  }

  return [...userIds];
}

export async function fetchSlackRecentDms(
  input: SlackRecentDmSyncInput,
): Promise<SlackRecentDmSyncResult> {
  const accessToken = getRequiredAccessToken(input.context);
  const conversationLimit = clampLimit(
    input.conversationLimit,
    SLACK_RECENT_SYNC_DEFAULT_CONVERSATION_LIMIT,
    SLACK_RECENT_SYNC_MAX_CONVERSATION_LIMIT,
  );
  const messageLimit = clampLimit(
    input.messageLimit,
    SLACK_RECENT_SYNC_DEFAULT_MESSAGE_LIMIT,
    SLACK_RECENT_SYNC_MAX_MESSAGE_LIMIT,
  );
  const replyLimit = clampLimit(
    input.replyLimit,
    SLACK_RECENT_SYNC_DEFAULT_REPLY_LIMIT,
    SLACK_RECENT_SYNC_MAX_REPLY_LIMIT,
  );
  const oldest = resolveOldestTimestamp(input);
  const latest = resolveLatestTimestamp(input);
  const includeThreadReplies = input.includeThreadReplies ?? true;

  const listResponse = await fetchSlackJson<SlackApiResponse & {
    channels?: SlackDmConversation[];
  }>(SLACK_CONVERSATIONS_LIST_URL, accessToken, {
    types: SLACK_DM_CONVERSATION_TYPES,
    exclude_archived: "true",
    limit: String(conversationLimit),
    cursor: input.cursor ?? undefined,
  });
  const channels = listResponse.channels ?? [];
  const rawHistories: Record<string, JsonValue> = {};
  const rawReplies: Record<string, JsonValue> = {};
  const conversationItems = await Promise.all(
    channels.map(async (conversation) => {
      const historyResponse = await fetchSlackJson<SlackApiResponse & {
        messages?: SlackMessage[];
        has_more?: boolean;
        pin_count?: number;
      }>(SLACK_CONVERSATIONS_HISTORY_URL, accessToken, {
        channel: conversation.id,
        limit: String(messageLimit),
        oldest,
        latest,
        inclusive: "true",
      });
      const messages = historyResponse.messages ?? [];
      rawHistories[conversation.id] = historyResponse as JsonValue;

      const threads = includeThreadReplies
        ? (
            await Promise.all(
              messages
                .filter(
                  (message) =>
                    Boolean(message.thread_ts) &&
                    (message.reply_count ?? 0) > 0 &&
                    message.thread_ts === message.ts,
                )
                .map(async (message) => {
                  const repliesResponse = await fetchSlackJson<
                    SlackApiResponse & {
                      messages?: SlackMessage[];
                      has_more?: boolean;
                    }
                  >(SLACK_CONVERSATIONS_REPLIES_URL, accessToken, {
                    channel: conversation.id,
                    ts: message.thread_ts,
                    limit: String(replyLimit),
                    oldest,
                    latest,
                    inclusive: "true",
                  });
                  const replies = (repliesResponse.messages ?? []).filter(
                    (reply) => reply.ts !== message.ts,
                  );

                  rawReplies[`${conversation.id}:${message.thread_ts}`] =
                    repliesResponse as JsonValue;

                  return {
                    parentMessageTs: message.ts,
                    replies,
                    rawPayloadJson: repliesResponse as JsonValue,
                  } satisfies SlackDmThread;
                }),
            )
          ).filter((thread) => thread.replies.length > 0)
        : [];

      const participantUserIds = collectParticipantUserIds(
        conversation,
        messages,
        threads,
      );

      return {
        conversation,
        messages,
        threads,
        participantUserIds,
        rawPayloadJson: {
          conversation,
          history: historyResponse,
          replies: threads.map((thread) => ({
            parentMessageTs: thread.parentMessageTs,
            rawPayloadJson: thread.rawPayloadJson,
          })),
        },
      } satisfies SlackDmConversationSyncItem;
    }),
  );

  const allUserIds = new Set<string>();

  for (const item of conversationItems) {
    for (const userId of item.participantUserIds) {
      allUserIds.add(userId);
    }
  }

  const users = await Promise.all(
    [...allUserIds].map(async (userId) => {
      const response = await fetchSlackJson<SlackApiResponse & { user?: SlackUser }>(
        SLACK_USERS_INFO_URL,
        accessToken,
        { user: userId },
      );

      if (!response.user) {
        throw new Error(`Slack users.info returned no user for ${userId}.`);
      }

      return response.user;
    }),
  );

  const totalMessages = conversationItems.reduce(
    (count, item) => count + item.messages.length,
    0,
  );
  const totalReplies = conversationItems.reduce(
    (count, item) =>
      count +
      item.threads.reduce(
        (threadCount, thread) => threadCount + thread.replies.length,
        0,
      ),
    0,
  );
  const nextCursor = listResponse.response_metadata?.next_cursor ?? null;

  return {
    conversations: conversationItems,
    users,
    nextCursor,
    hasMore: Boolean(nextCursor),
    diagnosticsJson: {
      provider: SLACK_PROVIDER,
      dmConversationCount: conversationItems.length,
      userCount: users.length,
      topLevelMessageCount: totalMessages,
      threadReplyCount: totalReplies,
      conversationLimit,
      messageLimit,
      replyLimit,
      includeThreadReplies,
      oldest,
      latest: latest ?? null,
    },
    rawPayloadJson: {
      provider: SLACK_PROVIDER,
      conversations: listResponse,
      histories: rawHistories,
      replies: rawReplies,
      users,
    },
  };
}

export function toSlackSyncResult(
  syncResult: SlackRecentDmSyncResult,
): SyncResult {
  const topLevelMessageCount = syncResult.conversations.reduce(
    (count, item) => count + item.messages.length,
    0,
  );
  const threadReplyCount = syncResult.conversations.reduce(
    (count, item) =>
      count +
      item.threads.reduce(
        (threadCount, thread) => threadCount + thread.replies.length,
        0,
      ),
    0,
  );

  return {
    batch: {
      conversations: [],
      participants: [],
      messages: [],
      attachments: [],
      rawPayloadJson: syncResult.rawPayloadJson,
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
        syncConversationCount: syncResult.conversations.length,
        syncUserCount: syncResult.users.length,
        syncTopLevelMessageCount: topLevelMessageCount,
        syncThreadReplyCount: threadReplyCount,
        normalizationPending: true,
      },
    },
    nextCursor: syncResult.nextCursor ?? null,
    hasMore: syncResult.hasMore,
    diagnosticsJson: syncResult.diagnosticsJson ?? null,
  };
}

export function buildSlackRecentDmSyncInput(
  input: SyncInput,
): SlackRecentDmSyncInput {
  const config = asJsonObject(input.context.config);

  return {
    context: input.context,
    cursor: input.cursor ?? null,
    conversationLimit:
      typeof config?.recentSyncConversationLimit === "number"
        ? config.recentSyncConversationLimit
        : input.limit,
    messageLimit:
      typeof config?.recentSyncMessageLimit === "number"
        ? config.recentSyncMessageLimit
        : undefined,
    replyLimit:
      typeof config?.recentSyncReplyLimit === "number"
        ? config.recentSyncReplyLimit
        : undefined,
    includeThreadReplies:
      typeof config?.includeThreadReplies === "boolean"
        ? config.includeThreadReplies
        : true,
    recentWindowDays:
      typeof config?.recentSyncWindowDays === "number"
        ? config.recentSyncWindowDays
        : undefined,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
  };
}
