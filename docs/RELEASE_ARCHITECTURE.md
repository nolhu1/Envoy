# Release Architecture

Envoy V1 is a workspace-scoped messaging operations app.

Core services:
- Next web app: product UI, auth, server actions, OAuth callbacks, webhook routes, and operator pages.
- Worker: BullMQ consumers for sync, outbound sends, agent jobs, maintenance, and safe recovery.
- Postgres: canonical product data, event journal, idempotency records, runtime jobs, attempts, dead letters, approvals, action logs.
- Redis: BullMQ queues and job delivery.
- Optional API app: currently not part of V1 product traffic.

Durability model:
- Events are persisted in `EventJournal`.
- Critical operations use `IdempotencyRecord`.
- Worker work is tracked in `RuntimeJob` and `RuntimeJobAttempt`.
- Exhausted failures create `DeadLetterRecord`.

Safety model:
- AI only creates drafts and approval requests.
- Sends require human manual action or approved draft continuation.
- All operator reads/actions are workspace-scoped and RBAC-gated.
- Connector secrets are encrypted and never rendered in operator UI.
