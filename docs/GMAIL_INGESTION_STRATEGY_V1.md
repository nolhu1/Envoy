# Envoy Gmail Ingestion Strategy v1

## Purpose

This document defines the Gmail message ingestion strategy for the Envoy MVP.

The first Gmail ingestion implementation will use:
- recent-thread polling first

It will not start with Gmail push/watch as the primary ingestion path.

This keeps the first connector narrow and aligned with the shared inbound pipeline.

---

## Strategy Decision

### Selected MVP ingestion mode
- polling recent Gmail threads

### Deferred
- Gmail push/watch setup
- Pub/Sub push delivery
- advanced mailbox sync
- full historical mailbox import

---

## Why polling first

Polling first is the simpler MVP path because it:
- avoids early webhook/watch setup complexity
- still proves the canonical ingestion framework
- is enough to power the first live inbox experience
- fits the recent-thread-first connector scope already locked for Gmail

Push/watch can be layered in later without changing the canonical model or connector framework.

---

## Ingestion Source

The Gmail connector should fetch:
- recent threads
- recent messages inside those threads

The connector should then feed normalized results into the shared inbound ingestion pipeline.

The shared inbound stages remain:
1. validate source
2. parse payload
3. dedupe
4. normalize
5. upsert conversation
6. insert messages
7. emit events

The Gmail connector must not bypass that shared pipeline.

---

## Initial Sync Window

### Included
- recent thread import only
- limited backfill window
- enough history to populate the inbox after connect

### Recommended MVP behavior
- fetch only a bounded recent window after first connect
- store a checkpoint or cursor in integration metadata for later incremental sync
- prefer recency over completeness in the first version

### Deferred
- full mailbox historical import
- large mailbox migration
- advanced folder/label sync semantics

---

## Checkpoint Model

The integration should maintain non-secret sync state in integration metadata.

Examples:
- last sync cursor
- last synced at
- recent sync window markers
- sync diagnostics

Secrets must not be stored in metadata.
Sync state should remain non-secret and connector-operational.

---

## Canonical Mapping Requirement

The Gmail connector must normalize Gmail provider data into the existing canonical model:

### Conversations
- Gmail thread id -> `external_conversation_id`
- subject -> `subject`
- latest thread activity -> `last_message_at`

### Messages
- Gmail message id -> `external_message_id`
- plain text -> `body_text`
- html body -> `body_html`
- send/receive timestamps -> canonical timing fields

### Metadata
Gmail-specific non-canonical detail should go into:
- `raw_payload_json`
- `platform_metadata_json`

No Gmail-only core columns should be added.

---

## Sync Frequency Assumption

For MVP:
- allow manual resync
- support a recent polling-based sync path
- do not require realtime delivery guarantees yet

The system should be designed so polling can later coexist with Gmail push/watch.

---

## Idempotency and Dedupe

The Gmail ingestion path must use the shared idempotency and inbound dedupe contracts.

That means:
- duplicate polling results must not create duplicate canonical messages
- message identity should converge on canonical uniqueness
- repeated syncs should converge to the same canonical state

The connector must not invent Gmail-only dedupe rules outside the shared framework.

---

## Lifecycle Interaction

When a connected Gmail integration runs an import or resync:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

If sync fails in a connector-health-relevant way:
- transition toward `ERROR` as appropriate

Do not invent Gmail-only lifecycle states.

---

## Attachment Handling During Ingestion

The first Gmail ingestion path should:
- normalize attachment metadata
- preserve provider attachment identifiers
- store file name, MIME type, size when available
- avoid full binary ingestion in the first sync implementation unless needed later

---

## Explicit MVP Non-Goals

Do not build these as part of the first Gmail ingestion step:
- Gmail push/watch as the primary path
- Pub/Sub consumer setup
- mailbox management actions
- full history migration
- label management as a first-class canonical concept
- advanced attachment ingestion pipeline

---

## Acceptance Test

The Gmail ingestion strategy is correct only if all of the following are true:

1. Gmail recent threads can be fetched through a bounded polling-based sync.
2. The connector feeds the shared inbound pipeline rather than custom Gmail-only write logic.
3. Repeated polling does not create duplicate canonical messages.
4. A sync checkpoint can be stored in non-secret integration metadata.
5. The strategy can later add Gmail push/watch without redesigning the canonical model.