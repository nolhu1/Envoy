# Frontend Design Foundation

Source audit: `docs/frontend/FRONTEND_GAP_AUDIT.md`.

This file merges the V1 frontend principles and visual language for Envoy. It is implementation-ready documentation, not a page redesign or UI implementation plan.

## Frontend Principles

## Product Feel

Envoy is a clean operator console for people managing message workflows, approvals, integrations, and agent activity. It should feel trustworthy, structured, and fast to scan.

The interface should be:

- Calm under load: high signal, low decoration, no visual panic unless a user must act.
- Dense but readable: closer to an operations console than a marketing site.
- Human-accountable: AI-generated work is treated as reviewable operational output, not magic.
- Workspace-aware: users should always understand what workspace, queue, item, and role context they are operating in.
- Fast to scan: status, owner, recency, next action, and failure state must be visible without reading paragraphs.

The interface should not feel:

- Consumer-social: no feed-style personality, oversized avatars, playful gradients, chatty copy, or engagement loops.
- Ultra-enterprise gray: avoid flat gray-on-gray admin sludge; use restrained contrast and purposeful color.
- Flashy AI: no glowing AI treatments, purple-blue gradients, sparkle metaphors, or hero copy about intelligence.
- Marketing-first: no large hero cards, dramatic shadows, oversized headers, or explanatory product copy on operational pages.

## Density Level

Default density should be medium-dense. A user should be able to scan a queue, detail record, or settings section without scrolling through decorative chrome.

Rules:

- Queue rows should target `56px` to `72px` height on desktop when content is normal.
- Data cards should be used for compact metrics or repeated entities, not for every small field.
- A section should earn its vertical space by containing data, controls, or decision context.
- Raw IDs, diagnostics, and developer details should be accessible but visually secondary.
- Use progressive disclosure for low-frequency configuration and diagnostics.

Audit tie-back:

- The current inbox puts identity cards above the queue.
- Current pages use large `rounded-[24px]` / `rounded-[28px]` cards and hero headers.
- Thread and approval pages push core content below banners, forms, and large panels.

## Page Rhythm

Every app page should follow this rhythm:

1. App shell context: persistent navigation, workspace identity, user/role access.
2. Page header: compact title, purpose, primary page action if any.
3. Optional status strip: global page-level alerts only.
4. Main work area: queue, detail, settings section, or dashboard.
5. Secondary panels: filters, metadata, context, diagnostics, or related activity.

Rules:

- Do not repeat full-page background, header, and nav markup in each route.
- Do not use dark hero headers as the default page framing pattern.
- Do not place account/workspace metadata cards above operational work unless the page is specifically about that metadata.
- Use section headers only when they improve scan or navigation.
- Keep page intro copy to one sentence or omit it when the page purpose is obvious.

Audit tie-back:

- `apps/web/src/app/layout.tsx` currently has no app shell.
- Major routes duplicate page backgrounds and hero-like headers.
- `Workspace shell`, `Account shell`, and "future flows" copy reads like scaffolding.

## Navigation Principles

Navigation must be persistent, predictable, and role-aware.

Rules:

- Provide a shared app shell with primary nav for Inbox, Approvals, Members, Settings, and future Admin/Operator tools.
- Show workspace context persistently in the shell, not as repeated cards.
- Show role/permission context only where it changes available actions.
- Keep route-local "Back" links for detail pages, but do not use them as primary navigation.
- Use settings sub-navigation for workspace profile, integrations, members/roles, audit/observability, and future agent policies.
- Use active nav state with a low-noise treatment: `bg-slate-100 text-slate-950` or equivalent, not bright accent fills.

Audit tie-back:

- Header links wrap inside page heroes on inbox, profile, members, settings, approvals, and thread pages.
- Settings combines too many admin concerns in one vertical page.

## Hierarchy Rules

The hierarchy order for operational screens is:

1. Critical status or blocking error.
2. Page object: queue name, thread title, approval title, integration name, member list.
3. Next action.
4. State, owner, recency, provider, and confidence/diagnostic metadata.
5. Secondary details and raw identifiers.

Rules:

- Status must be semantic, not just a pill color.
- Primary content should be visibly stronger than metadata.
- One page should have one primary action region.
- Destructive actions must be separated from primary actions.
- Do not give equal weight to all metadata cards.
- Raw enum labels must be formatted through shared label rules.

Audit tie-back:

