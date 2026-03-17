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