# Secret Handling Policy

## Storage

- Connector OAuth material is stored only through the connector secret store.
- `ENVOY_SECRET_ENCRYPTION_KEY` must be valid before production startup can create a Prisma client.
- `platformMetadataJson`, `metadataJson`, EventJournal payloads, RuntimeJob payloads, and UI DTOs must never contain access tokens, refresh tokens, cookies, auth headers, API keys, or decrypted secret payloads.

## Access Boundaries

- Provider operations may read decrypted secrets only inside server or worker runtime paths.
- UI and operator helpers must return only safe metadata: provider, account identifiers, health state, timestamps, retryability, and sanitized error summaries.
- Reconnect rotates existing secret material and records a safe `secretOperation` marker in the integration-connected event.

## Redaction

Use the shared security helpers before logging or rendering diagnostics. Redaction covers OAuth tokens, refresh tokens, bearer auth, cookies, Slack/Gmail tokens, OpenAI keys, and secret-like fields.

## Logging

Provider failures should log sanitized category and correlation details only. Raw provider responses are allowed only if they have been passed through diagnostics sanitization.

## Deferred Work

- Dedicated secret-read audit events may be added around high-volume provider operations later. For now, rotation/reconnect is audited without spamming sync/send logs.