- Inbox platform/state/send-failure/assignment/ID compete.
- Approval detail gives approve, edit approve, and reject similar weight.
- Profile and workspace pages give raw IDs too much prominence.

## Queue / Table Rules

Queues and tables are foundational V1 primitives.

Rules:

- Use one shared queue/table/list primitive for inbox, approvals, members, invites, future audit logs, and admin lists.
- Required queue affordances: empty state, loading state, error state, pagination or explicit result limit, sortable/scannable columns where relevant, responsive row labels, and row action area.
- Required row information for operational queues: object title, status, owner/assignment, provider/source, last activity, and next action/failure when present.
- Keep status and next action visible without opening the detail page.
- Do not make the entire row the only action when row-level secondary actions are needed.
- Mobile tables should become labeled record rows, not overflow-only fixed grids.
- Use active-filter summaries and reset actions for filtered queues.
- Do not hard-code high result limits without showing truncation or pagination.

Tailwind-friendly layout guidance:

- Desktop table container: `rounded-lg border border-slate-200 bg-white`.
- Header row: `bg-slate-50 text-xs font-medium text-slate-500`, avoid heavy tracking.
- Row: `min-h-14 px-4 py-3 hover:bg-slate-50`.
- Mobile row: `grid gap-2 p-4` with visible labels for secondary fields.

Audit tie-back:

- Inbox, approvals, members, and invites all use hand-built fixed grids.
- Members and invites risk mobile overflow.
- Approvals queue uses `limit: 100` without pagination or truncation.

## Detail Page Rules

Detail pages should separate the thing being reviewed from the operator controls around it.

Rules:

- Use a two-zone model on desktop: primary content plus context/action rail.
- Primary content contains the message thread, draft, integration record, or member record.
- Context/action rail contains metadata, status, audit trail, diagnostics, and primary actions.
- On mobile, order must be: critical status, compact header, primary next action, primary content, secondary context.
- Do not place large admin forms above the content users came to inspect.
- Keep durable lifecycle status visible near the record, not only in transient banners.
- Use structured metadata rows with copy affordances for IDs.

Audit tie-back:

- Thread page puts agent controls and manual reply before messages.
- Approval detail stacks decision forms and puts context in a narrow side column.
- Metadata is currently paragraph text and long IDs wrap awkwardly.

## Operator Action Rules

Operator actions must be clear, accountable, and close to their result state.

Rules:

- Every mutating action needs pending, success, failure, and permission-disabled states.
- Show action results near the action when the result affects only that section.
- Use page-level banners only for page-wide or blocking outcomes.
- Primary action means "the expected next safe action." There should usually be one.
- Secondary actions support the workflow but should not compete visually.
- Destructive actions must use confirmation or strong separation when irreversible or high impact.
- AI/agent actions must show whether they create drafts, send messages, require approval, or only preview.
- Agent controls should expose assignment summary, run status, last run/failure, trigger rules, and edit mode as separate states.

Audit tie-back:

- Assign/unassign/run agent, invite, integration, and dev helper forms lack consistent pending UI.
- Agent action results are URL-param banners at the top of the thread page.
- Integration actions do not show operation history or strong recovery guidance.

## Status / Error Rules

Status is part of the product model, not decoration.

Rules:

- Use shared status components for conversation state, approval state, integration state, message state, assignment state, and severity.
- Every status label must answer: what happened, current impact, and whether action is needed.
- Critical operational failures need recovery guidance: retry, reconnect, inspect logs, open detail, or contact admin.
- Avoid raw enums in UI. Format labels consistently: `Awaiting approval`, not `AWAITING_APPROVAL` or `awaiting approval` randomly.
- Do not rely on color alone. Include text and, when implemented, an icon or severity prefix.
- Do not show stale URL-param success/error banners as the only source of truth for critical state.

Severity rules:

- Critical: active failure blocking send/sync/review or data access.
- Warning: degraded state, reconnect required, pending human action, partial success.
- Success: completed requested action.
- Info: neutral context, permission explanation, background operation detail.
- Neutral: inactive, unavailable, unassigned, no data.

Audit tie-back:

- Send failure is a small pill in inbox and an amber banner in thread/approval flows.
- Integration status and diagnostics are route-local.
- Empty and unavailable states vary across routes.

## Form Rules

Forms should be compact, explicit, and scoped.

Rules:

