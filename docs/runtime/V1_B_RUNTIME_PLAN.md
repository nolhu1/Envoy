# Envoy Durable Runtime Phase V1-B Implementation Plan

## Purpose

Phase V1-B makes Envoy's runtime durable without changing connector product scope or weakening the approval boundary. The goal is to move from inline web-process side effects to replay-safe, worker-backed execution with append-only auditability, durable idempotency, and operator recovery paths.

This plan is based on `docs/EVENT_SCHEMA_V1.md`, the current Prisma schema, connector orchestration packages, web runtime paths, and the existing worker package.

## Non-Negotiables

- AI must not send autonomously. AI may create drafts and approval requests only.
- Human approval remains mandatory for AI outbound sends.
- Connector scope remains the current Gmail and Slack MVP scope.
- Canonical `Conversation`, `Message`, `ApprovalRequest`, `AgentAssignment`, and `ActionLog` stay intact unless a durable runtime record must reference them.
- Runtime records are workspace-scoped and append-friendly.
- Events are replay-safe.
- Sends are idempotent.
- Agent runs are suppressible and dedupe-safe.

## 1. Current Runtime Map

### Event Publishing Path

Current files:

- `apps/web/src/lib/event-publisher.ts`
- `packages/events/src/schema.ts`
- `packages/events/src/publisher.ts`
- `packages/events/src/workflow.ts`

Current behavior:

1. Callers build canonical events with `buildEnvoyEvent`.
2. `publishEnvoyEvent` or `publishEnvoyEvents` calls `getEventPublisher().publish`.
3. Development/test uses `InMemoryEventPublisher`; other environments use `NoOpEventPublisher`.
4. After publish, `runPostPublishEventHooks` runs inline in the web process:
   - `appendActionLogForEnvoyEvent(event)`
   - `executeAutomaticAgentTriggerForEvent(event)`
5. Hook failures are logged to stderr and do not mark the event as failed because there is no durable event record.

Gaps:

- Published events are not durably stored.
- Production publishing is effectively acknowledged by `NoOpEventPublisher`.
- Action-log and auto-agent side effects are not retried durably.
- Event replay is not available.
- A web-process crash after canonical writes but before publish hooks can drop downstream behavior.

### Sync Path

Current files:

- `apps/web/src/app/settings/workspace/actions.ts`
- `apps/web/src/lib/gmail-ingestion.ts`
- `apps/web/src/lib/slack-ingestion.ts`
- `packages/connectors/src/orchestration.ts`
- `packages/connectors/src/idempotency-service.ts`
- `packages/connectors/src/inbound.ts`
- `packages/db/src/inbound-writer.ts`

Current behavior:

1. Operator submits `syncIntegrationAction` from workspace settings.
2. The server action calls `syncWorkspaceGmailIntegration` or `syncWorkspaceSlackIntegration` inline.
3. The sync function sets integration status to `SYNC_IN_PROGRESS`.
4. It publishes `integration_sync_started`.
5. It fetches provider data directly from Gmail or Slack.
6. Each thread/conversation group runs `runInboundOrchestration`.
7. Current inbound idempotency is `InMemoryIdempotencyService` scoped to the web process.
8. Canonical data is written with `createPrismaCanonicalPersistenceWriter`.
9. Inserted inbound messages become `message_received` events.
10. Integration status is updated to `CONNECTED` or `ERROR`.
11. `integration_sync_completed` or `integration_sync_failed` is published.

Gaps:

- Sync jobs run inside the request lifecycle.
- Long provider fetches can time out or die with the web process.
- In-memory idempotency does not survive restart and does not coordinate multiple web/worker processes.
- Integration status updates and event publication are not atomic.
- Partial sync writes can happen before failure status and failure event publication.

### Send Path

Current files:

- `apps/web/src/app/conversations/[conversationId]/actions.ts`
- `apps/web/src/lib/gmail-send.ts`
- `apps/web/src/lib/slack-send.ts`
- `packages/connectors/src/outbound-orchestration.ts`
- `packages/connectors/src/outbound.ts`
- `packages/db/src/outbound-writer.ts`

Current behavior:

1. Manual reply action creates a canonical outbound `Message` with status `DRAFT`.
2. The same server action calls `sendWorkspaceGmailReply` or `sendWorkspaceSlackReply` inline.
3. Send functions load the message, validate provider/integration eligibility, and require approval if an approval request exists and is not approved.
4. They build provider payload and run `runOutboundOrchestration`.
5. Current outbound idempotency is `InMemoryIdempotencyService` scoped to the web process.
6. Provider send happens inline.
7. `createPrismaCanonicalOutboundWriter` updates message status to `SENT` or `FAILED`, writes provider response metadata, and appends send action logs.
8. A `message_sent` or `message_send_failed` event is published.

