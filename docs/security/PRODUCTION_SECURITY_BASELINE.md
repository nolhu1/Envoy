# Production Security Baseline

## Startup Checks

- Production startup validates `ENVOY_SECRET_ENCRYPTION_KEY` through the connector secret store.
- `NEXTAUTH_SECRET` is required in production.
- Missing OAuth and OpenAI configuration is surfaced as startup/runtime warnings so connector and agent failures are diagnosable without exposing secrets.

## Rate Limits

Lightweight in-memory rate limits protect:

- Credentials login.
- NextAuth callback POSTs.
- Password reset requests.
- Slack Events API route.
- Gmail Pub/Sub route.
- Connector reconnect actions.
- Manual sync, manual send, Gmail watch renewal, and manual agent run actions.

For multi-instance production deployments, replace or back this limiter with Redis so limits are shared across instances.

## Headers

The web middleware sets:

- Content-Security-Policy.
- X-Frame-Options.
- Referrer-Policy.
- X-Content-Type-Options.
- Permissions-Policy.

The CSP is intentionally practical for the current Next.js stack and can be tightened as external asset domains stabilize.

## Request Validation

- Webhooks verify provider authenticity before ingestion.
- Server actions validate route/form identifiers against the authenticated workspace.
- Operator pages use workspace-scoped query helpers and RBAC checks.
- Pagination and list helpers use bounded limits.

## Diagnostics

User-facing errors should be sanitized and concise. Operator diagnostics may include error class, category, retryability, and correlation IDs, but never raw tokens, auth headers, cookies, or provider secret payloads.
