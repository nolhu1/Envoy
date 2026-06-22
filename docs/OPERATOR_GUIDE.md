# Operator Guide

Audit viewer:
- Use for action logs and event journal inspection.
- Filter by actor, event/action, resource, status, and date.
- Use links to conversation, approval, runtime job, or agent run.

Integration Ops:
- Use Reconnect for auth problems.
- Use Resume sync when checkpoint has more pages.
- Disconnect is secondary and preserves history.

Runtime Jobs:
- Shows queued/running/completed/failed/dead-lettered work.
- Use detail pages to inspect attempts, payload summaries, and errors.
- Retry only safe jobs.

Agent Runs:
- Shows manual, automatic, follow-up evaluation, suppression, escalation, draft and approval output.
- AI runs should only produce drafts and approval requests.
- Model and prompt metadata are diagnostic, not customer-facing content.

Approval History:
- Shows reviewer, status, edited content indicator, send result, and failed send linkage.
- Approval remains approved even if provider send later fails.

Health states:
- Healthy: normal operation.
- Degraded: usable but needs monitoring.
- Action required: operator must reconnect, resume, retry, or inspect failures.
- Disconnected: sync/send is blocked until reconnect.
- Unknown: insufficient runtime metadata.
