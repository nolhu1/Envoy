# Tenancy Audit Summary

## Surfaces Audited

- Operator/admin routes: audit log, integration ops, agent runs, approval history, settings audit.
- Runtime readers and recovery helpers: runtime jobs, attempts, dead letters, health summaries.
- Integration operations: connect/reconnect, disconnect, manual sync, Gmail watch renewal.
- Conversation, message, approval, agent run, and attachment routes/actions.

## Major Fixes

- Added centralized tenancy helpers in `apps/web/src/lib/tenancy.ts` for workspace, operator, conversation, and integration access checks.
- Re-exported tenancy helpers through the existing workspace guard module so new server code has one obvious import path.
- Hardened high-risk server actions with workspace-derived auth context and rate limits.
- Preserved workspace-scoped DB access for operator readers and attachment download.
- Added explicit production security validation before auth/DB bootstrap.

## Required Pattern

Every server read/write/action must derive `workspaceId` from the authenticated session, then scope the DB query by that workspace. Client-supplied workspace IDs are diagnostic hints only and must not grant access.

## Deferred Risks

- Fine-grained replay/retry UI remains intentionally conservative. Any future replay UI must re-check workspace membership and avoid unsafe provider-send replay.
- Webhook routes remain unauthenticated by user session by design; they must continue to authenticate by provider signature/OIDC and map only to connected workspace integrations.
