import { SLACK_PROVIDER, type SlackProviderPayloadPlaceholder } from "./slack";
import type {
  SlackDmConversation,
  SlackDmConversationSyncItem,
  SlackMessage,
  SlackMessageFile,
  SlackUser,
} from "./slack-sync";
import type {
  ConnectorContext,
  JsonValue,
  NormalizedAttachmentCandidate,
  NormalizedConversationCandidate,
  NormalizedMessageCandidate,
  NormalizedParticipantCandidate,
} from "./types";

type JsonObject = Record<string, JsonValue>;

export type SlackConversationNormalizationResult = {
  conversation: NormalizedConversationCandidate;
  participants: NormalizedParticipantCandidate[];
  messages: NormalizedMessageCandidate[];
  attachments: NormalizedAttachmentCandidate[];
};

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function getSlackPlatformMetadata(context: ConnectorContext): JsonObject | null {
  return isJsonObject(context.platformMetadataJson ?? null)
    ? (context.platformMetadataJson as JsonObject)
    : null;
}

function getSlackBotUserId(context: ConnectorContext) {
  const platformMetadata = getSlackPlatformMetadata(context);

  return getString(platformMetadata?.slackBotUserId);
}

function parseSlackTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const epochSeconds = Number(value);

  if (!Number.isFinite(epochSeconds)) {
    return null;
  }

  return new Date(epochSeconds * 1000);
}

function createSlackMessageId(channelId: string | null, ts: string | null) {
  if (!ts) {
    return "slack-message-placeholder";
  }

  return channelId ? `${channelId}:${ts}` : ts;
}

function createSlackConversationId(channelId: string | null, threadTs?: string | null) {
  if (!channelId) {
    return "slack-dm-placeholder";
  }

  return threadTs ? `${channelId}:${threadTs}` : channelId;
}

function getMessageChannelId(message: SlackMessage | JsonObject) {
  return typeof message.channel === "string" ? message.channel : null;
}

function getMessageThreadTs(message: SlackMessage | JsonObject) {
  return typeof message.thread_ts === "string" ? message.thread_ts : null;
}

function getMessageSenderUserId(message: SlackMessage | JsonObject) {
  return typeof message.user === "string" ? message.user : null;
}

function getMessageBotId(message: SlackMessage | JsonObject) {
  return typeof message.bot_id === "string" ? message.bot_id : null;
}

function isInternalSlackMessage(
  context: ConnectorContext,
  message: SlackMessage | JsonObject,
) {
  const botUserId = getSlackBotUserId(context);
  const messageUserId = getMessageSenderUserId(message);

  return (
    Boolean(getMessageBotId(message)) ||
    (Boolean(botUserId) && messageUserId === botUserId)
  );
}

function computeSlackMessageIdentity(
  context: ConnectorContext,
  message: SlackMessage | JsonObject,
) {
  const channelId = getMessageChannelId(message);
  const threadTs = getMessageThreadTs(message);
  const messageTs = typeof message.ts === "string" ? message.ts : null;
  const internal = isInternalSlackMessage(context, message);

  return {
    channelId,
    threadTs,
    messageTs,
    externalConversationId: createSlackConversationId(channelId, threadTs),
    externalMessageId: createSlackMessageId(channelId, messageTs),
    senderExternalParticipantId:
      getMessageSenderUserId(message) ??
      (getMessageBotId(message) ? `bot:${getMessageBotId(message)}` : null),
    direction: internal ? "OUTBOUND" : "INBOUND",
    senderType: internal ? "AGENT" : "EXTERNAL",
    status: internal ? "SENT" : "RECEIVED",
  } as const;
}

function getSlackConversationLatestTimestamp(
  conversation: SlackDmConversation,
  options?: {
    messages?: SlackMessage[];
    rawConversation?: JsonValue;
    threadTs?: string | null;
  },
) {
  const timestamps = new Set<string>();

  if (typeof conversation.latest?.ts === "string") {
    timestamps.add(conversation.latest.ts);
  }

  if (options?.threadTs) {
    timestamps.add(options.threadTs);
  }

  for (const message of options?.messages ?? []) {
    if (typeof message.ts === "string") {
      timestamps.add(message.ts);
    }
    if (typeof message.latest_reply === "string") {
      timestamps.add(message.latest_reply);
    }
  }

  const rawConversation = isJsonObject(options?.rawConversation ?? null)
    ? (options?.rawConversation as JsonObject)
    : null;
  const explicitLastMessageTs = getString(rawConversation?.lastMessageTs);

  if (explicitLastMessageTs) {
    timestamps.add(explicitLastMessageTs);
  }

  const parsedDates = [...timestamps]
    .map((timestamp) => parseSlackTimestamp(timestamp))
    .filter((value): value is Date => value instanceof Date);

  if (parsedDates.length === 0) {
    return null;
  }

  return new Date(Math.max(...parsedDates.map((value) => value.getTime())));
}

