# Envoy Idempotency Contract v1

## Purpose

This document defines the shared idempotency contract for Envoy connector operations.

The idempotency layer exists so that repeated inbound or outbound operations do not corrupt canonical state or produce duplicate platform actions.

This contract applies to:
- inbound webhook processing
- inbound history sync ingestion
- manual refresh ingestion
- outbound human sends
- outbound approved AI sends
- future retry flows

---

## Core Rule

A repeated operation must either:
- no-op safely
- or converge to the same canonical result

It must not:
- create duplicate canonical messages
- create duplicate outbound provider sends
- corrupt workflow state
- write conflicting connector state

---

## Idempotency Scope

### Inbound scope
Protect against:
- duplicate webhook deliveries
- repeated polling results
- replayed sync batches
- repeated manual refreshes
- ambiguous provider retries

### Outbound scope
Protect against:
- repeated send attempts for the same canonical message
- retry after timeout or network error
- duplicate queue delivery
- ambiguous provider acceptance responses
- repeated approval-triggered send execution

---

## Inbound Idempotency Sources

Preferred inbound idempotency sources, in order:

### 1. External event id
Use when the provider gives a stable event identifier.

Examples:
- webhook delivery id
- history event id
- provider event id

This is the strongest inbound idempotency key when available.

### 2. Canonical message uniqueness
Use canonical uniqueness anchored on:
- integration
- canonical conversation
- `externalMessageId`