- Use shared field, label, helper text, error text, and submit controls.
- Labels should be sentence case and close to the field.
- Use helper text only when it affects completion or risk.
- Required fields should have both browser validation and server validation display.
- Field errors should render inline; page banners should summarize when needed.
- Submit areas should align consistently at the end of the form.
- Long configuration forms should be edit mode, drawer/panel, or dedicated settings page, not always-open blocks.
- Textareas for message/draft content should use stable min-height and resize rules.

Tailwind-friendly form guidance:

- Field: `rounded-md border border-slate-300 bg-white px-3 py-2 text-sm`.
- Focus: `focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100`.
- Label: `text-sm font-medium text-slate-700`.
- Helper: `text-xs text-slate-500`.
- Error: `text-xs text-red-700`.

Audit tie-back:

- Agent assignment form is always open and dominates thread reading.
- Server action errors redirect to route banners.
- Some submit buttons have pending states; many do not.

## Empty / Loading / Error State Rules

Every async surface needs a designed state set.

Rules:

- Add route-level loading and error boundaries for major app sections.
- Loading states should preserve layout shape with skeletons, not blank pages.
- Empty states must distinguish:
  - first-run no data,
  - filtered zero results,
  - permission-limited,
  - integration disconnected,
  - load failed,
  - archived/deleted/not found.
- Empty states should include one clear next action when action is available.
- Error states should include severity, short explanation, and recovery action.
- Do not use large decorative empty cards for small inline absences.

Audit tie-back:

- There are no `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` files under `apps/web/src/app`.
- Inbox empty state conflates no data and filtered results.
- Approval recent context has no empty state.

## Responsive Rules

Responsive behavior must preserve operator scan, not merely stack everything.

Rules:

- Minimum target viewports: `390x844`, `834x1112`, `1440x1000`.
- Use a persistent desktop shell; mobile shell may collapse nav but must keep workspace and primary section visible.
- Tables become labeled rows on mobile.
- Filters collapse into a summary plus editable panel on mobile when more than three controls exist.
- Primary actions remain reachable near the top on mobile.
- Long IDs, emails, provider diagnostics, and message bodies must wrap predictably and avoid horizontal overflow.
- Side rails collapse below primary content unless they contain the main next action.

Audit tie-back:

- Members and invites use fixed grids with no responsive breakpoints.
- Header pills and buttons wrap heavily on narrow screens.
- Agent controls create a long mobile preamble before messages.

## Accessibility Rules

Rules:

- All interactive controls must be keyboard reachable and have visible focus states.
- Tables/lists must expose meaningful labels and structure to assistive tech.
- Do not rely on color alone for status or severity.
- Use semantic headings in order; do not use oversized headings inside compact panels.
- Form labels must be programmatically associated with controls.
- Icon-only controls require accessible names.
- Disabled controls must explain why when the reason is not obvious.
- Maintain contrast: body text at least WCAG AA, subtle text no lighter than `text-slate-500` on white for essential labels.
- Avoid tiny all-caps labels for critical information.

Audit tie-back:

- Existing tables are grid links/divs, not shared semantic table/list components.
- Status and severity are primarily color/pill-based.
- Disabled Run Agent only gives a nearby text hint for one blocker.

## What Not To Do

- Do not build new pages with dark hero headers as the default.
- Do not add more route-local badge, banner, card, table, or button variants.
- Do not use purple/blue AI gradients, glow effects, sparkles, or generated-AI visual motifs.
- Do not turn queues into feed cards.
- Do not put raw workspace/user/conversation IDs in primary content unless the task is diagnostics.
- Do not stack large admin forms before the operational content users need to inspect.
- Do not use URL-param banners as the only status model for critical workflow state.
- Do not create fixed desktop grids that overflow on mobile.
- Do not write copy that says a page is a "shell", "future flow", or test scaffold in production surfaces.
- Do not use color-only status or severity.

## Acceptance Criteria

- New or refactored pages use a shared shell, shared status components, shared queue/list primitives, and designed loading/error/empty states.
- Operational work appears before metadata unless the page is explicitly a metadata page.
- Every mutating action has pending, success, failure, and permission-disabled behavior.
- Every queue row exposes status, owner/assignment, recency, provider/source, and next action/failure when relevant.
- Mobile layouts preserve labels and actions without horizontal overflow.
- Critical errors include impact and recovery action.
- Raw IDs and diagnostics are secondary, copyable, and not primary visual content.

## Examples Of Correct Usage