Gaps:

- Provider sends happen during web requests.
- A crash after provider accept but before DB update can create ambiguity and duplicate-send risk.
- There is no durable idempotency key protecting the provider send across restarts.
- Manual reply creation and send enqueue are not split.
- Message status jumps from `DRAFT` to final status without a durable queued/attempt state.

### Approval-Send Path

Current files:

- `apps/web/src/app/approvals/[approvalRequestId]/actions.ts`
- `apps/web/src/lib/approval-queue.ts`
- `packages/db/src/approval-requests.ts`
- `apps/web/src/lib/gmail-send.ts`
- `apps/web/src/lib/slack-send.ts`

Current behavior:

1. Approval server actions call `approveCurrentWorkspaceApprovalRequest`, `editAndApproveCurrentWorkspaceApprovalRequest`, or `rejectCurrentWorkspaceApprovalRequest`.
2. `reviewApprovalRequest` runs a Prisma transaction:
   - validates pending approval state transition
   - updates draft `Message` to `APPROVED` or `REJECTED`
   - updates `ApprovalRequest`
   - updates conversation state
   - appends `ActionLog`
3. Approval events are published after the transaction.
4. On approve or edit-and-approve, `sendApprovedDraftMessage` immediately calls Gmail or Slack send inline.
5. Rejection publishes `approval_rejected`, which can trigger automatic agent revision inline through the event post-publish hook.

Gaps:

- Approval review and provider send happen in one web request but not one atomic side-effect transaction.
- If approval succeeds and send fails or the process dies, the approval can be `APPROVED` while send status is ambiguous.
- Retrying the server action can re-enter the send path unless durable idempotency blocks it.
- Approval rejection can synchronously invoke agent generation through event hooks.

### Auto-Agent Trigger Path

Current files:

- `apps/web/src/lib/event-publisher.ts`
- `apps/web/src/lib/agent-trigger-runtime.ts`
- `apps/web/src/lib/agent-draft-flow.ts`
- `apps/web/src/lib/agent-run-logging.ts`
- `packages/db/src/agent-context.ts`
- `packages/db/src/response-planner.ts`
- `packages/db/src/approval-requests.ts`

Current behavior:

1. `runPostPublishEventHooks` calls `executeAutomaticAgentTriggerForEvent` inline.
2. `message_received` can trigger `INBOUND_MESSAGE`; `approval_rejected` can trigger `APPROVAL_REJECTED`.
3. A global in-memory `Set` suppresses duplicate triggers while the same web process is running.
4. Additional suppression checks query canonical state:
   - conversation exists
   - active assignment exists
   - trigger rules allow the trigger
   - conversation is not terminal
   - conversation is not awaiting approval and has no pending approval
   - no existing agent draft is tied to the source message or source approval
5. If accepted, `generateDraftAndCreateApprovalForWorkspace` runs inline.
6. The agent flow logs run stages to `ActionLog`, plans, generates a draft, creates a pending approval request, publishes draft/approval/agent events, or records escalation.

Gaps:

- In-memory locks do not protect across processes or restarts.
- Agent generation can run during sync or approval web requests.
- There is no durable `AgentRun` record with a unique source trigger.
- Duplicate runs are partly suppressed by JSON metadata lookup on generated messages, but not by a transactional idempotency claim.
- Event hook failure only logs to stderr.

### Worker Status

Current files:

- `apps/worker/src/jobs.ts`
- `apps/worker/src/handlers.ts`
- `apps/worker/src/in-memory-runner.ts`
- `apps/worker/src/registry.ts`
- `apps/worker/src/retry.ts`
- `apps/worker/src/observability.ts`
- `apps/worker/src/server.ts`
- `apps/worker/package.json`

Current behavior:

- Worker job envelopes exist for connector sync, connector process event, reminder, approval follow-up, and agent run.
- Retry, execution history, in-flight tracking, stuck-job recovery, dead-lettering, and replay are modeled in memory.
- Registered handlers are placeholders.
- `apps/worker/package.json` already includes `bullmq` and `ioredis`.
- Runtime metrics are written to `/tmp/envoy-worker-metrics.json`.

Gaps:

- There is no BullMQ connection or Redis-backed queue producer/consumer.
- The in-memory queue is not durable and only runs sample jobs.
- Worker has no dependency on `@envoy/db`, `@envoy/connectors`, or shared web runtime handlers.
- Operator health reads a metrics file rather than durable runtime tables.

## 2. Proposed Durable Data Model

The following tables should be added to Prisma. Names are proposed and can be adjusted to match repository style, but the shape should remain workspace-scoped and append-friendly.

