export type {
  ConnectInput,
  DisconnectInput,
  FetchConversationInput,
  FetchConversationResult,
  RefreshAuthInput,
} from "./connector";
export type { Connector } from "./connector";
export {
  AUTH_MATERIAL_TYPES,
} from "./credentials";
export {
  DEDUPE_STATUSES,
  INBOUND_SOURCE_TYPES,
  INBOUND_STAGES,
} from "./inbound";
export type {
  ApiKeyAuthMaterial,
  AuthMaterialType,
  ConnectorAuthMaterial,
  OAuthAuthMaterial,
  SecretRef,
  WebhookSecretMaterial,
} from "./credentials";
export type {
  DedupeDecision,
  DedupeStatus,
  InboundDiagnostic,
  InboundEmittedEvent,
  InboundEnvelope,
  InboundIngestionResult,
  InboundInsertedCounts,
  InboundSourceType,
  InboundStage,
} from "./inbound";
export {
  INTEGRATION_STATUSES,
  INTEGRATION_STATUS_TRANSITIONS,
  assertValidIntegrationStatusTransition,
  canIntegrationProcessWebhooks,
  canIntegrationSend,
  canIntegrationSync,
  isValidIntegrationStatusTransition,
} from "./lifecycle";
export type { IntegrationStatus } from "./lifecycle";
export type {
  ConnectResult,
  ConnectorContext,
  ConnectorPlatform,
  ConversationState,
  IngestionBatch,
  JsonPrimitive,
  JsonValue,
  MessageDirection,
  MessageStatus,
  NormalizedAttachmentCandidate,
  NormalizedConversationCandidate,
  NormalizedMessageCandidate,
  NormalizedParticipantCandidate,
  OutboundSendInput,
  SendResult,
  SenderType,
  SyncInput,
  SyncResult,
  WebhookInput,
  WorkspaceUserRole,
} from "./types";
