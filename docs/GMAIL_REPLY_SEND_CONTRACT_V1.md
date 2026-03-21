# Envoy Gmail Reply/Send Contract v1

## Purpose

This document defines the Gmail outbound reply/send contract for the Envoy MVP.

The first Gmail send implementation is thread-first.

That means MVP send scope is:
- reply within an existing Gmail thread

It does not yet include broad standalone compose behavior beyond the thread-first workflow.

This contract aligns Gmail sending with:
- the canonical message model
- the shared outbound sending pipeline
- the approval system for AI-generated drafts
- the workspace and RBAC model

---

## Core Rules

1. Gmail outbound sending is workspace-scoped.
2. Only users allowed to send messages may trigger a Gmail send.
3. AI-generated Gmail drafts must be approved before send.
4. Gmail-specific reply/thread data must remain in metadata, not new core schema fields.
5. Canonical message status must reflect real send outcome.

---

## Supported MVP Send Modes

### Included
- human reply in an existing Gmail thread
- approved AI-generated reply in an existing Gmail thread

### Deferred
- standalone compose-first email outside an existing thread
- Gmail native draft sync
- send scheduling
- alias/send-as support
- mailbox management actions

---

## Authorized Actors

### Human send
Allowed roles:
- ADMIN
- MEMBER

Denied:
- VIEWER

This follows the MVP RBAC policy for outbound messaging.

### AI-generated send
Allowed only when:
- the message is an AI-generated outbound draft
- the related approval request is approved
- the acting user has permission to send messages

---

## Canonical Send Preconditions

A Gmail reply may be sent only when all of the following are true:

1. the message belongs to the current workspace
2. the integration belongs to the same workspace
3. the integration is in a send-capable lifecycle state
4. the canonical message has:
   - `direction = OUTBOUND`
   - an eligible outbound status
5. the parent conversation maps to a Gmail thread
6. the connector has enough Gmail thread context to construct a valid reply

For AI-generated drafts, also require:
7. a related `approval_request`
8. `approval_request.status = APPROVED`

This follows the shared outbound pipeline and approval rules. 

---

## Gmail Thread Reply Requirement

The first Gmail send implementation must reply inside an existing Gmail thread.

That means the connector must preserve and use enough Gmail provider context to build a real reply, such as:
- Gmail thread id
- message references needed for reply context when useful
- any non-secret Gmail reply metadata stored in canonical metadata fields

Canonical conversation identity remains:
- `conversations.external_conversation_id = Gmail thread id`

Canonical message identity remains:
- `messages.external_message_id = Gmail message id`

Do not add Gmail-only reply fields to canonical tables.

Use metadata fields where Gmail-specific reply details are needed. 

---

## Input to Gmail Send

The Gmail connector should receive, through the shared outbound pipeline:

- connector context with resolved Gmail OAuth auth material
- canonical conversation
- canonical outbound message
- optional approval context
- shared idempotency key
- actor context

The connector should not fetch raw tokens from business tables directly.
It should operate on resolved auth material from connector runtime context. 

---

## Gmail Provider Payload Expectations

The Gmail connector is responsible for converting canonical reply input into a Gmail-compatible outbound payload.

The connector payload builder should use:
- canonical message body
- canonical conversation/thread context
- Gmail thread id
- any provider-specific reply metadata needed for correct threading

The connector should return:
- external provider message id
- provider-accepted timestamp if available
- safe provider response metadata
- retry-safe diagnostics

This aligns with the shared `sendMessage()` connector contract and the outbound pipeline contract. 

---

## Canonical Status Transitions

### Human reply path
Typical flow:
- `DRAFT -> QUEUED -> SENT`
or
- `DRAFT -> SENT`
depending on whether queueing is explicit in the implementation

### AI draft reply path
Typical flow:
- `PENDING_APPROVAL -> APPROVED -> QUEUED -> SENT`
or
- `PENDING_APPROVAL -> APPROVED -> SENT`

### Failure cases
On send failure:
- transition to `FAILED`
- preserve safe diagnostics
- do not falsely mark sent

Optional later:
- provider confirmation may move `SENT -> DELIVERED`

These transitions must align with the canonical message model. 

---

## Audit and Approval Linkage

Every Gmail outbound send should remain traceable through canonical audit records.

For human sends:
- record send requested
- record send success or failure

For AI sends:
- record approval decision
- record send requested
- record send success or failure

AI sends must remain traceable to:
- conversation
- message
- approval request
- acting user or system actor

This follows the audit and approval design rules.  [oai_citation:4‡AGENT_TABLES_V1.md](sediment://file_0000000024d471f5b5200b44aed2c6a7)

---

## Metadata Rules

### Allowed in platform_metadata_json
Examples:
- Gmail thread id copy if useful for fast access
- provider send response summary
- reply header references
- Gmail-specific delivery diagnostics
- normalized provider thread hints

### Not allowed
- raw OAuth tokens
- refresh tokens
- client secrets
- arbitrary Gmail-only fields promoted into canonical schema

Secrets must stay in the secret storage abstraction, not metadata. 

---

## Idempotency Rules

The Gmail send path must use the shared outbound idempotency contract.

That means:
- one canonical outbound message corresponds to one logical send
- retries use a stable shared idempotency key
- if Gmail supports idempotency-like protection, it is additive
- repeated send attempts must not create uncontrolled duplicate Gmail messages

This follows the shared idempotency contract.  [oai_citation:5‡IDEMPOTENCY_CONTRACT_V1.md](sediment://file_00000000114871fdbe5f058f9931bf27)

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail send step:
- new compose outside existing thread-first workflow
- send-as aliases
- Gmail draft sync
- scheduled send
- mailbox management actions
- autonomous AI sending

---

## Acceptance Test

The Gmail reply/send contract is correct only if all of the following are true:

1. A human can send a reply in an existing Gmail thread from Envoy.
2. An approved AI draft can send through the same shared outbound pipeline.
3. Gmail-specific reply context stays in metadata, not canonical schema.
4. Canonical message statuses reflect real send outcomes.
5. The contract does not require Gmail-only changes to the shared framework or core data model.