import type { IntegrationStatus } from "./lifecycle";

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConnectorPlatform = string;

export type WorkspaceUserRole = "ADMIN" | "MEMBER" | "VIEWER";

export type ConversationState =
  | "UNASSIGNED"
  | "ACTIVE"
  | "WAITING"
  | "FOLLOW_UP_DUE"
  | "AWAITING_APPROVAL"
  | "ESCALATED"
  | "COMPLETED"
  | "CLOSED";

export type MessageDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";

export type MessageStatus =
  | "RECEIVED"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED";

export type SenderType = "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";

export type ConnectorContext = {
  workspaceId: string;
  integrationId?: string | null;
  platform: ConnectorPlatform;
  externalAccountId?: string | null;
  authData?: JsonValue | null;
  config?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type WebhookInput = {
  context: ConnectorContext;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  query?: Record<string, string | string[] | undefined>;
  receivedAt?: Date;
};

export type SyncInput = {
  context: ConnectorContext;
  cursor?: string | null;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  limit?: number;
  fullResync?: boolean;
};

export type NormalizedConversationCandidate = {
  externalConversationId: string;
  platform: ConnectorPlatform;
  subject?: string | null;
  state?: ConversationState;
  lastMessageAt?: Date | null;
  openedAt?: Date | null;
  closedAt?: Date | null;
  rawPayloadJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type NormalizedParticipantCandidate = {
  externalParticipantId?: string | null;
  platform: ConnectorPlatform;
  displayName?: string | null;
  email?: string | null;
  handle?: string | null;
  isInternal?: boolean;
  rawPayloadJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type NormalizedAttachmentCandidate = {
  externalAttachmentId?: string | null;
  externalMessageId?: string | null;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageKey?: string | null;
  externalUrl?: string | null;
  rawPayloadJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type NormalizedMessageCandidate = {
  externalMessageId?: string | null;
  externalConversationId: string;
  platform: ConnectorPlatform;
  senderType: SenderType;
  direction: MessageDirection;
  senderExternalParticipantId?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  status?: MessageStatus;
  sentAt?: Date | null;
  receivedAt?: Date | null;
  rawPayloadJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
  attachments?: NormalizedAttachmentCandidate[];
};

export type OutboundSendInput = {
  context: ConnectorContext;
  conversation: Pick<
    NormalizedConversationCandidate,
    "externalConversationId" | "platform" | "subject" | "platformMetadataJson"
  >;
  message: Pick<
    NormalizedMessageCandidate,
    | "bodyText"
    | "bodyHtml"
    | "direction"
    | "senderType"
    | "platformMetadataJson"
  >;
  participants?: NormalizedParticipantCandidate[];
  replyToExternalMessageId?: string | null;
};

export type ConnectResult = {
  externalAccountId?: string | null;
  displayName?: string | null;
  status: IntegrationStatus;
  authData?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type IngestionBatch = {
  eventType?: string | null;
  externalEventId?: string | null;
  conversations: NormalizedConversationCandidate[];
  participants: NormalizedParticipantCandidate[];
  messages: NormalizedMessageCandidate[];
  attachments: NormalizedAttachmentCandidate[];
  rawPayloadJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type SendResult = {
  status: "ACCEPTED" | "QUEUED" | "FAILED";
  externalMessageId?: string | null;
  sentAt?: Date | null;
  providerResponseJson?: JsonValue | null;
  platformMetadataJson?: JsonValue | null;
};

export type SyncResult = {
  batch: IngestionBatch;
  nextCursor?: string | null;
  hasMore?: boolean;
  diagnosticsJson?: JsonValue | null;
};
