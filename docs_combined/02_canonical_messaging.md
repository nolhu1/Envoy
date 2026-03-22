# Envoy Canonical Messaging



---

> Source: `docs/CONVERSATION_MODEL_V1.md`

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

---

> Source: `docs/MESSAGE_MODEL_V1.md`

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

---

> Source: `docs/NORMALIZATION_METADATA_V1.md`

# Envoy Normalization Metadata v1

## Purpose

Envoy uses a normalized internal model for conversations, participants, messages, attachments, and agent workflow.

However, normalization must not destroy source-platform detail that may be needed for:
- debugging connector issues
- replaying ingestion
- investigating send failures
- preserving provider-specific thread behavior
- supporting future connector upgrades

To solve this, Envoy stores two metadata layers where needed:
- `raw_payload_json`
- `platform_metadata_json`

These fields must support debugging and replay without turning the canonical schema into a platform-specific schema.

---

## Core Rule

Canonical fields should store the normalized business meaning.

Metadata JSON fields should store provider-specific detail that:
- is useful
- is not canonical
- should not become a first-class column in the core schema

If a field is required for cross-platform product behavior, it belongs as a real column.
If it is only useful for debugging, replay, or connector edge cases, it belongs in metadata JSON.

---

## 1. raw_payload_json

### Purpose
Stores the original provider payload or a close representation of it.

### Use Cases
- webhook debugging
- ingestion replay
- provider mismatch investigation
- tracing normalization bugs
- support diagnostics

### Rules
- nullable
- stored only on tables where replay or forensic inspection matters
- should preserve original structure as much as practical
- should not be used by normal product queries
- should not replace canonical normalized columns

### Recommended Tables
- `participants`
- `messages`

### Optional Tables
- `attachments`
- `integrations`
- `conversations`

### Examples

#### Email message raw payload
May include:
- Gmail message payload
- headers
- message parts
- thread references
- snippet
- labels
- internal date

#### Slack message raw payload
May include:
- event envelope
- channel ID
- user ID
- thread timestamp
- subtype
- blocks
- files
- event timestamp

---

## 2. platform_metadata_json

### Purpose
Stores normalized provider-specific metadata that is useful to keep, but should not be promoted to a core schema column.

### Use Cases
- provider thread nuances
- UI edge-case rendering
- retry and send diagnostics
- provider message references
- connector-specific state not needed for canonical workflow logic

### Rules
- nullable
- structured JSON object
- should use stable internal keys where practical
- should not duplicate raw payload blindly
- should not become a dumping ground for random unstructured data
- should not hold secrets or auth tokens

### Recommended Tables
- `integrations`
- `conversations`
- `participants`
- `messages`
- `attachments`

---

## Table-by-Table Guidance

### conversations.platform_metadata_json

Use for conversation-level provider context that is not canonical.

#### Examples for Email
- thread snippet
- label summary
- provider folder or mailbox hints
- reply reference metadata

#### Examples for Slack
- channel ID
- channel type
- root thread timestamp
- workspace team ID

#### Do Not Store Here
- core workflow state
- subject
- last message time
- assigned agent state

Those belong in canonical columns.

---

### participants.raw_payload_json

Use for the original source participant payload when available.

#### Examples for Email
- original sender headers
- display name source
- raw address object

#### Examples for Slack
- original user profile object
- display name fields
- team membership hints

---

### participants.platform_metadata_json

Use for provider-specific participant details not worth elevating into core columns.

#### Examples
- avatar URL
- timezone
- Slack username
- email display formatting hints
- provider role hints

#### Do Not Store Here
- canonical display name
- canonical email
- canonical handle

Those should be first-class columns when used by the product.

---

### messages.raw_payload_json

This is the most important raw metadata field in the model.

Use it to store the original inbound or outbound provider message payload.

#### Email examples
- raw Gmail message payload
- MIME structure summary
- header references
- provider IDs
- thread association details

#### Slack examples
- raw event payload
- blocks
- subtype
- files array
- bot profile payload

---

### messages.platform_metadata_json

Use for normalized provider-specific details.

#### Examples
- reply-to references
- header-derived thread hints
- Slack subtype
- Slack block summary
- provider delivery metadata
- normalized error detail for failed sends

#### Do Not Store Here
- canonical body text
- canonical body html
- direction
- status
- sender type

