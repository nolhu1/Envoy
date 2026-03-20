# Envoy Integration Lifecycle v1

## Purpose

This document defines the lifecycle contract for connector integrations in the Envoy MVP.

An integration represents a connected provider account or installation inside a workspace, such as:
- a Gmail account
- a Slack workspace/app installation

The lifecycle contract exists so that:
- all connectors follow the same status model
- the UI can represent connector state consistently
- background sync and send logic can react to integration health
- auth failures and reconnect flows behave predictably
- provider-specific logic stays inside connectors while lifecycle behavior remains shared

---

## Canonical Integration Owner

Integrations are workspace-scoped resources.

Each integration belongs to exactly one workspace and must never be accessible from another workspace.

Key canonical fields already defined in the data model include:
- `id`
- `workspace_id`
- `platform`
- `external_account_id`
- `status`
- `last_synced_at`
- `config_json`
- `platform_metadata_json`
- `deleted_at`

The integration lifecycle operates through the canonical `status` field and related timestamps/metadata.

---

## MVP Integration States

### PENDING
Meaning:
- the integration has been initiated but is not yet fully usable

Examples:
- OAuth flow started but not completed
- credential submission received but not yet validated
- integration record created before first successful sync

What is allowed:
- connect completion
- auth validation
- initial metadata write
- transition to `CONNECTED`
- transition to `ERROR`

What is not allowed:
- normal inbound sync processing
- outbound message sending

---

### CONNECTED
Meaning:
- the integration is active and available for normal use

Examples:
- valid auth exists
- connector can sync or send
- integration is visible as healthy in settings

What is allowed:
- inbound sync
- webhook ingestion
- outbound send
- refresh auth
- transition to `SYNC_IN_PROGRESS`
- transition to `ERROR`
- transition to `DISCONNECTED`

What is not allowed:
- nothing special beyond normal workspace and permission boundaries

---

### SYNC_IN_PROGRESS
Meaning:
- the integration is currently running an initial sync, backfill, resync, or incremental sync job

Examples:
- recent threads are being imported after connect
- manual resync started
- background sync currently running

What is allowed:
- sync job execution
- cursor/checkpoint updates
- transition back to `CONNECTED`
- transition to `ERROR`
- possibly outbound send if auth is still valid and product policy allows it

MVP recommendation:
- treat this as an operational state, not a disabled state
- outbound sending may remain allowed if connector auth is valid

What is not allowed:
- duplicate overlapping sync jobs for the same integration unless explicitly designed

---

### ERROR
Meaning:
- the integration is not healthy enough for normal operation

Examples:
- auth refresh failed
- webhook verification failed repeatedly
- provider rejected credentials
- sync job failed in a non-transient way
- connector configuration is invalid

What is allowed:
- reconnect flow
- credential refresh
- retry after fix
- transition to `CONNECTED`
- transition to `DISCONNECTED`

What is not allowed:
- silent normal operation
- pretending the connector is healthy in the UI
- uncontrolled retry loops

Operational note:
- the error reason should be preserved in connector diagnostics or metadata, but not as provider secrets

---

### DISCONNECTED
Meaning:
- the integration is intentionally disconnected or has been made inactive

Examples:
- user removed the integration
- token was revoked and integration was closed
- connector is no longer authorized to operate

What is allowed:
- historical data remains readable
- reconnect or reconnect-like replacement flow
- transition to `PENDING` or `CONNECTED` only through an explicit reconnect flow

What is not allowed:
- inbound processing
- outbound sending
- sync scheduling

---

## Allowed State Transitions

### Allowed transitions

- `PENDING -> CONNECTED`
- `PENDING -> ERROR`

- `CONNECTED -> SYNC_IN_PROGRESS`
- `CONNECTED -> ERROR`
- `CONNECTED -> DISCONNECTED`

- `SYNC_IN_PROGRESS -> CONNECTED`
- `SYNC_IN_PROGRESS -> ERROR`
- `SYNC_IN_PROGRESS -> DISCONNECTED`

- `ERROR -> CONNECTED`
- `ERROR -> DISCONNECTED`

