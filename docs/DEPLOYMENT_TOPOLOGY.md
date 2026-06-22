# Deployment Topology

Required services:
- `web`: Next.js app serving UI, auth, server actions, OAuth callbacks, and webhooks.
- `worker`: BullMQ worker process.
- `postgres`: durable database.
- `redis`: queue backend.

Optional:
- `api`: unused for V1 product traffic unless explicitly deployed for `/health` only.
- Dedicated cron/maintenance process: optional; can enqueue `maintenance.recover_stuck_jobs`, `maintenance.renew_gmail_watch`, and `agent.evaluate_follow_ups`.

Health checks:
- Web: load `/sign-in` or an authenticated operator page in smoke tests.
- Worker: check worker logs plus runtime health counts in audit/operator UI.
- DB: `prisma migrate status`.
- Redis: worker runtime health shows Redis connected and queue names.
- Queue: operator runtime jobs and dead letters.
- Connector: integration ops health state.

Startup order:
1. Postgres and Redis.
2. Apply migrations.
3. Start web.
4. Start worker.
5. Verify webhook URLs.

Worker command:

```powershell
.\apps\worker\node_modules\.bin\tsx.CMD .\apps\worker\src\server.ts
```

Migration command:

```powershell
.\packages\db\node_modules\.bin\prisma.CMD migrate deploy --schema .\packages\db\prisma\schema.prisma
```

Rollback:
- Roll back web and worker together.
- Do not delete queues or database rows.
- Keep Redis/Postgres stable so queued work and idempotency state remain available.
