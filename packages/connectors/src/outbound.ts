import type {
  ConnectorContext,
  JsonValue,
  OutboundSendInput,
  SendResult,
} from "./types";

export const OUTBOUND_SEND_STATUSES = {
  ACCEPTED: "ACCEPTED",
  QUEUED: "QUEUED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
} as const;

export type OutboundSendStatus =
  (typeof OUTBOUND_SEND_STATUSES)[keyof typeof OUTBOUND_SEND_STATUSES];

export const OUTBOUND_DELIVERY_STATES = {
  QUEUED: "QUEUED",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const;

export type OutboundDeliveryState =
  (typeof OUTBOUND_DELIVERY_STATES)[keyof typeof OUTBOUND_DELIVERY_STATES];

export const OUTBOUND_ACTOR_TYPES = {
  USER: "USER",
  SYSTEM: "SYSTEM",
  AGENT: "AGENT",
} as const;

export type OutboundActorType =
  (typeof OUTBOUND_ACTOR_TYPES)[keyof typeof OUTBOUND_ACTOR_TYPES];

export type OutboundActorContext = {
  actorType: OutboundActorType;
  actorId?: string | null;
  metadata?: JsonValue | null;
};

export type OutboundApprovalContext = {
  approvalRequestId?: string | null;
  approvalStatus?: string | null;
  approvedByActorId?: string | null;
  approvedAt?: Date | null;
  metadata?: JsonValue | null;
};

export type OutboundRetryability = {
  retryable: boolean;
  retryAfterSeconds?: number | null;
  reason?: string | null;
};

export type OutboundAuditEvent = {
  eventName: string;
  payload?: JsonValue | null;
  occurredAt?: Date;
};

export type OutboundDiagnostic = {
  code?: string;
  message: string;
  details?: JsonValue | null;
};

export type OutboundSendEnvelope = {
  workspaceId: string;
  integrationId: string;
  conversationId: string;
  messageId: string;
  connectorContext: ConnectorContext;
  conversation: OutboundSendInput["conversation"];
  message: OutboundSendInput["message"];
  participants?: OutboundSendInput["participants"];
  replyToExternalMessageId?: string | null;
  actorContext?: OutboundActorContext | null;
  approvalContext?: OutboundApprovalContext | null;
  idempotencyKey?: string | null;
  requestedAt?: Date;
};

export type OutboundSendPipelineResult = {
  workspaceId: string;
  integrationId: string;
  conversationId: string;
  messageId: string;
  externalMessageId?: string | null;
  sendStatus: OutboundSendStatus;
  providerAcceptedAt?: Date | null;
  deliveryState?: OutboundDeliveryState | null;
  auditEvents: OutboundAuditEvent[];
  diagnostics?: OutboundDiagnostic[];
  retryable: boolean;
  retryability?: OutboundRetryability;
  sendResult?: SendResult | null;
};
