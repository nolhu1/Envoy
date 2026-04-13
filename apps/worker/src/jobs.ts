import type { WorkerRetryPolicy } from "./retry";

export const WORKER_JOB_TYPES = {
  CONNECTOR_SYNC: "connector_sync",
  CONNECTOR_PROCESS_EVENT: "connector_process_event",
  REMINDER: "reminder",
  APPROVAL_FOLLOW_UP: "approval_follow_up",
  AGENT_RUN: "agent_run",
} as const;

export type WorkerJobType =
  (typeof WORKER_JOB_TYPES)[keyof typeof WORKER_JOB_TYPES];

export type ConnectorSyncJobPayload = {
  workspaceId: string;
  integrationId: string;
  platform?: "EMAIL" | "SLACK" | null;
  fullResync?: boolean;
  cursor?: string | null;
};

export type ConnectorProcessEventJobPayload = {
  workspaceId: string;
  integrationId: string;
  eventId?: string | null;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
};

export type ReminderJobPayload = {
  workspaceId: string;
  reminderKey: string;
  conversationId?: string | null;
  messageId?: string | null;
  dueAt: string;
};

export type ApprovalFollowUpJobPayload = {
  workspaceId: string;
  approvalRequestId: string;
  conversationId: string;
  dueAt: string;
};

export type AgentRunJobPayload = {
  workspaceId: string;
  conversationId: string;
  agentAssignmentId: string;
  triggerEventId?: string | null;
};

export type WorkerJobPayloadByType = {
  connector_sync: ConnectorSyncJobPayload;
  connector_process_event: ConnectorProcessEventJobPayload;
  reminder: ReminderJobPayload;
  approval_follow_up: ApprovalFollowUpJobPayload;
  agent_run: AgentRunJobPayload;
};

export type WorkerJobErrorSnapshot = {
  message: string;
  code?: string | null;
  details?: Record<string, unknown> | null;
  stack?: string | null;
  retryable?: boolean | null;
  failedAt: string;
};

export type WorkerJobEnvelope<
  TType extends WorkerJobType = WorkerJobType,
> = {
  jobId: string;
  jobType: TType;
  workspaceId: string;
  payload: WorkerJobPayloadByType[TType];
  queuedAt: string;
  runAt?: string | null;
  attempt: number;
  retryPolicy: WorkerRetryPolicy;
  lastAttemptedAt?: string | null;
  lastError?: WorkerJobErrorSnapshot | null;
  replayOfJobId?: string | null;
};

export type WorkerJob =
  {
    [TType in WorkerJobType]: WorkerJobEnvelope<TType>;
  }[WorkerJobType];
