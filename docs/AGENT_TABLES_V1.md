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