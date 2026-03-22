# Envoy Core Platform



---

> Source: `docs/DATA_MODEL_V1.md`

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

---

> Source: `docs/SCHEMA_CONTRACTS.md`

# Envoy Schema Contracts v1

## Global Rules

### IDs
- All primary keys use UUID strings.
- Every table has a single `id` primary key.

### Tenant Boundaries
- Envoy is workspace-scoped.
- Customer data must belong to exactly one workspace, either directly or through a parent record.

### Timestamps
- Every table includes:
  - `created_at`
  - `updated_at`

### Soft Delete Policy
- Core mutable records use:
  - `deleted_at nullable`
- Audit-style records are immutable and are not soft deleted.

### Source Platform Fields
- Platform-specific external identifiers must be preserved.
- Raw payloads and normalized metadata must be preserved for debugging and replay.

### Naming
- Use snake_case at the database level.
- Use singular model names in ORM if needed.

---

## Entity Contracts

### Workspace
- Primary key: `id`
- Tenant root: yes
- Foreign keys: none
- Timestamps: yes
- Soft delete: no
- Platform fields: none
- Status enums: none

### User
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
- Timestamps: yes
- Soft delete: optional, not required for v1
- Platform fields: none
- Status enums:
  - role enum later in auth phase

### Integration
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
- Timestamps: yes
- Soft delete: yes
- Platform fields:
  - `platform`
  - `external_account_id`
  - `platform_metadata_json`
- Status enums:
  - integration status

### Conversation
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `integration_id -> integrations.id`
- Timestamps: yes
- Soft delete: yes
- Platform fields:
  - `platform`
  - `external_conversation_id`
  - `platform_metadata_json`
- Status enums:
  - conversation state

### Participant
- Primary key: `id`
- Belongs to workspace: indirectly through conversation, but store `workspace_id` directly for query simplicity
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
- Timestamps: yes
- Soft delete: no for v1
- Platform fields:
  - `platform`
  - `external_participant_id`
  - `raw_payload_json`
  - `platform_metadata_json`
- Status enums: none

### Message
- Primary key: `id`
- Belongs to workspace: indirectly through conversation, but store `workspace_id` directly for query simplicity
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
  - `sender_participant_id -> participants.id`
- Timestamps: yes
- Soft delete: yes
- Platform fields:
  - `platform`
  - `external_message_id`
  - `raw_payload_json`
  - `platform_metadata_json`
- Status enums:
  - sender type
  - direction
  - message status

### Attachment
- Primary key: `id`
- Belongs to workspace: indirectly through message, but store `workspace_id` directly
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `message_id -> messages.id`
- Timestamps: yes
- Soft delete: yes
- Platform fields:
  - `platform`
  - `external_attachment_id`
  - `platform_metadata_json`
- Status enums: none

### AgentAssignment
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
  - `assigned_by_user_id -> users.id`
- Timestamps: yes
- Soft delete: no, use `ended_at`
- Platform fields: none
- Status enums:
  - active/inactive can be handled by `is_active`

### ApprovalRequest
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
  - `draft_message_id -> messages.id`
  - `reviewed_by_user_id -> users.id`
- Timestamps: yes
- Soft delete: no
- Platform fields: none
- Status enums:
  - approval status

### ActionLog
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
  - `message_id -> messages.id nullable`
  - `approval_request_id -> approval_requests.id nullable`
- Timestamps:
  - `created_at`
- Soft delete: no
- Platform fields:
  - optional metadata only
- Status enums:
  - actor type
  - action type as enum or constrained string

### ConversationFact
- Primary key: `id`
- Belongs to workspace: yes
- Foreign keys:
  - `workspace_id -> workspaces.id`
  - `conversation_id -> conversations.id`
  - `source_message_id -> messages.id nullable`
- Timestamps: yes
- Soft delete: no
- Platform fields: none
- Status enums: none

---

> Source: `docs/WORKSPACE_MODEL_V1.md`

# Envoy Workspace Model v1

## Purpose

This document defines the workspace ownership and membership model for the Envoy MVP.

Envoy is a workspace-scoped application.
All business data belongs to a workspace.
Users act inside exactly one workspace in MVP.

This model is designed to support:
- tenant isolation
- team collaboration
- invitations
- role-based authorization
- workspace-scoped integrations and conversations

---

## Core Rules

### 1. Workspace is the tenant boundary
A workspace is the top-level owner of customer data.

