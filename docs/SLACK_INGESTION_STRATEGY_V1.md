# Envoy Slack Ingestion Strategy v1

## Purpose

This document defines the Slack message ingestion strategy for the Envoy MVP.

The first Slack ingestion implementation will use:
- Slack DM sync first
- bounded recent-history import
- shared inbound pipeline handoff

It will not start with broad workspace event ingestion or channel-wide sync.

This keeps the first Slack connector aligned with the shared connector framework and canonical model.

---

## Strategy Decision

### Selected MVP ingestion mode
- Slack DMs only
- recent DM sync first

### Deferred
- public channel ingestion
- private channel ingestion
- workspace-wide event ingestion
- Slack Connect complexity
- broad historical import

---

## Why DM sync first

DM sync first is the simplest MVP path because it:
- matches the locked Slack DM-only scope
- avoids channel permission complexity
- proves the canonical multi-platform model with a second connector
- keeps provider-specific behavior inside the connector while using the shared inbound pipeline

Slack Events API can be layered in later without redesigning the canonical model.

---

## Ingestion Source

The Slack connector should fetch:
- recent DM conversations
- recent messages inside those DMs
- thread replies inside DM scope when present

The connector should then feed normalized results into the shared inbound ingestion pipeline.

The shared inbound stages remain:
1. validate source
2. parse payload
3. dedupe
4. normalize
5. upsert conversation
6. insert messages
7. emit events

The Slack connector must not bypass that shared pipeline.

---

## Initial Sync Scope

### Included
- recent DM sync only
- bounded recent history
- DM thread reply import when present
- user/workspace metadata needed for participant mapping

### Deferred
- public channel history
- private channel history
- workspace-wide archive import
- edits/deletes beyond metadata preservation if later needed

---

## Checkpoint Model

The integration should maintain non-secret Slack sync state in integration metadata.

Examples:
- last DM sync timestamp
- recent sync window bounds
- paging cursor if used
- sync diagnostics summary
- item counts

Secrets must not be stored in metadata.

---

## Canonical Mapping Requirement

The Slack connector must normalize Slack provider data into the existing canonical model:

### Conversations
- DM or DM-thread identity -> `external_conversation_id`
- no subject -> `subject = null`
- most recent activity -> `last_message_at`

### Messages
- Slack message timestamp or normalized key -> `external_message_id`
- text -> `body_text`
- provider timestamps -> canonical timing fields

### Participants
- Slack user id
- display name
- handle
- workspace/team hints in metadata when useful

### Metadata
Slack-specific non-canonical detail should go into:
- `raw_payload_json`
- `platform_metadata_json`

No Slack-only core columns should be added.

---

## Sync Frequency Assumption

For MVP:
- allow manual resync
- support recent polling-based DM sync
- do not require realtime Slack events yet

The design should leave room for later Slack Events API support without redesigning the connector framework.

---

## Idempotency and Dedupe

The Slack ingestion path must use the shared idempotency and inbound dedupe contracts.

That means:
- repeated DM sync must not create duplicate canonical messages
- repeated import of thread replies must converge to the same canonical state
- Slack must not invent a connector-only dedupe system outside the shared framework

---

## Lifecycle Interaction

When a connected Slack integration runs a DM import or resync:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

If sync fails in a connector-health-relevant way:
- transition toward `ERROR` as appropriate

Do not invent Slack-only lifecycle states.

---

## Attachment/File Handling During Ingestion

The first Slack ingestion path should:
- preserve file metadata when present
- attach file metadata to canonical attachment rows
- avoid full binary file ingestion in the first Slack implementation

---

## Explicit MVP Non-Goals

Do not build these in the first Slack ingestion step:
- public/private channel ingestion
- Slack Events API as the primary path
- broad historical import
- edit/delete synchronization as a first-class workflow
- full Slack file ingestion pipeline

---

## Acceptance Test

The Slack ingestion strategy is correct only if all of the following are true:

1. Recent Slack DMs can be fetched through a bounded sync path.
2. Slack DM and DM-thread data can feed the shared inbound pipeline.
3. Repeated sync does not create duplicate canonical messages.
4. Checkpoint metadata remains non-secret and lives in integration metadata.
5. The strategy can later add Slack Events API support without redesigning the canonical model.