### EventJournal

Purpose: canonical durable event envelope. This is the source for replay, action-log hook delivery, agent trigger delivery, and operator event inspection.

Fields:

- `id String @id @default(uuid())`
- `eventId String @unique`
- `workspaceId String`
- `eventType String`
- `entityType String`
- `entityId String`
- `source String`
- `version Int`
- `occurredAt DateTime`
- `payloadJson Json`
- `status EventJournalStatus`
- `publishedAt DateTime @default(now())`
- `availableAt DateTime?`
- `processedAt DateTime?`
- `failedAt DateTime?`
- `deadLetteredAt DateTime?`
- `replayRequestedAt DateTime?`
- `replayOfEventId String?`
- `lastErrorJson Json?`
- `metadataJson Json?`
- relation to `Workspace`

Indexes:

- `@@index([workspaceId, eventType, occurredAt])`
- `@@index([workspaceId, status, availableAt])`
- `@@index([entityType, entityId, occurredAt])`
- `@@index([replayOfEventId])`

### EventProcessingAttempt

Purpose: append-only per-consumer attempt log. A single event can have separate consumers such as action log, automatic agent trigger, outbound status projection, and replay validation.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `eventJournalId String`
- `eventId String`
- `consumer String`
- `status EventProcessingStatus`
- `attempt Int`
- `startedAt DateTime @default(now())`
- `finishedAt DateTime?`
- `nextRetryAt DateTime?`
- `errorJson Json?`
- `resultJson Json?`
- `workerJobId String?`
- `bullJobId String?`
- relation to `Workspace`
- relation to `EventJournal`

Indexes and constraints:

- `@@unique([eventId, consumer, attempt])`
- `@@index([workspaceId, consumer, status, nextRetryAt])`
- `@@index([workerJobId])`

### IdempotencyRecord

Purpose: durable implementation of the existing `IdempotencyService` contract.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `scope String`
- `key String`
- `status IdempotencyRecordStatus`
- `integrationId String?`
- `operationType String`
- `resourceType String?`
- `resourceId String?`
- `externalEventId String?`
- `requestHash String?`
- `resultSummaryJson Json?`
- `startedAt DateTime @default(now())`
- `completedAt DateTime?`
- `expiresAt DateTime?`
- `lockedAt DateTime?`
- `lockOwner String?`
- `failedAt DateTime?`
- `lastErrorJson Json?`
- relation to `Workspace`

Indexes and constraints:

- `@@unique([scope, key])`
- `@@index([workspaceId, scope, status])`
- `@@index([workspaceId, resourceType, resourceId])`
- `@@index([workspaceId, externalEventId])`
- `@@index([expiresAt])`

### RuntimeJob

Purpose: durable DB mirror for BullMQ jobs. BullMQ should own scheduling/execution; this table gives Envoy an auditable, workspace-scoped job ledger and fallback recovery list.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `queueName String`
- `jobType String`
- `dedupeKey String?`
- `bullJobId String?`
- `status RuntimeJobStatus`
- `payloadJson Json`
- `resultJson Json?`
- `attemptsMade Int @default(0)`
- `maxAttempts Int`
- `runAt DateTime?`
- `queuedAt DateTime @default(now())`
- `startedAt DateTime?`
- `completedAt DateTime?`
- `failedAt DateTime?`
- `deadLetteredAt DateTime?`
- `cancelledAt DateTime?`
- `lastErrorJson Json?`
- `replayOfJobId String?`
- `sourceEventId String?`
- `idempotencyRecordId String?`
- relation to `Workspace`

Indexes and constraints:

- `@@unique([queueName, dedupeKey])` where a dedupe key is present, implemented by application logic if Prisma partial unique support is not enough.
- `@@index([workspaceId, queueName, status])`
- `@@index([workspaceId, sourceEventId])`
- `@@index([bullJobId])`

### RuntimeJobAttempt

Purpose: append-only attempt records for jobs.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `runtimeJobId String`
- `queueName String`
- `jobType String`
- `attempt Int`
- `workerId String?`
- `startedAt DateTime @default(now())`
- `finishedAt DateTime?`
- `status RuntimeJobAttemptStatus`
- `errorJson Json?`
- `resultJson Json?`
- relation to `Workspace`
- relation to `RuntimeJob`

Indexes:

- `@@unique([runtimeJobId, attempt])`
- `@@index([workspaceId, queueName, status])`

### DeadLetterRecord