- Inbox page opens directly on a compact conversation queue; workspace and role live in the app shell.
- Approval detail shows the draft as the primary object, with approve/edit/reject in a stable decision rail and recent context clearly separated.
- Integration card shows `Reconnect required`, last sync time, impact, and a primary reconnect action.
- Member list uses a responsive shared table that becomes labeled rows on mobile.
- Agent controls show current assignment summary, last run status, and a compact edit mode instead of an always-open form.

## Examples Of Incorrect Usage

- A new admin page copies the current dark rounded header, gradient background, and local nav links.
- A queue row uses three unrelated pills plus a raw ID, but does not show owner, recency, or next action.
- A send failure appears only as `Send failed` with no retry, provider, or diagnostic path.
- A mobile member table keeps four fixed columns and overflows horizontally.
- A profile/settings page gives raw IDs the same visual weight as the actual user or workspace name.

## Visual Language

This section defines Envoy's V1 visual system. It is Tailwind-friendly and should be used when creating shared UI primitives or refactoring existing route-local markup.

## Visual Direction

Envoy should look like a calm operator console: clean, structured, high-information-density, and fast to scan.

Use:

- White and near-white surfaces with slate text.
- Muted blue/sky accents for focus and selected states.
- Semantic colors only for status and severity.
- Compact panels, lists, and tables.
- Minimal shadows and modest radius.

Avoid:

- Full-page gradients as default app backgrounds.
- Dark hero cards as page headers.
- Large rounded marketing cards.
- Purple AI gradients, glow, shimmer, or decorative blobs.
- Gray-only enterprise dashboards with no semantic contrast.

Audit tie-back:

- Current pages rely on `bg-[linear-gradient(...)]`, dark slate hero headers, large rounded cards, and route-local color decisions.

## Color System

Use Tailwind's default palette as the initial token source. Prefer semantic aliases in code when the component layer exists.

### Base Colors

| Purpose | Tailwind guidance | Usage |
| --- | --- | --- |
| App background | `bg-slate-50` | Default full app background. |
| Primary surface | `bg-white` | Main panels, tables, cards, forms. |
| Secondary surface | `bg-slate-50` | Table headers, nested panels, subtle grouped areas. |
| Tertiary surface | `bg-slate-100` | Hover, selected nav, neutral badges. |
| Border | `border-slate-200` | Default panel/list/table borders. |
| Strong border | `border-slate-300` | Inputs, active separators, secondary buttons. |
| Primary text | `text-slate-950` | Main titles and important values. |
| Body text | `text-slate-700` | Standard content. |
| Muted text | `text-slate-500` | Labels, helper text, timestamps. |
| Disabled text | `text-slate-400` | Disabled and unavailable text. |
| Focus/accent | `sky-600`, `sky-100`, `sky-500` | Focus rings, selected state, primary non-destructive accent. |

### Semantic Colors

| Semantic | Background | Border | Text | Usage |
| --- | --- | --- | --- | --- |
| Success | `bg-emerald-50` | `border-emerald-200` | `text-emerald-800` | Completed user action, connected, sent. |
| Warning | `bg-amber-50` | `border-amber-200` | `text-amber-900` | Needs attention, degraded, reconnect required, pending human action. |
| Critical | `bg-red-50` | `border-red-200` | `text-red-800` | Failed send/sync, destructive errors, blocked operation. |
| Info | `bg-sky-50` | `border-sky-200` | `text-sky-800` | Neutral operational detail, preview generated, background context. |
| Neutral | `bg-slate-100` | `border-slate-200` | `text-slate-700` | Unassigned, inactive, no data. |

Rules:

- Use red for active failures that block work. Do not use amber for send failures that require recovery.
- Use amber for "attention needed" states that are not hard failures.
- Use sky sparingly for focus, selected controls, and neutral information. Do not make the app blue-dominant.
- Platform colors may be used only as secondary metadata, never as the main status color.
- Do not encode severity only through color; include text labels and accessible names.

Audit tie-back:

- Current send failure and integration states use inconsistent amber/rose handling.
- Platform, state, and assignment badges are one-off Tailwind strings.

## Typography Scale

Use one sans-serif system from `apps/web/src/app/globals.css`: `"IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif`. Keep typography compact and calm.

