# Envoy Slack Normalization Validation v1

## Purpose

This document validates the Slack normalization layer against real Slack DM data before reply/send is implemented.

The goal is to confirm that Slack DM and DM-thread payloads map correctly into the canonical Envoy model without Slack-specific leakage into core tables.

---

## Validation Areas

### 1. Conversation mapping
Check that for real Slack DMs:
- DM identity maps correctly to `external_conversation_id`
- DM-thread identity maps correctly when replies exist
- `subject` is null
- `last_message_at` reflects the latest activity correctly
- Slack-only thread/channel detail remains in metadata fields

### 2. Participant mapping
Check that for real Slack messages:
- Slack user id maps correctly to `externalParticipantId`
- display name maps correctly
- handle maps correctly
- email maps when available and safe to fetch
- duplicate participants are not created unnecessarily
- internal vs external identity is handled consistently

### 3. Message mapping
Check that for real Slack messages:
- Slack timestamp or normalized message key maps to `externalMessageId`
- body text extraction is correct
- sent/received timing is populated correctly
- bot-authored messages are classified consistently
- thread reply ordering is stable

### 4. File metadata mapping
Check that for real Slack messages with files:
- file name is captured
- MIME type is captured
- size is captured when available
- provider file identifiers are preserved in metadata
- no binary file content is written into canonical attachment records

### 5. Metadata preservation
Check that:
- `raw_payload_json` preserves enough Slack source detail for debugging/replay
- `platform_metadata_json` preserves useful non-canonical Slack details
- no secret/auth material appears in message, attachment, or integration metadata

### 6. Canonical cleanliness
Check that:
- no Slack-only core columns were needed
- Slack channel/thread semantics are not leaking into canonical columns
- normalization outputs fit the existing canonical conversation/message model

---

## Real Data Test Cases

Use a small but varied sample of real Slack DMs:

1. simple one-message DM
2. multi-message DM
3. DM with thread replies
4. DM with file metadata
5. DM with bot-authored message if available
6. DM with user profile/display-name differences if available

---

## Validation Checklist

For each sampled DM or DM thread, verify:

### Conversation
- [ ] external conversation id is correct
- [ ] subject is null
- [ ] last message at is correct
- [ ] DM-thread grouping is correct when replies exist

### Participants
- [ ] participant identities are correct
- [ ] no unnecessary duplicates
- [ ] display name and handle are mapped correctly

### Messages
- [ ] external message ids are correct
- [ ] body text is usable
- [ ] timestamps are correct
- [ ] ordering is correct
- [ ] bot/system/internal classification is reasonable

### Files
- [ ] file metadata exists when expected
- [ ] no binary content is stored
- [ ] provider metadata is preserved safely

### Metadata
- [ ] raw payload is preserved
- [ ] platform metadata is useful
- [ ] no secret/auth leakage

---

## Fix Categories

If a normalization issue is found, classify it as one of:

### A. Conversation grouping bug
Examples:
- DM-thread replies grouped into the wrong conversation
- unstable external conversation id
- wrong last activity time

### B. Participant mapping bug
Examples:
- duplicate Slack user identities
- missing display name or handle
- bad internal/external classification

### C. Message mapping bug
Examples:
- empty text when content exists
- wrong message id mapping
- bot messages classified incorrectly

### D. Timestamp/order bug
Examples:
- reply ordering unstable
- wrong latest activity time
- bad timestamp parsing

### E. File metadata bug
Examples:
- missing filename
- missing MIME type
- provider file id not preserved

### F. Metadata preservation bug
Examples:
- raw payload missing important Slack event data
- thread hints missing
- secret/auth leakage into metadata

---

## Required Output of This Step

After validating real data, produce:

1. a short list of actual normalization issues found, if any
2. the code fixes applied
3. confirmation that the canonical model still did not need Slack-only fields

---

## Acceptance Test

This step is complete only if all of the following are true:

1. Real Slack DMs map cleanly to canonical conversations, participants, messages, and file metadata attachments.
2. DM-thread grouping is stable and usable for later reply/send.
3. File handling remains metadata-only.
4. No Slack-only fields were added to the canonical schema.
5. Raw payload and non-secret metadata are preserved well enough for debugging and replay.