Canonical message uniqueness already exists as part of the message model and prevents duplicate ingestion of the same provider message inside one canonical conversation.  [oai_citation:2‡MESSAGE_MODEL_V1.md](sediment://file_00000000732471f5b948eca0d7faeef1)

### 3. Ingestion fingerprint
Use a deterministic hash when the provider does not give a stable external event id.

Possible inputs:
- integrationId
- source type
- external conversation id
- external message id
- event timestamp
- normalized provider subtype

This is a fallback, not the preferred primary key.

---

## Outbound Idempotency Sources

Preferred outbound idempotency sources, in order:

### 1. Canonical message id
The canonical outbound `messageId` is the core business identity for an outbound send attempt.

One canonical outbound message should correspond to one logical send.

### 2. Explicit idempotency key
Use a stable idempotency key derived from:
- workspaceId
- integrationId
- conversationId
- messageId
- approvalRequestId if relevant
- send attempt type

This is the primary retry-safe send key at the shared pipeline layer.

### 3. Provider idempotency support
If a provider supports idempotency tokens or dedupe headers, pass the shared idempotency key through the connector.

This is additive.
It does not replace internal Envoy idempotency tracking.

---

## Inbound Contract

### Inbound identity
Each inbound operation should attempt to compute:
- `externalEventId` when available
- `idempotencyKey` when needed
- canonical message uniqueness target

### Inbound dedupe rule
If an inbound operation matches a previously processed identity:
- do not write duplicate canonical messages
- do not emit duplicate downstream effects beyond the allowed shared result
- return a duplicate-safe ingestion result

### Inbound convergence rule
If canonical state already reflects the provider message:
- repeated processing should converge to the same conversation/message result
- participant and attachment handling should also remain duplicate-safe

---

## Outbound Contract

### Outbound identity
Each outbound send operation should compute:
- one logical send identity for one canonical outbound message
- one idempotency key for retries and repeated execution attempts

### Outbound dedupe rule
If an outbound operation for the same logical message is already in progress or already completed:
- do not create a second provider send without explicit operator intent
- return the existing or resolved send state when possible

### Outbound convergence rule
If a send attempt is retried after ambiguous failure:
- repeated execution should converge on one final canonical result
- canonical status should not oscillate unpredictably
- audit should remain traceable without duplicate “success” semantics

---

## When Canonical Uniqueness Is Enough

Canonical uniqueness is often enough for inbound message creation when:
- the provider gives a stable `externalMessageId`
- the message belongs to one canonical conversation
- the shared write path uses upsert or equivalent matching

Canonical uniqueness is not enough by itself for:
- webhook delivery dedupe
- outbound send retries
- ambiguous provider responses
- approval-triggered repeated send jobs

Those need explicit idempotency records or keys.

---

## When a Separate Idempotency Record Is Needed

Use a dedicated idempotency store when:
- the operation may repeat before canonical writes complete
- the operation has side effects outside the DB
- the provider response may be ambiguous
- retries must observe prior attempt state

Examples:
- webhook delivery processing
- outbound provider send attempts
- future agent runs
- future approval-triggered send execution

---

## Suggested Idempotency Record Shape

A future idempotency store should support fields like:

- `id`
- `workspaceId`
- `integrationId` nullable
- `scope`
  - inbound
  - outbound
  - approval
  - agent
- `key`
- `status`
  - in_progress
  - completed
  - failed
  - duplicate
- `operationType`
- `resourceType` nullable
- `resourceId` nullable
- `externalEventId` nullable
- `requestHash` nullable
- `resultSummaryJson`
- `startedAt`
- `completedAt` nullable
- `expiresAt` nullable

This document defines the contract only.
Concrete persistence comes later.

---

## Retry Safety Rules

### Rule 1
A retry must use the same logical idempotency identity as the original operation.

### Rule 2
Retries must not mint new canonical identities when the logical operation is the same.

### Rule 3
If provider outcome is ambiguous, preserve diagnostics and idempotency state rather than assuming success or blindly retrying.

### Rule 4
Final canonical state must be derivable from:
- canonical records
- idempotency records
- safe diagnostics

---

## Inbound vs Outbound Difference

### Inbound
Goal:
- avoid duplicate canonical ingestion

Main anchors:
- external event id
- external message id
- canonical uniqueness

### Outbound
Goal:
- avoid duplicate provider sends

Main anchors:
- canonical message id
- approval-linked send identity
- shared idempotency key
- provider idempotency token when available

---

## Connector Responsibilities

Connector code is responsible for:
- surfacing provider event ids when available
- surfacing provider message ids
- accepting idempotency tokens for send when the provider supports them
- returning safe diagnostics on ambiguous provider responses

Connector code is not responsible for:
- inventing connector-specific dedupe systems outside the shared contract
- deciding canonical duplicate handling alone
- deciding final retry policy alone

---

## Shared Framework Responsibilities

The shared connector framework is responsible for:
- computing or accepting stable idempotency keys
- enforcing duplicate-safe orchestration
- deciding when a duplicate should short-circuit
- keeping inbound and outbound contracts consistent
- making later persistence and retry layers pluggable

---

## Failure Handling Rules

### Duplicate inbound delivery
- short-circuit safely
- return duplicate-safe result

### Duplicate outbound execution
- short-circuit or return existing logical send state when possible

### Ambiguous provider result
- keep idempotency state
- preserve diagnostics
- avoid double-send

### Partial failure
- keep enough state to replay safely without corrupting canonical data

---

## Acceptance Test

The idempotency contract is correct only if all of the following are true:

1. Duplicate webhook deliveries do not create duplicate canonical messages.  [oai_citation:3‡INBOUND_INGESTION_PIPELINE_V1.md](sediment://file_00000000a62c71f5b722d6452a2b6129)
2. Repeated sync ingestion converges on the same canonical message state.  [oai_citation:4‡INBOUND_INGESTION_PIPELINE_V1.md](sediment://file_00000000a62c71f5b722d6452a2b6129)
3. Repeated outbound send attempts for one canonical message do not create uncontrolled duplicate sends.  [oai_citation:5‡OUTBOUND_SENDING_PIPELINE_V1.md](sediment://file_0000000002fc71fd863506f91d67515f)
4. Provider idempotency support can be used without replacing internal Envoy idempotency.
5. The framework can later add a dedicated idempotency store without redesigning connector contracts.