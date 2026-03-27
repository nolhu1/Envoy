# Envoy Event Schema v1

## Purpose

This document defines the canonical event schema for the Envoy MVP runtime.

Envoy is an event-driven system.
All major business actions should be representable as canonical events so that:
- runtime workers can react consistently
- workflow state can update consistently
- audit and observability remain coherent
- later approvals and agents can plug into the same event stream

This schema is provider-agnostic and workspace-scoped.

---

## Core Rules

1. Every event must be workspace-scoped.
2. Event payloads must reference canonical entities, not provider-specific business identities as the primary key.
3. Provider-specific details may appear in safe payload metadata when needed, but the event must still be canonical first.
4. Events must be idempotent and replay-safe.
5. Events must not carry auth secrets or raw tokens.

---

## Required Top-Level Fields

Each event should include at minimum:

- `eventId`
- `eventType`
- `occurredAt`
- `workspaceId`
- `entityType`
- `entityId`
- `payload`
- `source`
- `version`

### eventId
Stable unique identifier for the emitted event.

### eventType
Canonical event type string.

### occurredAt
Timestamp when the business event occurred.

### workspaceId
Canonical workspace boundary.

### entityType
Primary canonical entity type associated with the event.

Examples:
- conversation
- message
- approval_request
- agent_assignment
- integration

### entityId
Canonical primary entity id.

### payload
Structured event payload.

### source
Origin of event emission.

Examples:
- connector
- api
- ui
- workflow
- approval
- agent_runtime
- system

### version
Schema version for the event envelope.

---

## Event Type Families

### Message events
Examples:
- `message_received`
- `message_sent`
- `message_send_failed`
- `message_draft_created`

### Conversation events
Examples:
- `conversation_created`
- `conversation_updated`
- `conversation_state_changed`

### Approval events
Examples:
- `approval_requested`
- `approval_approved`
- `approval_rejected`

### Agent events
Examples:
- `agent_assigned`
- `agent_unassigned`
- `agent_run_requested`
- `agent_run_completed`

### Integration events
Examples:
- `integration_connected`
- `integration_sync_started`
- `integration_sync_completed`
- `integration_sync_failed`
- `integration_disconnected`

---

## Canonical Payload Rules

Payloads should reference canonical ids such as:
- `conversationId`
- `messageId`
- `approvalRequestId`
- `agentAssignmentId`
- `integrationId`

Provider-specific details may be included only as safe metadata when needed, for example:
- provider platform
- external message id
- sync counts
- diagnostics summary

Do not use provider ids as the primary event identity.

---

## Example Envelope

```json
{
  "eventId": "evt_123",
  "eventType": "message_received",
  "occurredAt": "2026-03-26T20:00:00.000Z",
  "workspaceId": "ws_123",
  "entityType": "message",
  "entityId": "msg_123",
  "source": "connector",
  "version": 1,
  "payload": {
    "conversationId": "conv_123",
    "integrationId": "int_123",
    "platform": "EMAIL",
    "externalMessageId": "gmail-msg-123"
  }
}