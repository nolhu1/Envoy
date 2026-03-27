export const ENVOY_EVENT_SCHEMA_VERSION = 1 as const;

export const ENVOY_EVENT_SOURCES = {
  CONNECTOR: "connector",
  API: "api",
  UI: "ui",
  WORKFLOW: "workflow",
  APPROVAL: "approval",
  AGENT_RUNTIME: "agent_runtime",
  SYSTEM: "system",
} as const;

export const ENVOY_EVENT_ENTITY_TYPES = {
  CONVERSATION: "conversation",
  MESSAGE: "message",
  APPROVAL_REQUEST: "approval_request",
  AGENT_ASSIGNMENT: "agent_assignment",
  INTEGRATION: "integration",
} as const;

export const ENVOY_EVENT_TYPES = {
  MESSAGE_RECEIVED: "message_received",
  MESSAGE_SENT: "message_sent",
  MESSAGE_SEND_FAILED: "message_send_failed",
  MESSAGE_DRAFT_CREATED: "message_draft_created",
  CONVERSATION_CREATED: "conversation_created",
  CONVERSATION_UPDATED: "conversation_updated",
  CONVERSATION_STATE_CHANGED: "conversation_state_changed",
  APPROVAL_REQUESTED: "approval_requested",
  APPROVAL_APPROVED: "approval_approved",
  APPROVAL_REJECTED: "approval_rejected",
  AGENT_ASSIGNED: "agent_assigned",
  AGENT_UNASSIGNED: "agent_unassigned",
  AGENT_RUN_REQUESTED: "agent_run_requested",
  AGENT_RUN_COMPLETED: "agent_run_completed",
  INTEGRATION_CONNECTED: "integration_connected",
  INTEGRATION_SYNC_STARTED: "integration_sync_started",
  INTEGRATION_SYNC_COMPLETED: "integration_sync_completed",
  INTEGRATION_SYNC_FAILED: "integration_sync_failed",
  INTEGRATION_DISCONNECTED: "integration_disconnected",
} as const;

export type EnvoyEventVersion = typeof ENVOY_EVENT_SCHEMA_VERSION;
export type EnvoyEventSource =
  (typeof ENVOY_EVENT_SOURCES)[keyof typeof ENVOY_EVENT_SOURCES];
export type EnvoyEntityType =
  (typeof ENVOY_EVENT_ENTITY_TYPES)[keyof typeof ENVOY_EVENT_ENTITY_TYPES];
export type EnvoyEventType =
  (typeof ENVOY_EVENT_TYPES)[keyof typeof ENVOY_EVENT_TYPES];

export type EnvoyPlatform = "EMAIL" | "SLACK";
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EventId = string;
export type WorkspaceId = string;
export type EntityId = string;
export type IsoTimestamp = string;

export type EventPayloadMetadata = {
  provider?: string | null;
  externalMessageId?: string | null;
  externalConversationId?: string | null;
  diagnosticsSummary?: JsonValue | null;
  [key: string]: JsonValue | undefined;
};

export type MessageEventPayload = {
  conversationId: string;
  messageId: string;
  integrationId?: string | null;
  platform?: EnvoyPlatform | null;
  externalMessageId?: string | null;
  senderType?: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM" | null;
  direction?: "INBOUND" | "OUTBOUND" | "INTERNAL" | null;
  status?:
    | "RECEIVED"
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "QUEUED"
    | "SENT"
    | "DELIVERED"
    | "FAILED"
    | null;
  metadata?: EventPayloadMetadata | null;
};

export type ConversationEventPayload = {
  conversationId: string;
  integrationId?: string | null;
  platform?: EnvoyPlatform | null;
  subject?: string | null;
  state?:
    | "UNASSIGNED"
    | "ACTIVE"
    | "WAITING"
    | "FOLLOW_UP_DUE"
    | "AWAITING_APPROVAL"
    | "ESCALATED"
    | "COMPLETED"
    | "CLOSED"
    | null;
  previousState?:
    | "UNASSIGNED"
    | "ACTIVE"
    | "WAITING"
    | "FOLLOW_UP_DUE"
    | "AWAITING_APPROVAL"
    | "ESCALATED"
    | "COMPLETED"
    | "CLOSED"
    | null;
  metadata?: EventPayloadMetadata | null;
};