All of the following belong to a workspace:
- users
- integrations
- conversations
- participants
- messages
- attachments
- agent assignments
- approval requests
- action logs
- conversation facts

### 2. MVP membership model
In MVP, each user belongs to exactly one workspace.

That means:
- one `User` row maps to one workspace
- a user cannot switch between multiple workspaces in v1 unless the data model changes later
- workspace switching UI is not required for true multi-workspace tenancy in MVP

### 3. Signup behavior
When a new user signs up directly:
- a new workspace is created automatically
- the new user becomes the first member of that workspace
- the new user role is `ADMIN`

This is a temporary MVP onboarding path and may later be replaced with a more explicit onboarding flow.

### 4. Invitation behavior
An existing workspace admin can invite another user into the workspace.

The invited user:
- is created inside the inviter’s workspace
- receives one role on entry:
  - `ADMIN`
  - `MEMBER`
  - `VIEWER`

### 5. Workspace switching
For MVP v1:
- true multi-workspace switching is not supported
- if a workspace switcher UI exists, it should only reflect the currently active single workspace or remain hidden

### 6. Data access
A user may only access data where:
- `resource.workspace_id == session.user.workspaceId`

This rule applies to:
- page loads
- API routes
- server actions
- background actions initiated on behalf of a user

---

## Workspace Creation Paths

### Path A — Direct sign-up
1. user submits sign-up form
2. system creates workspace
3. system creates user linked to that workspace
4. user becomes `ADMIN`
5. session starts inside that workspace

### Path B — Invite acceptance
1. workspace admin creates invite
2. invited user accepts invite
3. system creates user inside inviter workspace
4. invited user gets assigned role
5. session starts inside that workspace

---

## Roles in the workspace

### ADMIN
Can:
- manage workspace settings
- invite members
- manage member roles
- connect integrations
- send messages
- approve AI drafts
- assign agents
- view audit logs

### MEMBER
Can:
- send messages
- approve AI drafts if allowed by policy
- assign agents if allowed by policy
- view normal workspace data

### VIEWER
Can:
- view permitted workspace data
- not send messages
- not connect integrations
- not approve drafts
- not assign agents

Final permission mapping is defined separately in RBAC documentation.

---

## Integration ownership

Integrations are always scoped to a workspace.

That means:
- a Gmail integration belongs to one workspace
- a Slack integration belongs to one workspace
- conversations imported through that integration belong to the same workspace

A user from another workspace must never access or send through that integration.

---

## Current MVP decisions

For v1:
- `User.workspaceId` is required
- single-workspace membership is the supported model
- direct sign-up creates a workspace automatically
- invite flows will add users into an existing workspace
- all route and query protection must be workspace-based

---

## Non-Goals

This version does not support:
- multi-workspace membership for one user
- organization hierarchies
- cross-workspace shared inboxes
- enterprise tenant management
- workspace transfer between owners

---

## Acceptance Test

This model is correct only if all of the following are true:

1. A newly signed-up user always lands in a valid workspace.
2. Every authenticated user session has exactly one workspace ID.
3. Every workspace-scoped resource can be filtered by `workspaceId`.
4. A user from workspace A cannot access workspace B data.
5. Integrations, conversations, and approvals remain workspace-scoped.

---

> Source: `docs/RBAC_POLICY_V1.md`

# Envoy RBAC Policy v1

## Purpose

This document defines the role-based access control policy for the Envoy MVP.

Envoy is workspace-scoped.
Permissions apply only within the user’s current workspace.

RBAC decisions must be enforced in:
- server-rendered pages
- server actions
- API routes
- background actions initiated on behalf of a user where applicable

---

## Roles

### ADMIN
Full workspace operator for MVP.

### MEMBER
Standard operator inside a workspace.

### VIEWER
Read-only user for MVP.

---

## Core Rule

A role check is never enough by itself.

A user may perform an action only if both are true:
1. the resource belongs to `session.user.workspaceId`
2. the user’s role permits the action

---

## MVP Permissions

### 1. Connect integrations
Description:
- connect Gmail
- connect Slack
- disconnect integrations
- resync integrations
- view integration management settings

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 2. Send messages
Description:
- manually send outbound messages from Envoy
- reply in existing conversations
- submit approved drafts for send when allowed by workflow

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

---

### 3. Approve AI drafts
Description:
- approve pending AI-generated drafts
- reject pending AI-generated drafts
- edit draft content before approval if allowed by product flow

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

