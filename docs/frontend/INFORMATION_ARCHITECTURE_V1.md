# Information Architecture V1

Source documents:

- `docs/frontend/FRONTEND_GAP_AUDIT.md`
- `docs/frontend/FRONTEND_DESIGN_FOUNDATION.md`

Note: `FRONTEND_PRINCIPLES.md` and `VISUAL_LANGUAGE.md` were consolidated into `FRONTEND_DESIGN_FOUNDATION.md`.

This document defines the V1 application structure for Envoy. It does not define visual design and does not prescribe implementation code.

## 1. Global App Shell

### Layout Structure

V1 uses one shared authenticated app shell for all product pages.

Desktop structure:

1. Left sidebar: persistent primary navigation.
2. Topbar: workspace context, global status entry point, user/profile menu.
3. Main content area: page header, optional page status region, page body.

Mobile/tablet structure:

1. Topbar: workspace context, current section, menu trigger, user/profile access.
2. Collapsed navigation drawer or sheet for primary navigation.
3. Main content area with the same page body contract as desktop.

The shell owns:

- App background.
- Primary navigation.
- Workspace switch/context.
- Current user/profile access.
- Global alert/status region.
- Page content padding and max-width defaults.

Routes should not recreate these concerns.

### Workspace Context Placement

Workspace context belongs in the shell topbar, not in page cards.

Required workspace context:

- Workspace name.
- Workspace status if degraded.
- Optional workspace selector when multi-workspace support exists.

Do not show workspace ID as primary page content. IDs belong in metadata/details panels or copyable diagnostics.

### User/Profile Placement

User and profile access belong in the topbar user menu.

The user menu should contain:

- User name or email.
- Role label.
- Profile link.
- Sign out action.

Role should appear in page content only when it changes permissions or explains disabled actions.

### Global Alert / Status Region

The shell owns a global alert/status region immediately below the topbar and above the page content.

Use global alerts for:

- Workspace-wide degraded integration status.
- Active sync/send outage affecting multiple pages.
- Permission or session issues affecting the whole app.
- Background operation summaries that remain relevant across navigation.

Do not use global alerts for:

- A single form validation error.
- A one-off section update.
- A local detail-page action result that belongs near the action.

### Content Area Structure

Every page uses this content contract:

1. Page header: compact title, short optional description, primary page action if any.
2. Page-local status region: only for page-scoped blocking or result states.
3. Page body: queue, detail, settings form, or admin/operator tool.

Page body variants:

- Queue pages use a filter/action bar plus shared queue/table/list area.
- Detail pages use primary content plus action/context zones.
- Settings pages use settings sub-navigation plus section panels/forms.
- Operator/admin tools use dashboards, timelines, and data tables inside the shell.

## 2. Primary Navigation

Top-level sections:

1. Inbox
2. Approvals
3. Members
4. Settings
5. Operator

`Operator` is included in V1 because audit logs, agent runs, approval history, integration operations, and future analytics need a stable home. It should be permission-gated and hidden from users without access.

### Inbox

Purpose: unified operational queue for Gmail and Slack conversations.

Primary user task: triage conversations, inspect current status, open threads, and identify items needing response, assignment, or approval.

Default route: `/`

### Approvals

Purpose: human review area for AI-generated outbound drafts and approval lifecycle.

Primary user task: review pending drafts, approve/edit/reject, and inspect approval outcomes.

Default route: `/approvals`

### Members

Purpose: workspace member and invite administration.

Primary user task: view members, understand roles, create/revoke/resend invites, and manage access when permissions allow.

Default route: `/members`

### Settings

Purpose: workspace configuration and connector setup.

Primary user task: manage workspace profile, integrations, member-related settings, and future workspace policies.

Default route: `/settings/workspace`

### Operator

Purpose: operational observability, audit trails, agent activity, approval history, and future analytics.

Primary user task: investigate system activity, diagnose failed operations, inspect agent runs, and monitor workflow health.

Default route: `/audit`

## 3. Route Map

### Inbox

| Route | Page type | Purpose |
| --- | --- | --- |
| `/` | Queue | Unified inbox queue across Gmail and Slack. |
| `/conversations/[id]` | Detail | Conversation thread with messages, assignment state, manual reply, agent controls, approvals/send diagnostics, and audit timeline. |