export type ApprovalEventPayload = {
  approvalRequestId: string;
  conversationId: string;
  draftMessageId: string;
  agentAssignmentId?: string | null;
  reviewedByUserId?: string | null;
  rejectionReason?: string | null;
  metadata?: EventPayloadMetadata | null;
};

export type AgentEventPayload = {
  agentAssignmentId: string;
  conversationId: string;
  requestedByUserId?: string | null;
  goal?: string | null;
  runId?: string | null;
  metadata?: EventPayloadMetadata | null;
};

export type IntegrationEventPayload = {
  integrationId: string;
  platform: EnvoyPlatform;
  externalAccountId?: string | null;
  status?:
    | "PENDING"
    | "CONNECTED"
    | "SYNC_IN_PROGRESS"
    | "ERROR"
    | "DISCONNECTED"
    | null;
  threadCount?: number | null;
  messageCount?: number | null;
  attachmentCount?: number | null;
  hasMore?: boolean | null;
  metadata?: EventPayloadMetadata | null;
};

export type EnvoyEventPayloadByType = {
  message_received: MessageEventPayload;
  message_sent: MessageEventPayload;
  message_send_failed: MessageEventPayload;
  message_draft_created: MessageEventPayload;
  conversation_created: ConversationEventPayload;
  conversation_updated: ConversationEventPayload;
  conversation_state_changed: ConversationEventPayload;
  approval_requested: ApprovalEventPayload;
  approval_approved: ApprovalEventPayload;
  approval_rejected: ApprovalEventPayload;
  agent_assigned: AgentEventPayload;
  agent_unassigned: AgentEventPayload;
  agent_run_requested: AgentEventPayload;
  agent_run_completed: AgentEventPayload;
  integration_connected: IntegrationEventPayload;
  integration_sync_started: IntegrationEventPayload;
  integration_sync_completed: IntegrationEventPayload;
  integration_sync_failed: IntegrationEventPayload;
  integration_disconnected: IntegrationEventPayload;
};

export type EnvoyEventEntityTypeByType = {
  message_received: typeof ENVOY_EVENT_ENTITY_TYPES.MESSAGE;
  message_sent: typeof ENVOY_EVENT_ENTITY_TYPES.MESSAGE;
  message_send_failed: typeof ENVOY_EVENT_ENTITY_TYPES.MESSAGE;
  message_draft_created: typeof ENVOY_EVENT_ENTITY_TYPES.MESSAGE;
  conversation_created: typeof ENVOY_EVENT_ENTITY_TYPES.CONVERSATION;
  conversation_updated: typeof ENVOY_EVENT_ENTITY_TYPES.CONVERSATION;
  conversation_state_changed: typeof ENVOY_EVENT_ENTITY_TYPES.CONVERSATION;
  approval_requested: typeof ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST;
  approval_approved: typeof ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST;
  approval_rejected: typeof ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST;
  agent_assigned: typeof ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT;
  agent_unassigned: typeof ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT;
  agent_run_requested: typeof ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT;
  agent_run_completed: typeof ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT;
  integration_connected: typeof ENVOY_EVENT_ENTITY_TYPES.INTEGRATION;
  integration_sync_started: typeof ENVOY_EVENT_ENTITY_TYPES.INTEGRATION;
  integration_sync_completed: typeof ENVOY_EVENT_ENTITY_TYPES.INTEGRATION;
  integration_sync_failed: typeof ENVOY_EVENT_ENTITY_TYPES.INTEGRATION;
  integration_disconnected: typeof ENVOY_EVENT_ENTITY_TYPES.INTEGRATION;
};

export type EnvoyEventEnvelope<
  TType extends EnvoyEventType = EnvoyEventType,
  TPayload extends EnvoyEventPayloadByType[TType] = EnvoyEventPayloadByType[TType],
> = {
  eventId: EventId;
  eventType: TType;
  occurredAt: IsoTimestamp;
  workspaceId: WorkspaceId;
  entityType: EnvoyEventEntityTypeByType[TType];
  entityId: EntityId;
  payload: TPayload;
  source: EnvoyEventSource;
  version: EnvoyEventVersion;
};

export type EnvoyEvent =
  {
    [TType in EnvoyEventType]: EnvoyEventEnvelope<TType>;
  }[EnvoyEventType];