Those belong in first-class columns.

---

### attachments.platform_metadata_json

Use for file-specific provider metadata.

#### Examples
- provider file IDs
- preview URLs
- source download URL
- external thumbnail metadata
- content disposition metadata

#### Do Not Store Here
- canonical file name
- MIME type
- size bytes
- storage key

Those should remain real columns.

---

### integrations.platform_metadata_json

Use for non-secret connector state and provider context.

#### Examples
- connected workspace name
- provider account label
- last sync cursor
- sync diagnostics
- webhook registration metadata

#### Do Not Store Here
- access tokens
- refresh tokens
- client secrets

Secrets must be stored outside the application database when possible.

---

## Canonical vs Metadata Decision Test

Before adding a new field, ask:

### 1. Is this required for normalized product behavior across platforms?
If yes:
- make it a real column

### 2. Is this mainly for debugging, replay, or connector-specific nuance?
If yes:
- put it in metadata JSON

### 3. Is this secret or auth-sensitive?
If yes:
- do not store it in metadata JSON

### 4. Is this useful only for one connector and not needed in core workflows?
If yes:
- prefer metadata JSON

---

## Replay Rule

Envoy should be able to inspect a stored message and understand:
- what canonical record was produced
- what source payload produced it
- what provider-specific metadata was preserved

That means metadata must be sufficient for:
- debugging normalization
- comparing source vs normalized output
- reconstructing connector behavior during failures

It does not need to perfectly reproduce every external API object.

---

## Anti-Patterns

Do not do any of these:

1. Put Gmail-only or Slack-only fields directly on core tables unless they are genuinely canonical.
2. Store huge raw payloads everywhere by default without purpose.
3. Store auth secrets in raw or metadata JSON.
4. Use metadata JSON as a substitute for proper schema design.
5. Query business logic from raw payloads in normal application code.

---

## Design Rule

The normalized core model should remain clean and stable.

Metadata should preserve provider detail without forcing provider-specific columns into the business schema.

If a connector needs special data, prefer:
- canonical column if cross-platform and product-critical
- metadata JSON if provider-specific and non-canonical

Do not create connector-specific core tables just to preserve source detail.

---

> Source: `docs/AGENT_TABLES_V1.md`

# Envoy Agent-Specific Tables v1

## Purpose

These tables support the agent workflow layer on top of the normalized conversation model.

They are responsible for:
- assigning agents to conversations
- storing approval checkpoints for AI-generated outbound drafts
- recording audit logs of agent and user actions
- storing structured memory or extracted facts from conversations

These tables must remain tied to the canonical conversation and message model.

They must not bypass:
- approval requirements
- workflow state
- audit logging

---

## 1. agent_assignments

### Purpose
Represents an agent assigned to a conversation with a specific operating goal and constraints.

### Table Name
`agent_assignments`

### Required Fields

#### id
- Type: UUID
- Primary key

#### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`

#### conversation_id
- Type: UUID
- Foreign key to `conversations.id`

#### goal
- Type: text
- High-level objective for the agent in this conversation

#### instructions
- Type: text nullable
- Additional task guidance for the agent

#### tone
- Type: string nullable
- Tone or style constraints for generated drafts

#### allowed_actions_json
- Type: JSON nullable
- Structured list of permitted actions
- Example:
  - reply_draft
  - ask_question
  - escalate
  - wait

#### escalation_rules_json
- Type: JSON nullable
- Rules for when the agent should escalate to a human

#### assigned_by_user_id
- Type: UUID nullable
- Foreign key to `users.id`

#### is_active
- Type: boolean
- Indicates whether this is the active assignment

#### created_at
- Type: timestamp

### Recommended Additional Fields

#### updated_at
- Type: timestamp

#### ended_at
- Type: timestamp nullable
- Marks the end of the assignment without deleting history

### Constraints
- One conversation may have many historical assignments
- Only one active assignment should exist per conversation at a time

### Indexes
- `workspace_id, is_active`
- `conversation_id, is_active`

---

## 2. approval_requests

### Purpose
Represents a human approval checkpoint for an AI-generated outbound message draft.

### Table Name
`approval_requests`

### Required Fields

#### id
- Type: UUID
- Primary key

#### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`

#### conversation_id
- Type: UUID
- Foreign key to `conversations.id`

