# Envoy Gmail OAuth Connect Contract v1

## Purpose

This document defines the exact Gmail OAuth connect contract for the Envoy MVP.

It covers:
- how a workspace admin starts Gmail connection
- how OAuth callback exchange is handled
- what secret material is stored
- what integration record is created or updated
- how lifecycle state changes
- what errors are surfaced

This contract is limited to Gmail API connection for the MVP.

---

## Core Rules

1. Gmail connection is workspace-scoped.
2. Only users allowed to connect integrations may start or complete the connect flow.
3. Raw OAuth secrets and tokens must not be stored in integration metadata JSON.
4. Successful connection must end in a valid integration record plus secret reference.
5. The Gmail connector must use the shared integration lifecycle and shared credential handling rules.

---

## Authorized Actor

### Who can connect Gmail
Allowed role:
- `ADMIN`

Denied roles:
- `MEMBER`
- `VIEWER`

This follows the MVP RBAC policy for integration management.

---

## Connect Flow Overview

### Step 1 — Start connect
A workspace admin clicks “Connect Gmail” inside Envoy.

System responsibilities:
- confirm the user is authenticated
- confirm the user belongs to the active workspace
- confirm the user has `connect_integrations` permission
- generate OAuth state tied to the workspace and user
- redirect to Google OAuth consent

### Step 2 — Google consent
The user authorizes the Gmail integration with the requested scopes.

### Step 3 — OAuth callback
Envoy receives the callback with:
- authorization code
- state

System responsibilities:
- validate state
- exchange code for tokens
- fetch provider account identity needed for integration ownership
- create or update secret storage
- create or update integration record
- transition lifecycle appropriately
- trigger initial recent-thread sync later

---

## Required OAuth State Properties

The OAuth state must be sufficient to validate the callback and restore workspace context safely.

Recommended state contents:
- workspaceId
- initiatingUserId
- connector type = Gmail
- nonce
- createdAt or expiry marker

Rules:
- state must be signed or otherwise tamper-resistant
- state must expire
- callback must fail cleanly if state is missing, invalid, expired, or workspace-mismatched

---

## OAuth Scopes

The Gmail connector should request only the minimum scopes needed for MVP behavior.

MVP capabilities require:
- read recent threads
- read message/thread content
- send replies in existing threads

The exact Google scopes should be chosen to support:
- Gmail thread/message read
- Gmail send/reply

Rules:
- keep requested scopes minimal
- do not request unrelated Google account scopes
- document final scope strings in the implementation

---

## Connect Input Contract

### Start connect input
Inputs:
- authenticated app user
- workspace id
- connector type = Gmail

Outputs:
- Google authorization URL
- signed state payload

### Callback input
Inputs:
- authorization code
- state
- authenticated or correlation-safe callback context

Outputs:
- exchanged auth material
- external account identity
- integration create/update decision
- secret store result
- lifecycle update result

---

## Secret Storage Outcome

Successful OAuth callback should produce secret material compatible with the shared credential handling contract.

Expected stored auth material:
- access token
- refresh token if issued
- token expiry if available
- granted scopes summary if useful
- provider account identifier if useful

Rules:
- store secret material only through the secret storage abstraction
- integration record stores secret reference only
- do not store raw OAuth response in `platform_metadata_json`
- safe non-secret diagnostics may be stored separately

---

## Integration Record Outcome

Successful connect should create or update one `integrations` record scoped to the current workspace.

Expected canonical integration fields:
- `workspace_id`
- `platform = EMAIL`
- `auth_type = oauth`
- `external_account_id`
- `display_name`
- `status`
- `config_json`
- `platform_metadata_json`

Expected metadata examples:
- provider = gmail
- connected email address
- granted scope summary if non-secret
- provider display label
- reconnect hints if needed later

Rules:
- no raw tokens in the integration record
- use one integration per connected Gmail account inside a workspace
- do not duplicate integrations for the same workspace/account without explicit reason

---

## Lifecycle Transitions

The Gmail connect flow must follow the shared integration lifecycle.

Recommended transition flow:
1. create or mark integration as `PENDING`
2. after successful code exchange and account validation, transition to `CONNECTED`
3. if exchange or validation fails, transition to `ERROR`
4. later initial import may move `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

Do not invent Gmail-only lifecycle states.

---

## Duplicate Connect Rule

If the same Gmail account is reconnected for the same workspace:
- prefer updating the existing integration and rotating secret material
- do not create unnecessary duplicate integration rows
- preserve prior normalized history when possible

If the same Gmail account is attempted in a different workspace:
- handle according to product policy later
- for MVP, at minimum keep workspace ownership explicit and do not cross-link data

---

## Error Cases

The connect flow must fail cleanly for at least these cases:

### Invalid or expired state
Result:
- reject callback
- do not exchange code
- do not create or update integration

### OAuth code exchange failure
Result:
- no successful connect
- integration may remain `PENDING` or move to `ERROR` depending on implementation path
- store safe diagnostics only

### Missing refresh token or insufficient auth material
Result:
- fail connection if MVP requires refreshable access
- surface reconnect guidance if useful

### Provider identity fetch failure
Result:
- do not finalize integration ownership
- fail safely
- avoid storing incomplete integration state as connected

### Secret store write failure
Result:
- do not mark integration connected
- avoid partial successful connect state

### Integration persistence failure
Result:
- do not report success
- preserve safe diagnostics
- avoid leaking secret material

---

## Security Rules

### Workspace boundary
The connect and callback flow must resolve to exactly one workspace.

### Permission boundary
Only users with integration management permission may complete the connect flow.

### Secret boundary
Tokens and secrets:
- must not be logged in plaintext
- must not be written to integration metadata JSON
- must only be persisted through the secret storage abstraction

### Metadata boundary
Use metadata JSON only for non-secret provider context.

This follows the normalization and credential handling rules already defined.

---

## Connect Result Contract

A successful Gmail connect should produce a connector-level result equivalent to:

- externalAccountId
- displayName
- integrationStatus = CONNECTED
- secretRef
- platformMetadata

This should align with the shared `connect()` connector contract.

---

## Deferred Items

Do not include these in the first connect implementation:
- Gmail push/webhook setup
- full mailbox import
- label management
- send-as alias support
- multi-account connect UX polish
- deep reconnect UI flows

Those come later.

---

## Acceptance Test

The Gmail OAuth connect contract is correct only if all of the following are true:

1. An admin can start Gmail OAuth for the current workspace.
2. The callback validates state and workspace context safely.
3. Secret material is stored only through the secret storage abstraction.
4. The integration record stores non-secret Gmail connection metadata only.
5. Successful connect results in a valid workspace-scoped integration in `CONNECTED` state.
6. The contract does not introduce Gmail-only fields into the canonical data model.