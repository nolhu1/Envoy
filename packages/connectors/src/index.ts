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
  GMAIL_MVP_SCOPES,
  GMAIL_PROVIDER,
  GmailConnector,
} from "./gmail";
export {
  SLACK_MVP_SCOPES,
  SLACK_PROVIDER,
  SlackConnector,
} from "./slack";
export {
  GMAIL_OAUTH_ACCESS_TYPE,
  GMAIL_OAUTH_AUTH_BASE_URL,
  GMAIL_OAUTH_DEFAULT_STATE_TTL_SECONDS,
  GMAIL_GMAIL_PROFILE_URL,
  GMAIL_OAUTH_INCLUDE_GRANTED_SCOPES,
  GMAIL_OAUTH_PROMPT,
  GMAIL_OAUTH_RESPONSE_TYPE,
  GMAIL_OAUTH_TOKEN_URL,
  buildGmailAuthorizationUrl,
  createGmailOAuthStatePayload,
  decodeAndVerifyGmailOAuthState,
  decodeVerifyAndValidateGmailOAuthState,
  exchangeGmailAuthorizationCode,
  fetchGmailAccountProfile,
  getGmailOAuthConfig,
  refreshGmailOAuthAccessToken,
  signAndEncodeGmailOAuthState,
  validateGmailOAuthStatePayload,
} from "./gmail-oauth";
export {
  SLACK_OAUTH_AUTH_BASE_URL,
  SLACK_AUTH_TEST_URL,
  SLACK_OAUTH_ACCESS_URL,
  SLACK_OAUTH_DEFAULT_STATE_TTL_SECONDS,
  buildSlackAuthorizationUrl,
  createSlackOAuthStatePayload,
  decodeAndVerifySlackOAuthState,
  decodeVerifyAndValidateSlackOAuthState,
  exchangeSlackAuthorizationCode,
  fetchSlackWorkspaceIdentity,
  getSlackOAuthConfig,
  signAndEncodeSlackOAuthState,
  validateSlackOAuthStatePayload,
} from "./slack-oauth";
export {
  normalizeGmailAttachmentCandidates,
  normalizeGmailConversationCandidate,
  normalizeGmailMessageCandidate,
  normalizeGmailParticipantCandidates,
  normalizeGmailThread,
} from "./gmail-normalization";
export {
  GMAIL_RECENT_SYNC_DEFAULT_MAX_RESULTS,
  GMAIL_RECENT_SYNC_DEFAULT_WINDOW_DAYS,
  GMAIL_RECENT_SYNC_MAX_RESULTS_LIMIT,
  GMAIL_THREAD_DETAIL_FORMAT,
  GMAIL_THREADS_LIST_URL,
  buildGmailRecentThreadSyncInput,
  fetchGmailRecentThreads,
  getGmailThreadSubject,
  toGmailSyncResult,
} from "./gmail-sync";
export {
  SLACK_CONVERSATIONS_HISTORY_URL,
  SLACK_CONVERSATIONS_LIST_URL,
  SLACK_CONVERSATIONS_REPLIES_URL,
  SLACK_DM_CONVERSATION_TYPES,
  SLACK_RECENT_SYNC_DEFAULT_CONVERSATION_LIMIT,
  SLACK_RECENT_SYNC_DEFAULT_MESSAGE_LIMIT,
  SLACK_RECENT_SYNC_DEFAULT_REPLY_LIMIT,
  SLACK_RECENT_SYNC_DEFAULT_WINDOW_DAYS,
  SLACK_RECENT_SYNC_MAX_CONVERSATION_LIMIT,
  SLACK_RECENT_SYNC_MAX_MESSAGE_LIMIT,
  SLACK_RECENT_SYNC_MAX_REPLY_LIMIT,
  SLACK_USERS_INFO_URL,
  buildSlackRecentDmSyncInput,
  fetchSlackRecentDms,
  toSlackSyncResult,
} from "./slack-sync";
export {
  GMAIL_SEND_MESSAGE_URL,
  buildGmailReplyPayload,
  executeGmailSend,
  sendGmailReply,
} from "./gmail-send";
export {
  DEDUPE_STATUSES,
  INBOUND_SOURCE_TYPES,
  INBOUND_STAGES,
} from "./inbound";
export {
  InMemoryIdempotencyService,
  NoOpIdempotencyService,
} from "./idempotency-service";
export {
  IDEMPOTENCY_DECISION_TYPES,
  IDEMPOTENCY_SCOPES,
  IDEMPOTENCY_STATUSES,
} from "./idempotency";
export {
  OUTBOUND_ACTOR_TYPES,
  OUTBOUND_DELIVERY_STATES,
  OUTBOUND_SEND_STATUSES,
} from "./outbound";
export {
  buildOutboundPersistenceResult,
  createCanonicalOutboundPersistenceHandlers,
  createNoOpCanonicalOutboundWriter,
} from "./outbound-persistence";
export {
  runOutboundOrchestration,
} from "./outbound-orchestration";
export {
  buildCanonicalWriteResult,
  createCanonicalWriteHandler,
  createNoOpCanonicalPersistenceWriter,
} from "./persistence";
export {
  runInboundOrchestration,
} from "./orchestration";
export type {
  GmailConnectorConfig,
  GmailOAuthConnectCredentialInput,
  GmailProviderPayloadPlaceholder,
} from "./gmail";
export type {
  SlackConnectorConfig,
  SlackOAuthInstallCredentialInput,
  SlackProviderPayloadPlaceholder,
} from "./slack";
export type {
  GmailAuthorizationUrlInput,
  GmailAuthorizationUrlResult,
  GmailAccountProfile,
  GmailOAuthConfig,
  GmailOAuthExchangeResult,
  GmailOAuthRefreshResult,
  GmailOAuthStatePayload,
  GmailOAuthTokenResponse,
} from "./gmail-oauth";
export type {
  SlackOAuthAccessResponse,
  SlackAuthorizationUrlInput,
  SlackAuthorizationUrlResult,
  SlackOAuthConfig,
  SlackOAuthExchangeResult,
  SlackOAuthStatePayload,
  SlackWorkspaceIdentity,
} from "./slack-oauth";
export type { GmailThreadNormalizationResult } from "./gmail-normalization";
export type {
  GmailMessage,
  GmailMessageHeader,
  GmailMessagePayload,
  GmailRecentThreadSyncInput,
  GmailRecentThreadSyncResult,
  GmailThread,
  GmailThreadListItem,
} from "./gmail-sync";
export type {
  SlackDmConversation,
  SlackDmConversationSyncItem,
  SlackDmThread,
  SlackMessage,
  SlackMessageFile,
  SlackRecentDmSyncInput,
  SlackRecentDmSyncResult,
  SlackUser,
  SlackUserProfile,
} from "./slack-sync";
export type {
  GmailProviderSendPayload,
  GmailSendApiResponse,
  GmailSendExecutionInput,
} from "./gmail-send";
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
export type {
  IdempotencyDecision,
  IdempotencyDecisionType,
  IdempotencyKey,
  IdempotencyRecordSummary,
  IdempotencyScope,
  IdempotencyStatus,
} from "./idempotency";
export type {
  IdempotencyBeginInput,
  IdempotencyCompleteInput,
  IdempotencyFailInput,
  IdempotencyMarkDuplicateInput,
  IdempotencyService,
} from "./idempotency-service";
export type {
  OutboundActorContext,
  OutboundActorType,
  OutboundApprovalContext,
  OutboundAuditEvent,
  OutboundDeliveryState,
  OutboundDiagnostic,
  OutboundRetryability,
  OutboundSendEnvelope,
  OutboundSendPipelineResult,
  OutboundSendStatus,
} from "./outbound";
export type {
  CanonicalOutboundMessageStatus,
  CanonicalOutboundStatusUpdateHandler,
  CanonicalOutboundStatusUpdateResult,
  CanonicalOutboundWriter,
  OutboundAuditHandoffHandler,
  OutboundAuditHandoffResult,
  OutboundPersistenceResult,
} from "./outbound-persistence";
export type {
  AuditDownstreamHandler,
  AuditDownstreamResult,
  OutboundIdempotencyKeyResolver,
  OutboundOrchestrationDependencies,
  OutboundOrchestrationHandlers,
  OutboundOrchestrationResult,
  ProviderPayloadBuildResult,
  ProviderPayloadBuilder,
  ProviderSendExecutionResult,
  ProviderSendExecutor,
  SendEligibilityValidationHandler,
  ValidatedOutboundSend,
} from "./outbound-orchestration";
export type {
  DedupeHandler,
  DownstreamEventHandler,
  InboundIdempotencyKeyResolver,
  InboundOrchestrationDependencies,
  InboundOrchestrationHandlers,
  InboundOrchestrationResult,
  NormalizationHandler,
  NormalizedInboundPayload,
  ParsedInboundPayload,
  ParsingHandler,
  SourceValidationHandler,
} from "./orchestration";
export type {
  CanonicalPersistenceWriter,
  CanonicalWriteHandler,
  CanonicalWriteMatchedCounts,
  CanonicalWriteResult,
  ConversationParticipantsWriteHandler,
  ConversationParticipantsWriteResult,
  MessageAttachmentWriteHandler,
  MessageAttachmentWriteResult,
  ParticipantResolution,
  ParticipantResolutionMap,
} from "./persistence";
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
