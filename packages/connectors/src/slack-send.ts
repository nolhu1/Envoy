import { AUTH_MATERIAL_TYPES } from "./credentials";
import { SLACK_PROVIDER } from "./slack";
import { OUTBOUND_SEND_STATUSES } from "./outbound";
import type {
  ConnectorContext,
  JsonValue,
  OutboundSendInput,
  SendResult,
} from "./types";

export const SLACK_CHAT_POST_MESSAGE_URL =
  "https://slack.com/api/chat.postMessage";

type JsonObject = Record<string, JsonValue>;

export type SlackProviderSendPayload = {
  channel: string;
  text: string;
  threadTs?: string | null;
  metadata: {
    channelId: string;
    threadTs?: string | null;
    conversationExternalId: string;
    replyToExternalMessageId?: string | null;
  };
};

export type SlackSendExecutionInput = {
  context: ConnectorContext;
  payload: SlackProviderSendPayload;
};

export type SlackSendApiResponse = {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
  message?: {
    text?: string;
    user?: string;
    bot_id?: string;
    thread_ts?: string;
  };
  warning?: string;
  response_metadata?: {
    warnings?: string[];
  };
};

function isJsonObject(value: JsonValue | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredAccessToken(context: ConnectorContext) {
  const authMaterial = context.authMaterial;

  if (!authMaterial || authMaterial.type !== AUTH_MATERIAL_TYPES.OAUTH) {
    throw new Error("Slack send requires resolved OAuth auth material.");
  }

  return authMaterial.providerAccessTokens?.userAccessToken ?? authMaterial.accessToken;
}

function getSlackConversationMetadata(input: OutboundSendInput) {
  return isJsonObject(input.conversation.platformMetadataJson)
    ? input.conversation.platformMetadataJson
    : null;
}

function parseSlackCompositeId(value?: string | null) {
  if (!value) {
    return {
      channelId: null,
      threadTs: null,
    };
  }

  const separatorIndex = value.indexOf(":");

  if (separatorIndex === -1) {
    return {
      channelId: value,
      threadTs: null,
    };
  }

  return {
    channelId: value.slice(0, separatorIndex) || null,
    threadTs: value.slice(separatorIndex + 1) || null,
  };
}

function extractSlackConversationContext(input: OutboundSendInput) {
  const metadata = getSlackConversationMetadata(input);
  const conversationComposite = parseSlackCompositeId(
    input.conversation.externalConversationId,
  );
  const replyComposite = parseSlackCompositeId(input.replyToExternalMessageId);
  const channelId =
    (typeof metadata?.channelId === "string" ? metadata.channelId : null) ??
    conversationComposite.channelId;
  const threadTs =
    (typeof metadata?.threadTs === "string" ? metadata.threadTs : null) ??
    conversationComposite.threadTs ??
    replyComposite.threadTs;

  if (!channelId) {
    throw new Error("Slack send requires an existing DM channel id.");
  }

  return {
    channelId,
    threadTs,
  };
}

function buildSlackMessageText(input: OutboundSendInput) {
  const text = input.message.bodyText?.trim() || input.message.bodyHtml?.trim() || "";

  if (!text) {
    throw new Error("Slack send requires a non-empty outbound message body.");
  }

  return text;
}

function createSlackExternalMessageId(channelId: string, messageTs?: string | null) {
  if (!messageTs) {
    return null;
  }

  return `${channelId}:${messageTs}`;
}

export function buildSlackReplyPayload(
  input: OutboundSendInput,
): SlackProviderSendPayload {
  const conversationContext = extractSlackConversationContext(input);

  return {
    channel: conversationContext.channelId,
    text: buildSlackMessageText(input),
    threadTs: conversationContext.threadTs,
    metadata: {
      channelId: conversationContext.channelId,
      threadTs: conversationContext.threadTs,
      conversationExternalId: input.conversation.externalConversationId,
      replyToExternalMessageId: input.replyToExternalMessageId ?? null,
    },
  };
}

export async function executeSlackSend(
  input: SlackSendExecutionInput,
): Promise<SlackSendApiResponse> {
  const accessToken = getRequiredAccessToken(input.context);
  const response = await fetch(SLACK_CHAT_POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.payload.channel,
      text: input.payload.text,
      thread_ts: input.payload.threadTs ?? undefined,
    }),
    cache: "no-store",
  });
  const responseText = await response.text();
  const responseJson = responseText
    ? (JSON.parse(responseText) as SlackSendApiResponse)
    : null;

  if (!response.ok || !responseJson?.ok || !responseJson.ts || !responseJson.channel) {
    throw new Error(
      `Slack send failed with status ${response.status}${
        responseJson?.error ? ` (${responseJson.error})` : ""
      }.`,
    );
  }

  return responseJson;
}

export async function sendSlackReply(
  input: OutboundSendInput,
): Promise<SendResult> {
  try {
    const payload = buildSlackReplyPayload(input);
    const response = await executeSlackSend({
      context: input.context,
      payload,
    });
    const externalMessageId = createSlackExternalMessageId(
      response.channel ?? payload.channel,
      response.ts,
    );

    return {
      status: OUTBOUND_SEND_STATUSES.ACCEPTED,
      externalMessageId,
      sentAt: new Date(),
      providerResponseJson: {
        provider: SLACK_PROVIDER,
        channelId: response.channel ?? payload.channel,
        ts: response.ts ?? null,
        threadTs: response.message?.thread_ts ?? payload.threadTs ?? null,
        warning: response.warning ?? null,
        warnings: response.response_metadata?.warnings ?? [],
      },
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
        channelId: response.channel ?? payload.channel,
        threadTs: response.message?.thread_ts ?? payload.threadTs ?? null,
        conversationExternalId: payload.metadata.conversationExternalId,
        replyToExternalMessageId: payload.metadata.replyToExternalMessageId ?? null,
      },
      diagnosticsJson: {
        provider: SLACK_PROVIDER,
        stage: "send",
        accepted: true,
      },
    };
  } catch (error) {
    const fallbackPayload = (() => {
      try {
        return buildSlackReplyPayload(input);
      } catch {
        return null;
      }
    })();

    return {
      status: OUTBOUND_SEND_STATUSES.FAILED,
      externalMessageId: null,
      sentAt: null,
      providerResponseJson: {
        provider: SLACK_PROVIDER,
        accepted: false,
      },
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
        channelId: fallbackPayload?.channel ?? null,
        threadTs: fallbackPayload?.threadTs ?? null,
        conversationExternalId: input.conversation.externalConversationId,
        replyToExternalMessageId: input.replyToExternalMessageId ?? null,
      },
      diagnosticsJson: {
        provider: SLACK_PROVIDER,
        stage: "send",
        error: error instanceof Error ? error.message : "Unknown Slack send error.",
      },
    };
  }
}