Note:
This is the MVP default policy.
If approval authority needs tightening later, it can become admin-only or policy-based.

---

### 4. Assign agents
Description:
- assign an agent to a conversation
- update agent goal or instructions
- remove or end an agent assignment

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

---

### 5. View audit logs
Description:
- read action logs
- inspect approval history
- inspect agent activity history

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 6. Invite team members
Description:
- create workspace invites
- view pending invites

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 7. View workspace settings
Description:
- view workspace settings page
- view workspace metadata

Allowed roles:
- ADMIN
- MEMBER
- VIEWER

---

### 8. View members
Description:
- view workspace members list

Allowed roles:
- ADMIN
- MEMBER
- VIEWER

---

## Permission Matrix

| Action | ADMIN | MEMBER | VIEWER |
|---|---|---|---|
| View workspace settings | Yes | Yes | Yes |
| View members | Yes | Yes | Yes |
| Create invites | Yes | No | No |
| View pending invites | Yes | No | No |
| Connect integrations | Yes | No | No |
| Disconnect integrations | Yes | No | No |
| Send messages | Yes | Yes | No |
| Approve AI drafts | Yes | Yes | No |
| Assign agents | Yes | Yes | No |
| View audit logs | Yes | No | No |

---

## Enforcement Rules

### Rule 1 — Workspace boundary first
Before any role check, confirm the current user belongs to the same workspace as the resource.

### Rule 2 — Server-side enforcement required
RBAC must be enforced on the server.
UI hiding is not sufficient.

### Rule 3 — Deny by default
If an action is not explicitly allowed for a role, deny it.

### Rule 4 — Viewer is read-only
VIEWER must not be able to mutate workspace data.

### Rule 5 — Admin-only workspace management
Workspace-level management actions are admin-only in MVP.

---

## Initial Implementation Shape

The RBAC layer should provide:
- a normalized app auth context
- a role-to-permission mapping
- helpers like:
  - `hasPermission(role, permission)`
  - `requirePermission(permission)`
  - `canAccessWorkspaceResource(workspaceId)`

Permission checks should be reusable across:
- pages
- server actions
- route handlers

---

## Non-Goals

This version does not support:
- custom roles
- per-user exceptions
- per-conversation ACLs
- attribute-based access control
- multi-workspace permission overlays

---

## Acceptance Test

The RBAC model is correct only if all of the following are true:

1. A VIEWER cannot send messages.
2. A VIEWER cannot approve drafts.
3. A VIEWER cannot assign agents.
4. A MEMBER cannot connect integrations.
5. A MEMBER cannot create invites.
6. A MEMBER cannot view audit logs.
7. An ADMIN can perform all MVP workspace management actions.
8. No role can access data from another workspace.

---

> Source: `docs/INTEGRATION_LIFECYCLE_V1.md`

# Envoy Integration Lifecycle v1

## Purpose

This document defines the lifecycle contract for connector integrations in the Envoy MVP.

An integration represents a connected provider account or installation inside a workspace, such as:
- a Gmail account
- a Slack workspace/app installation

The lifecycle contract exists so that:
- all connectors follow the same status model
- the UI can represent connector state consistently
- background sync and send logic can react to integration health
- auth failures and reconnect flows behave predictably
- provider-specific logic stays inside connectors while lifecycle behavior remains shared

---

## Canonical Integration Owner

Integrations are workspace-scoped resources.

Each integration belongs to exactly one workspace and must never be accessible from another workspace.

Key canonical fields already defined in the data model include:
- `id`
- `workspace_id`
- `platform`
- `external_account_id`
- `status`
- `last_synced_at`
- `config_json`
- `platform_metadata_json`
- `deleted_at`

The integration lifecycle operates through the canonical `status` field and related timestamps/metadata.

---

## MVP Integration States

### PENDING
Meaning:
- the integration has been initiated but is not yet fully usable

Examples:
- OAuth flow started but not completed
- credential submission received but not yet validated
- integration record created before first successful sync

What is allowed:
- connect completion
- auth validation
- initial metadata write
- transition to `CONNECTED`
- transition to `ERROR`

What is not allowed:
- normal inbound sync processing
- outbound message sending

---

### CONNECTED
Meaning:
- the integration is active and available for normal use

Examples:
- valid auth exists
- connector can sync or send
- integration is visible as healthy in settings

