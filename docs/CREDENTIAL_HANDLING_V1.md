# Envoy Credential Handling v1

## Purpose

This document defines the credential handling contract for connector integrations in the Envoy MVP.

The credential handling layer exists so that:
- connector auth material is stored safely
- connectors can refresh credentials without leaking secrets into business tables
- integrations can reconnect or rotate credentials cleanly
- connector-specific auth formats remain isolated from the canonical data model

This contract applies to:
- OAuth-based connectors
- API-token-based connectors
- future credential-based connectors

---

## Core Rules

### 1. Secrets do not live in canonical metadata JSON
The following must never be stored in:
- `platform_metadata_json`
- `raw_payload_json`
- `config_json`

Examples:
- access tokens
- refresh tokens
- client secrets
- private API keys
- webhook signing secrets

### 2. Integrations store references, not raw secrets
The `integrations` table should store:
- provider identity
- status
- non-secret config
- non-secret lifecycle metadata
- a secret reference or secret handle if needed

It should not store raw credential values directly unless there is a temporary MVP fallback that is explicitly isolated and encrypted.

### 3. Connectors receive resolved auth material through runtime context
Connector code should not query random DB fields for tokens.
Instead, connector runtime should receive auth material through a structured `ConnectorContext`.

### 4. Refresh is a first-class connector operation
Credential refresh must be handled through `refreshAuth()` and not mixed into normal send or sync logic except when operationally required.

### 5. Rotation must be supported without changing core conversation logic
Credential replacement or reconnection must update integration auth state without affecting canonical messages or conversations.

---

## Credential Types

### OAuth credentials
Typical fields:
- access token
- refresh token
- token expiry
- granted scopes
- provider account identifier

Examples:
- Gmail OAuth
- Slack OAuth

### Static API credentials
Typical fields:
- API key
- token label
- optional signing secret

Examples:
- future connectors with API-key auth

### Webhook secrets
Typical fields:
- signing secret
- verification token

These are connector secrets and must be stored like other secret material, not in metadata JSON.

---

## Canonical Integration Storage Responsibilities

The `integrations` table is the canonical integration owner and should store non-secret connector state such as:
- `workspace_id`
- `platform`
- `external_account_id`
- `status`
- `auth_type`
- `last_synced_at`
- `config_json`
- `platform_metadata_json`  [oai_citation:1‡DATA_MODEL_V1.md](sediment://file_00000000eb44722f911c7913e2821476)

### What belongs in config_json
Only non-secret product-relevant connector configuration.

Examples:
- selected sync mode
- enabled scopes summary
- import options
- rate-limit preference hints
- connector mode toggles

### What belongs in platform_metadata_json
Only non-secret provider-specific operational metadata.

Examples:
- provider display name
- provider workspace label
- webhook registration status
- last sync cursor
- auth error category
- reconnect hint
- token expiry timestamp summary if non-sensitive

### What does not belong in integration records
- access token
- refresh token
- raw OAuth response
- client secret
- webhook signing secret

---

## Secret Storage Contract

### Secret store responsibility
Use a dedicated secret storage layer separate from normal app business tables.

For MVP this may start as:
- an encrypted secret store table or service
- or a provider secret manager abstraction

The interface must allow later replacement without rewriting connector logic.

### Minimum secret store capabilities
The secret store layer must support:
- create secret
- read secret
- update secret
- rotate secret
- revoke or delete secret
- versioning or replacement metadata if possible

### Secret reference shape
Integrations should store a reference such as:
- `secretRef`
- `credentialHandle`
- `authMaterialRef`

This reference points to the secret store entry and is used to resolve auth material at runtime.

---

## Runtime Credential Resolution

### ConnectorContext requirement
`ConnectorContext` should contain either:
- a secret reference that can be resolved before connector execution
- or already-resolved auth material injected by the calling service

Recommended fields:
- workspaceId
- integrationId
- platform
- integration metadata
- config
- secret reference
- resolved auth material when needed

### Runtime rule
Connector methods should operate on structured auth material passed through context, not direct DB token access.

This keeps:
- connector code testable
- auth refresh isolated
- secret storage replaceable

---

## Refresh Token Flow

### When refresh should happen
Refresh may be triggered when:
- token expiry is near
- provider returns an auth-expired response
- a scheduled maintenance job refreshes credentials
- reconnect logic requires replacement auth

### Refresh flow
1. load integration and confirm lifecycle allows refresh
2. resolve current auth material from secret storage
3. call connector `refreshAuth()`
4. receive updated auth material
5. update the secret store entry
6. update integration lifecycle metadata if needed
7. if refresh fails, move integration toward `ERROR` state

### Refresh outputs
Connector refresh should return:
- updated auth material
- new expiry time if available
- refresh outcome
- provider diagnostics safe for metadata storage

---

## Rotation and Reconnect

### Rotation
Rotation means replacing current credential material without changing workspace ownership or canonical history.

Examples:
- user reconnects Google account
- user re-installs Slack app
- API key is replaced

### Rotation rules
- do not create a duplicate integration if the same external account is being repaired
- preserve integration ownership where appropriate
- preserve conversation history
- update secret reference or secret version cleanly
- write operational diagnostics, not raw secrets, into metadata

### Reconnect
Reconnect may transition integration state from:
- `ERROR -> CONNECTED`
- `DISCONNECTED -> PENDING`
- `DISCONNECTED -> CONNECTED`
depending on provider flow and lifecycle rules  [oai_citation:2‡INTEGRATION_LIFECYCLE_V1.md](sediment://file_00000000686c71f896a517665a3a02c6)

---

## Connector-Specific Config Storage

Connector-specific config is allowed, but it must remain non-secret.

Examples:
- Gmail import label filters
- Slack selected channel scope mode
- webhook enabled flag
- sync window size
- backfill enabled flag

Store this in `config_json`, not in secrets storage.

Rule:
If config value grants access or authenticates the connector, it is a secret.
If config value changes behavior but does not authenticate, it can live in `config_json`.

---

## Credential Error Handling

### Auth-related failures should produce:
- clear connector diagnostics
- lifecycle status updates
- reconnect hints when possible

### Safe metadata examples
Allowed:
- `auth_error_category = "token_expired"`
- `reauth_required = true`
- `last_auth_failure_at = timestamp`

Not allowed:
- raw provider auth payloads containing secrets
- token strings
- secret fragments

---

## Recommended Internal Types

The codebase should eventually define stable internal auth material types such as:

### OAuthAuthMaterial
- accessToken
- refreshToken
- expiresAt
- scopes
- tokenType
- providerAccountId

### ApiKeyAuthMaterial
- apiKey
- keyLabel
- optional secret extras

### WebhookSecretMaterial
- signingSecret
- verificationToken

These types belong in connector/auth infrastructure, not in canonical business schema.

---

## Anti-Patterns

Do not do any of these:

1. Store access tokens in `platform_metadata_json`.
2. Store refresh tokens in `config_json`.
3. Make connectors fetch tokens directly from business tables.
4. Hardcode one provider’s token shape into shared framework code.
5. Mix token refresh logic into unrelated normalization code.
6. Replace integrations by deleting and recreating them when simple reconnect or rotation should suffice.

---

## Acceptance Test

The credential handling contract is correct only if all of the following are true:

1. Gmail OAuth can be supported without storing tokens in canonical metadata.
2. Slack OAuth can be supported without storing tokens in canonical metadata.
3. Connectors can receive resolved auth material through shared runtime context.
4. Credential refresh can update auth material without changing core conversation logic.
5. Reconnect or rotation can recover an integration without deleting historical data.