# Envoy Data Model v1

## Purpose

This document describes the first production data model for the Envoy MVP.

The model is built around a normalized internal conversation layer so that multiple communication platforms can map into the same canonical structures.

For MVP, the supported source platforms are:
- Email
- Slack

The model is designed so that:
- both platforms map into the same `conversations` table
- both platforms map into the same `messages` table
- AI draft workflows route through `approval_requests`
- all major actions can be audited through `action_logs`

---

## Design Principles

1. The canonical model must remain platform-agnostic.
2. Platform-specific detail should be preserved in metadata JSON fields, not first-class core columns.
3. All customer data is workspace-scoped.
4. AI-generated outbound messages must require human approval in MVP.
5. Agent workflow records must attach cleanly to conversations and messages.

---

## Core Tables

### workspaces
Top-level tenant boundary.

Key fields:
- `id`
- `name`
- `settings_json`
- `created_at`
- `updated_at`

### users
Workspace members who act inside Envoy.

Key fields:
- `id`
- `workspace_id`
- `email`
- `name`
- `role`
- `created_at`
- `updated_at`

### integrations
Connected provider accounts or installations.

Key fields:
- `id`
- `workspace_id`
- `platform`
- `display_name`
- `external_account_id`
- `auth_type`
- `status`
- `last_synced_at`
- `config_json`
- `platform_metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

### conversations
Canonical normalized thread container.

Key fields:
- `id`
- `workspace_id`
- `integration_id`
- `platform`
- `external_conversation_id`
- `subject`
- `state`
- `assigned_agent_id`
- `last_message_at`
- `opened_at`
- `closed_at`
- `platform_metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

### participants
Normalized people or actors in a conversation.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `platform`
- `external_participant_id`
- `display_name`
- `email`
- `handle`
- `is_internal`
- `raw_payload_json`
- `platform_metadata_json`
- `created_at`
- `updated_at`

### messages
Canonical normalized message record.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `platform`
- `external_message_id`
- `sender_participant_id`
- `sender_type`
- `direction`
- `body_text`
- `body_html`
- `status`
- `sent_at`
- `received_at`
- `raw_payload_json`
- `platform_metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

### attachments
Attachment metadata linked to messages.

Key fields:
- `id`
- `workspace_id`
- `message_id`
- `platform`
- `external_attachment_id`
- `file_name`
- `mime_type`
- `size_bytes`
- `storage_key`
- `external_url`
- `platform_metadata_json`
- `created_at`
- `deleted_at`

---

## Agent Workflow Tables

### agent_assignments
Stores the operating assignment of an agent on a conversation.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `goal`
- `instructions`
- `tone`
- `allowed_actions_json`
- `escalation_rules_json`
- `assigned_by_user_id`
- `is_active`
- `created_at`
- `updated_at`
- `ended_at`

### approval_requests
Stores the approval checkpoint for AI-generated outbound drafts.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `draft_message_id`
- `proposed_by_agent_assignment_id`
- `status`
- `reviewed_by_user_id`
- `reviewed_at`
- `rejection_reason`
- `edited_content`
- `created_at`
- `updated_at`

### action_logs
Append-only audit trail for major product actions.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `message_id`
- `approval_request_id`
- `actor_type`
- `actor_user_id`
- `actor_agent_assignment_id`
- `action_type`
- `metadata_json`
- `created_at`

### conversation_facts
Structured facts extracted from a conversation for agent context.

Key fields:
- `id`
- `workspace_id`
- `conversation_id`
- `source_message_id`
- `key`
- `value_text`
- `confidence`
- `created_at`
- `updated_at`

---

## Enums

### Platform
- `EMAIL`
- `SLACK`

### IntegrationStatus
- `PENDING`
- `CONNECTED`
- `SYNCING`
- `ERROR`
- `DISCONNECTED`

### WorkspaceUserRole
- `ADMIN`
- `MEMBER`
- `VIEWER`

### ConversationState
- `UNASSIGNED`
- `ACTIVE`
- `WAITING`
- `FOLLOW_UP_DUE`
- `AWAITING_APPROVAL`
- `ESCALATED`
- `COMPLETED`
- `CLOSED`

### MessageDirection
- `INBOUND`
- `OUTBOUND`
- `INTERNAL`

### MessageStatus
- `RECEIVED`
- `DRAFT`
- `PENDING_APPROVAL`
- `APPROVED`
- `REJECTED`
- `QUEUED`
- `SENT`
- `DELIVERED`
- `FAILED`

### SenderType
- `EXTERNAL`
- `USER`
- `AGENT`
- `SYSTEM`

### ApprovalStatus
- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

### ActorType
- `USER`
- `AGENT`
- `SYSTEM`
- `INTEGRATION`

---

## Key Relationships

- a `workspace` has many `users`
- a `workspace` has many `integrations`
- an `integration` has many `conversations`
- a `conversation` has many `participants`
- a `conversation` has many `messages`
- a `message` has many `attachments`
- a `conversation` has many `agent_assignments`
- a `conversation` may point to one current `assigned_agent_id`
- an `approval_request` points to one draft `message`
- an `action_log` may point to a `message` and/or `approval_request`
- a `conversation_fact` may point to its source `message`

---

## Canonical Mapping Rules

### Email mapping
- email thread ID -> `conversations.external_conversation_id`
- email subject -> `conversations.subject`
- email message ID -> `messages.external_message_id`
- sender email/name -> `participants`
- plain text body -> `messages.body_text`
- html body -> `messages.body_html`

### Slack mapping
- Slack DM or thread key -> `conversations.external_conversation_id`
- no subject -> `conversations.subject = null`
- Slack message ID or timestamp -> `messages.external_message_id`
- Slack user ID -> `participants.external_participant_id`
- Slack text -> `messages.body_text`

---

## Metadata Strategy

Use canonical columns for cross-platform business meaning.

Use:
- `raw_payload_json`
- `platform_metadata_json`

for provider-specific detail needed for:
- debugging
- replay
- connector diagnostics
- non-canonical rendering support

Do not store provider secrets in metadata JSON.

---

## Current Deliverables Completed

Phase C implementation includes:
- Prisma schema v1
- initial migration
- generated Prisma client
- seed script with email and Slack demo data
- schema validation docs
- model design docs

---

## Phase C Acceptance Check

This data model is considered complete for MVP foundation when all of the following are true:

- email and Slack both map into the same `conversations` model
- email and Slack both map into the same `messages` model
- no core table is provider-specific
- AI draft approvals map through `approval_requests`
- audit history maps through `action_logs`
- local migration runs successfully
- seed data produces a believable multi-platform inbox state

At this point, the canonical data layer is ready for the next phase.