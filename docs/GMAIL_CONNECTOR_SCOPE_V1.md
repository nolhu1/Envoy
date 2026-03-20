# Envoy Gmail Connector Scope v1

## Purpose

This document locks the first real email connector scope for the Envoy MVP.

Envoy will ship email before Slack.
For MVP, Envoy will support one concrete email provider path first:
- Gmail API only

This avoids the complexity of universal IMAP/SMTP support and keeps the first connector aligned with the canonical integration framework.

---

## Provider Choice

### Selected provider
- Gmail API

### Not included in this phase
- Microsoft Graph mail
- generic IMAP
- generic SMTP
- multi-provider email abstraction beyond the shared connector framework
- custom SMTP relay support

---

## Auth Model

### Auth type
- OAuth 2.0 with Gmail/Google account connection

### Credential handling
- access token and refresh token resolved through the shared connector credential model
- secret material stored through the secret storage abstraction
- integration record stores non-secret metadata and secret reference only

### Connect flow outcome
Successful connect should produce:
- integration record creation or update
- external account identifier
- provider display label
- secret reference
- lifecycle state update to connected when valid

---

## Initial Gmail MVP Capabilities

### 1. Connect account
Support:
- OAuth connect
- token storage through secret store
- integration record creation

### 2. Import recent threads
Support:
- import recent Gmail threads after connect
- store checkpoint/cursor metadata for future incremental sync
- avoid full historical import in MVP

### 3. Read threads in Envoy
Support:
- normalize Gmail threads into canonical conversations
- normalize senders/participants
- normalize messages
- normalize attachment metadata

### 4. Reply from Envoy
Support:
- reply in an existing Gmail thread
- reflect canonical outbound status updates
- preserve provider reply/thread context in metadata

### 5. Attachment metadata
Support:
- store attachment metadata
- display attachment information in thread view
- allow later download handling
- do not build full attachment binary storage pipeline in the first Gmail connector step unless needed

---

## Gmail Thread Mapping Assumptions

### Conversation mapping
Map Gmail thread id to:
- `conversations.external_conversation_id`

Map Gmail subject to:
- `conversations.subject`

Map latest Gmail thread activity to:
- `conversations.last_message_at`

### Message mapping
Map Gmail message id to:
- `messages.external_message_id`

Map plain text body to:
- `messages.body_text`

Map HTML body to:
- `messages.body_html`

Map provider send/receive timestamps to:
- `messages.sent_at`
- `messages.received_at`

Preserve Gmail-specific thread and header detail in:
- `raw_payload_json`
- `platform_metadata_json`

This must remain aligned with the canonical message and conversation model.

---

## Initial Sync Scope

### Included
- recent thread import only
- incremental sync preparation
- limited backfill window
- thread metadata needed for unified inbox and reply

### Deferred
- full mailbox historical import
- advanced folder/label sync semantics
- archive/trash actions
- complex mailbox management
- bulk export

---

## Outbound Scope

### Included
- send reply within an existing Gmail thread
- status updates in canonical message state
- provider message id capture
- safe provider diagnostics

### Deferred
- advanced compose flows outside thread-first MVP usage
- draft sync with Gmail native drafts
- send scheduling
- alias/send-as management
- mailbox management actions

---

## Attachment Scope

### Included
- attachment metadata normalization
- file name
- MIME type
- size
- provider attachment identifiers
- thread rendering support

### Deferred
- full attachment ingestion/storage pipeline
- virus scanning
- OCR
- attachment preview generation

---

## Lifecycle Expectations

The Gmail connector must use the shared integration lifecycle:
- pending
- connected
- sync_in_progress
- error
- disconnected

It must not invent Gmail-only lifecycle states.

---

## Idempotency Expectations

The Gmail connector must use the shared idempotency contract for:
- history sync ingestion
- webhook or push ingestion if added
- outbound replies
- retry-safe sends

It must not invent its own standalone dedupe model outside the shared framework.

---

## Security and Metadata Rules

### Secrets
- never store Gmail tokens in integration metadata
- use the secret storage abstraction

### Metadata
- Gmail-specific non-secret thread or header details belong in metadata fields
- do not add Gmail-only core columns to canonical tables

### Workspace boundary
- Gmail integrations are always workspace-scoped
- a user from another workspace must not access or send through the integration

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail connector phase:
- universal email provider support
- IMAP/SMTP abstraction
- Gmail labels as first-class canonical fields
- mailbox management actions
- autonomous sending
- Gmail-native draft sync
- deep admin tooling

---

## Acceptance Test

The Gmail connector scope is correct only if all of the following are true:

1. Gmail is the only email provider implemented in Phase F.
2. A user can connect a Gmail account through OAuth.
3. Recent Gmail threads can be normalized into canonical conversations and messages.
4. A user can reply from Envoy in an existing Gmail thread.
5. Attachment metadata is preserved without polluting the canonical model.
6. No Gmail-only logic leaks into the shared connector framework or canonical schema.