# Envoy Slack DM Reply/Send Contract v1

## Purpose

This document defines the Slack outbound reply/send contract for the Envoy MVP.

The first Slack send implementation is DM-first.

That means MVP send scope is:
- reply in an existing Slack DM
- reply in an existing Slack DM thread when thread context exists

It does not yet include public/private channel posting or broad compose behavior.

This contract aligns Slack sending with:
- the canonical message model
- the shared outbound sending pipeline
- the approval system for AI-generated drafts
- the workspace and RBAC model

---

## Core Rules

1. Slack outbound sending is workspace-scoped.
2. Only users allowed to send messages may trigger a Slack send.
3. AI-generated Slack drafts must be approved before send.
4. Slack-specific DM/thread data must remain in metadata, not new core schema fields.
5. Canonical message status must reflect real send outcome.

---

## Supported MVP Send Modes

### Included
- human reply in an existing Slack DM
- human reply in an existing Slack DM thread when thread context exists
- approved AI-generated reply in an existing Slack DM
- approved AI-generated reply in an existing Slack DM thread when thread context exists

### Deferred
- public channel posting
- private channel posting
- standalone compose outside existing DM-first workflow
- interactive Slack app message flows
- advanced block-kit authoring
- edit/delete synchronization as a send workflow
- autonomous AI sending

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

A Slack DM reply may be sent only when all of the following are true:

1. the message belongs to the current workspace
2. the integration belongs to the same workspace
3. the integration is in a send-capable lifecycle state
4. the canonical message has:
   - `direction = OUTBOUND`
   - an eligible outbound status
5. the parent conversation maps to a Slack DM or Slack DM-thread conversation
6. the connector has enough Slack provider context to construct a valid reply

For AI-generated drafts, also require:
7. a related `approval_request`
8. `approval_request.status = APPROVED`

This follows the shared outbound pipeline and approval rules.

---

## Slack DM Reply Requirement

The first Slack send implementation must send into an existing DM conversation.

That means the connector must preserve and use enough Slack provider context to build a real reply, such as:
- Slack DM conversation id
- Slack thread timestamp when replying inside a DM thread
- bot/user context needed for send

Canonical conversation identity remains:
- `conversations.external_conversation_id = Slack DM id or DM-thread composite id`

Canonical message identity remains:
- `messages.external_message_id = Slack message ts or normalized Slack message key`

Do not add Slack-only reply fields to canonical tables.

Use metadata fields where Slack-specific DM/thread details are needed. 

---

## Input to Slack Send

The Slack connector should receive, through the shared outbound pipeline:

- connector context with resolved Slack OAuth auth material
- canonical conversation
- canonical outbound message
- optional approval context
- shared idempotency key
- actor context

The connector should not fetch raw tokens from business tables directly.
It should operate on resolved auth material from connector runtime context.  [oai_citation:4‡CREDENTIAL_HANDLING_V1.md](sediment://file_000000004c3871fd89da2550bdb21c9f)

---

## Slack Provider Payload Expectations

The Slack connector is responsible for converting canonical reply input into a Slack-compatible outbound payload.

The connector payload builder should use:
- canonical message body
- canonical conversation/DM context
- Slack DM conversation id
- Slack thread timestamp when replying inside a DM thread
- any provider-specific metadata needed for correct threading

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

Every Slack outbound send should remain traceable through canonical audit records.

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

This follows the audit and approval design rules. 

---

## Metadata Rules

### Allowed in platform_metadata_json
Examples:
- Slack DM conversation id copy if useful for fast access
- Slack thread timestamp
- provider send response summary
- Slack-specific delivery diagnostics
- normalized provider thread hints

### Not allowed
- raw OAuth tokens
- bot token
- client secret
- arbitrary Slack-only fields promoted into canonical schema

Secrets must stay in the secret storage abstraction, not metadata. 

---

## Idempotency Rules

The Slack send path must use the shared outbound idempotency contract.

That means:
- one canonical outbound message corresponds to one logical send
- retries use a stable shared idempotency key
- if Slack supports dedupe behavior later, it is additive
- repeated send attempts must not create uncontrolled duplicate Slack messages

This follows the shared idempotency contract.  [oai_citation:5‡IDEMPOTENCY_CONTRACT_V1.md](sediment://file_00000000114871fdbe5f058f9931bf27)

---

## Explicit MVP Non-Goals

Do not build these in the first Slack send step:
- public/private channel posting
- standalone compose outside existing DM-first workflow
- advanced interactive Slack features
- workflow builder integrations
- autonomous AI sending

---

## Acceptance Test

The Slack DM reply/send contract is correct only if all of the following are true:

1. A human can send a reply in an existing Slack DM from Envoy.
2. A human can reply in a Slack DM thread when thread context exists.
3. An approved AI draft can send through the same shared outbound pipeline.
4. Slack-specific DM/thread context stays in metadata, not canonical schema.
5. Canonical message statuses reflect real send outcomes.
6. The contract does not require Slack-only changes to the shared framework or core data model.