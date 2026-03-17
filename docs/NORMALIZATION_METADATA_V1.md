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