Purpose: durable dead-letter record for exhausted jobs or event consumers. Keep the final payload and error for operator replay.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `kind String` (`event` or `job`)
- `sourceEventId String?`
- `runtimeJobId String?`
- `queueName String?`
- `reason String`
- `payloadJson Json`
- `errorJson Json?`
- `createdAt DateTime @default(now())`
- `resolvedAt DateTime?`
- `replayRequestedAt DateTime?`
- `replayedAsEventId String?`
- `replayedAsJobId String?`
- `resolutionJson Json?`
- relation to `Workspace`

Indexes:

- `@@index([workspaceId, kind, createdAt])`
- `@@index([workspaceId, replayRequestedAt])`
- `@@index([sourceEventId])`
- `@@index([runtimeJobId])`

### Optional AgentRun

Purpose: make agent runs first-class, dedupe-safe, and inspectable without scraping `ActionLog`. This is recommended for V1-B because automatic agent runs are one of the highest duplicate-risk flows.

Fields:

- `id String @id @default(uuid())`
- `workspaceId String`
- `conversationId String`
- `agentAssignmentId String?`
- `triggerType String`
- `sourceEventId String?`
- `sourceMessageId String?`
- `sourceApprovalRequestId String?`
- `runId String @unique`
- `dedupeKey String @unique`
- `status AgentRunStatus`
- `requestedByUserId String?`
- `startedAt DateTime @default(now())`
- `completedAt DateTime?`
- `suppressedAt DateTime?`
- `suppressionReason String?`
- `draftMessageId String?`
- `approvalRequestId String?`
- `errorJson Json?`
- `metadataJson Json?`
- relation to `Workspace`
- optional relations to canonical conversation, assignment, message, approval

Indexes:

- `@@index([workspaceId, conversationId, startedAt])`
- `@@index([workspaceId, status])`
- `@@index([sourceEventId])`

If this table is deferred, `IdempotencyRecord(scope="agent")` must still protect the dedupe key transactionally.

## 3. Proposed Event Lifecycle

Use these event statuses:

- `pending`: event is durably stored and ready for consumers.
- `processing`: at least one dispatcher has claimed the event for processing.
- `processed`: all required consumers completed successfully or intentionally skipped.
- `failed`: one or more required consumers failed but retry budget remains.
- `dead_lettered`: retry budget is exhausted or failure is non-retryable.
- `replay_requested`: an operator or maintenance job requested a replay.

Justification:

- These names match the user's requested lifecycle and map cleanly onto event journal rows.
- Consumer-specific detail belongs in `EventProcessingAttempt`, not only on the event row.
- `processed` means required processing completed, not that every optional observer did work.

Consumer model:

- Required consumers for V1-B:
  - `action_log_projector`
  - `agent_trigger_dispatcher`
- Optional consumers:
  - future integration operations projector
  - notification projector
  - metrics projector

Lifecycle:

1. Web or worker code calls `publishEnvoyEvent`.
2. Publisher inserts `EventJournal(status="pending")` with unique `eventId`.
3. Publisher enqueues an `events` queue job with `eventId` after the DB transaction commits.
4. Event worker claims the event by creating an `EventProcessingAttempt`.
5. Each required consumer runs idempotently.
6. If all required consumers succeed or skip, mark event `processed`.
7. Retryable failures mark event `failed` and schedule a retry.
8. Exhausted or non-retryable failures create `DeadLetterRecord` and mark `dead_lettered`.
9. Replay creates a new attempt against the same `eventId`, or a new event with `replayOfEventId` only when the business meaning is a re-emission. Prefer same-event consumer replay.

## 4. Proposed Idempotency Model

### Durable Service Contract

Replace web-local `InMemoryIdempotencyService` with `PrismaIdempotencyService` implementing the existing connector interface:

- `check`
- `begin`
- `complete`
- `fail`
- `markDuplicate`
- `getSummary`

`begin` must be atomic:

- Create a new record when missing.
- Return existing record when present.
- Do not allow two workers to both win the same key.

### Inbound Sync Events

Scope: `inbound`

Key shape:

- Gmail thread sync: `gmail:sync:{integrationId}:{threadId}:{historyIdOrLastMessageId}`
- Slack DM sync: avoid current run-specific key for dedupe. Use `slack:sync:{integrationId}:{conversationId}:{lastMessageExternalId}:{messageCountOrWindowEnd}` or a normalized batch hash. Current `syncRunId` in the key makes repeated sync runs look new and weakens replay safety.

Result summary:

- integration id
- conversation id
- message ids
- inserted message indexes
- provider cursor/window

Rule:

- Replayed sync jobs may fetch the provider again, but canonical message ingestion must dedupe on provider message identity and idempotency key.

### Message Ingestion

Existing canonical constraints help:

- `Conversation` unique on `[integrationId, externalConversationId]`
- `Message` unique on `[conversationId, externalMessageId]`

