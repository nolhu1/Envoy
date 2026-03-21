# Envoy Slack Connector Scope v1

## Purpose

This document locks the Slack connector scope for the Envoy MVP.

Slack is the second messaging connector after Gmail.
It must integrate through the shared connector framework and canonical conversation model without forcing Slack to behave exactly like email.

For MVP, Slack scope is intentionally narrow:
- Slack DMs only

This avoids premature complexity from public channels, private channels, and broad workspace message ingestion.

---

## Provider Choice

### Selected provider
- Slack Web API + Slack Events/OAuth app model

### Initial Slack scope
- direct messages only

### Not included in this phase
- public channels
- private channels
- Slack Connect shared channels
- multi-workspace routing complexity
- message edits/deletes beyond minimal metadata preservation
- broad channel history sync

---

## Why DMs only first

Slack differs from email in important ways:
- no email-style subject
- channel and thread semantics differ
- user identity and participant modeling differ
- bot install and token behavior differ

Starting with DMs only keeps the first Slack integration aligned with the canonical model while minimizing product and connector complexity.

---

## Auth Model

### Auth type
- Slack app OAuth install flow

### Credential handling
- bot token and related auth material stored through the shared secret storage abstraction
- integration record stores non-secret metadata and secret reference only

### Connect flow outcome
Successful install should produce:
- integration record creation or update
- external workspace/account identifier
- provider display label
- secret reference
- lifecycle state update to connected when valid

---

## Initial Slack MVP Capabilities

### 1. Connect Slack workspace
Support:
- Slack app install flow
- bot token storage through secret store
- integration record creation

### 2. Import DM conversations
Support:
- sync DM conversations for the installed workspace
- normalize DM threads/messages into canonical conversations/messages
- preserve Slack-specific thread metadata in metadata fields

### 3. Read Slack DMs in Envoy
Support:
- render DM conversation history
- show sender identity
- show thread replies when present in DM-thread scope
- preserve Slack timestamps and user identifiers in metadata

### 4. Reply from Envoy
Support:
- send outbound bot replies into Slack DMs
- reflect canonical outbound status updates
- preserve Slack thread context in metadata

---

## Canonical Mapping Assumptions

### Conversation mapping
Map Slack DM or DM-thread identity to:
- `conversations.external_conversation_id`

Slack conversations do not require email-style subjects:
- `conversations.subject = null`

Map most recent DM activity to:
- `conversations.last_message_at`

### Message mapping
Map Slack message timestamp or normalized Slack message key to:
- `messages.external_message_id`

Map Slack text to:
- `messages.body_text`

Map Slack provider timestamps to canonical timing fields.

### Participant mapping
Preserve:
- Slack user id
- display name
- handle
- team/workspace hints in metadata when useful

### Metadata
Slack-specific non-canonical details belong in:
- `raw_payload_json`
- `platform_metadata_json`

Do not add Slack-only core columns.

---

## Initial Sync Scope

### Included
- DM sync only
- recent conversation import
- thread replies inside DM scope if available
- limited recent history

### Deferred
- public channel sync
- private channel sync
- workspace-wide archive import
- advanced channel membership handling

---

## Outbound Scope

### Included
- send bot reply in existing DM conversation
- send bot reply in Slack DM thread context when needed
- canonical status updates
- safe provider diagnostics

### Deferred
- channel posting
- rich interactive Slack app features
- slash commands
- workflow builder integration
- advanced block-kit authoring beyond basic message support

---

## Attachment/File Scope

### Included
- preserve file metadata when present in DM messages
- support thread rendering of file metadata
- keep Slack-specific file detail in metadata

### Deferred
- full Slack file download/storage pipeline
- preview generation
- cross-platform file unification beyond canonical attachment metadata

---

## Lifecycle Expectations

The Slack connector must use the shared integration lifecycle:
- pending
- connected
- sync_in_progress
- error
- disconnected

It must not invent Slack-only lifecycle states.

---

## Idempotency Expectations

The Slack connector must use the shared idempotency contract for:
- event ingestion
- DM sync
- outbound replies
- retry-safe send behavior

It must not invent a separate Slack-only dedupe model outside the shared framework.

---

## Security and Workspace Rules

### Workspace boundary
- Slack integrations are workspace-scoped in Envoy
- a user from another Envoy workspace must not access or send through the Slack integration

### Secret boundary
- never store Slack bot tokens in integration metadata
- use the secret storage abstraction

### Metadata boundary
- non-secret Slack workspace, conversation, and thread detail may live in metadata fields
- do not add Slack-only core schema fields

---

## Explicit MVP Non-Goals

Do not build these in the first Slack connector phase:
- channel-wide support
- Slack Connect complexity
- message management features
- interactive app surfaces
- autonomous sending
- custom Slack workflow features

---

## Acceptance Test

The Slack connector scope is correct only if all of the following are true:

1. Slack DMs are the only Slack conversation type implemented in Phase G.
2. Slack can map into the same canonical conversation and message model as Gmail.
3. Slack-specific thread and user detail stay in metadata, not canonical schema.
4. Outbound Slack replies can later flow through the same shared outbound pipeline.
5. No Slack-only logic leaks into the shared connector framework or canonical model.