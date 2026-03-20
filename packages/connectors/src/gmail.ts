import { AUTH_MATERIAL_TYPES } from "./credentials";
import type {
  ConnectInput,
  Connector,
  DisconnectInput,
  FetchConversationInput,
  FetchConversationResult,
  RefreshAuthInput,
} from "./connector";
import { INTEGRATION_STATUSES } from "./lifecycle";
import { OUTBOUND_SEND_STATUSES } from "./outbound";
import type {
  ConnectResult,
  ConnectorContext,
  JsonValue,
  NormalizedConversationCandidate,
  NormalizedMessageCandidate,
  OutboundSendInput,
  SendResult,
  SyncInput,
  SyncResult,
  WebhookInput,
} from "./types";

export const GMAIL_PROVIDER = "gmail";
export const GMAIL_MVP_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export type GmailOAuthConnectCredentialInput = {
  authorizationCode?: string;
  state?: string;
  codeVerifier?: string;
};

export type GmailConnectorConfig = {
  provider?: typeof GMAIL_PROVIDER;
  requestedScopes?: string[];
  reconnect?: boolean;
};

export type GmailProviderPayloadPlaceholder = {
  threadId?: string | null;
  messageId?: string | null;
  gmailMessage?: JsonValue | null;
};

type JsonObject = Record<string, JsonValue>;

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function readDateFromEpochMillis(value: JsonValue | undefined) {
  const stringValue = readString(value);

  if (!stringValue) {
    return null;
  }

  const epochMillis = Number(stringValue);

  if (!Number.isFinite(epochMillis)) {
    return null;
  }

  return new Date(epochMillis);
}

function buildEmptyBatch(rawPayloadJson?: JsonValue | null) {
  return {
    conversations: [],
    participants: [],
    messages: [],
    attachments: [],
    rawPayloadJson: rawPayloadJson ?? null,
    platformMetadataJson: {
      provider: GMAIL_PROVIDER,
      stub: true,
    },
  };
}

function resolveExternalConversationId(rawConversation: JsonValue) {
  if (!isJsonObject(rawConversation)) {
    return "gmail-thread-placeholder";
  }

  return (
    readString(rawConversation.threadId) ??
    readString(rawConversation.id) ??
    "gmail-thread-placeholder"
  );
}

function resolveExternalMessageId(rawMessage: JsonValue) {
  if (!isJsonObject(rawMessage)) {
    return "gmail-message-placeholder";
  }

  return readString(rawMessage.id) ?? "gmail-message-placeholder";
}

export class GmailConnector implements Connector {
  async connect(input: ConnectInput): Promise<ConnectResult> {
    const credentialInput = isJsonObject(input.credentialInput ?? null)
      ? (input.credentialInput as unknown as GmailOAuthConnectCredentialInput)
      : null;
    const config = isJsonObject(input.config ?? null)
      ? (input.config as unknown as GmailConnectorConfig)
      : null;

    return {
      displayName: "Gmail",
      status: INTEGRATION_STATUSES.PENDING,
      authMaterial:
        credentialInput?.authorizationCode || credentialInput?.state
          ? {
              type: AUTH_MATERIAL_TYPES.OAUTH,
              accessToken: "gmail-oauth-connect-pending",
              providerAccountId: null,
              scopes: config?.requestedScopes ?? [...GMAIL_MVP_SCOPES],
            }
          : null,
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        requestedScopes: config?.requestedScopes ?? [...GMAIL_MVP_SCOPES],
        redirectUri: input.redirectUri ?? null,
        reconnect: config?.reconnect ?? false,
        stub: true,
      },
    };
  }

  async disconnect(_input: DisconnectInput): Promise<void> {
    return;
  }

  async refreshAuth(input: RefreshAuthInput): Promise<ConnectResult> {
    return {
      externalAccountId: input.context.externalAccountId ?? null,
      displayName: "Gmail",
      status: input.context.authMaterial
        ? INTEGRATION_STATUSES.CONNECTED
        : INTEGRATION_STATUSES.ERROR,
      authMaterial: input.context.authMaterial ?? null,
      secretRef: input.context.secretRef ?? null,
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        refreshed: false,
        stub: true,
      },
    };
  }

  async ingestWebhook(input: WebhookInput) {
    return {
      ...buildEmptyBatch({
        rawBody: input.rawBody,
      }),
      eventType: "gmail.webhook.stub",
      externalEventId:
        input.headers["x-goog-message-number"]?.toString() ?? null,
    };
  }

  async syncHistory(_input: SyncInput): Promise<SyncResult> {
    return {
      batch: buildEmptyBatch(),
      nextCursor: null,
      hasMore: false,
      diagnosticsJson: {
        provider: GMAIL_PROVIDER,
        syncImplemented: false,
      },
    };
  }

  async sendMessage(input: OutboundSendInput): Promise<SendResult> {
    return {
      status: OUTBOUND_SEND_STATUSES.FAILED,
      externalMessageId: null,
      sentAt: null,
      providerResponseJson: {
        provider: GMAIL_PROVIDER,
        threadId: input.conversation.externalConversationId,
        sendImplemented: false,
      },
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        replyToExternalMessageId: input.replyToExternalMessageId ?? null,
      },
    };
  }

  async fetchConversation(
    input: FetchConversationInput,
  ): Promise<FetchConversationResult> {
    const rawConversation = {
      id: input.externalConversationId,
      threadId: input.externalConversationId,
      provider: GMAIL_PROVIDER,
    } satisfies JsonObject;

    return {
      rawConversation,
      conversation: await this.normalizeConversation({
        context: input.context,
        rawConversation,
      }),
      messages: [],
      batch: buildEmptyBatch(rawConversation),
    };
  }

  async normalizeConversation(input: {
    context: ConnectorContext;
    rawConversation: JsonValue;
  }): Promise<NormalizedConversationCandidate> {
    const rawConversation = isJsonObject(input.rawConversation)
      ? input.rawConversation
      : {};

    return {
      externalConversationId: resolveExternalConversationId(input.rawConversation),
      platform: input.context.platform,
      subject: readString(rawConversation.subject) ?? readString(rawConversation.snippet),
      lastMessageAt: readDateFromEpochMillis(rawConversation.historyId),
      rawPayloadJson: input.rawConversation,
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        threadId:
          readString(rawConversation.threadId) ?? readString(rawConversation.id),
      },
    };
  }

  async normalizeMessage(input: {
    context: ConnectorContext;
    rawMessage: JsonValue;
  }): Promise<NormalizedMessageCandidate> {
    const rawMessage = isJsonObject(input.rawMessage) ? input.rawMessage : {};
    const labelIds = Array.isArray(rawMessage.labelIds) ? rawMessage.labelIds : [];
    const isSent = labelIds.includes("SENT");

    return {
      externalMessageId: resolveExternalMessageId(input.rawMessage),
      externalConversationId:
        readString(rawMessage.threadId) ?? "gmail-thread-placeholder",
      platform: input.context.platform,
      senderType: isSent ? "USER" : "EXTERNAL",
      direction: isSent ? "OUTBOUND" : "INBOUND",
      bodyText: readString(rawMessage.snippet),
      status: isSent ? "SENT" : "RECEIVED",
      sentAt: readDateFromEpochMillis(rawMessage.internalDate),
      receivedAt: readDateFromEpochMillis(rawMessage.internalDate),
      rawPayloadJson: input.rawMessage,
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        labelIds,
        threadId: readString(rawMessage.threadId),
      },
    };
  }
}
