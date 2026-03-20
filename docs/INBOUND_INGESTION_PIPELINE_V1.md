# Envoy Inbound Ingestion Pipeline v1

## Purpose

This document defines the shared inbound ingestion pipeline for Envoy connectors.

The inbound pipeline exists so that all connectors can feed provider events and history into one standard workflow that:
- validates source authenticity
- prevents duplicate ingestion
- normalizes provider data into the canonical model
- writes conversations, participants, messages, and attachments safely
- emits downstream events for workflow processing

This contract applies to:
- webhooks
- polling-based sync
- backfill/history sync
- manual thread refresh

---

## Core Rule

Provider-specific parsing belongs inside the connector.

Canonical ingestion behavior belongs inside the shared inbound pipeline.

A connector may interpret provider payloads, but it must hand off normalized ingestion candidates to one shared pipeline.

---

## Standard Inbound Stages

### 1. Validate source
Purpose:
- confirm the inbound request or sync source is trustworthy and belongs to a valid integration

Examples:
- webhook signature verification
- integration existence check
- workspace ownership check
- connector status check

Inputs:
- integration context
- raw request or sync payload
- headers if applicable

Outputs:
- validated inbound input
- rejection if invalid

Failure behavior:
- reject invalid source
- do not continue to parsing or writes

---

### 2. Parse payload
Purpose:
- extract the provider event or message data into a connector-understood internal shape

Examples:
- Slack event payload parsing
- Gmail history record parsing
- provider-specific thread/message extraction

Inputs:
- validated raw inbound payload
- connector context

Outputs:
- provider-native parsed objects
- external event id if available
- provider diagnostics

Failure behavior:
- log parse failure
- do not continue to normalization if parsing is unusable

---

### 3. Dedupe
Purpose:
- prevent duplicate ingestion before canonical writes happen

Possible dedupe keys:
- provider external event id
- provider message id
- normalized `(integrationId, externalConversationId, externalMessageId)`
- ingestion fingerprint or hash

Inputs:
- integration id
- external event id if available
- parsed provider message or thread identity

Outputs:
- dedupe decision:
  - new
  - already processed
  - ambiguous/retry-safe

Failure behavior:
- if duplicate, short-circuit safely
- do not create duplicate canonical records

---

### 4. Normalize
Purpose:
- convert parsed provider objects into canonical ingestion candidates

Canonical candidates may include:
- conversation candidates
- participant candidates
- message candidates
- attachment candidates

Inputs:
- parsed provider payload
- connector normalization methods
- integration context

Outputs:
- `IngestionBatch`
- canonical normalized candidates
- preserved raw payload and metadata

Failure behavior:
- reject malformed normalized output
- log normalization diagnostics
- do not partially write invalid objects without policy

---

### 5. Upsert conversation and participants
Purpose:
- create or update the canonical conversation container and related participants before message insert

Inputs:
- normalized conversation candidate
- normalized participant candidates

Outputs:
- resolved canonical conversation id
- resolved participant ids

Rules:
- identify conversations by canonical unique keys
- upsert by integration and external conversation identity
- preserve existing data where appropriate
- keep platform-specific data in metadata fields only

---

### 6. Insert or upsert messages and attachments
Purpose:
- write canonical message records and related attachment metadata

Inputs:
- normalized message candidates
- normalized attachment candidates
- resolved conversation id
- resolved participant ids

Outputs:
- inserted or matched canonical message ids
- inserted attachment ids

Rules:
- message identity must support idempotent reprocessing
- attachment writes should be metadata-only in MVP
- do not create duplicates for repeated inbound events

---

### 7. Emit downstream events
Purpose:
- notify the rest of the system that canonical inbound work completed

Examples:
- `message_received`
- `conversation_updated`
- `workflow_state_changed`

Inputs:
- successful canonical write results
- conversation id
- message ids
- integration id
- workspace id

Outputs:
- emitted downstream event payloads

Failure behavior:
- event emission should be retry-safe
- DB writes and event emission need a consistent handoff strategy later

---

## Shared Input Contract

The shared inbound pipeline should accept a normalized inbound envelope such as:

### InboundEnvelope
- sourceType
  - webhook
  - sync
  - refresh
- workspaceId
- integrationId
- platform
- connectorContext
- rawInput
- receivedAt
- externalEventId nullable
- idempotencyKey nullable

This envelope is provider-agnostic.

---

## Shared Output Contract

The shared inbound pipeline should produce a structured result such as:

### InboundIngestionResult
- integrationId
- workspaceId
- conversationId nullable
- messageIds[]
- insertedCounts
- dedupeDecision
- emittedEvents[]
- diagnostics

This lets downstream services understand what happened without provider-specific branching.

---

## Dedupe Rules

### Primary rule
No duplicate webhook or sync input should create duplicate canonical messages.

### Preferred dedupe order
1. external event id when the provider gives one
2. canonical message uniqueness:
   - `(conversationId, externalMessageId)`
3. idempotency fingerprint when needed

### Retry rule
A retry must be safe.
Repeated processing of the same inbound event should either:
- no-op
- or converge to the same canonical result

---

## Canonical Write Rules

### Conversations
Use canonical conversation identity based on:
- integration
- external conversation id

### Participants
Participants should be matched or created using:
- conversation scope
- external participant id when available
- canonical email/handle fallback only when safe

### Messages
Messages should be matched or created using:
- canonical conversation
- external message id

### Attachments
Attachment metadata is linked to canonical messages.
Do not store binaries in the inbound pipeline.

---

## Connector Responsibilities

Connector code is responsible for:
- source validation details
- provider payload parsing
- normalization into shared candidate shapes
- provider diagnostics

Connector code is not responsible for:
- direct canonical DB writes scattered per provider
- custom per-provider conversation insertion logic outside the shared pipeline
- ad hoc duplicate handling outside the shared dedupe rules

---

## Shared Pipeline Responsibilities

The shared inbound pipeline is responsible for:
- dedupe enforcement
- canonical upsert/insert sequencing
- canonical identity resolution
- safe message insertion
- event emission handoff
- shared ingestion result shape

---

## Failure Handling Rules

### Validation failure
- reject
- no writes

### Parse failure
- reject
- no writes
- record diagnostics

### Duplicate detection
- no-op safely
- return duplicate result

### Normalization failure
- reject
- no writes unless explicitly safe and intentional

### Partial write risk
Avoid connector-specific partial write sequences.
Prefer shared ordered writes:
1. conversation
2. participants
3. messages
4. attachments
5. downstream events

---

## Event Emission Boundary

Inbound ingestion should not contain downstream workflow logic directly.

It should only emit canonical system events after successful canonical writes.

Examples:
- `message_received`
- `conversation_updated`

Workflow engines, approvals, and agent logic should react later.

---

## Acceptance Test

The inbound pipeline contract is correct only if all of the following are true:

1. A webhook and a history sync batch can both feed the same shared pipeline.
2. Duplicate webhook deliveries do not create duplicate canonical messages.
3. Connectors normalize data before DB writes.
4. Canonical writes happen through one shared ingestion pattern.
5. Downstream workflow logic is triggered by emitted events, not provider-specific side effects.