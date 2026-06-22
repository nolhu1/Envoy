import type { WorkerRetryPolicy } from "./retry";

export const WORKER_JOB_TYPES = {
  MAINTENANCE_HEALTH_CHECK: "maintenance.health_check",
  MAINTENANCE_RECOVER_STUCK_JOBS: "maintenance.recover_stuck_jobs",
  MAINTENANCE_RENEW_GMAIL_WATCH: "maintenance.renew_gmail_watch",
  EVENTS_PROCESS_EVENT_PLACEHOLDER: "events.process_event_placeholder",
  SYNC_GMAIL_INTEGRATION: "sync.gmail_integration",
  OUTBOUND_SEND_MESSAGE: "outbound.send_message",
  AGENT_RUN_FROM_TRIGGER: "agent.run_from_trigger",
  AGENT_RUN_MANUAL: "agent.run_manual",
  AGENT_EVALUATE_FOLLOW_UPS: "agent.evaluate_follow_ups",
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
  platform?: "EMAIL" | null;
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

export type ManualIntegrationSyncReason = "manual" | "initial" | "retry" | "replay";

export type IntegrationSyncJobPayload = {
  workspaceId: string;
  integrationId: string;
  requestedByUserId: string | null;
  reason: ManualIntegrationSyncReason;
  requestedAt: string;
};

export type GmailWatchRenewalReason = "scheduled" | "manual" | "reconnect";

export type GmailWatchRenewalJobPayload = {
  workspaceId: string;
  integrationId: string;
  requestedAt: string;
  reason: GmailWatchRenewalReason;
};

export type OutboundSendSource = "manual" | "approval";

export type OutboundSendMessageJobPayload = {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  integrationId: string;
  platform: "EMAIL";
  requestedByUserId: string | null;
  sendSource: OutboundSendSource;
  approvalRequestId: string | null;
  requestedAt: string;
};

export type AgentRunFromTriggerJobPayload = {
  workspaceId: string;
  conversationId: string;
  triggerType: "inbound_message" | "approval_rejected" | "follow_up_due";
  sourceEventId: string | null;
  sourceMessageId: string | null;
  sourceApprovalRequestId: string | null;
  requestedAt: string;
};

export type AgentEvaluateFollowUpsJobPayload = {
  workspaceId: string | null;
  requestedAt: string;
  reason: "scheduled" | "manual" | "recovery";
};

export type AgentRunManualJobPayload = {
  workspaceId: string;
  conversationId: string;
  requestedByUserId: string;
  requestedAt: string;
  requestNonce: string;
  triggerType: "manual_regenerate";
};

export type WorkerJobPayloadByType = {
  "maintenance.health_check": {
    workspaceId: string;
    requestedAt?: string | null;
    fail?: boolean | null;
    failRetryable?: boolean | null;
  };
  "maintenance.recover_stuck_jobs": {
    workspaceId: string;
    requestedAt?: string | null;
    staleAfterMs?: number | null;
    limit?: number | null;
  };
  "maintenance.renew_gmail_watch": GmailWatchRenewalJobPayload;
  "events.process_event_placeholder": {
    workspaceId: string;
    eventId: string;
  };
  "sync.gmail_integration": IntegrationSyncJobPayload;
  "outbound.send_message": OutboundSendMessageJobPayload;
  "agent.run_from_trigger": AgentRunFromTriggerJobPayload;
  "agent.run_manual": AgentRunManualJobPayload;
  "agent.evaluate_follow_ups": AgentEvaluateFollowUpsJobPayload;
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