### Approvals

| Route | Page type | Purpose |
| --- | --- | --- |
| `/approvals` | Queue | Pending approval queue with reviewed/recent filters. |
| `/approvals/[id]` | Detail | Approval review detail, draft context, decision actions, lifecycle status, and related conversation context. |
| `/approval-history` | Operator queue | Historical approval decisions across the workspace. |

### Members

| Route | Page type | Purpose |
| --- | --- | --- |
| `/members` | Queue/admin list | Workspace member and invite management. |

The top-level `/members` page remains because member management is a frequent administrative task. Settings may link to the same member administration surface rather than duplicate it.

### Settings

| Route | Page type | Purpose |
| --- | --- | --- |
| `/settings/workspace` | Settings form | Workspace profile, basic workspace metadata, and safe workspace-level configuration. |
| `/settings/integrations` | Settings/admin tool | Gmail and Slack connection state, reconnect, sync, disconnect, connector diagnostics, and integration operation entry points. |
| `/settings/members` | Settings redirect or scoped view | Entry point from settings to member/role management. Prefer redirecting to `/members` unless a settings-specific permissions view is needed. |
| `/settings/agent-policies` | Future settings form | Workspace-level agent policy defaults, assignment constraints, and trigger policy. |
| `/settings/security` | Future settings form | Authentication, session, role, and sensitive operation policy. |
| `/settings/notifications` | Future settings form | Notification preferences for approvals, failures, and operator alerts. |

### Operator / Admin

| Route | Page type | Purpose |
| --- | --- | --- |
| `/audit` | Operator queue | Audit log and event search across conversations, approvals, integrations, members, and agents. |
| `/agent-runs` | Operator queue | Agent run history, status, latency, escalation reason, created drafts, and failure diagnostics. |
| `/agent-runs/[id]` | Operator detail | Single agent run trace with inputs, outputs, tools, policy decisions, generated draft, and related entities. |
| `/approval-history` | Operator queue | Durable approval review history, reviewer, decision, send result, rejection reason, and related conversation. |
| `/integration-ops` | Future operator queue | Sync/connect/disconnect/send operation history across integrations. |
| `/analytics` | Future operator dashboard | Workspace trend views for volume, latency, approval turnaround, send failures, and connector health. |

### Profile

| Route | Page type | Purpose |
| --- | --- | --- |
| `/profile` | Account/settings detail | Signed-in user profile, account metadata, preferences, and session-related actions. |

`/profile` is accessed from the topbar user menu, not primary navigation.

## 4. Page Grouping

### Queues

Queues use the shared queue/table/list contract.

Routes:

- `/`
- `/approvals`
- `/members`
- `/audit`
- `/agent-runs`
- `/approval-history`
- `/integration-ops`

Queue responsibilities:

- Filter, search, sort, paginate, and scan.
- Expose object status, owner/assignment, source/provider, recency, and next action.
- Preserve responsive row labels on mobile.

### Detail Views

Detail views use the detail page structure contract.

Routes:

- `/conversations/[id]`
- `/approvals/[id]`
- `/agent-runs/[id]`
- `/profile`

Detail responsibilities:

- Present one primary object.
- Keep primary content separate from actions, metadata, and timelines.
- Show durable status and related operational context.

### Settings Forms

Settings forms use settings sub-navigation and scoped panels.

Routes:

- `/settings/workspace`
- `/settings/integrations`
- `/settings/members`
- `/settings/agent-policies`
- `/settings/security`
- `/settings/notifications`

Settings responsibilities:

- Change durable workspace configuration.
- Explain permission limits.
- Keep dev/test tools out of production settings.

### Admin / Operator Tools

Admin/operator tools use dense tables, timelines, and diagnostic panels.

Routes:

- `/audit`
- `/agent-runs`
- `/agent-runs/[id]`
- `/approval-history`
- `/integration-ops`
- `/analytics`

Operator responsibilities:

- Investigate what happened.
- Diagnose failures.
- Monitor trends and health.
- Link back to source entities: conversations, approvals, integrations, members, and agents.

## 5. Detail Page Structure Contract

Every detail page must fit these zones.

### Primary Content

The primary content zone contains the object the user came to inspect.

Examples:

- Conversation messages on `/conversations/[id]`.
- Proposed draft and review context on `/approvals/[id]`.
- Run trace on `/agent-runs/[id]`.
- User/account details on `/profile`.

Rules:

- Primary content must appear before deep metadata on mobile.
- Primary content must not be pushed below large configuration forms.
- Primary content must include the object title and durable current status.

### Action Rail

The action rail contains the next safe action and secondary actions.

Examples:

- Assign/run agent and reply actions on a conversation.
- Approve, edit and approve, reject on an approval.
- Retry/reconnect/inspect logs on integration or operator detail.

Rules:

- One primary action should be visually and structurally dominant.
- Destructive actions are separated from safe actions.
- Each action has pending, success, failure, and permission-disabled states.
- Action results render near the action unless they affect the whole page.

### Metadata / Context

Metadata/context contains supporting facts.

Examples:

- Conversation ID, provider, participants, assignment, last activity.
- Approval ID, created/reviewed timestamps, reviewer, agent assignment.
- Integration ID, last sync, provider diagnostics.

Rules:

- Raw IDs are secondary and copyable.
- Metadata is structured as fields, not paragraphs.
- Metadata should be collapsible or lower priority on mobile when not required for the next action.

### Timeline / Audit

Timeline/audit contains durable lifecycle and operational events.

Examples:

- Conversation state changes.
- Approval requested/approved/rejected/revised.
- Agent run requested/completed/escalated/failed.
- Integration sync/connect/disconnect/send events.

Rules:

- Critical events must link to details or diagnostics when available.
- Timeline is durable; transient banners are not a substitute.
- Timeline should use consistent actor/source, event label, timestamp, severity, and related entity links.

## 6. Navigation Rules

### Sidebar vs Top Nav

Use sidebar navigation on desktop for primary sections:

- Inbox
- Approvals
- Members
- Settings
- Operator

Use topbar for:

- Workspace context.
- User/profile menu.
- Global alert/status access.
- Mobile menu trigger.

Use mobile drawer/sheet for primary navigation.

Do not put page navigation links inside page hero/header blocks.

### Tabs vs Routes

Use routes when:

- The page has a distinct URL-worthy purpose.
- The content has different permissions.
- The section should be linkable/bookmarkable.
- The content can grow independently.

Use tabs when:

- Views are peer filters of the same resource.
- Switching views does not change the page's primary object.
- The content shares the same actions and permissions.

Examples:

- `/settings/workspace` and `/settings/integrations` are routes.
- Pending vs recently reviewed inside `/approvals` can be tabs or a query-param segmented view.
- Detail page subpanels such as metadata/timeline can be tabs only when they remain within the same object.

### Deep Navigation

Deep pages must include:

- Breadcrumb or parent link to the owning queue.
- Object title.
- Object current status.
- Related entity links where relevant.

Examples:

- `/conversations/[id]` links back to `/` and to related approvals.
- `/approvals/[id]` links back to `/approvals` and to `/conversations/[id]`.
- `/agent-runs/[id]` links back to `/agent-runs`, related conversation, related approval, and related integration if present.

Do not rely on browser back as the only way out of a detail page.

## 7. Extensibility

### Audit Logs

Home: `/audit`

Fits as:

- Operator top-level section.
- Queue/table with event type, actor/source, entity, timestamp, severity, and related link.
- Detail side panels from conversations, approvals, integrations, and agent runs can show filtered audit timelines.

### Agent History

Home: `/agent-runs`

Fits as:

- Operator queue.
- Conversation detail related panel.
- Approval detail related panel when a draft came from an agent run.
- Future settings/policy pages can link to runs affected by policy changes.

### Integration Ops

Home:

- Primary management: `/settings/integrations`
- Operational history: `/integration-ops`
- Global degraded status: shell global alert/status region.

Fits as:

- Settings page for connect/reconnect/configure.
- Operator queue for sync/send/connect/disconnect operation history.
- Detail context panels for conversations and approvals affected by integration failures.

### Analytics

Home: `/analytics`

Fits as:

- Operator dashboard.
- Uses metrics and tables, not settings page cards.
- Includes volume, approval turnaround, agent latency, send failure rate, integration health, and worker queue trends.

### Future Feature Placement