#### draft_message_id
- Type: UUID
- Foreign key to `messages.id`
- Must point to the draft message being reviewed

#### status
- Type: enum
- Suggested values:
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
  - `CANCELLED`

#### reviewed_by_user_id
- Type: UUID nullable
- Foreign key to `users.id`

#### created_at
- Type: timestamp

### Recommended Additional Fields

#### updated_at
- Type: timestamp

#### reviewed_at
- Type: timestamp nullable

#### rejection_reason
- Type: text nullable

#### edited_content
- Type: text nullable
- Stores the reviewed version if the user edits the draft before approval

#### proposed_by_agent_assignment_id
- Type: UUID nullable
- Foreign key to `agent_assignments.id`

### Rules
- Every outbound AI-generated message draft must create an approval request before sending
- Approval requests are immutable checkpoints in the workflow
- An approval request must always tie back to one conversation and one draft message

### Indexes
- `workspace_id, status, created_at`
- `conversation_id`
- `draft_message_id`

---

## 3. action_logs

### Purpose
Represents the audit trail for major human, agent, system, and integration actions.

### Table Name
`action_logs`

### Required Fields

#### id
- Type: UUID
- Primary key

#### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`

#### conversation_id
- Type: UUID
- Foreign key to `conversations.id`

#### actor_type
- Type: enum
- Suggested values:
  - `USER`
  - `AGENT`
  - `SYSTEM`
  - `INTEGRATION`

#### action_type
- Type: string or enum
- Examples:
  - `CONVERSATION_CREATED`
  - `MESSAGE_INGESTED`
  - `MESSAGE_DRAFTED`
  - `APPROVAL_REQUESTED`
  - `APPROVAL_APPROVED`
  - `APPROVAL_REJECTED`
  - `MESSAGE_SENT`
  - `AGENT_ASSIGNED`
  - `AGENT_UNASSIGNED`
  - `STATE_CHANGED`

#### metadata_json
- Type: JSON nullable
- Stores structured action detail

#### created_at
- Type: timestamp

### Recommended Additional Fields

#### message_id
- Type: UUID nullable
- Foreign key to `messages.id`

#### approval_request_id
- Type: UUID nullable
- Foreign key to `approval_requests.id`

#### actor_user_id
- Type: UUID nullable
- Foreign key to `users.id`

#### actor_agent_assignment_id
- Type: UUID nullable
- Foreign key to `agent_assignments.id`

### Rules
- Action logs are append-only
- Do not soft delete action logs
- Every approval decision should create an action log
- Every agent draft generation should create an action log
- Every major workflow state change should create an action log

### Indexes
- `workspace_id, conversation_id, created_at`
- `message_id`
- `approval_request_id`

---

## 4. conversation_facts

### Purpose
Stores structured facts extracted from a conversation for agent context and workflow use.

Use this instead of unstructured long-term memory in MVP.

### Table Name
`conversation_facts`

### Required Fields

#### id
- Type: UUID
- Primary key

#### workspace_id
- Type: UUID
- Foreign key to `workspaces.id`

#### conversation_id
- Type: UUID
- Foreign key to `conversations.id`

#### key
- Type: string
- Example:
  - `contact_name`
  - `company`
  - `meeting_time`
  - `budget`
  - `requirements`

#### value_text
- Type: text
- Extracted value for the fact

#### created_at
- Type: timestamp

### Recommended Additional Fields

#### updated_at
- Type: timestamp

#### source_message_id
- Type: UUID nullable
- Foreign key to `messages.id`

#### confidence
- Type: float nullable
- Optional confidence score from extraction step

### Rules
- Facts are structured memory
- Facts should be concise and workflow-relevant
- Facts should link to source messages when possible
- Facts should not replace raw conversation history

### Indexes
- `workspace_id, conversation_id`
- `conversation_id, key`
- `source_message_id`

---

## Relationship Summary

- `agent_assignments` belong to `conversations`
- `approval_requests` belong to `conversations` and point to draft `messages`
- `action_logs` belong to `conversations` and may point to `messages` or `approval_requests`
- `conversation_facts` belong to `conversations` and may point to source `messages`

---

## Design Rules

These tables must satisfy all of the following:

