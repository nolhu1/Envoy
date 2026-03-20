import type {
  ConnectResult,
  ConnectorContext,
  IngestionBatch,
  JsonValue,
  NormalizedConversationCandidate,
  NormalizedMessageCandidate,
  OutboundSendInput,
  SendResult,
  SyncInput,
  SyncResult,
  WebhookInput,
} from "./types";

export type ConnectInput = {
  workspaceId: string;
  redirectUri?: string | null;
  credentialInput?: JsonValue | null;
  config?: JsonValue | null;
};

export type DisconnectInput = {
  context: ConnectorContext;
};

export type RefreshAuthInput = {
  context: ConnectorContext;
};

export type FetchConversationInput = {
  context: ConnectorContext;
  externalConversationId: string;
};

export type FetchConversationResult = {
  rawConversation: JsonValue;
  conversation?: NormalizedConversationCandidate | null;
  messages?: NormalizedMessageCandidate[];
  batch?: IngestionBatch | null;
};

export interface Connector {
  connect(input: ConnectInput): Promise<ConnectResult>;
  disconnect(input: DisconnectInput): Promise<void>;
  refreshAuth(input: RefreshAuthInput): Promise<ConnectResult>;
  ingestWebhook(input: WebhookInput): Promise<IngestionBatch>;
  syncHistory(input: SyncInput): Promise<SyncResult>;
  sendMessage(input: OutboundSendInput): Promise<SendResult>;
  fetchConversation(input: FetchConversationInput): Promise<FetchConversationResult>;
  normalizeConversation(input: {
    context: ConnectorContext;
    rawConversation: JsonValue;
  }): Promise<NormalizedConversationCandidate>;
  normalizeMessage(input: {
    context: ConnectorContext;
    rawMessage: JsonValue;
  }): Promise<NormalizedMessageCandidate>;
}