- `DISCONNECTED -> PENDING`
- `DISCONNECTED -> CONNECTED` only through explicit reconnect logic if supported cleanly

### Disallowed transitions

Examples of disallowed direct transitions:
- `PENDING -> DISCONNECTED` without explicit cancellation or teardown logic
- `DISCONNECTED -> SYNC_IN_PROGRESS`
- `ERROR -> SYNC_IN_PROGRESS` without first restoring connector health
- any transition that bypasses auth validation when auth is required

---

## Transition Triggers

### Connect started
Typical result:
- create or update integration in `PENDING`

### Connect completed successfully
Typical result:
- write external account metadata
- store secret reference
- transition to `CONNECTED`

### Initial backfill or manual resync started
Typical result:
- transition to `SYNC_IN_PROGRESS`

### Sync completed successfully
Typical result:
- update `last_synced_at`
- update cursor/checkpoint metadata
- transition to `CONNECTED`

### Auth refresh failure or provider auth invalid
Typical result:
- transition to `ERROR`

### Recoverable error resolved
Typical result:
- refresh auth or reconnect
- transition to `CONNECTED`

### User disconnects integration
Typical result:
- revoke tokens if supported
- stop jobs/webhook use
- transition to `DISCONNECTED`

---

## Lifecycle Metadata Expectations

The shared lifecycle service should support updating these integration-adjacent fields where relevant:

### status
Canonical lifecycle status.

### last_synced_at
Updated when a sync finishes successfully.

### config_json
Stores connector configuration that is not secret and is product-relevant.

Examples:
- sync preferences
- selected scope modes
- connector options

### platform_metadata_json
Stores provider-specific non-secret lifecycle detail.

Examples:
- provider display name
- provider workspace label
- webhook registration metadata
- last cursor/checkpoint
- sync diagnostics
- last known error code/category
- reconnect hints

### deleted_at
Used only for soft deletion behavior if you later add it to operational disconnect/archive flows.
Do not use `deleted_at` as the main lifecycle control in MVP.
Use `status`.

---

## Lifecycle Rules

### Rule 1 — Workspace boundary first
Any lifecycle operation must be executed only within the integration’s owning workspace.

### Rule 2 — Status drives operational eligibility
Inbound sync, webhook processing, and outbound send behavior must check integration status before proceeding.

### Rule 3 — Error is explicit
If the integration is unhealthy, status must reflect that.
Do not hide failures inside metadata only.

### Rule 4 — Disconnect preserves history
Disconnecting an integration must not delete historical conversations or messages already normalized into Envoy.

### Rule 5 — Sync state is operational, not ownership-related
`SYNC_IN_PROGRESS` reflects connector activity, not a different tenancy or permission model.

### Rule 6 — Secret material stays outside metadata JSON
Lifecycle state may reference secret storage indirectly, but tokens and secrets must not be stored in `platform_metadata_json`.

---

## Connector Responsibilities vs Shared Lifecycle Responsibilities

### Connector responsibilities
- provider auth exchange
- provider revoke logic
- provider sync calls
- provider send calls
- provider-specific diagnostics

### Shared lifecycle service responsibilities
- status transitions
- transition validation
- last synced bookkeeping
- shared error state handling
- preventing invalid transitions
- giving the UI a stable status model

---

## UI Expectations

The product UI should be able to represent integrations consistently using this lifecycle:

### PENDING
- “Connecting” or “Setup in progress”

### CONNECTED
- “Connected”

### SYNC_IN_PROGRESS
- “Syncing”

### ERROR
- “Needs attention” or “Connection error”

### DISCONNECTED
- “Disconnected”

The UI should not need provider-specific logic just to understand connector health.

---

## Acceptance Test

The lifecycle contract is correct only if all of the following are true:

1. Every integration fits one shared status model.
2. Gmail can use this lifecycle without needing Gmail-only status values.
3. Slack can use this lifecycle without needing Slack-only status values.
4. The UI can represent connector health from the shared status field.
5. A connector can fail auth, recover, sync, and disconnect without changing core conversation logic.