What is allowed:
- inbound sync
- webhook ingestion
- outbound send
- refresh auth
- transition to `SYNC_IN_PROGRESS`
- transition to `ERROR`
- transition to `DISCONNECTED`

What is not allowed:
- nothing special beyond normal workspace and permission boundaries

---

### SYNC_IN_PROGRESS
Meaning:
- the integration is currently running an initial sync, backfill, resync, or incremental sync job

Examples:
- recent threads are being imported after connect
- manual resync started
- background sync currently running

What is allowed:
- sync job execution
- cursor/checkpoint updates
- transition back to `CONNECTED`
- transition to `ERROR`
- possibly outbound send if auth is still valid and product policy allows it

MVP recommendation:
- treat this as an operational state, not a disabled state
- outbound sending may remain allowed if connector auth is valid

What is not allowed:
- duplicate overlapping sync jobs for the same integration unless explicitly designed

---

### ERROR
Meaning:
- the integration is not healthy enough for normal operation

Examples:
- auth refresh failed
- webhook verification failed repeatedly
- provider rejected credentials
- sync job failed in a non-transient way
- connector configuration is invalid

What is allowed:
- reconnect flow
- credential refresh
- retry after fix
- transition to `CONNECTED`
- transition to `DISCONNECTED`

What is not allowed:
- silent normal operation
- pretending the connector is healthy in the UI
- uncontrolled retry loops

Operational note:
- the error reason should be preserved in connector diagnostics or metadata, but not as provider secrets

---

### DISCONNECTED
Meaning:
- the integration is intentionally disconnected or has been made inactive

Examples:
- user removed the integration
- token was revoked and integration was closed
- connector is no longer authorized to operate

What is allowed:
- historical data remains readable
- reconnect or reconnect-like replacement flow
- transition to `PENDING` or `CONNECTED` only through an explicit reconnect flow

What is not allowed:
- inbound processing
- outbound sending
- sync scheduling

---

## Allowed State Transitions

### Allowed transitions

- `PENDING -> CONNECTED`
- `PENDING -> ERROR`

- `CONNECTED -> SYNC_IN_PROGRESS`
- `CONNECTED -> ERROR`
- `CONNECTED -> DISCONNECTED`

- `SYNC_IN_PROGRESS -> CONNECTED`
- `SYNC_IN_PROGRESS -> ERROR`
- `SYNC_IN_PROGRESS -> DISCONNECTED`

- `ERROR -> CONNECTED`
- `ERROR -> DISCONNECTED`

- `DISCONNECTED -> PENDING`
- `DISCONNECTED -> CONNECTED` only through explicit reconnect logic if supported cleanly

### Disallowed transitions

Examples of disallowed direct transitions:
- `PENDING -> DISCONNECTED` without explicit cancellation or teardown logic
- `DISCONNECTED -> SYNC_IN_PROGRESS`
- `ERROR -> SYNC_IN_PROGRESS` without first restoring connector health
- any transition that bypasses auth validation when auth is required

---

## Transition Triggers

### Connect started
Typical result:
- create or update integration in `PENDING`

### Connect completed successfully
Typical result:
- write external account metadata
- store secret reference
- transition to `CONNECTED`

### Initial backfill or manual resync started
Typical result:
- transition to `SYNC_IN_PROGRESS`

### Sync completed successfully
Typical result:
- update `last_synced_at`
- update cursor/checkpoint metadata
- transition to `CONNECTED`

### Auth refresh failure or provider auth invalid
Typical result:
- transition to `ERROR`

### Recoverable error resolved
Typical result:
- refresh auth or reconnect
- transition to `CONNECTED`

### User disconnects integration
Typical result:
- revoke tokens if supported
- stop jobs/webhook use
- transition to `DISCONNECTED`

---

## Lifecycle Metadata Expectations

The shared lifecycle service should support updating these integration-adjacent fields where relevant:

### status
Canonical lifecycle status.

### last_synced_at
Updated when a sync finishes successfully.

### config_json
Stores connector configuration that is not secret and is product-relevant.

Examples:
- sync preferences
- selected scope modes
- connector options

### platform_metadata_json
Stores provider-specific non-secret lifecycle detail.

Examples:
- provider display name
- provider workspace label
- webhook registration metadata
- last cursor/checkpoint
- sync diagnostics
- last known error code/category
- reconnect hints

### deleted_at
Used only for soft deletion behavior if you later add it to operational disconnect/archive flows.
Do not use `deleted_at` as the main lifecycle control in MVP.
Use `status`.

