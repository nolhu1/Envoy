# Production Checks

Before deploy:
- `DATABASE_URL` points to production Postgres.
- `REDIS_URL` points to production Redis.
- `ENVOY_SECRET_ENCRYPTION_KEY` is present, strong, and not shared with non-prod.
- OAuth callback URLs match deployed web URL.
- Gmail Pub/Sub topic and push endpoint are configured.
- `OPENAI_API_KEY` is present if agent drafting is enabled.

Deploy:
- Run migrations once before starting new workers.
- Start one web deployment and at least one worker.
- Confirm worker can connect to Redis and Postgres.
- Confirm operator runtime health shows queues and no stale RUNNING jobs.

Smoke tests:
- Login as admin.
- Open workspace settings, audit, integration ops, agent runs, approval history.
- Queue a manual sync.
- Queue a manual reply against a safe test integration or mocked staging provider.
- Generate an AI draft and confirm approval is required before send.

Post deploy:
- Watch dead letters, failed runtime jobs, connector health, and webhook delivery logs.
- Verify no provider tokens appear in logs or operator panels.