| Future feature | Home |
| --- | --- |
| Saved inbox views | `/` queue controls |
| Bulk assignment | `/` queue controls |
| Approval policies | `/settings/agent-policies` or future `/settings/approval-policies` |
| Agent policy defaults | `/settings/agent-policies` |
| Connector diagnostics | `/settings/integrations` and `/integration-ops` |
| Workspace security | `/settings/security` |
| Notifications | `/settings/notifications` |
| Audit export | `/audit` |
| Member role history | `/members` detail expansion and `/audit` |

## 8. What Gets Removed From Current UI

Remove from current UI patterns:

- Identity cards on inbox:
  - Email, user ID, workspace ID, and role cards do not belong above the inbox queue.
  - Workspace and user context move to the shell/topbar.

- Dark hero headers:
  - Current page-specific dark rounded headers are replaced by compact page headers inside the shell.
  - Operational pages should not use marketing-style hero framing.

- Route-local nav:
  - Header links such as Home, Profile, Members, Workspace settings, Approvals, and Sign out move to shell navigation or user menu.
  - Detail pages keep parent links/breadcrumbs only.

- Dev-only blocks in settings:
  - Temporary approval seed helper and draft preview helper are removed from production settings.
  - If retained for local development, they move behind an explicit developer-only route/flag outside normal admin IA.

- Repeated page-local banners:
  - Route-specific success/error blocks become shared global, page, section, or inline status regions depending on scope.

- Fixed custom table grids:
  - Inbox, approvals, members, and invites move to the shared queue/table/list contract.

- Raw IDs as primary content:
  - User, workspace, conversation, approval, and draft IDs move to secondary metadata/details areas.

- Settings as a catch-all page:
  - Workspace metadata, integrations, member settings, observability, and dev tools no longer share one vertical page.

## 9. Acceptance Criteria

- Every current page maps cleanly:
  - `/` maps to Inbox queue.
  - `/conversations/[id]` maps to Conversation detail.
  - `/approvals` maps to Approvals queue.
  - `/approvals/[id]` maps to Approval detail.
  - `/members` maps to Members admin queue.
  - `/settings/workspace` maps to Workspace settings.
  - `/profile` maps to user menu account/profile detail.

- Every V1 feature has a home:
  - Integrations live under `/settings/integrations`.
  - Audit logs live under `/audit`.
  - Agent run history lives under `/agent-runs`.
  - Approval history lives under `/approval-history`.
  - Integration operations live under `/integration-ops`.
  - Analytics live under `/analytics`.

- Future features fit without restructuring nav:
  - New settings pages extend `/settings/*`.
  - New operator tools extend Operator routes.
  - New conversation/approval capabilities fit within existing detail zones.
  - New queues reuse the queue/table/list contract.

- No page requires custom layout logic outside shell:
  - Navigation, workspace context, user/profile, app background, and global alerts are shell-owned.
  - Pages own only their header, page-local status, and body content.
  - Queue, detail, settings, and operator pages use the defined page grouping contracts.

- Current audit problems are addressed structurally:
  - Identity cards are removed from inbox hierarchy.
  - Dark hero headers and route-local nav are removed.
  - Settings has a future-ready route structure.
  - Operator/admin tooling has a stable top-level home.
  - Detail pages separate primary content, actions, metadata, and timeline/audit.

## Naming Note

"Operator" is the internal category for audit, agent runs, and system tooling.

The actual UI label may be:
- "Operations"
- "System"
- or remain "Operator"

Final naming should optimize for clarity over internal terminology.
Approval history is not a primary workflow surface.

It is a diagnostic/operator surface and belongs under Operator, not Approvals.
Conversation detail must prioritize message reading first.

The message timeline is always the primary content.

All operator actions (reply, agent, approval, diagnostics) must not block access to messages.

On mobile:
- messages must appear before large forms
- primary reply action must remain accessible near the top

## Queue System Rule

All queue-like surfaces must use a shared queue/list system.

This includes:
- inbox
- approvals
- members
- audit
- agent runs
- approval history
- integration ops

No page may implement its own grid/list layout.

If a new queue is needed, it must be built by composing the shared system.

`/members` is the primary member management surface.

`/settings/members` should redirect to `/members` unless a future scoped settings view is required.