V1-B requirements:

- Keep canonical upserts idempotent.
- Emit `message_received` only for inserted messages, as current code does.
- Store inbound idempotency result before emitting downstream events.
- For messages lacking external ids, compute a request hash from canonical normalized fields and provider metadata, then store it in `IdempotencyRecord.requestHash`.

### Outbound Sends

Scope: `outbound`

Key shape:

- `send:{workspaceId}:{integrationId}:{conversationId}:{messageId}:{approvalRequestIdOrManual}`

Rules:

- The message id is the canonical send identity.
- Before provider send, atomically claim the outbound idempotency record and transition the message to `QUEUED` or keep `APPROVED` plus create a `RuntimeJob`. Prefer `QUEUED` when the send job is accepted.
- If the idempotency record is `completed`, return the stored result and do not call the provider.
- If status is `in_progress` and lock is fresh, skip/retry later.
- If status is `failed` and retryable, retries must reuse the same key.
- If provider returns an external message id, persist it and complete the idempotency record.

### Approval-Triggered Sends

Scope: `approval` for review decision and `outbound` for provider send.

Key shapes:

- Approval review: `approval_review:{workspaceId}:{approvalRequestId}:{decision}:{reviewedByUserId}`
- Approval send: same outbound key with approval request id included.

Rules:

- Approval review transaction remains canonical and human-gated.
- Approval success enqueues an outbound-send job after the review transaction commits.
- The enqueue must be protected by either:
  - a durable `RuntimeJob` unique `dedupeKey`, or
  - an `IdempotencyRecord(scope="approval")` that stores the outbound job id.
- Replaying the approval event must not change review state if the approval is already reviewed.
- Replaying the outbound-send job must not call provider if outbound idempotency is already completed.

### Automatic Agent Runs

Scope: `agent`

Key shape:

- `agent:{workspaceId}:{conversationId}:{triggerType}:{sourceMessageIdOrNone}:{sourceApprovalRequestIdOrNone}`

Rules:

- Claim the agent idempotency key before generation starts.
- If conversation has pending approval or terminal state, record a suppressed `AgentRun` or action log and complete the idempotency record as duplicate/suppressed.
- If a draft/approval is created, store draft and approval ids in result summary.
- Replays use the same key and should return existing result or suppression instead of generating again.
- Manual regenerate may use a different key that includes an explicit user request id or runtime job id, but it still must suppress concurrent duplicate clicks.

### Replayed Jobs

Rules:

- Replay never bypasses idempotency.
- Replay records must include `replayOfJobId` or `replayOfEventId`.
- Replay may create a new BullMQ job, but the handler must use the original business idempotency key unless the operator explicitly creates a new business operation.

## 5. Proposed Queue Architecture

Use Redis/BullMQ. The worker package already depends on `bullmq` and `ioredis`, and Redis is present in local Docker.

### Shared Queue Rules

- Every job payload includes `workspaceId`.
- Every job has a deterministic `dedupeKey` when it represents a business operation.
- BullMQ `jobId` should be set from the dedupe key where practical.
- A `RuntimeJob` row is created before or alongside queue enqueue.
- Handlers claim idempotency before unsafe side effects.
- Provider rate-limit responses set BullMQ delayed retries from `retryAfterSeconds` when available.

### Queue: `sync`

Job types:

- `gmail.sync_recent`
- `slack.sync_recent`

Payload:

- `workspaceId`
- `integrationId`
- `platform`
- `requestedByUserId`
- optional `windowStart`, `windowEnd`, `cursor`, `fullResync`

Producer:

- Workspace settings sync action.
- Future maintenance scheduler.

Consumer:

- Calls current `syncWorkspaceGmailIntegration` or `syncWorkspaceSlackIntegration` after extracting the reusable core from web-only dependencies.

### Queue: `outbound-send`

Job types:

- `gmail.send_reply`
- `slack.send_reply`

Payload:

- `workspaceId`
- `messageId`
- `actorUserId`
- `approvalRequestId`
- `requestedAt`

Producer:

- Manual reply action after creating outbound draft.
- Approval-approved event consumer after human approval.

Consumer:

- Calls provider-specific send orchestration.
- Uses durable outbound idempotency.

### Queue: `agent`

Job types:

- `agent.run`

Payload:

- `workspaceId`
- `conversationId`
- `agentAssignmentId`
- `triggerType`
- `sourceEventId`
- optional `sourceMessageId`
- optional `sourceApprovalRequestId`
- optional `requestedByUserId`

Producer:

- Agent trigger event consumer.
- Manual agent run action.

Consumer:

- Calls `generateDraftAndCreateApprovalForWorkspace` only after durable idempotency claim and suppression checks.

