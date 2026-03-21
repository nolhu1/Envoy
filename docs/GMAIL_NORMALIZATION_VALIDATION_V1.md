# Envoy Gmail Normalization Validation v1

## Purpose

This document validates the Gmail normalization layer against real Gmail data before reply/send is implemented.

The goal is to confirm that Gmail provider-native thread and message payloads map correctly into the canonical Envoy model without Gmail-specific leakage into core tables.

---

## Validation Areas

### 1. Conversation mapping
Check that for real Gmail threads:
- Gmail thread id maps to `external_conversation_id`
- subject maps to `subject`
- latest message activity maps to `last_message_at`
- Gmail-only thread details remain in metadata fields

### 2. Participant mapping
Check that for real Gmail messages:
- sender email maps correctly
- sender display name maps correctly when present
- duplicate participants are not created unnecessarily
- internal vs external identity is handled consistently

### 3. Message mapping
Check that for real Gmail messages:
- Gmail message id maps to `external_message_id`
- plain text body extraction is correct
- HTML body extraction is correct
- sent and received timestamps are populated correctly
- message ordering inside a thread is stable

### 4. Attachment metadata mapping
Check that for real Gmail messages with attachments:
- attachment filename is captured
- MIME type is captured
- size is captured when available
- provider attachment identifiers are preserved in metadata
- no binary payloads are written into the canonical attachment model

### 5. Metadata preservation
Check that:
- `raw_payload_json` preserves enough Gmail source detail for debugging/replay
- `platform_metadata_json` preserves useful non-canonical Gmail details
- no secrets or auth material appear in message, attachment, or integration metadata

### 6. Canonical cleanliness
Check that:
- no Gmail-only core columns were needed
- Gmail labels/folder semantics are not leaking into canonical columns
- normalization outputs fit the existing canonical conversation/message model

---

## Real Data Test Cases

Use a small but varied sample of real Gmail threads:

1. simple single-message inbound thread
2. multi-message thread with replies
3. thread with HTML-heavy message body
4. thread with attachment metadata
5. thread with display name + email sender headers
6. thread with missing or unusual headers if available
7. thread with internal self-sent or self-reply behavior if available

---

## Validation Checklist

For each sampled thread, verify:

### Conversation
- [ ] external conversation id is correct
- [ ] subject is correct
- [ ] last message at is correct

### Participants
- [ ] participant identities are correct
- [ ] no unnecessary duplicates
- [ ] display name and email are mapped correctly

### Messages
- [ ] external message ids are correct
- [ ] body text is usable
- [ ] body html is preserved when available
- [ ] timestamps are correct
- [ ] ordering is correct

### Attachments
- [ ] attachment metadata exists when expected
- [ ] no binary content is stored
- [ ] provider metadata is preserved safely

### Metadata
- [ ] raw payload is preserved
- [ ] platform metadata is useful
- [ ] no secret/auth leakage

---

## Fix Categories

If a normalization issue is found, classify it as one of:

### A. Conversation mapping bug
Examples:
- wrong subject
- wrong last activity time
- thread identity mismatch

### B. Participant mapping bug
Examples:
- duplicate sender identities
- missing display name
- bad internal/external classification

### C. Message body bug
Examples:
- empty body text when content exists
- broken HTML capture
- incorrect text fallback

### D. Timestamp bug
Examples:
- sent/received reversed
- wrong timezone handling
- unstable ordering

### E. Attachment metadata bug
Examples:
- missing filename
- MIME type not extracted
- provider attachment id not preserved

### F. Metadata preservation bug
Examples:
- raw payload missing key source data
- useful Gmail thread hints missing
- auth-sensitive data leaking into metadata

---

## Required Output of This Step

After validating real data, produce:

1. a short list of actual normalization issues found, if any
2. the code fixes applied
3. confirmation that the canonical model still did not need Gmail-only fields

---

## Acceptance Test

This step is complete only if all of the following are true:

1. Real Gmail threads map cleanly to canonical conversations, participants, messages, and attachments.
2. Body extraction is good enough for inbox/thread reading.
3. Attachment handling remains metadata-only.
4. No Gmail-only fields were added to the canonical schema.
5. Raw payload and non-secret metadata are preserved well enough for debugging and replay.