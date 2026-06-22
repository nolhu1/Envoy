# Environment Variables

This file documents the variables needed for the easiest local evaluation flow: sign up, connect Gmail, sync data.

## Required For Local Runtime

- `DATABASE_URL`: Postgres connection string.
- `REDIS_URL`: Redis connection string for BullMQ.
- `NEXTAUTH_URL`: local app URL, usually `http://localhost:3000`.
- `NEXTAUTH_SECRET`: session signing secret.
- `ENVOY_SECRET_ENCRYPTION_KEY`: 32-byte key encoded as either 64-char hex or base64.

## Required For Gmail OAuth

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REDIRECT_URI`
- `GMAIL_OAUTH_STATE_SECRET`

For local development, set:

- `GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback`

## Optional For Gmail Live Sync

Manual sync works without these. Add them only if you want Gmail Pub/Sub push updates.

- `GMAIL_PUBSUB_TOPIC`
- `GMAIL_PUBSUB_VERIFICATION_TOKEN`
- `GMAIL_PUBSUB_AUDIENCE`
- `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`

## Optional For Agent Draft Generation

- `OPENAI_API_KEY`
- `OPENAI_DRAFT_MODEL`
- `OPENAI_BASE_URL`

Without `OPENAI_API_KEY`, Gmail sync and the core inbox still work, but draft preview / generation features will fail when invoked.

## Optional Worker Settings

- `WORKER_ID`
- `WORKER_CONCURRENCY`
- `ENVOY_DISABLE_INLINE_AGENT_TRIGGERS`

Never store provider tokens in metadata JSON or expose decrypted secret payloads to UI DTOs.