### Queue: `events`

Job types:

- `event.process`
- `event.replay`

Payload:

- `workspaceId`
- `eventId`
- optional `consumers`
- optional `replayReason`

Producer:

- Durable event publisher.
- Replay UI/API.
- Maintenance sweep for pending/failed events.

Consumer:

- Runs event consumers such as action-log projection and agent-trigger dispatch.

### Queue: `maintenance`

Job types:

- `runtime.recover_stuck_jobs`
- `runtime.requeue_pending_events`
- `runtime.expire_idempotency_records`
- `runtime.metrics_snapshot`

Payload:

- `workspaceId` optional for workspace-specific sweeps.
- thresholds and limits.

Producer:

- Scheduled worker loop or deployment scheduler.

Consumer:

- Repairs pending event and job records, emits metrics, and moves exhausted work to dead letter.

## 6. Migration Strategy

### B1: Event Journal

Goal:

Persist events before moving behavior to workers.

Steps:

1. Add `EventJournal`, `EventProcessingAttempt`, and supporting enums.
2. Implement a `PrismaEventPublisher`.
3. Keep `publishEnvoyEvent` API stable.
4. Insert event rows and still run existing inline post-publish hooks.
5. Make event insert idempotent on `eventId`.
6. Add a small event journal read path for operator/debug inspection if needed.

Acceptance criteria:

- Publishing any current event creates exactly one `EventJournal` row.
- Existing action logs still appear.
- Existing automatic triggers still work.
- Re-publishing the same `eventId` does not create duplicates.
- Tests cover single and bulk publish.
- No provider sends or agent generation move yet.

### B2: Idempotency Store

Goal:

Replace in-memory idempotency for sync, send, approval continuation, and agent trigger claims.

Steps:

1. Add `IdempotencyRecord`.
2. Implement `PrismaIdempotencyService`.
3. Inject it into Gmail sync, Slack sync, Gmail send, Slack send, and agent trigger flow.
4. Remove web-local singleton reliance for runtime safety, but tests can still use in-memory service.
5. Tighten Slack sync key to avoid `syncRunId` making every run unique.
6. Add durable agent dedupe key before generation starts.

Acceptance criteria:

- Re-running the same Gmail thread ingestion records duplicate/processed and does not emit duplicate `message_received`.
- Re-running the same Slack conversation ingestion dedupes across sync runs.
- Retrying an outbound send with completed idempotency does not call provider.
- Concurrent duplicate agent triggers produce one run and one suppression/duplicate outcome.
- Existing connector orchestration interfaces remain usable.

### B3: BullMQ Worker

Goal:

Introduce Redis-backed worker infrastructure while keeping web flows functionally unchanged.

Steps:

1. Add shared BullMQ queue factory using `REDIS_URL`.
2. Add queue producers in a shared runtime package or `apps/web/src/lib/runtime-queues.ts`.
3. Add worker consumers for `events`, `sync`, `outbound-send`, `agent`, and `maintenance`.
4. Add `RuntimeJob`, `RuntimeJobAttempt`, and `DeadLetterRecord`.
5. Mirror BullMQ lifecycle into runtime tables.
6. Keep existing in-memory worker runner only for unit tests or delete after parity.
7. Implement real event worker consumers first:
   - action log projection
   - agent trigger dispatch to enqueue `agent.run`, not execute inline

Acceptance criteria:

- Worker can boot and connect to Redis.
- A queued sample job is visible in BullMQ and `RuntimeJob`.
- Failed jobs retry with backoff and write attempts.
- Exhausted jobs create `DeadLetterRecord`.
- Event processing can be run by worker while inline hooks are still available behind a flag.

### B4: Move Flows

Goal:

Move unsafe/long side effects out of web requests one flow at a time.

Order:

1. Move sync:
   - `syncIntegrationAction` creates `sync` job and redirects with queued state.
   - Worker executes Gmail/Slack sync.
   - Integration status and events are updated by worker.
2. Move automatic agent triggers:
   - Event consumer enqueues `agent.run`.
   - Web publisher no longer executes agent trigger inline once worker mode is enabled.
3. Move approval-send:
   - Approval review transaction remains in web request.
   - Approval-approved event consumer or approval action enqueues outbound send.
   - Provider send runs only in `outbound-send` worker.
4. Move manual send:
   - Manual reply action creates outbound message and enqueues send job.
   - UI shows queued/sending state from canonical message/runtime job state.

Feature flags:

- `ENVOY_RUNTIME_EVENT_WORKER_ENABLED`
- `ENVOY_RUNTIME_SYNC_WORKER_ENABLED`
- `ENVOY_RUNTIME_AGENT_WORKER_ENABLED`
- `ENVOY_RUNTIME_OUTBOUND_WORKER_ENABLED`

