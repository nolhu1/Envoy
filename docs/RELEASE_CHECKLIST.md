# Release Checklist

Pre-release:
- Run web lint, web typecheck, web build, worker typecheck.
- Run regression suite.
- Confirm seed runs on disposable database.
- Confirm no duplicate lockfile warning in web build.

Database:
- Review pending Prisma migrations.
- Run `prisma migrate status`.
- Run `prisma migrate deploy`.

Environment:
- Confirm all variables in `docs/ENVIRONMENT_VARIABLES.md`.
- Confirm encryption key is production-safe.
- Confirm webhook public URL is stable.

Webhooks:
- Gmail Pub/Sub push route configured.
- Gmail watch renewal configured.

Smoke:
- Admin login.
- Runtime health visible.
- Manual sync queues and worker completes/fails visibly.
- Manual send queues and worker completes/fails visibly.
- Approval send queues only after human approval.
- Agent output creates draft plus approval only.

Rollback:
- Roll back web and worker image together.
- Leave Postgres and Redis intact.
- Pause providers/webhooks only if they are causing repeated unsafe failures.

Post-release:
- Monitor runtime jobs, dead letters, connector health, auth errors, and provider rate limits.
