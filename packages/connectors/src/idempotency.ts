import type { JsonValue } from "./types";

export const IDEMPOTENCY_SCOPES = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
  APPROVAL: "approval",
  AGENT: "agent",
} as const;

export type IdempotencyScope =
  (typeof IDEMPOTENCY_SCOPES)[keyof typeof IDEMPOTENCY_SCOPES];

export const IDEMPOTENCY_STATUSES = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  DUPLICATE: "duplicate",
} as const;

export type IdempotencyStatus =
  (typeof IDEMPOTENCY_STATUSES)[keyof typeof IDEMPOTENCY_STATUSES];

export const IDEMPOTENCY_DECISION_TYPES = {
  NEW_OPERATION: "new_operation",
  ALREADY_PROCESSED: "already_processed",
  IN_PROGRESS: "in_progress",
  FAILED_PRIOR_ATTEMPT: "failed_prior_attempt",
  AMBIGUOUS_RETRY_SAFE: "ambiguous_retry_safe",
} as const;

export type IdempotencyDecisionType =
  (typeof IDEMPOTENCY_DECISION_TYPES)[keyof typeof IDEMPOTENCY_DECISION_TYPES];

export type IdempotencyKey = {
  key: string;
  scope: IdempotencyScope;
  workspaceId: string;
  integrationId?: string | null;
  operationType: string;
  externalEventId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestHash?: string | null;
};

export type IdempotencyRecordSummary = {
  id?: string;
  scope: IdempotencyScope;
  key: string;
  status: IdempotencyStatus;
  workspaceId: string;
  integrationId?: string | null;
  operationType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  externalEventId?: string | null;
  requestHash?: string | null;
  resultSummaryJson?: JsonValue | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  expiresAt?: Date | null;
};

export type IdempotencyDecision = {
  decision: IdempotencyDecisionType;
  retrySafe: boolean;
  key: IdempotencyKey;
  existingRecord?: IdempotencyRecordSummary | null;
  resultSummaryJson?: JsonValue | null;
  diagnostics?: JsonValue | null;
};