| Token | Tailwind guidance | Usage |
| --- | --- | --- |
| Page title | `text-2xl font-semibold tracking-normal` | App page titles. Use `text-3xl` only for broad dashboards. |
| Section title | `text-lg font-semibold` | Panel and section headings. |
| Subsection title | `text-base font-semibold` | Cards, table groups, action panels. |
| Body | `text-sm leading-5` | Default content. |
| Dense body | `text-xs leading-5` or `text-sm leading-5` | Table metadata, helper copy. |
| Label | `text-xs font-medium text-slate-500` | Field/table labels. Avoid wide letter spacing. |
| Metric | `text-2xl font-semibold tabular-nums` | Metric values in operator dashboards. |
| Monospace detail | `font-mono text-xs` | IDs, tokens, diagnostics, logs. |

Rules:

- Default letter spacing is `tracking-normal`.
- Avoid `uppercase tracking-[0.25em]` for table headers and routine labels.
- Use `tabular-nums` for counts, latency, timestamps when aligned.
- Body content in messages can use `leading-6` when readability needs it; queue rows should default to `leading-5`.
- Do not use hero-scale type inside cards, tables, sidebars, or compact panels.

Audit tie-back:

- Current pages overuse heavy uppercase tracking.
- Current queue rows and message cards use generous leading that reduces scan density.

## Spacing Scale

Use a 4px spacing base and avoid bespoke spacing unless layout requires it.

| Token | Tailwind | Usage |
| --- | --- | --- |
| 4px | `1` | Tight icon/text gaps, compact separators. |
| 8px | `2` | Inline control gaps, badge padding gap. |
| 12px | `3` | Field groups, row internal gaps. |
| 16px | `4` | Default panel padding for dense surfaces, list row x/y spacing. |
| 20px | `5` | Standard section gap inside panels. |
| 24px | `6` | Page section gap, roomy panel padding. |
| 32px | `8` | Major page regions. |
| 40px | `10` | Top-level page padding on desktop only. |

Rules:

- Page gutters: mobile `px-4`, tablet `px-6`, desktop `px-8`.
- Main content max width should depend on surface:
  - Queues: `max-w-screen-2xl`.
  - Detail pages: `max-w-screen-xl` or full shell grid.
  - Settings forms: `max-w-5xl`.
- Avoid stacking many `mt-8` sections when content belongs in a shared grid or settings shell.
- Use consistent internal panel padding: `p-4` for dense, `p-6` for spacious.

Audit tie-back:

- Current pages use repeated `px-6 py-10`, `mt-8`, and large card padding without a shell rhythm.

## Radius And Shadow Rules

Use modest radius and almost no shadow. Structure should come from spacing, borders, and hierarchy.

| Element | Radius | Shadow |
| --- | --- | --- |
| App shell/sidebar/nav | `rounded-none` or `rounded-md` for active states | none |
| Panels/cards | `rounded-lg` | `shadow-sm` only when elevation is needed |
| Tables/lists | `rounded-lg` container, rows no radius | none |
| Inputs/buttons | `rounded-md` | none |
| Badges | `rounded-full` or `rounded-md` depending density | none |
| Modals/popovers | `rounded-xl` | `shadow-lg` |

Rules:

- Do not use `rounded-[24px]` or `rounded-[28px]` for standard panels.
- Do not use large soft shadows for normal content.
- Use borders as the default surface separator.
- Nested cards should be avoided; use section dividers or subdued panels instead.

Audit tie-back:

- Current UI uses large radii and big shadows that make operator pages feel inflated.

## Card / Panel / List / Table Treatment

### Panels

Default panel:

- `rounded-lg border border-slate-200 bg-white`
- Dense padding: `p-4`
- Spacious padding: `p-6`

Use panels for:

- One bounded tool or form.
- One settings section.
- One detail context panel.
- One repeated entity card when a table is not appropriate.

Do not use panels for:

- Every field in a metadata group.
- Page sections that should be full-width app layout.
- Decorative framing around already-framed content.

### Lists And Tables

Default table/list container:

- `overflow-hidden rounded-lg border border-slate-200 bg-white`

Header row:

- `bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500`

Data row:

- `border-t border-slate-200 px-4 py-3 text-sm hover:bg-slate-50`

Rules:

- Use semantic `table` when the relationship is tabular and interaction does not require custom list behavior.
- Use `role` and labels carefully if a div-based virtualized/list row is needed.
- Mobile rows must expose labels for fields that lose column headers.

Audit tie-back:

- Current inbox/approvals/members/invites all use hand-built grid rows.

## Badge / Status System

Badges must be consistent and semantic.

### Badge Types

