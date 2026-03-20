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