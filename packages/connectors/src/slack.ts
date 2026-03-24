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
import {
  normalizeSlackConversationCandidateFromRaw,
  normalizeSlackMessageCandidateFromRaw,
} from "./slack-normalization";
import { sendSlackReply } from "./slack-send";
import {
  buildSlackRecentDmSyncInput,
  fetchSlackRecentDms,
  toSlackSyncResult,
} from "./slack-sync";
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

export const SLACK_PROVIDER = "slack";
export const SLACK_MVP_BOT_SCOPES = [
  "chat:write",
] as const;
export const SLACK_MVP_USER_SCOPES = [
  "im:read",
  "im:history",
  "chat:write",
  "users:read",
] as const;
export const SLACK_MVP_SCOPES = [
  ...SLACK_MVP_BOT_SCOPES,
  ...SLACK_MVP_USER_SCOPES,
] as const;

export type SlackOAuthInstallCredentialInput = {
  authorizationCode?: string;
  state?: string;
};

export type SlackConnectorConfig = {
  provider?: typeof SLACK_PROVIDER;
  requestedScopes?: string[];
  reconnect?: boolean;
};

export type SlackProviderPayloadPlaceholder = {
  channelId?: string | null;
  threadTs?: string | null;
  slackMessage?: JsonValue | null;
};

type JsonObject = Record<string, JsonValue>;

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildEmptyBatch(rawPayloadJson?: JsonValue | null) {
  return {
    conversations: [],
    participants: [],
    messages: [],
    attachments: [],
    rawPayloadJson: rawPayloadJson ?? null,
    platformMetadataJson: {
      provider: SLACK_PROVIDER,
      stub: true,
    },
  };
}

export class SlackConnector implements Connector {
  async connect(input: ConnectInput): Promise<ConnectResult> {
    const credentialInput = isJsonObject(input.credentialInput ?? null)
      ? (input.credentialInput as unknown as SlackOAuthInstallCredentialInput)
      : null;
    const config = isJsonObject(input.config ?? null)
      ? (input.config as unknown as SlackConnectorConfig)
      : null;

    return {
      displayName: "Slack",
      status: INTEGRATION_STATUSES.PENDING,
      authMaterial:
        credentialInput?.authorizationCode || credentialInput?.state
          ? {
              type: AUTH_MATERIAL_TYPES.OAUTH,
              accessToken: "slack-oauth-install-pending",
              providerAccountId: null,
              scopes: config?.requestedScopes ?? [...SLACK_MVP_SCOPES],
            }
          : null,
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
        requestedScopes: config?.requestedScopes ?? [...SLACK_MVP_SCOPES],
        redirectUri: input.redirectUri ?? null,
        reconnect: config?.reconnect ?? false,
        dmOnly: true,
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
      displayName: "Slack",
      status: input.context.authMaterial
        ? INTEGRATION_STATUSES.CONNECTED
        : INTEGRATION_STATUSES.ERROR,
      authMaterial: input.context.authMaterial ?? null,
      secretRef: input.context.secretRef ?? null,
      platformMetadataJson: {
        provider: SLACK_PROVIDER,
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
      eventType: "slack.webhook.stub",
      externalEventId:
        input.headers["x-slack-request-timestamp"]?.toString() ?? null,
    };
  }

  async syncHistory(_input: SyncInput): Promise<SyncResult> {
    const slackSyncResult = await fetchSlackRecentDms(
      buildSlackRecentDmSyncInput(_input),
    );

    return toSlackSyncResult(slackSyncResult);
  }

  async sendMessage(input: OutboundSendInput): Promise<SendResult> {
    return sendSlackReply(input);
  }

  async fetchConversation(
    input: FetchConversationInput,
  ): Promise<FetchConversationResult> {
    const rawConversation = {
      id: input.externalConversationId,
      provider: SLACK_PROVIDER,
      dm: true,
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
    return normalizeSlackConversationCandidateFromRaw(
      input.context,
      input.rawConversation,
    );
  }

  async normalizeMessage(input: {
    context: ConnectorContext;
    rawMessage: JsonValue;
  }): Promise<NormalizedMessageCandidate> {
    return normalizeSlackMessageCandidateFromRaw(
      input.context,
      input.rawMessage,
    );
  }
}