| Type | Class guidance | Usage |
| --- | --- | --- |
| Neutral badge | `bg-slate-100 text-slate-700 border border-slate-200` | Unassigned, inactive, role metadata. |
| Info badge | `bg-sky-50 text-sky-800 border border-sky-200` | Preview, informational state. |
| Success badge | `bg-emerald-50 text-emerald-800 border border-emerald-200` | Connected, sent, approved. |
| Warning badge | `bg-amber-50 text-amber-900 border border-amber-200` | Awaiting approval, reconnect required, pending. |
| Critical badge | `bg-red-50 text-red-800 border border-red-200` | Failed, blocked, rejected when active risk. |

Default badge classes:

- `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium`

Rules:

- Use sentence case labels.
- Do not apply wide uppercase tracking to badges.
- Avoid multiple equal-weight badges in a row. Put primary status first.
- Platform is metadata, not severity.
- Assignment status should be short; long agent goals belong in text or tooltip/detail, not a pill.

Audit tie-back:

- Current pages show platform, state, assignment, and errors as peer pills with inconsistent styles.

## Severity System

Severity applies to banners, inline alerts, badges, validation, and status rows.

| Severity | Use when | Required content |
| --- | --- | --- |
| Critical | Work is blocked, data failed to load, send/sync failed, destructive action failed. | What failed, impact, recovery action. |
| Warning | Human action needed, degraded state, reconnect required, approval pending. | What needs attention, who can act, next step. |
| Success | User-requested operation completed. | What completed and resulting state. |
| Info | Non-blocking context or preview. | What changed or what is being shown. |
| Neutral | No data, inactive, unassigned, unavailable without risk. | Current state and optional next step. |

Default alert classes:

- Critical: `rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800`
- Warning: `rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900`
- Success: `rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800`
- Info: `rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800`
- Neutral: `rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700`

Rules:

- Critical alerts must include an action when recovery is possible.
- Alert title: `text-sm font-semibold`.
- Alert body: `mt-1 text-sm leading-5`.
- Alert actions: `mt-3 flex flex-wrap gap-2`.
- Do not place multiple large banners above page headers; use a status region within the shell or near the affected component.

Audit tie-back:

- Current route-local banners are large, duplicated, and inserted above headers.

## Button / Action Hierarchy

| Type | Class guidance | Usage |
| --- | --- | --- |
| Primary | `bg-slate-950 text-white hover:bg-slate-800` | Main safe action on the page or panel. |
| Accent primary | `bg-sky-600 text-white hover:bg-sky-500` | Workflow action needing distinction, used sparingly. |
| Secondary | `border border-slate-300 bg-white text-slate-700 hover:bg-slate-50` | Navigation, alternate action. |
| Tertiary | `text-slate-700 hover:bg-slate-100` | Low-emphasis inline action. |
| Danger | `border border-red-300 bg-white text-red-700 hover:bg-red-50` or `bg-red-600 text-white` for confirmed destructive actions | Disconnect, reject, remove, revoke. |
| Disabled | `disabled:cursor-not-allowed disabled:opacity-50` plus visible reason | Unavailable action. |

Default button classes:

- `inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition`

Rules:

- One primary action per panel unless the workflow requires a split primary.
- Destructive actions should not sit visually beside safe primary actions without grouping.
- Buttons should use pending labels for async work.
- Text-only links are acceptable for navigation inside tables; action buttons should look like controls.
- Use icons later where they improve scan, but do not depend on icons for meaning.

Audit tie-back:

- Current actions use many rounded-full variants and inconsistent primary colors.
- Approval decisions and integration actions need clearer hierarchy.

## Form Field Treatment

Default field:

- `w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950`
- Focus: `focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100`
- Placeholder: `placeholder:text-slate-400`
- Disabled: `disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`

Label:

- `text-sm font-medium text-slate-700`

Helper:

- `text-xs leading-5 text-slate-500`

Error:

- `text-xs leading-5 text-red-700`

Rules:

- Field groups use `space-y-1.5`.
- Form sections use `space-y-4`.
- Form actions align right on desktop and stretch only when mobile ergonomics require it.
- Textareas for message content use `min-h-32`.
- Configuration textareas should not appear inline on every page load unless editing is the page's primary task.

Audit tie-back:

- Current agent assignment and approval edit forms are large always-visible blocks.

## Timeline / Message Treatment

Messages and operational events need different treatments.

### Conversation Messages

Rules:

