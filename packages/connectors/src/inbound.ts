import type {
  ConnectorContext,
  ConnectorPlatform,
  IngestionBatch,
  JsonValue,
} from "./types";

export const INBOUND_SOURCE_TYPES = {
  WEBHOOK: "webhook",
  SYNC: "sync",
  REFRESH: "refresh",
} as const;

export type InboundSourceType =
  (typeof INBOUND_SOURCE_TYPES)[keyof typeof INBOUND_SOURCE_TYPES];

export const DEDUPE_STATUSES = {
  NEW: "NEW",
  ALREADY_PROCESSED: "ALREADY_PROCESSED",
  AMBIGUOUS: "AMBIGUOUS",
} as const;

export type DedupeStatus =
  (typeof DEDUPE_STATUSES)[keyof typeof DEDUPE_STATUSES];

export const INBOUND_STAGES = {
  VALIDATE_SOURCE: "validate_source",
  PARSE_PAYLOAD: "parse_payload",
  DEDUPE: "dedupe",
  NORMALIZE: "normalize",
  UPSERT_CONVERSATION_AND_PARTICIPANTS: "upsert_conversation_and_participants",
  UPSERT_MESSAGES_AND_ATTACHMENTS: "upsert_messages_and_attachments",
  EMIT_EVENTS: "emit_events",
} as const;

export type InboundStage =
  (typeof INBOUND_STAGES)[keyof typeof INBOUND_STAGES];

export type InboundEnvelope<
  TRawInput extends JsonValue | string = JsonValue | string,
> = {
  sourceType: InboundSourceType;
  workspaceId: string;
  integrationId: string;
  platform: ConnectorPlatform;
  connectorContext: ConnectorContext;
  rawInput: TRawInput;
  receivedAt?: Date;
  externalEventId?: string | null;
  idempotencyKey?: string | null;
};

export type DedupeDecision = {
  status: DedupeStatus;
  dedupeKey?: string | null;
  retrySafe?: boolean;
  existingMessageIds?: string[];
  diagnostics?: JsonValue | null;
};

export type InboundDiagnostic = {
  stage?: InboundStage;
  code?: string;
  message: string;
  details?: JsonValue | null;
};

export type InboundEmittedEvent = {
  eventName: string;
  payload?: JsonValue | null;
};

export type InboundInsertedCounts = {
  conversations: number;
  participants: number;
  messages: number;
  attachments: number;
};

export type InboundIngestionResult = {
  integrationId: string;
  workspaceId: string;
  conversationId?: string | null;
  messageIds: string[];
  insertedCounts: InboundInsertedCounts;
  dedupeDecision: DedupeDecision;
  emittedEvents: InboundEmittedEvent[];
  diagnostics?: InboundDiagnostic[];
  batch?: IngestionBatch | null;
};
