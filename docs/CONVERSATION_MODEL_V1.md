# Envoy Conversation Model v1

## Purpose

The `conversations` table represents the internal normalized thread model for Envoy.

It is not a direct copy of a Gmail thread, Slack thread, or any other platform-native object.
It is the canonical conversation container used by:
- inbox listing
- thread rendering
- search and filtering
- workflow state
- agent assignment
- approvals
- audit logs

A conversation must be able to represent both:
- an email thread
- a Slack DM or Slack thread

without changing the core schema.

---

## Table Name

`conversations`

---

## Required Fields

### id
- Type: UUID
- Primary key
- Internal conversation identifier

### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`
- Tenant boundary for the conversation

### integration_id
- Type: UUID
- Foreign key to `integrations.id`
- Indicates which connected account or platform integration owns the source conversation

### platform
- Type: enum
- Expected values for MVP:
  - `EMAIL`
  - `SLACK`
- Required because normalization still needs to preserve source platform identity

### external_conversation_id
- Type: string
- The provider-native thread identifier
- Examples:
  - Gmail thread ID
  - Slack DM thread key or channel-thread composite key

### subject
- Type: string nullable
- Present for email threads
- Nullable for Slack conversations that do not have a subject

### state
- Type: enum
- Workflow state of the conversation
- Suggested values:
  - `UNASSIGNED`
  - `ACTIVE`
  - `WAITING`
  - `FOLLOW_UP_DUE`
  - `AWAITING_APPROVAL`
  - `ESCALATED`
  - `COMPLETED`
  - `CLOSED`

### last_message_at
- Type: timestamp nullable
- Used for inbox ordering
- Should reflect the most recent actual message activity

### assigned_agent_id
- Type: UUID nullable
- Reference to the currently active agent assignment
- Nullable when no agent is assigned

### created_at
- Type: timestamp
- Record creation time in Envoy

### updated_at
- Type: timestamp
- Last update time for the row

---

## Recommended Additional Fields

### opened_at
- Type: timestamp nullable
- First observed or created time in Envoy

### closed_at
- Type: timestamp nullable
- Time when the conversation reached a terminal state

### deleted_at
- Type: timestamp nullable
- Soft delete support

### platform_metadata_json
- Type: JSON nullable
- Stores normalized platform-specific metadata needed for debugging, replay, or UI edge cases
- Must not replace canonical fields

---

## Foreign Keys

- `workspace_id -> workspaces.id`
- `integration_id -> integrations.id`
- `assigned_agent_id -> agent_assignments.id` nullable

---

## Constraints

### Primary Key
- `id`

### Uniqueness
- Unique on:
  - `integration_id`
  - `external_conversation_id`

This ensures that the same provider thread is not duplicated for the same integration.

### Tenant Integrity
- A conversation must belong to the same workspace as its integration

---

## Indexes

Create indexes for:
- `workspace_id, state, last_message_at`
- `integration_id`
- `platform`
- `assigned_agent_id`
- `last_message_at`

These support:
- inbox queries
- workflow filters
- assigned-agent filtering
- recent activity sorting

---

## Mapping Rules

### Email
Map email threads like this:
- Gmail thread ID -> `external_conversation_id`
- email subject -> `subject`
- latest email timestamp -> `last_message_at`
- source integration -> `integration_id`
- platform -> `EMAIL`

### Slack
Map Slack conversations like this:
- Slack DM thread key or channel-thread composite key -> `external_conversation_id`
- no subject -> `subject = null`
- latest Slack message timestamp -> `last_message_at`
- source integration -> `integration_id`
- platform -> `SLACK`

---

## Non-Goals

The `conversations` table must not:
- duplicate every platform-native field
- contain provider auth data
- contain message body data
- contain platform-specific fields that only make sense for one connector

If a field is only useful for one platform and not needed for normalized workflow behavior, it belongs in `platform_metadata_json`, not as a first-class core column.

---

## Design Test

This model is correct only if both of these are true:

1. A Gmail thread can be stored without adding email-only core columns beyond normalized metadata.
2. A Slack DM or Slack thread can be stored without adding Slack-only core columns beyond normalized metadata.

If either platform requires a separate core conversation table, the model has failed.