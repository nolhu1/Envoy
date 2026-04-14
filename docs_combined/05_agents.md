# Envoy Agents Docs



---

> Source: `docs/AGENT_TRIGGER_RULES_V1.md`

# Envoy Agent Trigger Rules v1

## Purpose

This document defines when an assigned agent is allowed to run in the Envoy MVP.

Envoy uses a draft-only agent runtime.
That means the agent may prepare draft outputs, but it does not send autonomously.

Trigger rules exist so that:
- agent runs happen only in well-defined situations
- agent work stays tied to canonical conversations
- human control remains intact
- approval and workflow boundaries are respected

---

## Core Rules

1. An agent may run only when a conversation has an active agent assignment.
2. Agent runs must be workspace-scoped and canonical-conversation-scoped.
3. Agent runs may produce drafts, not autonomous sends.
4. Agent runs must respect workflow state and approval boundaries.
5. Triggering an agent is not the same as authorizing a send.

---

## Initial Trigger Types

### 1. Inbound message received
Trigger:
- a new inbound message is added to a conversation

Use case:
- prepare a suggested reply draft after a customer message arrives

Conditions:
- conversation has an active agent assignment
- conversation is in a state where response generation makes sense
- no blocking approval state prevents draft generation
- duplicate inbound events do not create uncontrolled duplicate agent runs

### 2. Follow-up due
Trigger:
- a follow-up timer or reminder condition is reached

Use case:
- prepare a follow-up draft when a conversation has been waiting and follow-up is due

Conditions:
- conversation has an active agent assignment
- conversation state is compatible with follow-up behavior
- no terminal state prevents agent work

### 3. Approval rejected
Trigger:
- an approval request is rejected

Use case:
- optionally prepare a revised draft based on reviewer feedback

Conditions:
- conversation has an active agent assignment
- rejected approval includes usable feedback context
- runtime remains draft-only
- the system creates a new draft + new approval request later, rather than mutating approval history

### 4. Manual regenerate requested
Trigger:
- a human explicitly requests a regenerated draft

Use case:
- reviewer or operator wants a fresh draft using the current conversation context

Conditions:
- conversation has an active agent assignment
- acting user is authorized
- regenerate request is auditable

---

## Suppression Rules

An assigned agent must not run when:

### 1. No active assignment exists
No active assignment means no automatic draft generation.

### 2. Conversation is in a terminal or blocked state
Examples:
- CLOSED
- COMPLETED
- other states where reply generation is not appropriate

### 3. A duplicate trigger is already in progress
The runtime should not launch uncontrolled duplicate runs for the same trigger condition.

### 4. The conversation is already awaiting approval for the same unresolved draft path
Do not keep stacking draft runs on top of one unresolved approval without explicit policy.

### 5. Human/operator policy disables the relevant action
For example:
- allowed actions do not permit drafting
- escalation rules suppress agent work

---

## Trigger Input Requirements

Every agent trigger should be able to reference canonical ids such as:
- conversationId
- agentAssignmentId
- messageId when applicable
- approvalRequestId when applicable
- workspaceId

Optional safe metadata may include:
- trigger source
- trigger reason
- reminder context
- rejection feedback summary

Do not use provider-native ids as the primary trigger identity.

---

## Trigger Source Types

Initial canonical trigger sources:

- inbound_message
- follow_up_due
- approval_rejected
- manual_regenerate

These can later map to canonical event types and worker jobs.

---

## Relationship to Workflow State

Agent trigger rules must respect canonical conversation state.

Examples:
- ACTIVE conversation + inbound message -> allowed
- FOLLOW_UP_DUE -> allowed
- AWAITING_APPROVAL -> usually suppress duplicate drafting unless explicitly manual
- CLOSED -> not allowed
- COMPLETED -> usually not allowed

The trigger system must defer to the canonical workflow state machine rather than inventing connector-specific or agent-specific state rules.

---

## Relationship to Approval System

Approval remains the safety boundary.

That means:
- agent runs may prepare a draft
- agent runs may not send a message directly
- if the runtime later drafts a response, that draft still follows the approval system when required

Approval rejection may become a trigger for draft revision, but not for direct sending.

---

## Relationship to Idempotency

Each trigger must be compatible with the shared idempotency model.

That means:
- repeated inbound-message triggers should not create uncontrolled duplicate agent runs
- repeated reminder triggers should be dedupe-safe
- repeated manual regenerate requests should be auditable and policy-controlled
- approval-rejection triggers should preserve history and create new draft checkpoints rather than rewriting past approvals

---

## Non-Goals

This version does not define:
- prompt construction
- context assembly
- model selection
- agent memory format
- exact draft generation logic
- autonomous sending behavior

Those come later.

---

## Acceptance Test

The trigger rules are correct only if all of the following are true:

1. A new inbound message can trigger a draft-only agent run when an active assignment exists.
2. A follow-up-due condition can trigger a draft-only agent run.
3. Approval rejection can become a draft-revision trigger without mutating approval history.
