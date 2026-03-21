# Envoy Gmail Attachment Handling v1

## Purpose

This document defines the first Gmail attachment handling contract for the Envoy MVP.

The Gmail connector must support attachment handling well enough for:
- canonical metadata storage
- thread view rendering
- download-on-demand behavior later

The first implementation is metadata-first.

It does not include full binary ingestion or long-term file storage in the initial Gmail attachment step.

---

## Core Rules

1. Attachment handling is workspace-scoped through the parent message and conversation.
2. The canonical attachment model stores metadata, not Gmail-specific business logic.
3. Gmail-specific attachment detail belongs in metadata fields, not new core schema columns.
4. Attachment binaries are not ingested into long-term storage in the first Gmail attachment phase.
5. Secrets and auth material must never appear in attachment metadata.

---

## MVP Attachment Scope

### Included
- normalize attachment metadata from Gmail messages
- store canonical attachment rows
- preserve provider attachment identifiers in metadata
- show attachment information in thread view
- support later on-demand download using connector auth context

### Deferred
- full attachment binary ingestion pipeline
- object storage upload for all attachments
- preview generation
- OCR
- malware scanning
- attachment search indexing
- inline rich preview rendering beyond basic file info

---

## Canonical Attachment Fields

The canonical `attachments` model should be used as-is.

Expected canonical fields include:
- `workspace_id`
- `message_id`
- `platform`
- `external_attachment_id`
- `file_name`
- `mime_type`
- `size_bytes`
- `storage_key`
- `external_url`
- `platform_metadata_json`

For Gmail MVP:
- `storage_key` will usually remain null until a later binary ingestion phase
- `external_url` may remain null if Gmail does not expose a stable direct file URL for safe reuse
- the core value is canonical metadata plus provider attachment identifiers

This keeps the canonical model platform-agnostic.  [oai_citation:5‡DATA_MODEL_V1.md](sediment://file_00000000eb44722f911c7913e2821476)

---

## Gmail Metadata Rules

### What belongs in platform_metadata_json
Examples:
- Gmail attachment id
- Gmail message part id
- content disposition
- inline vs attachment hint
- provider file metadata useful for later download
- thumbnail or preview hints if safely available later

### What does not belong in canonical columns
Do not add Gmail-only fields like:
- Gmail part structure fields
- Gmail MIME part tree details
- Gmail-only preview fields as core columns

Use `platform_metadata_json` instead.  [oai_citation:6‡NORMALIZATION_METADATA_V1.md](sediment://file_000000009ff071f5b80b24106066bd63)

---

## Thread View Requirements

The first Gmail thread view should be able to show, for each attachment:
- file name
- MIME type
- size when available
- whether the file is an attachment or inline-related part when that distinction is useful
- enough metadata for a future download action

This is enough for MVP thread reading and basic operator trust.

---

## Download-On-Demand Contract

The first Gmail attachment phase should not pre-download every file.

Instead, later download behavior should work like this:

1. user requests a download from thread view
2. system validates:
   - auth
   - workspace ownership
   - permission to view the conversation
3. system resolves the connector context for the Gmail integration
4. system uses preserved Gmail attachment identifiers to fetch the file on demand
5. system returns the file or a streamed response safely

This contract is enough now even if the actual download endpoint is built later.

---

## Ingestion Rules

When Gmail messages are ingested:
- attachment metadata should be extracted during normalization
- canonical attachment rows should be inserted through the shared inbound write path
- duplicate syncs must not create duplicate attachment records for the same canonical message and external attachment identity
- binary content should not be stored in the first Gmail ingestion phase

This stays aligned with the shared inbound pipeline and idempotency rules. 

---

## Security Rules

### Workspace boundary
A user may only access attachment data where the parent resource belongs to the current workspace.  [oai_citation:7‡WORKSPACE_MODEL_V1.md](sediment://file_00000000376c722f9d3755c3e196f5a5)

### Secret boundary
Attachment metadata must never contain:
- access tokens
- refresh tokens
- auth headers
- raw connector secret material

### Logging boundary
Do not log raw attachment fetch auth data.
Only log safe diagnostics if later download errors occur.

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail attachment step:
- attachment object storage mirror
- virus scanning
- OCR
- preview thumbnails
- cross-thread attachment library
- content indexing
- Slack attachment unification beyond the shared canonical model

---

## Acceptance Test

The Gmail attachment handling contract is correct only if all of the following are true:

1. Gmail attachment metadata is stored in canonical attachment rows.
2. Thread view can display basic attachment information without binary ingestion.
3. Gmail-specific attachment details stay in metadata, not new core schema columns.
4. Attachment handling remains workspace-scoped and secret-safe.
5. The contract leaves room for later on-demand download without redesigning the canonical model.