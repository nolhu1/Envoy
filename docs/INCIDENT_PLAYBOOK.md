# Incident Playbook

Gmail sync failures:
- Open Integration Ops.
- Check Gmail health, checkpoint, recent sync jobs, and dead letters.
- Reconnect if auth problem is shown.
- Resume sync after credentials recover.

- Reconnect if token/auth problem is shown.
- Confirm only DM sync is expected in V1.

Queue stalled:
- Open runtime health.
- Confirm Redis connected and worker heartbeat is fresh.
- Restart worker if no jobs are active in BullMQ but DB jobs are RUNNING.
- Run stuck job recovery maintenance.

Dead-letter spike:
- Filter Runtime Jobs and Dead Letters by queue.
- Do not replay outbound sends unless idempotency protection is present.
- Fix connector/env issue first, then retry safe jobs.

Send failures:
- Check message state in thread.
- Reconnect integration if needed.
- Use retry action; it enqueues worker work and preserves idempotency.

OAuth/reconnect failures:
- Verify OAuth client ID, secret, redirect URI, app URL.
- Reconnect from settings.
- Existing conversations/messages should remain attached to the integration.

OpenAI/draft generation failures:
- Check `OPENAI_API_KEY`, model, and agent run detail.
- Confirm failures did not create sends.
- Retry manual Run Agent after service recovery.

Suspected tenant leak:
- Disable affected operator account.
- Preserve logs.
- Check workspace-scoped route/action paths.
- Rotate exposed credentials if any secret material was involved.

Suspected secret leak:
- Revoke and rotate provider secret.
- Rotate `ENVOY_SECRET_ENCRYPTION_KEY` only with a planned secret re-encryption process.
- Review logs and operator metadata for redaction gaps.
