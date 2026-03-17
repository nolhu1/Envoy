# Envoy Message Model v1

## Purpose

The `messages` table represents the internal normalized message model for Envoy.

It is not a direct copy of a Gmail message object or a Slack message event.
It is the canonical message record used by:
- thread rendering
- inbound ingestion
- outbound sending
- approval workflows
- audit logging
- agent context building

A message must be able to represent both:
- an email message
- a Slack message

without changing the core schema.

---

## Table Name

`messages`

---

## Required Fields

### id
- Type: UUID
- Primary key
- Internal message identifier

### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`
- Stored directly for tenant-safe querying and indexing

### conversation_id
- Type: UUID
- Foreign key to `conversations.id`
- Required parent conversation

### platform
- Type: enum
- Expected values for MVP:
  - `EMAIL`
  - `SLACK`

### external_message_id
- Type: string
- Provider-native message identifier
- Examples:
  - Gmail message ID
  - Slack message timestamp or normalized message key

### sender_participant_id
- Type: UUID nullable
- Foreign key to `participants.id`
- Nullable only for rare system-generated records if needed

### sender_type
- Type: enum
- Suggested values:
  - `EXTERNAL`
  - `USER`
  - `AGENT`
  - `SYSTEM`

### direction
- Type: enum
- Suggested values:
  - `INBOUND`
  - `OUTBOUND`
  - `INTERNAL`

### body_text
- Type: text nullable
- Normalized plain text message content
- Should be filled whenever text can be extracted

### body_html
- Type: text nullable
- HTML version of content when available
- Mostly useful for email

### status
- Type: enum
- Suggested values:
  - `RECEIVED`
  - `DRAFT`
  - `PENDING_APPROVAL`
  - `APPROVED`
  - `REJECTED`
  - `QUEUED`
  - `SENT`
  - `DELIVERED`
  - `FAILED`

### sent_at
- Type: timestamp nullable
- Time message was sent to provider or intended recipient

### received_at
- Type: timestamp nullable
- Time message was received from the provider

### created_at
- Type: timestamp
- Internal Envoy record creation time

---

## Recommended Additional Fields

### updated_at
- Type: timestamp
- Last update time for the row

### deleted_at
- Type: timestamp nullable
- Soft delete support

### raw_payload_json
- Type: JSON nullable
- Raw provider payload for debugging and replay

### platform_metadata_json
- Type: JSON nullable
- Normalized provider-specific metadata that should not become first-class core columns

---

## Foreign Keys

- `workspace_id -> workspaces.id`
- `conversation_id -> conversations.id`
- `sender_participant_id -> participants.id` nullable

---

## Constraints

### Primary Key
- `id`

### Uniqueness
- Unique on:
  - `conversation_id`
  - `external_message_id`

This prevents duplicate ingestion of the same provider message into the same canonical conversation.

### Tenant Integrity
- A message must belong to the same workspace as its parent conversation.

---

## Indexes

Create indexes for:
- `conversation_id, created_at`
- `workspace_id, status`
- `workspace_id, direction`
- `sender_participant_id`
- `external_message_id`

These support:
- thread ordering
- approval queue queries
- send pipeline queries
- participant-based retrieval
- idempotent message ingestion

---

## Mapping Rules

### Email
Map email messages like this:
- Gmail message ID -> `external_message_id`
- sender identity -> `sender_participant_id`
- inbound email -> `direction = INBOUND`
- outbound reply -> `direction = OUTBOUND`
- plain text email body -> `body_text`
- HTML email body -> `body_html`
- provider receive time -> `received_at`
- provider send time -> `sent_at`
- platform -> `EMAIL`

### Slack
Map Slack messages like this:
- Slack message timestamp or normalized message key -> `external_message_id`
- Slack user -> `sender_participant_id`
- inbound DM from outside actor -> `direction = INBOUND`
- outbound Envoy reply -> `direction = OUTBOUND`
- Slack text -> `body_text`
- no HTML required -> `body_html = null`
- Slack event timestamp -> `received_at` or normalized event time
- platform -> `SLACK`

---

## Direction Rules

### INBOUND
Use when the message comes into Envoy from the outside platform.

Examples:
- external email received
- Slack DM received

### OUTBOUND
Use when a human user or approved AI draft is sent out through a connected integration.

Examples:
- user replies from Envoy
- approved AI draft is sent

### INTERNAL
Use only for non-platform-visible internal records if needed later.
Avoid using this in MVP unless there is a clear workflow reason.

---

## Status Rules

### RECEIVED
Inbound message successfully ingested.

### DRAFT
Draft exists but has not been submitted for approval or send.

### PENDING_APPROVAL
AI-generated outbound draft is waiting for human review.

### APPROVED
Draft approved for sending.

### REJECTED
Draft rejected and will not be sent as-is.

### QUEUED
Approved outbound message is queued for send.

### SENT
Outbound message was handed off successfully to the provider.

### DELIVERED
Optional provider-confirmed delivery state if available.

### FAILED
Outbound send failed.

---

## Non-Goals

The `messages` table must not:
- store provider auth data
- store attachment binaries directly
- contain email-only or Slack-only first-class columns unless they are truly canonical
- become a dumping ground for connector-specific fields

If a field is useful only for one platform and not needed for cross-platform workflow behavior, put it in `platform_metadata_json`.

---

## Design Test

This model is correct only if both of these are true:

1. An email message with both plain text and HTML can be stored without adding email-only core columns beyond normalized metadata.
2. A Slack message can be stored without adding Slack-only core columns beyond normalized metadata.

If either platform requires a separate core message table, the model has failed.