- Use a timeline/list with compact message headers: sender, direction, timestamp, status.
- Body text should be readable but not card-inflated: `text-sm leading-6 text-slate-800`.
- Inbound/outbound/agent/system should be visually distinguishable through a left border, subtle background, or header marker.
- Attachments should be rows with filename, type/size, and action affordance when allowed.
- Long external IDs should be hidden behind details or copy controls.

Suggested classes:

- Message item: `rounded-lg border border-slate-200 bg-white p-4`
- Inbound marker: `border-l-4 border-l-slate-300`
- Outbound marker: `border-l-4 border-l-sky-300`
- Failed outbound marker: `border-l-4 border-l-red-400 bg-red-50/40`

### Operational Events

Rules:

- Use a denser event timeline for agent runs, approvals, syncs, sends, and audit actions.
- Each event should show actor/source, event label, timestamp, severity, and link to details/logs when present.

Audit tie-back:

- Thread messages currently look identical aside from small badges.
- Future agent runs and approval lifecycle need durable timelines.

## Admin / Operator Surface Treatment

Admin/operator surfaces should be organized by work type, not by scaffolding.

Rules:

- Settings pages use a section nav and compact panels.
- Integration cards prioritize health, last operation, and next required action.
- Observability surfaces use metric cards plus status tables; metrics require thresholds or context.
- Member/admin tables prioritize identity, role, status, last activity/invite expiry, and actions.
- Dev-only tooling must be visually and navigationally isolated from production settings.

Audit tie-back:

- Workspace settings currently combines workspace metadata, dev helpers, integration controls, and observability in one page.

## Motion / Animation Rules

Motion should communicate state, not decorate.

Rules:

- Use short transitions only: `transition-colors`, `duration-150`.
- Focus, hover, and pressed states should be immediate and subtle.
- Loading states use skeletons or spinners only where useful; avoid shimmer-heavy effects.
- No decorative background animation.
- Respect reduced motion: avoid required motion for understanding state.

Allowed:

- Button hover color.
- Row hover background.
- Collapsible panel open/close with short duration if reduced-motion safe.
- Toast/alert entrance if subtle and non-blocking.

Disallowed:

- AI glow effects.
- Animated gradients.
- Bouncy controls.
- Loading animations that distract from dense data.

## Dark Mode Decision

V1 should ship light mode only.

Rationale:

- The current product foundation needs layout, status, table, and state consistency first.
- A dark mode would double the token and QA surface before the operator console patterns are stable.
- Existing dark hero headers should not be mistaken for a dark mode direction.

Rules:

- Define semantic tokens so dark mode can be added later.
- Do not add page-specific dark blocks except where required by an embedded artifact or code/log viewer.
- Code/log viewers may use a dark or high-contrast treatment if readability requires it, but the app shell remains light.

## Acceptance Criteria

- New UI uses `bg-slate-50` app background and white/bordered operational surfaces, not page gradients or dark hero headers.
- Radius defaults to `rounded-md` / `rounded-lg`; large custom radii are not used for standard panels.
- Queue/table/list rows share consistent density, typography, hover, and mobile behavior.
- Status, severity, and platform are visually distinct concepts.
- Buttons use a consistent hierarchy with one primary action per panel.
- Forms use shared field, label, helper, error, focus, disabled, and pending treatments.
- Critical states use red, include impact text, and provide recovery action when possible.
- Light mode is the only V1 theme, with semantic tokens ready for future dark mode.

## Examples Of Correct Usage

- A conversation row uses a neutral platform badge, warning `Awaiting approval` status, assigned owner text, timestamp, and one row action.
- A sync failure alert uses red styling, states that Gmail sync failed, explains inbox freshness impact, and offers `Retry sync` or `Reconnect`.
- A settings integration card uses a white panel, compact health badge, last sync time, diagnostics summary, and grouped connect/sync/disconnect actions.
- A member table uses `rounded-lg border border-slate-200 bg-white`, compact row padding, and mobile labels.
- A focused input uses a sky focus ring and inline validation below the field.

## Examples Of Incorrect Usage

- A page starts with a dark rounded hero panel on a full-page gradient.
- A status row shows `AWAITING_APPROVAL` in an uppercase cyan pill beside two other equal-weight pills.
- A critical send failure uses amber styling and gives no retry or diagnostic path.
- A table header uses wide uppercase tracking and fixed columns that overflow mobile.
- A destructive `Disconnect` button appears directly next to the primary safe action with the same visual weight.
