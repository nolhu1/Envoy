# Regression Suite

Envoy V1 uses a deterministic Node test suite for launch regression checks.

Run:

```powershell
node --test tests/regression/*.test.mjs
```


Coverage:
- Auth/workspace invite and RBAC boundaries.
- Gmail callback/reconnect contract, paginated sync convergence, Pub/Sub idempotency, and attachment tenancy guard.
- Inbox/thread contract checks, manual reply queueing, and failed-send retry queueing.
- Approval approve/edit/reject send boundaries.
- Agent trigger queueing, follow-up suppression, draft-only generation, and approval requirement.
- Event journal, idempotency, runtime jobs, dead letters, and stuck recovery contract.
- Cross-workspace denial, operator access, redaction, and production dev-helper guard.

External providers are intentionally mocked so the suite can run before local services are started.