---

## Lifecycle Rules

### Rule 1 — Workspace boundary first
Any lifecycle operation must be executed only within the integration’s owning workspace.

### Rule 2 — Status drives operational eligibility
Inbound sync, webhook processing, and outbound send behavior must check integration status before proceeding.

### Rule 3 — Error is explicit
If the integration is unhealthy, status must reflect that.
Do not hide failures inside metadata only.

### Rule 4 — Disconnect preserves history
Disconnecting an integration must not delete historical conversations or messages already normalized into Envoy.

### Rule 5 — Sync state is operational, not ownership-related
`SYNC_IN_PROGRESS` reflects connector activity, not a different tenancy or permission model.

### Rule 6 — Secret material stays outside metadata JSON
Lifecycle state may reference secret storage indirectly, but tokens and secrets must not be stored in `platform_metadata_json`.

---

## Connector Responsibilities vs Shared Lifecycle Responsibilities

### Connector responsibilities
- provider auth exchange
- provider revoke logic
- provider sync calls
- provider send calls
- provider-specific diagnostics

### Shared lifecycle service responsibilities
- status transitions
- transition validation
- last synced bookkeeping
- shared error state handling
- preventing invalid transitions
- giving the UI a stable status model

---

## UI Expectations

The product UI should be able to represent integrations consistently using this lifecycle:

### PENDING
- “Connecting” or “Setup in progress”

### CONNECTED
- “Connected”

### SYNC_IN_PROGRESS
- “Syncing”

### ERROR
- “Needs attention” or “Connection error”

### DISCONNECTED
- “Disconnected”

The UI should not need provider-specific logic just to understand connector health.

---

## Acceptance Test

The lifecycle contract is correct only if all of the following are true:

1. Every integration fits one shared status model.
2. Gmail can use this lifecycle without needing Gmail-only status values.
3. Slack can use this lifecycle without needing Slack-only status values.
4. The UI can represent connector health from the shared status field.
5. A connector can fail auth, recover, sync, and disconnect without changing core conversation logic.

---

> Source: `docs/CREDENTIAL_HANDLING_V1.md`

# Envoy Credential Handling v1

## Purpose

This document defines the credential handling contract for connector integrations in the Envoy MVP.

The credential handling layer exists so that:
- connector auth material is stored safely
- connectors can refresh credentials without leaking secrets into business tables
- integrations can reconnect or rotate credentials cleanly
- connector-specific auth formats remain isolated from the canonical data model

This contract applies to:
- OAuth-based connectors
- API-token-based connectors
- future credential-based connectors

---

## Core Rules

### 1. Secrets do not live in canonical metadata JSON
The following must never be stored in:
- `platform_metadata_json`
- `raw_payload_json`
- `config_json`

Examples:
- access tokens
- refresh tokens
- client secrets
- private API keys
- webhook signing secrets

### 2. Integrations store references, not raw secrets
The `integrations` table should store:
- provider identity
- status
- non-secret config
- non-secret lifecycle metadata
- a secret reference or secret handle if needed

It should not store raw credential values directly unless there is a temporary MVP fallback that is explicitly isolated and encrypted.

### 3. Connectors receive resolved auth material through runtime context
Connector code should not query random DB fields for tokens.
Instead, connector runtime should receive auth material through a structured `ConnectorContext`.

### 4. Refresh is a first-class connector operation
Credential refresh must be handled through `refreshAuth()` and not mixed into normal send or sync logic except when operationally required.

### 5. Rotation must be supported without changing core conversation logic
Credential replacement or reconnection must update integration auth state without affecting canonical messages or conversations.

---

## Credential Types

### OAuth credentials
Typical fields:
- access token
- refresh token
- token expiry
- granted scopes
- provider account identifier

Examples:
- Gmail OAuth
- Slack OAuth

### Static API credentials
Typical fields:
- API key
- token label
- optional signing secret

Examples:
- future connectors with API-key auth

### Webhook secrets
Typical fields:
- signing secret
- verification token

These are connector secrets and must be stored like other secret material, not in metadata JSON.

---

## Canonical Integration Storage Responsibilities