Acceptance criteria:

- With flags off, current inline behavior still works.
- With each flag on, the corresponding web action returns after enqueue, not after side effect completion.
- No flow is moved before durable idempotency is in place.
- Approval still must be `APPROVED` before any AI draft enters outbound-send.
- Manual sends and approval sends both dedupe by message id.

### B5: Health and Recovery

Goal:

Make the durable runtime operable.

Steps:

1. Replace file-based worker metrics with DB-backed runtime metrics derived from `RuntimeJob`, `RuntimeJobAttempt`, `EventJournal`, and `DeadLetterRecord`.
2. Add maintenance workers for:
   - stuck `processing` events
   - stale in-progress idempotency records
   - BullMQ jobs missing matching `RuntimeJob`
   - `RuntimeJob` rows stuck after worker crash
3. Add replay API/actions gated by `VIEW_AUDIT_LOGS` or stronger operator permission.
4. Add operator views later using the existing queue/table guidance:
   - event journal queue
   - dead-letter queue
   - runtime job detail
   - agent run history

Acceptance criteria:

- Operator snapshot shows real queue depth, dead letters, failed events, and stale jobs from DB.
- Replaying a dead-lettered event or job creates a replay record and a new attempt.
- Replay does not bypass idempotency.
- Maintenance can recover a stuck job/event in a local crash simulation.

## 7. Risk Analysis

### Duplicate Sends

Risk:

- Provider accepts a send, then the process dies before DB status/idempotency completion.

Mitigation:

- Durable outbound idempotency key before provider call.
- Persist provider response immediately after send.
- Use provider-native idempotency headers if Gmail/Slack support them for the specific endpoint. If not, treat unknown provider outcome as ambiguous and require operator review instead of blind retry.
- Retry only when failure is known retryable and no external message id was persisted.

### Duplicate Agent Runs

Risk:

- `message_received` replay or concurrent workers generate multiple AI drafts and approvals.

Mitigation:

- Durable `IdempotencyRecord(scope="agent")` or `AgentRun.dedupeKey`.
- Claim before generation.
- Suppression checks remain.
- Unique source trigger key includes source message or source approval id.

### Dropped Events

Risk:

- Canonical data writes succeed but event publish fails.

Mitigation:

- B1 event journal should be called immediately after canonical transaction.
- For highest-risk flows, use an outbox-like pattern inside the same transaction where possible:
  - approval review plus approval event journal insert
  - draft creation plus draft/approval event journal inserts
  - send status update plus sent/failed event journal insert
- Maintenance sweep can backfill missing events from canonical state only where deterministic.

### Partial DB Writes

Risk:

- Sync updates integration status, ingests some messages, then fails.

Mitigation:

- Treat sync as a job with attempt records.
- Keep canonical message upserts idempotent.
- Persist sync started/completed/failed events.
- Store per-attempt result and provider cursor/window in runtime job result.

### Worker/Web Race Conditions

Risk:

- Inline hooks and workers both process the same event during migration.

Mitigation:

- Feature flags are mutually exclusive per consumer.
- Event consumers use `EventProcessingAttempt` uniqueness and idempotency.
- `agent.run` uses durable dedupe even if double-enqueued.

### Retries Causing Unsafe Side Effects

Risk:

- Retried jobs repeat provider sends or AI generation.

Mitigation:

- Handlers are structured as claim, inspect prior result, then side effect.
- Retries reuse original idempotency key.
- Ambiguous side-effect outcomes move to dead letter/operator review instead of automatic replay.

### Approval State Mismatch

Risk:

- Approval is approved but send job fails or is never queued.

Mitigation:

- Approval review transaction records durable event/job intent.
- Approval detail should show send queued/failed state.
- Maintenance sweep detects approved draft messages without terminal send job/status and enqueues/reports them based on idempotency state.

### Provider Rate Limits

Risk:

- Gmail/Slack rate limits cause repeated fast retries and degraded workspace health.

Mitigation:

- Use connector retryability and `retryAfterSeconds`.
- Apply queue-level limiter per provider and possibly per integration.
- Store rate-limit diagnostics in `RuntimeJobAttempt.errorJson`.
- Surface rate-limited integrations in operator health.

## 8. Acceptance Criteria by Step

### B1 Event Journal

- `message_received`, `message_sent`, `approval_approved`, `approval_rejected`, `agent_run_requested`, and sync events are present in `EventJournal`.
- Bulk event publish creates one row per event.
- Duplicate `eventId` is ignored or returned as already accepted.
- Existing `ActionLog` behavior remains unchanged.