1. Agent behavior is always tied to a conversation.
2. AI outbound drafts always route through `approval_requests`.
3. Human and agent actions are visible in `action_logs`.
4. Structured memory is stored as facts, not only as raw history.
5. None of these tables should contain platform-specific core logic.

If approval or agent behavior cannot be represented without adding platform-specific tables, the model has failed.

---

> Source: `docs/INBOUND_INGESTION_PIPELINE_V1.md`

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

---

> Source: `docs/OUTBOUND_SENDING_PIPELINE_V1.md`

# Envoy Outbound Sending Pipeline v1

## Purpose

This document defines the shared outbound sending pipeline for Envoy connectors.

The outbound pipeline exists so that all outbound messages, regardless of provider, follow one standard workflow that:
- validates send eligibility
- enforces approval requirements
- converts canonical outbound messages into provider payloads
- sends through the connector
- updates canonical message delivery state
- records audit information
- supports retry-safe failure handling

This contract applies to:
- human-authored outbound replies
- approved AI-generated outbound drafts

It does not yet apply to autonomous agent sending, which is out of scope for MVP.

---

## Core Rule

Provider-specific payload construction belongs inside the connector.

Canonical send eligibility, status handling, and audit behavior belong inside the shared outbound pipeline.

A connector may map provider-specific thread or payload details, but it must not define its own separate business-layer send workflow.

---

## Standard Outbound Stages

### 1. Validate send eligibility
Purpose:
- confirm that the canonical message is allowed to be sent

Checks may include:
- message belongs to the current workspace
- integration belongs to the same workspace
- integration lifecycle allows sending
- message direction is `OUTBOUND`
- message status is eligible for send
- sender is allowed to perform the action

For AI-generated drafts, also check:
- approval requirement is satisfied
- related approval request is approved

Inputs:
- workspace context
- integration context
- canonical conversation
- canonical message
- optional approval context
- acting user or system context

Outputs:
- validated send request
- rejection if send is not allowed

Failure behavior:
- reject before provider payload mapping
- do not send
- do not mark message as sent

---

### 2. Build provider payload
Purpose:
- convert canonical outbound message plus canonical conversation context into the provider-native outbound payload

Examples:
- Gmail reply payload
- Slack reply body and thread metadata

Inputs:
- connector context
- canonical conversation
- canonical message
- provider thread metadata if needed

Outputs:
- provider send payload
- provider-specific thread/reply context
- safe diagnostics

Rules:
- keep provider-specific construction inside the connector
- do not put provider-only fields into core canonical message columns

---

### 3. Send through connector
Purpose:
- execute the actual provider API send

Inputs:
- connector context
- provider payload
- idempotency token when supported
- canonical outbound metadata

Outputs:
- `SendResult`
- external provider message id
- accepted timestamp
- provider delivery metadata
- safe provider diagnostics

Failure behavior:
- return structured failure
- do not silently swallow provider errors

---

### 4. Update canonical delivery state
Purpose:
- reflect send outcome in the canonical message record

Possible status transitions:
- `APPROVED -> QUEUED`
- `QUEUED -> SENT`
- `SENT -> DELIVERED` if provider confirmation later exists
- `QUEUED -> FAILED`
- `APPROVED -> FAILED` if queueing is skipped and send fails directly

Canonical fields affected may include:
- `status`
- `sent_at`
- `platform_metadata_json`
- provider response metadata in safe normalized form

Rules:
- canonical message status must reflect the actual send outcome
- provider-specific metadata belongs in `platform_metadata_json`
- raw provider responses may be stored only in safe diagnostic boundaries, not mixed into arbitrary business logic

---

### 5. Write audit log
Purpose:
- record the business-layer send action and outcome

Audit examples:
- send requested
- send succeeded
- send failed
- approval-approved outbound sent

Inputs:
- workspace id
- conversation id
- message id
- approval request id if applicable
- actor type
- result metadata

Outputs:
- audit log record or handoff for one

Rules:
- audit logs are canonical product events, not provider-specific logs
- all AI outbound sends should remain traceable to approval state

---

### 6. Retry boundary
Purpose:
- make failed sends retry-safe without duplicating outbound messages

Retry concerns:
- network failures
- provider temporary errors
- rate limits
- ambiguous provider responses

Rules:
- retries must use stable idempotency inputs where possible
- repeated retry attempts must not create uncontrolled duplicate sends
- final failure should be reflected in canonical message status