function createSlackParticipantFromUser(
  context: ConnectorContext,
  user: SlackUser,
): NormalizedParticipantCandidate {
  const displayName =
    user.profile?.display_name ||
    user.profile?.real_name ||
    user.real_name ||
    user.name ||
    user.id;

  return {
    externalParticipantId: user.id,
    platform: context.platform,
    displayName,
    email: user.profile?.email ?? null,
    handle: user.name ? `@${user.name}` : user.id,
    isInternal:
      user.id === getSlackBotUserId(context) || Boolean(user.is_bot || user.is_app_user),
    rawPayloadJson: user,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      slackUserId: user.id,
      slackTeamId: user.team_id ?? null,
      slackUsername: user.name ?? null,
      deleted: user.deleted ?? false,
      isBot: user.is_bot ?? false,
      isAppUser: user.is_app_user ?? false,
    },
  };
}

function createSlackParticipantFallback(
  context: ConnectorContext,
  participantId: string,
  rawPayloadJson: JsonValue,
  isInternal: boolean,
) {
  return {
    externalParticipantId: participantId,
    platform: context.platform,
    displayName: participantId,
    email: null,
    handle: participantId.startsWith("bot:") ? null : participantId,
    isInternal,
    rawPayloadJson,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      unresolved: true,
    },
  } satisfies NormalizedParticipantCandidate;
}

function normalizeSlackFileName(file: SlackMessageFile, index: number) {
  return file.name ?? `slack-file-${index + 1}`;
}

function asSlackMessage(value: JsonValue): SlackMessage | null {
  return isJsonObject(value) ? (value as unknown as SlackMessage) : null;
}

function asSlackConversation(value: JsonValue): SlackDmConversation | null {
  return isJsonObject(value) ? (value as unknown as SlackDmConversation) : null;
}

export function normalizeSlackConversationCandidate(
  context: ConnectorContext,
  conversation: SlackDmConversation,
  options?: {
    messages?: SlackMessage[];
    rawPayloadJson?: JsonValue | null;
    threadTs?: string | null;
  },
): NormalizedConversationCandidate {
  const externalConversationId = createSlackConversationId(
    conversation.id,
    options?.threadTs ?? null,
  );

  return {
    externalConversationId,
    platform: context.platform,
    subject: null,
    lastMessageAt: getSlackConversationLatestTimestamp(conversation, {
      messages: options?.messages,
      rawConversation: options?.rawPayloadJson ?? conversation,
      threadTs: options?.threadTs ?? null,
    }),
    rawPayloadJson: options?.rawPayloadJson ?? conversation,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      channelId: conversation.id,
      threadTs: options?.threadTs ?? null,
      dm: true,
      slackDmUserId: conversation.user ?? null,
      isOpen: conversation.is_open ?? null,
      isThread: Boolean(options?.threadTs),
      messageCount: options?.messages?.length ?? 0,
    },
  };
}

export function normalizeSlackParticipantCandidates(
  context: ConnectorContext,
  input: {
    users?: SlackUser[];
    messages?: SlackMessage[];
  },
): NormalizedParticipantCandidate[] {
  const participants = new Map<string, NormalizedParticipantCandidate>();

  for (const user of input.users ?? []) {
    participants.set(user.id, createSlackParticipantFromUser(context, user));
  }

  for (const message of input.messages ?? []) {
    const senderUserId = getMessageSenderUserId(message);

    if (senderUserId && !participants.has(senderUserId)) {
      participants.set(
        senderUserId,
        createSlackParticipantFallback(context, senderUserId, message, false),
      );
    }

    const botId = getMessageBotId(message);

    if (botId) {
      const participantId = `bot:${botId}`;

      if (!participants.has(participantId)) {
        participants.set(
          participantId,
          createSlackParticipantFallback(context, participantId, message, true),
        );
      }
    }
  }

  return [...participants.values()];
}