The `integrations` table is the canonical integration owner and should store non-secret connector state such as:
- `workspace_id`
- `platform`
- `external_account_id`
- `status`
- `auth_type`
- `last_synced_at`
- `config_json`
- `platform_metadata_json`  [oai_citation:1‡DATA_MODEL_V1.md](sediment://file_00000000eb44722f911c7913e2821476)

### What belongs in config_json
Only non-secret product-relevant connector configuration.

Examples:
- selected sync mode
- enabled scopes summary
- import options
- rate-limit preference hints
- connector mode toggles

### What belongs in platform_metadata_json
Only non-secret provider-specific operational metadata.

Examples:
- provider display name
- provider workspace label
- webhook registration status
- last sync cursor
- auth error category
- reconnect hint
- token expiry timestamp summary if non-sensitive

### What does not belong in integration records
- access token
- refresh token
- raw OAuth response
- client secret
- webhook signing secret

---

## Secret Storage Contract

### Secret store responsibility
Use a dedicated secret storage layer separate from normal app business tables.

For MVP this may start as:
- an encrypted secret store table or service
- or a provider secret manager abstraction

The interface must allow later replacement without rewriting connector logic.

### Minimum secret store capabilities
The secret store layer must support:
- create secret
- read secret
- update secret
- rotate secret
- revoke or delete secret
- versioning or replacement metadata if possible

### Secret reference shape
Integrations should store a reference such as:
- `secretRef`
- `credentialHandle`
- `authMaterialRef`

This reference points to the secret store entry and is used to resolve auth material at runtime.

---

## Runtime Credential Resolution

### ConnectorContext requirement
`ConnectorContext` should contain either:
- a secret reference that can be resolved before connector execution
- or already-resolved auth material injected by the calling service

Recommended fields:
- workspaceId
- integrationId
- platform
- integration metadata
- config
- secret reference
- resolved auth material when needed

### Runtime rule
Connector methods should operate on structured auth material passed through context, not direct DB token access.

This keeps:
- connector code testable
- auth refresh isolated
- secret storage replaceable

---

## Refresh Token Flow

### When refresh should happen
Refresh may be triggered when:
- token expiry is near
- provider returns an auth-expired response
- a scheduled maintenance job refreshes credentials
- reconnect logic requires replacement auth

### Refresh flow
1. load integration and confirm lifecycle allows refresh
2. resolve current auth material from secret storage
3. call connector `refreshAuth()`
4. receive updated auth material
5. update the secret store entry
6. update integration lifecycle metadata if needed
7. if refresh fails, move integration toward `ERROR` state

### Refresh outputs
Connector refresh should return:
- updated auth material
- new expiry time if available
- refresh outcome
- provider diagnostics safe for metadata storage

---

## Rotation and Reconnect

### Rotation
Rotation means replacing current credential material without changing workspace ownership or canonical history.

Examples:
- user reconnects Google account
- user re-installs Slack app
- API key is replaced

### Rotation rules
- do not create a duplicate integration if the same external account is being repaired
- preserve integration ownership where appropriate
- preserve conversation history
- update secret reference or secret version cleanly
- write operational diagnostics, not raw secrets, into metadata

### Reconnect
Reconnect may transition integration state from:
- `ERROR -> CONNECTED`
- `DISCONNECTED -> PENDING`
- `DISCONNECTED -> CONNECTED`
depending on provider flow and lifecycle rules  [oai_citation:2‡INTEGRATION_LIFECYCLE_V1.md](sediment://file_00000000686c71f896a517665a3a02c6)

---

## Connector-Specific Config Storage

Connector-specific config is allowed, but it must remain non-secret.

Examples:
- Gmail import label filters
- Slack selected channel scope mode
- webhook enabled flag
- sync window size
- backfill enabled flag

Store this in `config_json`, not in secrets storage.

Rule:
If config value grants access or authenticates the connector, it is a secret.
If config value changes behavior but does not authenticate, it can live in `config_json`.

---

## Credential Error Handling

### Auth-related failures should produce:
- clear connector diagnostics
- lifecycle status updates
- reconnect hints when possible

### Safe metadata examples
Allowed:
- `auth_error_category = "token_expired"`
- `reauth_required = true`
- `last_auth_failure_at = timestamp`

Not allowed:
- raw provider auth payloads containing secrets
- token strings
- secret fragments

---

## Recommended Internal Types

The codebase should eventually define stable internal auth material types such as:

### OAuthAuthMaterial
- accessToken
- refreshToken
- expiresAt
- scopes
- tokenType
- providerAccountId

### ApiKeyAuthMaterial
- apiKey
- keyLabel
- optional secret extras

### WebhookSecretMaterial
- signingSecret
- verificationToken

These types belong in connector/auth infrastructure, not in canonical business schema.

---

## Anti-Patterns

Do not do any of these:

1. Store access tokens in `platform_metadata_json`.
2. Store refresh tokens in `config_json`.
3. Make connectors fetch tokens directly from business tables.
4. Hardcode one provider’s token shape into shared framework code.
5. Mix token refresh logic into unrelated normalization code.
6. Replace integrations by deleting and recreating them when simple reconnect or rotation should suffice.

---

## Acceptance Test

The credential handling contract is correct only if all of the following are true:

1. Gmail OAuth can be supported without storing tokens in canonical metadata.
2. Slack OAuth can be supported without storing tokens in canonical metadata.
3. Connectors can receive resolved auth material through shared runtime context.
4. Credential refresh can update auth material without changing core conversation logic.
5. Reconnect or rotation can recover an integration without deleting historical data.

---

> Source: `docs/CONNECTOR_INTERFACE_V1.md`

# Envoy Connector Interface v1

## Purpose

This document defines the base interface that every platform connector must implement in the Envoy MVP.

The connector interface exists so that:
- new platforms can be added without changing core conversation logic
- inbound and outbound flows follow one standard architecture
- authentication, normalization, and provider-specific behavior remain isolated inside connector packages
- the canonical Envoy data model remains platform-agnostic

This interface applies to initial MVP connectors:
- Email
- Slack

It should also be reusable for future connectors.

---

## Design Rules

1. Connectors must not write platform-specific fields into core canonical tables beyond approved metadata fields.
2. Connectors must normalize provider data into the canonical `Conversation`, `Participant`, `Message`, and `Attachment` model.
3. Connectors must preserve source payload detail needed for debugging and replay through:
   - `rawPayloadJson`
   - `platformMetadataJson`
4. Connector methods should return normalized shapes or connector-specific intermediate payloads, not raw business-layer side effects hidden inside the method.
5. All important connector actions should be compatible with later event emission.

---

## Core Interface

Each connector must implement the following methods.

### connect(input)
Purpose:
- establish a new integration connection for a workspace

Responsibilities:
- validate the auth input
- exchange OAuth code or validate provided credentials
- return enough connector data to create or update an `Integration` record
- never write secrets into canonical business tables directly

Typical inputs:
- workspaceId
- authCode or credential payload
- redirect URI if OAuth-based
- connector-specific config

Typical outputs:
- external account identifier
- display label
- auth material for secret storage
- initial integration status
- provider metadata

---

### disconnect(input)
Purpose:
- disconnect an existing integration safely

Responsibilities:
- revoke tokens if supported
- mark integration disconnected
- stop future sync or webhook processing
- preserve historical conversation and message data

Typical inputs:
- integrationId
- workspaceId

Typical outputs:
- disconnect result
- updated status
- optional revoke metadata

---

### refreshAuth(input)
Purpose:
- refresh expired or expiring connector credentials

Responsibilities:
- use refresh token or equivalent provider mechanism
- return updated auth material for secret storage
- report auth failure clearly
- avoid mixing auth refresh logic with message sync logic

Typical inputs:
- integration identity
- stored auth material reference

Typical outputs:
- refreshed auth material
- expiry data
- refresh status

---

### ingestWebhook(input)
Purpose:
- accept and parse an inbound provider webhook or event payload

Responsibilities:
- validate source authenticity if the provider supports signatures
- parse provider payload
- extract event identity for dedupe
- produce normalized ingestion candidates for the standard inbound pipeline

Typical inputs:
- integration context
- request headers
- raw request body

Typical outputs:
- event type
- external event id if available
- normalized message or conversation candidates
- raw payload for storage or diagnostics

---

### syncHistory(input)
Purpose:
- backfill or incrementally sync historical messages and conversations

Responsibilities:
- fetch recent history from the provider
- support checkpoint or cursor-based sync
- return normalized ingestion candidates
- avoid full historical sync in MVP unless explicitly requested

Typical inputs:
- integration context
- checkpoint cursor
- sync window parameters

Typical outputs:
- normalized conversation/message batches
- next cursor
- sync diagnostics

---

### sendMessage(input)
Purpose:
- send a canonical outbound Envoy message through the provider

Responsibilities:
- convert canonical outbound message into provider payload
- send through provider API
- return provider identifiers and delivery metadata
- report failures in a way the outbound pipeline can retry safely

Typical inputs:
- integration context
- canonical message
- canonical conversation context
- provider-specific thread metadata when needed

Typical outputs:
- external message id
- send timestamp
- delivery or acceptance metadata
- provider response metadata

---

### fetchConversation(input)
Purpose:
- fetch one provider-native conversation or thread on demand

Responsibilities:
- retrieve provider thread detail
- support thread refresh or troubleshooting flows
- normalize or prepare normalized records for re-ingestion

Typical inputs:
- integration context
- external conversation id

Typical outputs:
- provider-native conversation payload
- normalized conversation
- normalized participants
- normalized messages

---

### normalizeConversation(input)
Purpose:
- convert provider-native conversation/thread data into the canonical Envoy conversation shape

Responsibilities:
- map provider thread identity to:
  - `externalConversationId`
  - `platform`
  - `subject`
  - `lastMessageAt`
  - `platformMetadataJson`
- avoid adding connector-only core columns

Output must align with the canonical `Conversation` model.

---

### normalizeMessage(input)
Purpose:
- convert provider-native message data into the canonical Envoy message shape

Responsibilities:
- map provider message identity to:
  - `externalMessageId`
  - `senderParticipantId` or participant candidate
  - `direction`
  - `bodyText`
  - `bodyHtml`
  - `status`
  - `sentAt`
  - `receivedAt`
  - `rawPayloadJson`
  - `platformMetadataJson`

Output must align with the canonical `Message` model.

---

## Recommended Supporting Methods

These are not strictly required in the initial base interface, but the framework should leave room for them.

### normalizeParticipant(input)
Purpose:
- normalize provider-native actor data into the canonical participant shape

### normalizeAttachment(input)
Purpose:
- normalize provider file or attachment metadata into the canonical attachment shape

### validateWebhookSignature(input)
Purpose:
- verify webhook authenticity before ingestion when supported

### mapOutboundThreadContext(input)
Purpose:
- derive provider-specific reply threading payload from canonical conversation/message context

### getRateLimitPolicy()
Purpose:
- expose connector-specific rate-limit hints to the shared retry/send framework

---

## Standard Input Contracts

The connector package should use stable internal DTOs rather than ad hoc raw objects.

Suggested shared input shapes:

### ConnectorContext
- workspaceId
- integrationId
- platform
- integration metadata
- secret reference or resolved auth material
- connector config

### WebhookInput
- headers
- rawBody
- receivedAt
- connectorContext

### SyncInput
- connectorContext
- cursor
- startedAt
- windowStart
- windowEnd

### OutboundSendInput
- connectorContext
- conversation
- message
- approval context if relevant
- idempotency token

---

## Standard Output Contracts

The framework should standardize outputs so the inbound and outbound pipelines do not need connector-specific branching.

### ConnectResult
- externalAccountId
- displayName
- integrationStatus
- authMaterial
- platformMetadata

### IngestionBatch
- externalEventId
- conversations[]
- participants[]
- messages[]
- attachments[]
- diagnostics

### SendResult
- externalMessageId
- providerAcceptedAt
- deliveryState
- platformMetadata
- rawProviderResponse

### SyncResult
- ingestionBatch
- nextCursor
- diagnostics

---

## Canonical Alignment Rules

Connector output must align with the existing Envoy canonical model:

### Conversations
Use canonical fields such as:
- `workspace_id`
- `integration_id`
- `platform`
- `external_conversation_id`
- `subject`
- `state`
- `last_message_at`
- `platform_metadata_json`  [oai_citation:7‡DATA_MODEL_V1.md](sediment://file_00000000eb44722f911c7913e2821476)

### Messages
Use canonical fields such as:
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

### Metadata
Provider-specific details belong in metadata fields, not new core columns. Secrets must not be stored in metadata JSON. 

---

## Non-Goals

This interface does not:
- define provider OAuth setup details
- define the shared retry engine
- define secret manager implementation
- define event bus implementation
- define UI behavior

Those are covered in later framework steps.

---

## Acceptance Test

The connector interface is correct only if all of the following are true:

1. Gmail can implement it without changing core conversation logic.
2. Slack can implement it without changing core conversation logic.
3. Inbound webhooks and historical sync can both feed the same standard ingestion pipeline.
4. Outbound sends can feed one standard send pipeline.
5. Provider-specific data can be preserved without polluting the canonical model.

---

> Source: `docs/IDEMPOTENCY_CONTRACT_V1.md`

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