### B2 Idempotency Store

- Durable idempotency records are created for inbound, outbound, approval, and agent scopes.
- Repeated sync against the same provider payload does not create duplicate messages.
- Repeated outbound send request for the same message does not call provider twice.
- Automatic agent replay for the same source event does not create a second draft.

### B3 BullMQ Worker

- Worker starts, connects to Redis, and registers all queue consumers.
- Enqueued job creates `RuntimeJob`.
- Handler attempts create `RuntimeJobAttempt`.
- Retry and dead-letter behavior is reflected in DB.
- Event worker processes pending event journal rows.

### B4 Move Flows

- Sync action queues a job and web request returns quickly.
- Approval approve action reviews the approval but provider send runs in worker.
- Manual reply action creates a message and queues send.
- Automatic agent runs happen from `agent` queue, not event post-publish inline hook.
- All moved flows remain replay-safe under duplicate enqueue.

### B5 Health and Recovery

- Operator snapshot reads DB-backed worker/event health.
- Dead-letter records can be replayed by authorized operators.
- Stuck processing records are recoverable by maintenance.
- Replay produces attempts but not duplicate business side effects.

## Safest First Coding Step

Start with B1: add `EventJournal` and `EventProcessingAttempt`, implement `PrismaEventPublisher`, and keep inline hooks enabled. This gives durable visibility without moving provider sends, sync, approvals, or agent generation yet.

## Biggest Risk

The biggest risk is duplicate outbound sends from ambiguous provider outcomes. The implementation must treat provider sends as the most dangerous side effect: claim durable idempotency before send, persist results immediately after provider response, and dead-letter ambiguous retry cases for operator review instead of automatically trying again.

## Files Inspected

- `docs/EVENT_SCHEMA_V1.md`
- `docs/frontend/COMPONENT_SYSTEM.md`
- `docs/frontend/FRONTEND_DESIGN_FOUNDATION.md`
- `docs/frontend/FRONTEND_GAP_AUDIT.md`
- `docs/frontend/FRONTEND_IMPLEMENTATION_RULES.md`
- `docs/frontend/INFORMATION_ARCHITECTURE_V1.md`
- `packages/db/prisma/schema.prisma`
- `packages/events/src/index.ts`
- `packages/events/src/publisher.ts`
- `packages/events/src/schema.ts`
- `packages/events/src/workflow.ts`
- `packages/connectors/src/idempotency.ts`
- `packages/connectors/src/idempotency-service.ts`
- `packages/connectors/src/inbound.ts`
- `packages/connectors/src/orchestration.ts`
- `packages/connectors/src/outbound.ts`
- `packages/connectors/src/outbound-orchestration.ts`
- `packages/connectors/src/outbound-persistence.ts`
- `packages/connectors/src/persistence.ts`
- `packages/connectors/src/index.ts`
- `packages/db/src/inbound-writer.ts`
- `packages/db/src/outbound-writer.ts`
- `packages/db/src/approval-requests.ts`
- `apps/worker/package.json`
- `apps/worker/src/handlers.ts`
- `apps/worker/src/in-memory-runner.ts`
- `apps/worker/src/jobs.ts`
- `apps/worker/src/observability.ts`
- `apps/worker/src/registry.ts`
- `apps/worker/src/retry.ts`
- `apps/worker/src/server.ts`
- `apps/web/src/lib/event-publisher.ts`
- `apps/web/src/lib/gmail-ingestion.ts`
- `apps/web/src/lib/slack-ingestion.ts`
- `apps/web/src/lib/gmail-send.ts`
- `apps/web/src/lib/slack-send.ts`
- `apps/web/src/lib/agent-draft-flow.ts`
- `apps/web/src/lib/agent-trigger-runtime.ts`
- `apps/web/src/lib/agent-run-logging.ts`
- `apps/web/src/lib/approval-queue.ts`
- `apps/web/src/lib/observability.ts`
- `apps/web/src/lib/audit-log-viewer.ts`
- `apps/web/src/app/approvals/[approvalRequestId]/actions.ts`
- `apps/web/src/app/conversations/[conversationId]/actions.ts`
- `apps/web/src/app/settings/workspace/actions.ts`
- `apps/web/src/app/settings/workspace/page.tsx`
- `apps/web/src/app/settings/audit/page.tsx`

## Proposed Tables

- `EventJournal`
- `EventProcessingAttempt`
- `IdempotencyRecord`
- `RuntimeJob`
- `RuntimeJobAttempt`
- `DeadLetterRecord`
- `AgentRun` recommended

## Proposed Queues

- `sync`
- `outbound-send`
- `agent`
- `events`
- `maintenance`