export function normalizeSlackAttachmentCandidates(
  context: ConnectorContext,
  message: SlackMessage,
): NormalizedAttachmentCandidate[] {
  const identity = computeSlackMessageIdentity(context, message);

  return (message.files ?? []).map((file, index) => ({
    externalAttachmentId:
      file.id ?? `${identity.externalMessageId}:${normalizeSlackFileName(file, index)}`,
    externalMessageId: identity.externalMessageId,
    fileName: normalizeSlackFileName(file, index),
    mimeType: file.mimetype ?? null,
    sizeBytes: file.size ?? null,
    storageKey: null,
    externalUrl: file.permalink ?? file.url_private ?? null,
    rawPayloadJson: file,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      channelId: identity.channelId,
      threadTs: identity.threadTs,
      messageTs: identity.messageTs,
      fileType: file.filetype ?? null,
      prettyType: file.pretty_type ?? null,
    },
  }));
}

export function normalizeSlackMessageCandidate(
  context: ConnectorContext,
  message: SlackMessage,
): NormalizedMessageCandidate {
  const identity = computeSlackMessageIdentity(context, message);
  const sentAt = parseSlackTimestamp(identity.messageTs);

  return {
    externalMessageId: identity.externalMessageId,
    externalConversationId: identity.externalConversationId,
    platform: context.platform,
    senderType: identity.senderType,
    direction: identity.direction,
    senderExternalParticipantId: identity.senderExternalParticipantId,
    bodyText: typeof message.text === "string" ? message.text : null,
    bodyHtml: null,
    status: identity.status,
    sentAt,
    receivedAt: sentAt,
    rawPayloadJson: message,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      channelId: identity.channelId,
      threadTs: identity.threadTs,
      ts: identity.messageTs,
      userId: getMessageSenderUserId(message),
      botId: getMessageBotId(message),
      subtype: message.subtype ?? null,
      teamId: message.team ?? null,
      replyCount: message.reply_count ?? 0,
      latestReply: message.latest_reply ?? null,
      payloadPlaceholder: {
        channelId: identity.channelId,
        threadTs: identity.threadTs,
        slackMessage: null,
      } satisfies SlackProviderPayloadPlaceholder,
    },
    attachments: normalizeSlackAttachmentCandidates(context, message),
  };
}

export function normalizeSlackConversationSyncItem(
  context: ConnectorContext,
  item: SlackDmConversationSyncItem,
  users: SlackUser[],
): SlackConversationNormalizationResult {
  const allMessages = [
    ...item.messages,
    ...item.threads.flatMap((thread) => thread.replies),
  ];
  const messages = allMessages.map((message) =>
    normalizeSlackMessageCandidate(context, message),
  );
  const attachments = messages.flatMap((message) => message.attachments ?? []);

  return {
    conversation: normalizeSlackConversationCandidate(context, item.conversation, {
      messages: allMessages,
      rawPayloadJson: item.rawPayloadJson,
    }),
    participants: normalizeSlackParticipantCandidates(context, {
      users,
      messages: allMessages,
    }),
    messages,
    attachments,
  };
}

export function normalizeSlackConversationCandidateFromRaw(
  context: ConnectorContext,
  rawConversation: JsonValue,
): NormalizedConversationCandidate {
  const conversation = asSlackConversation(rawConversation);

  if (!conversation) {
    return {
      externalConversationId: "slack-dm-placeholder",
      platform: context.platform,
      subject: null,
      lastMessageAt: null,
      rawPayloadJson: rawConversation,
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
        dm: true,
      },
    };
  }

  return normalizeSlackConversationCandidate(context, conversation, {
    rawPayloadJson: rawConversation,
    threadTs:
      isJsonObject(rawConversation) && typeof rawConversation.threadTs === "string"
        ? rawConversation.threadTs
        : null,
  });
}

export function normalizeSlackMessageCandidateFromRaw(
  context: ConnectorContext,
  rawMessage: JsonValue,
): NormalizedMessageCandidate {
  const message = asSlackMessage(rawMessage);

  if (!message) {
    return {
      externalMessageId: "slack-message-placeholder",
      externalConversationId: "slack-dm-placeholder",
      platform: context.platform,
      senderType: "EXTERNAL",
      direction: "INBOUND",
      senderExternalParticipantId: null,
      bodyText: null,
      bodyHtml: null,
      status: "RECEIVED",
      sentAt: null,
      receivedAt: null,
      rawPayloadJson: rawMessage,
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
      },
      attachments: [],
    };
  }

  return normalizeSlackMessageCandidate(context, message);
}
