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