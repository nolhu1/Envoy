# Envoy Slack Participant and Thread Mapping v1

## Purpose

This document defines the hardened participant and thread mapping rules for the Slack connector in the Envoy MVP.

Slack is now connected, DM sync works, and outbound DM replies work.
This document locks the identity and threading rules that must remain stable before the unified inbox and thread UI are built.

The goal is to preserve enough Slack-native identity and thread structure to support:
- correct participant rendering
- correct DM and DM-thread grouping
- correct outbound reply threading
- cross-platform consistency in the canonical model

This contract applies only to:
- Slack DMs
- Slack DM threads

It does not add public/private channel support.

---

## Core Rules

1. Slack user identity must be preserved through stable external participant identifiers.
2. Slack DM and Slack DM-thread conversation identity must remain stable across repeated sync and send operations.
3. Slack-specific thread and participant details belong in metadata, not new core schema fields.
4. Canonical conversation and message records must remain platform-agnostic.
5. Repeated sync and send behavior must converge on the same participant and thread identities.

---

## Participant Mapping Rules

### Canonical participant identity
Slack participants should be anchored on:
- `participants.external_participant_id = Slack user id`

This is the primary stable identity.

### Canonical participant fields
Use canonical fields when available:
- `display_name`
- `handle`
- `email` when available and safe
- `is_internal`

### Metadata preservation
Slack-specific participant detail may be preserved in:
- `raw_payload_json`
- `platform_metadata_json`

Examples:
- team/workspace hints
- profile image URL later if useful
- Slack display-name variants
- provider role hints

### Duplicate prevention
Repeated sync must not create duplicate participant rows for the same Slack user inside the same canonical conversation unless there is a real identity distinction.

---

## Conversation Identity Rules

### Root DM conversation
A root Slack DM should map to one canonical conversation.

Preferred identity:
- Slack DM conversation id as the base identity

Example:
- `external_conversation_id = D123456`

### DM-thread conversation
When Slack thread replies exist inside a DM scope, they should map consistently.

Preferred identity:
- DM-thread composite identity using DM conversation id + root thread timestamp

Example:
- `external_conversation_id = D123456:1741200000.000100`

This keeps thread replies grouped consistently without requiring Slack-only schema fields.

### Subject handling
Slack DM and DM-thread conversations must keep:
- `subject = null`

Do not introduce Slack-only subject logic.

---

## Message Identity Rules

### Canonical message identity
Slack messages should map to:
- `messages.external_message_id = Slack message ts or normalized Slack message key`

For thread replies, the message identity must still remain stable within the canonical conversation scope.

### Timing
Preserve provider timing through canonical fields:
- `sent_at`
- `received_at`

Preserve Slack-native timing detail in metadata when useful:
- message timestamp
- thread timestamp
- ordering hints

### Direction and sender
Slack DM inbound and outbound messages should still align with the canonical model:
- inbound DM -> `direction = INBOUND`
- outbound Envoy reply -> `direction = OUTBOUND`

Do not introduce Slack-only message direction fields.

---

## Required Metadata Preservation

The following Slack-native details should remain available in metadata when useful for correct rendering or reply behavior:

### Conversation/platform metadata
- Slack DM conversation id
- Slack thread timestamp
- Slack workspace/team id when useful
- normalized provider thread hints

### Message/platform metadata
- Slack message timestamp
- root thread timestamp if applicable
- Slack subtype when relevant
- bot-authored hint when relevant
- safe provider response metadata from sends

### Participant/platform metadata
- Slack user id copy if useful
- profile/display-name hints
- team/workspace hints

These belong in:
- `raw_payload_json`
- `platform_metadata_json`

Do not promote them into new canonical columns unless they become cross-platform business requirements.

---

## Reply Threading Rules

The outbound Slack reply path depends on stable thread context.

To support correct DM and DM-thread replies, the connector must be able to recover:
- DM conversation id
- thread timestamp when replying inside a thread

The canonical model should not add Slack-only reply fields.
Instead, recover reply context through:
- `external_conversation_id`
- `platform_metadata_json`
- normalized Slack thread hints

This is required so Slack outbound send can continue to work through the shared outbound pipeline without connector-specific schema changes.

---

## Unified Inbox / Thread UI Expectations

Before Phase H, this mapping must already support:

### Inbox list
- stable conversation identity
- stable participants
- correct latest activity

### Thread view
- chronological message rendering
- sender identity rendering
- DM-thread grouping that remains understandable to the user
- file metadata display later

### Cross-platform consistency
Slack must fit the same canonical list/thread surfaces as Gmail, even though it preserves Slack-native thread context in metadata.

---

## Explicit Non-Goals

Do not add these in this step:
- public/private channel identity rules
- Slack Connect identity rules
- channel membership modeling
- custom Slack-only schema tables
- rich Slack UI-specific rendering logic

---

## Acceptance Test

This mapping contract is correct only if all of the following are true:

1. Slack user ids remain stable across repeated sync and send operations.
2. Root DMs and DM threads map to stable canonical conversation identities.
3. Slack thread context required for outbound replies is recoverable without Slack-only schema changes.
4. Canonical conversation and message tables remain platform-agnostic.
5. The mapping is stable enough for the unified inbox and thread UI to be built next.