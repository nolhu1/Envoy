# Envoy Gmail Sync Backfill and Checkpoint Contract v1

## Purpose

This document defines the Gmail backfill and checkpoint contract for the Envoy MVP.

The Gmail connector must:
- import a bounded recent window after account connection
- maintain non-secret sync checkpoint state
- avoid full mailbox historical import in MVP
- support safe repeated polling without creating duplicate canonical records

---

## Core Rules

1. Gmail sync checkpoint data is non-secret and belongs in integration metadata.
2. Gmail sync must remain bounded in MVP.
3. Initial connect sync and later manual resync should share the same checkpoint model.
4. Full historical mailbox import is out of scope for MVP.
5. Repeated sync must converge on the same canonical state.

---

## Initial Backfill Scope

### Included
- recent-thread import after connect
- bounded lookback window
- limited thread count or similar guardrail
- enough history to populate the Envoy inbox meaningfully

### Recommended MVP defaults
- recent lookback window such as 7 to 14 days
- bounded maximum thread count per sync batch
- manual resync allowed for the same bounded window

### Deferred
- full historical mailbox import
- large mailbox migration
- unbounded sync
- advanced label/folder backfill semantics

---

## Checkpoint Storage

Checkpoint data should live in non-secret integration metadata.

Allowed checkpoint examples:
- `lastSyncedAt`
- `lastSuccessfulSyncAt`
- `lastRecentWindowStart`
- `lastRecentWindowEnd`
- `lastSyncThreadCount`
- `lastSyncMessageCount`
- `lastSyncStatus`
- sync diagnostics summary

Do not store:
- access tokens
- refresh tokens
- auth secrets

This follows the metadata and credential handling rules.

---

## Sync Modes

### 1. Initial connect sync
Purpose:
- populate the first recent inbox state after Gmail is connected

Expected behavior:
- run bounded recent-thread import
- write checkpoint metadata on success
- leave integration in healthy connected state after sync completes

### 2. Manual resync
Purpose:
- refresh recent Gmail thread state on demand

Expected behavior:
- rerun bounded recent-thread polling
- use shared inbound idempotency and canonical upsert rules
- update checkpoint metadata again on success

### 3. Future incremental sync
Deferred in implementation, but checkpoint design should leave room for:
- provider cursor
- history id
- incremental poll marker
- push/watch coexistence later

---

## Success Criteria for Checkpoint Updates

A sync may update checkpoint metadata only after:
- connector fetch succeeded
- normalization succeeded
- canonical persistence completed without fatal failure

Recommended metadata updates after success:
- sync timestamp
- recent window bounds
- item counts
- status summary
- connector diagnostics summary if useful

If sync fails:
- preserve safe diagnostics
- do not falsely mark successful checkpoint completion

---

## Lifecycle Interaction

Recommended Gmail sync lifecycle flow:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

On meaningful connector failure:
- transition toward `ERROR` as appropriate

Do not invent Gmail-only lifecycle states.

---

## Dedupe and Idempotency

Repeated backfill or manual resync must not create duplicate canonical records.

Use:
- shared inbound dedupe rules
- canonical uniqueness for messages
- shared idempotency contract where applicable

The checkpoint model does not replace dedupe.
It only records sync progress and outcome.

---

## Metrics to Preserve in Metadata

Safe and useful examples:
- threads scanned
- messages normalized
- messages inserted
- messages matched
- attachments inserted
- sync duration summary
- last failure category

These are operational metadata, not business schema fields.

---

## Explicit MVP Non-Goals

Do not add these to the first backfill/checkpoint implementation:
- full mailbox history import
- Gmail push/watch as primary sync path
- Gmail label sync as a first-class canonical model
- advanced mailbox state replication
- background scheduling sophistication beyond basic manual/recent sync behavior

---

## Acceptance Test

The Gmail backfill/checkpoint contract is correct only if all of the following are true:

1. Initial Gmail connect can populate recent threads without full mailbox import.
2. Manual resync can safely rerun the same bounded recent sync window.
3. Checkpoint metadata remains non-secret and lives in integration metadata.
4. Repeated sync converges without duplicate canonical records.
5. The checkpoint model leaves room for future incremental sync or Gmail push/watch later.