This document defines the contract only.
Concrete retry policy is handled later.

---

## Shared Input Contract

The shared outbound pipeline should accept a normalized envelope such as:

### OutboundSendEnvelope
- workspaceId
- integrationId
- conversationId
- messageId
- connectorContext
- conversation
- message
- actor context
- approval context nullable
- idempotencyKey nullable
- requestedAt

This envelope is provider-agnostic.

---

## Shared Output Contract

The shared outbound pipeline should produce a structured result such as:

### OutboundSendPipelineResult
- workspaceId
- integrationId
- conversationId
- messageId
- externalMessageId nullable
- sendStatus
- providerAcceptedAt nullable
- deliveryState nullable
- auditEvents[]
- diagnostics
- retryable boolean

This lets downstream systems handle send results without provider-specific branching.

---

## Send Eligibility Rules

### Human send
A human-authored outbound message may be sent when:
- user is authorized to send messages
- message belongs to user workspace
- integration is send-capable
- message is in an eligible outbound state

### AI draft send
An AI-generated outbound draft may be sent only when:
- the draft belongs to the current workspace
- the draft has a related approval request
- the approval request is approved
- the integration is send-capable
- the message is in an eligible outbound state

### Disallowed cases
Do not send when:
- integration is `PENDING`
- integration is `ERROR`
- integration is `DISCONNECTED`
- message is still `PENDING_APPROVAL`
- approval was rejected or cancelled
- acting user lacks permission
- workspace ownership does not match

Integration send capability should follow the shared lifecycle contract.  [oai_citation:3‡INTEGRATION_LIFECYCLE_V1.md](sediment://file_00000000686c71f896a517665a3a02c6)

---

## Connector Responsibilities

Connector code is responsible for:
- provider payload mapping
- provider API send call
- provider response interpretation
- provider-specific thread context handling
- provider rate-limit or temporary failure diagnostics

Connector code is not responsible for:
- deciding whether approval is required
- deciding whether a user is authorized
- maintaining canonical business-layer send rules
- inventing connector-specific message status workflows

---

## Shared Pipeline Responsibilities

The shared outbound pipeline is responsible for:
- eligibility checks
- approval gating
- lifecycle send-capability checks
- standard send result handling
- canonical status updates
- audit log handoff
- retry-safe contract boundaries

---

## Canonical Model Alignment

The outbound pipeline must align with the canonical message model.

### Message direction
Outbound sends apply to messages where:
- `direction = OUTBOUND`  [oai_citation:4‡MESSAGE_MODEL_V1.md](sediment://file_00000000732471f5b948eca0d7faeef1)

### Message statuses
Relevant canonical statuses include:
- `DRAFT`
- `PENDING_APPROVAL`
- `APPROVED`
- `QUEUED`
- `SENT`
- `DELIVERED`
- `FAILED` 

### Approval requirement
AI-generated outbound messages must route through approval before send.  [oai_citation:5‡AGENT_TABLES_V1.md](sediment://file_0000000024d471f5b5200b44aed2c6a7)

### Metadata
Provider-specific delivery detail belongs in `platform_metadata_json`, not new provider-specific core columns. 

---

## Failure Handling Rules

### Eligibility failure
- reject
- no provider send
- no sent state update

### Provider mapping failure
- reject
- log diagnostics
- no send

### Provider send failure
- mark retryable or failed
- preserve diagnostics
- do not falsely mark sent

### Ambiguous provider response
- return retry-safe result
- preserve idempotency context
- do not assume success without evidence

---

## Event and Audit Boundary

The outbound pipeline should support later event emission, but business-layer send completion and audit logging should remain explicit.

Examples of downstream events:
- `message_sent`
- `approval_approved`

Major send outcomes should remain traceable in audit logs and system events.  [oai_citation:6‡Envoy Development Specifications.txt](sediment://file_00000000305471fbb47e3b1647e7dd6b)

---

## Acceptance Test

The outbound pipeline contract is correct only if all of the following are true:

1. Human sends and approved AI sends can both use the same shared pipeline.
2. Approval-gated AI drafts cannot bypass approval.
3. Provider-specific payload logic stays inside the connector.
4. Canonical message statuses reflect real send outcomes.
5. The framework can later add retry logic without redesigning the send contract.