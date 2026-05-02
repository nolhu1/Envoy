# Frontend Gap Audit

Scope: current Envoy frontend implementation in `apps/web/src/app`. This is an audit only; it does not propose final redesigned screens or implementation changes.

## Cross-Surface Findings

- The app is a set of route-local server-rendered pages, not a shared application shell. `apps/web/src/app/layout.tsx` only renders `{children}`, so every page owns its own background, header, navigation links, max-width, and content spacing.
- There are no route-level `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` files under `apps/web/src/app`. Server fetch failures and slow responses will fall back to framework behavior instead of an Envoy-specific operator experience.
- `packages/ui` currently has no files, so repeated UI patterns live inline across route files.
- Most pages use the same marketing-style shell: `min-h-screen` gradient background, `max-w-5xl`, dark rounded hero header, large rounded cards, pill buttons, and dense uppercase tracking. That gives consistency, but it does not yet form an admin/operator product system.
- The app uses many one-off pill/status/badge variants for platform, state, role, integration, approval, assignment, and errors. Status semantics are encoded as Tailwind strings inside page files rather than shared components.
- Fixed grid column templates are used for table-like lists. Inbox and approvals partially adapt for mobile; members and invites do not.
- V1 admin/operator tooling will need denser navigation, persistent context, bulk actions, filters, pagination, detail sidebars, audit trails, permissions affordances, and service health states. The current page-local card structure will not fit those cleanly without extracting an app frame and shared table, status, form, banner, and detail-panel primitives.

## Inbox

### Current Route and Files

- Route: `/`
- Page: `apps/web/src/app/page.tsx`
- Data/helpers: `apps/web/src/lib/inbox.ts`, `apps/web/src/lib/conversation-display.ts`
- Related auth/nav component: `apps/web/src/components/sign-out-button.tsx`

### What It Currently Does

- Requires app auth, reads URL filters, fetches inbox rows and assignee options.
- Shows a dark header with Profile, Members, Workspace settings, Approvals when the role can approve drafts, and Sign out.
- Shows four context cards: email, user ID, workspace ID, role.
- Shows a queue section with search, platform, state, assignment, assignee, and awaiting-approval filters.
- Lists conversations as linked rows with platform pill, conversation state pill, optional `Send failed` pill, title, last message preview, participant summary, assignment, last activity, and raw conversation ID.

### Layout Problems

- The page mixes account/session metadata and operational inbox content at the same hierarchy. The four identity cards consume prime space above the queue.
- Header links are route-local and wrap inside the hero instead of living in persistent navigation.
- The filter form is a six-column grid with mixed control widths; the checkbox and action buttons do not align naturally with the other inputs.
- The conversation list is visually a table but implemented as linked grid rows. It has no sticky header, row selection, density controls, pagination, bulk affordance, or keyboard-focused table semantics.
- The raw conversation ID in each row adds visual noise and forces long text handling in an already dense activity column.

### Visual Hierarchy Problems

- `Unified Inbox`, user identity cards, queue title, filters, and rows all compete. The actual queue is not the first clear product object.
- Platform, state, send failure, assignment, and ID all appear as pills/text without a strong rule for which status matters most.
- The `authContext.role` pill in the queue header duplicates the role card above and does not help triage conversations.

### Spacing/Typography Problems

- Heavy `tracking-[0.25em]` and `tracking-[0.3em]` labels are repeated throughout, creating loud section chrome for an operator screen.
- Rounded radii are very large (`rounded-[28px]`, `rounded-[24px]`), which increases visual bulk and reduces dense scan capacity.
- Row body copy uses generous `leading-6`, making high-volume inbox scanning less efficient.
- Long assignee goals are rendered as pills and can become bulky row content.

### Status/Error Signaling Problems

- `hasSendFailure` in `apps/web/src/lib/inbox.ts` is true when any failed outbound message exists in the conversation, but the UI only says `Send failed` without recency, provider, retryability, or whether the failure is resolved.
- State labels use raw enum text with `replaceAll("_", " ")`, which yields inconsistent capitalization and no semantic priority.
- Empty state combines no-data and filtered-zero-data messaging: `No conversations match the current search and filters. Adjust the filters or run sync from workspace settings.` It does not distinguish a new workspace from active filters.
- There is no loading state for filtered server navigation.

### Responsive/Mobile Risks

- The inbox list collapses to stacked cards on smaller screens, but filters remain a long stacked form with no compact filter drawer or active-filter summary.
- Header buttons are numerous and will wrap into multiple lines on mobile.
- The row grid hides column headings on mobile and repeats field labels only for some fields; platform/state/status pills may push titles down significantly.

### V1 Admin/Operator Fit Risks

- No persistent nav or workspace switcher area for future admin sections.
- No table primitive for saved views, SLA columns, priority, owner, provider, last failure, or bulk assignment.
- No reusable filter-bar model for additional queue dimensions.
- No room for operator actions per row beyond making the entire row a link.

### Duplicate UI Patterns to Share

- App shell/header/nav.
- Stat cards for user/workspace metadata.
- Filter controls and submit/reset buttons.
- Platform badge, state badge, send-failure badge, assignment badge.
- Empty state block.
- Table/list row primitive.

### Highest-Priority Fixes

- P0: Extract shared app shell/navigation and remove account metadata from the default inbox landing experience.
- P0: Create shared status/badge and table/list primitives before adding more admin queues.
- P1: Redesign inbox as an operator queue with clearer state hierarchy, active-filter display, empty-state variants, and scalable row actions.
- P1: Add route loading/error boundaries.

## Conversation / Thread Page

### Current Route and Files

- Route: `/conversations/[conversationId]`
- Page: `apps/web/src/app/conversations/[conversationId]/page.tsx`
- Actions: `apps/web/src/app/conversations/[conversationId]/actions.ts`
- Submit control: `apps/web/src/app/conversations/[conversationId]/reply-submit-button.tsx`
- Data/helpers: `apps/web/src/lib/thread.ts`, `apps/web/src/lib/agent-assignments.ts`, `apps/web/src/lib/agent-draft-flow.ts`

### What It Currently Does

- Requires auth, loads one conversation thread, and returns `notFound()` when absent.
- Shows URL-param-driven banners for reply send, reply error, recent send failure, agent assignment save/unassign/error, agent run created/escalated/error.
- Shows a dark header with conversation title, subject/participants, back link, platform, state, assignment, and last activity pills.
- Shows an `Agent Assignment` panel with current assignment summary, goal/instructions/tone form, trigger-rule checkboxes, assign/replace, unassign, and run-agent controls.
- Shows a manual reply form.
- Shows participant summary and message timeline with platform/direction/status pills, sender, timestamp, external ID, body, and attachment metadata.

### Layout Problems

- The top of the page can stack many banners before the conversation header, causing the thread itself to move unpredictably after actions.
- Agent assignment and manual reply appear before the conversation history. This makes the page feel like a configuration form first and a thread second.
- Agent controls, manual reply, and message history all live inside one large white section, limiting opportunities for sticky composer or side-panel layouts.
- Message cards do not distinguish inbound/outbound/agent/system layout beyond small pills.
- Attachments are metadata-only cards; no download/open affordance is rendered even though `externalUrl` is present in `apps/web/src/lib/thread.ts`.

### Visual Hierarchy Problems

- `Agent Assignment` has the same visual weight as the thread history and appears above the messages, despite being administrative configuration.
- Multiple success/error banners use similar large blocks, so critical send failure can be visually equivalent to minor assignment saved.
- Message status, direction, and platform are all badges. The actual sender and message body have limited hierarchy.

### Spacing/Typography Problems

- Large rounded nested cards (`section` -> agent panel -> active assignment card -> trigger card) make the controls feel inflated.
- Textareas and inputs are wide and form-like; there is no compact operator mode for quick assignment or run actions.
- Message cards use `leading-6` and `whitespace-pre-wrap`, which can become very tall with long email content.

### Status/Error Signaling Problems

- URL params drive transient banners but there is no central notification model or dismissal.
- Recent send failure includes timestamp and summary but not provider, attempted recipient, retry option, or current resolution state.
- Agent run escalation displays bracketed reason text (`[${agentRunReason}]`) rather than a structured status.
- Disabled `Run Agent` only states `Assign an agent first...`; it does not describe permission/state blockers beyond missing assignment.
- There is no loading/error boundary for thread fetch, action failures outside redirects, or slow action submission beyond button pending text.

### Responsive/Mobile Risks

- The agent form plus trigger checkboxes becomes a long mobile block before users reach messages.
- Header pills can wrap extensively when title, state, assignment goal, and timestamp are long.
- The `md:grid-cols-[minmax(0,1fr)_auto]` assignment layout puts the unassign form beside a large form on desktop but may feel detached on mobile.
- Long message IDs and external IDs are shown in cards and can dominate narrow screens.

### V1 Admin/Operator Fit Risks

- Current agent controls are embedded only at conversation level. Future admin tooling for agent policy, assignment history, run logs, confidence, tool calls, escalation reasons, and replay will not fit inside the current single panel.
- No shared action log or side rail for operational events.
- No threading affordance for Slack replies versus Gmail threads beyond platform labels.
- No room for approvals, send diagnostics, and audit timeline to coexist cleanly with messages.

### Duplicate UI Patterns to Share

- Flash/banner component for success/warning/error/info.
- Header metadata badge group.
- Agent assignment form fields and trigger-rule checklist.
- Message card/timeline item.
- Textarea form block and submit button.
- Empty state.

### Highest-Priority Fixes

- P0: Split thread content, operator actions, and agent controls into reusable layout zones.
- P0: Create a shared notification/status system with severity and action support.
- P1: Move agent controls into a side panel or dedicated operational section that does not block reading the thread.
- P1: Add message/timeline primitives that can support diagnostics, attachments, and outbound state.

## Approvals Queue

### Current Route and Files

- Route: `/approvals`
- Page: `apps/web/src/app/approvals/page.tsx`
- Data/helpers: `apps/web/src/lib/approval-queue.ts`

### What It Currently Does

- Requires `APPROVE_DRAFTS`.
- Reads `view=reviewed` from search params; defaults to pending.
- Fetches up to 100 pending or recently reviewed approval requests.
- Shows dark header, back-to-inbox link, role pill, pending/recently-reviewed toggle links, empty state, and table-like linked rows.

### Layout Problems

- The pending/reviewed toggle is hand-built from links, not a shared segmented control or tab primitive.
- Queue rows are linked grids without row actions, checkboxes, sorting, pagination, or filters beyond pending/reviewed.
- `limit: 100` is hard-coded; there is no pagination or indication of truncation.
- Draft preview and conversation context compete in fixed grid columns.

### Visual Hierarchy Problems

- Pending/reviewed status is shown as a small row badge; urgency, age, and reviewer context are not visually emphasized.
- Assignment is plain text while platform/status are badges, making ownership less scannable.
- The title `Human review` is generic and does not expose queue count, SLA, oldest item, or priority.

### Spacing/Typography Problems

- Same large hero/card language as inbox makes a work queue feel less dense than it should.
- Draft previews use full `leading-6` text in a narrow column, likely producing uneven row heights.
- Column headings use high letter spacing, reducing legibility at table scale.

### Status/Error Signaling Problems

- Empty state does not distinguish no access, no pending work, failed load, or filtered-zero.
- Reviewed rows still show `${rows.length} approval requests ready for review.`, even when the view is recently reviewed.
- No route loading/error boundary.

### Responsive/Mobile Risks

- Unlike inbox, mobile rows do not add labels for `Draft`, `Assignment`, or `Created/Reviewed`, so stacked content loses context below `md`.
- Header link and role pill wrap but do not form a mobile nav pattern.

### V1 Admin/Operator Fit Risks

- No space for approval metadata such as risk, confidence, requester, provider, policy reason, reviewer, or due time.
- No bulk review or assignment model.
- No reusable queue/list component to reuse for future admin queues.

### Duplicate UI Patterns to Share

- Queue page header.
- Segmented view toggle.
- Approval/status/platform badges.
- Queue table/list primitive.
- Empty state.

### Highest-Priority Fixes

- P0: Build a shared queue/table primitive before expanding approval workflows.
- P1: Add pagination/filter/sort model and mobile row labels.
- P1: Correct reviewed-view copy and status hierarchy.

## Approval Detail

### Current Route and Files

- Route: `/approvals/[approvalRequestId]`
- Page: `apps/web/src/app/approvals/[approvalRequestId]/page.tsx`
- Actions: `apps/web/src/app/approvals/[approvalRequestId]/actions.ts`
- Submit control: `apps/web/src/app/approvals/[approvalRequestId]/approval-submit-button.tsx`
- Data/helpers: `apps/web/src/lib/approval-queue.ts`

### What It Currently Does

- Requires `APPROVE_DRAFTS`.
- Loads approval detail with recent thread context.
- Shows review banners from `review` and `message` search params.
- Shows header with queue/thread links and platform/status/state/assignment metadata.
- Pending approvals show proposed draft, quick approve, edit-and-approve, and reject forms.
- Reviewed approvals show outcome; rejected approvals can create a revised draft.
- Sidebar shows approval metadata and recent thread context.

### Layout Problems

- Three decision paths (approve, edit approve, reject) are stacked vertically and all high weight. The safest/default action is not isolated from destructive action.
- The draft and action forms are in the same primary column, so editing can push critical metadata and context far down.
- Recent context lives in a narrow side column, which can make message review difficult.
- Metadata is rendered as paragraphs, not a structured copyable details table.

### Visual Hierarchy Problems

- `Quick approve`, `Edit and approve`, and `Reject` look like peer cards. Rejection has rose styling but still competes with approval cards.
- Header status pills are low-information strings (`Approval pending`, `Conversation awaiting approval`) without clear urgency or decision state.
- Review banners above the header can obscure whether the current detail is still actionable after an action redirects back to the same page.

### Spacing/Typography Problems

- Large nested cards and textareas create a long decision flow.
- Draft content and recent messages use similar body styling, so current draft versus context is not visually distinct enough.
- Metadata paragraphs with long IDs can wrap awkwardly in the sidebar.

### Status/Error Signaling Problems

- Review results are transient URL-param banners, not durable audit/history records in the UI.
- `send-failed` is amber, but the action result is critical because approval may have succeeded while send failed; this needs more structured recovery guidance.
- Pending submit buttons show pending text, but there is no global disabled state across competing forms while one decision is in flight.
- No empty state for `detail.recentMessages` when the list is empty.

### Responsive/Mobile Risks

- The two-column detail grid collapses; users may have to scroll through draft and forms before seeing metadata/context.
- Long draft content and textareas can make the page very tall.
- Header action links and status pills can wrap heavily.

### V1 Admin/Operator Fit Risks

- Future approval tooling needs policy rationale, diff, confidence, generated evidence, reviewer notes, escalation links, send diagnostics, and audit history. The current stacked-card form layout will not scale.
- No shared decision panel that can be reused for other approval types.
- No durable status timeline for approval lifecycle.

### Duplicate UI Patterns to Share

- Approval decision form controls.
- Draft preview card.
- Review outcome/status banner.
- Metadata detail list.
- Recent message context card.
- Submit button with tones.

### Highest-Priority Fixes

- P0: Define a reusable approval detail layout with primary review surface, context panel, and decision rail.
- P1: Separate destructive/reject flow from approve/edit flow and add durable lifecycle status.
- P1: Improve send-failed recovery status and error action guidance.

## Workspace / Integration Settings

### Current Route and Files

- Route: `/settings/workspace`
- Page: `apps/web/src/app/settings/workspace/page.tsx`
- Actions: `apps/web/src/app/settings/workspace/actions.ts`
- Data/helpers: `apps/web/src/lib/workspace.ts`, `apps/web/src/lib/integration-management.ts`, `apps/web/src/lib/observability.ts`

### What It Currently Does

- Requires `VIEW_WORKSPACE_SETTINGS`.
- Shows workspace metadata cards.
- For admins, shows dev-only approval seed and draft preview helpers.
- For integration managers, shows Gmail and Slack integration management cards with connect/reconnect, resync, disconnect, status summary, diagnostics, and reconnect warning.
- For audit viewers, shows an operational snapshot with sync failures, send failure rate, worker queue depth, average agent latency, and approval turnaround.
- Renders URL-param-driven banners for connect, sync, disconnect, test approval, and draft preview outcomes.

### Layout Problems

- This page combines workspace identity, dev tools, integration management, and observability in one vertical page.
- The dev-only helpers sit before production integration management, which can distract admins and distort screenshots.
- Integration cards are provider-specific but use mostly generic fields; actions can wrap unpredictably.
- Observability metrics are shoved into the settings page instead of a dedicated operator dashboard.

### Visual Hierarchy Problems

- Header title `Workspace shell` reads like scaffolding, not a production settings surface.
- Dev-only amber section has strong visual weight and can dominate the page.
- Integration status, diagnostics summary, and status detail have similar weight even when the integration requires reconnect.
- Observability cards use large numbers but no severity or trend context.

### Spacing/Typography Problems

- Many `rounded-[24px]` sections and cards create a long, padded settings page.
- Long provider diagnostics are plain text in cards; they are not structured for scan or copy.
- Draft preview output uses a `<pre>` block inside a card, which can produce awkward wrapping and height.

### Status/Error Signaling Problems

- Integration banners are hand-coded in `renderIntegrationBanner()` with many branches.
- Error banners expose only one message string and do not offer retry/reconnect guidance beyond the card warning.
- `requiresReconnect` has a warning block, but action priority does not change accordingly.
- No pending/loading states for connect, sync, disconnect except form submission browser behavior.
- No route error boundary for failed settings/integration data loads.

### Responsive/Mobile Risks

- Workspace metric cards and observability cards stack into a long page.
- Integration action buttons wrap; destructive `Disconnect` can sit near secondary actions without stronger grouping.
- Dev helper selects can contain long conversation labels and may overflow or become hard to use on mobile.

### V1 Admin/Operator Fit Risks

- Future admin settings need separate areas for workspace profile, members/roles, integrations, connector diagnostics, audit/observability, billing/limits, and agent policies. The current single page will not scale.
- No settings navigation or section-level routing.
- No shared integration card/connector health component.
- No durable operation history for sync/connect/disconnect attempts.

### Duplicate UI Patterns to Share

- Settings shell and section header.
- Workspace metadata stat cards.
- Integration status badge/card.
- Banner/alert.
- Operational metric card.
- Destructive action button group.

### Highest-Priority Fixes

- P0: Split settings into a navigable settings/admin shell before adding more tooling.
- P0: Extract integration health/status components and central banner handling.
- P1: Move dev-only tooling out of production settings or gate it behind an explicit developer section.
- P1: Add connector operation history and better pending/error states.

## Members Page

### Current Route and Files

- Route: `/members`
- Page: `apps/web/src/app/members/page.tsx`
- Actions: `apps/web/src/app/members/actions.ts`
- Data/helpers: `apps/web/src/lib/workspace.ts`, `apps/web/src/lib/invite.ts`

### What It Currently Does

- Requires `VIEW_MEMBERS`.
- Fetches current workspace members and invites when the user can create invites.
- Shows dark header with Home/Profile/Workspace settings links.
- Shows invite-created and invite-error banners from URL params.
- Shows an invite form for admins or a permission warning.
- Shows members in a fixed four-column grid.
- Shows pending invites in a fixed four-column grid, or empty states.

### Layout Problems

- Invite creation appears before the member list, making administration form-first rather than member-list-first.
- Members and invites are table-like grids without shared table behavior, mobile adaptation, row actions, or column controls.
- The role pill in the invite card header repeats auth context and does not control the form.
- Pending invites are hidden entirely from users without invite permissions, so the page structure varies by role.

### Visual Hierarchy Problems

- Header copy says this is for "future invite and member management flows", which makes the page feel unfinished.
- Empty states and data tables share the same card language; there is no strong distinction between actual data and scaffolding.
- Invite errors/successes use large sections that can push the form down.

### Spacing/Typography Problems

- Fixed grid table columns with `gap-4` can crowd long emails and dates.
- Uppercase table headers with wide tracking hurt readability.
- `rounded-[24px]` table containers match all other cards, reducing table clarity.

### Status/Error Signaling Problems

- Invite error text comes directly from search params.
- Invite created message does not show who was invited, expiry, or invite link.
- No loading/error state for member fetch or invite creation beyond submit.
- Permission warning is local to the invite form and not tied to broader page capability.

### Responsive/Mobile Risks

- The member and invite grids do not include `md:` breakpoints. Four fixed columns can overflow narrow screens.
- Invite form uses a three-column desktop grid that stacks, but the role badge and header layout do not explicitly adapt.
- Long invite URLs/tokens are represented as links but no copy/share affordance exists.

### V1 Admin/Operator Fit Risks

- No member detail, deactivate/remove, role change, resend invite, revoke invite, search, filters, or audit history.
- No shared data table component for RBAC/member administration.
- No settings/admin shell context.

### Duplicate UI Patterns to Share

- Member/invite table.
- Invite form controls.
- Permission warning/empty state.
- Header/nav.
- Success/error banners.

### Highest-Priority Fixes

- P0: Replace fixed member/invite grids with a responsive shared table/list primitive.
- P1: Reorder around member management as the primary task; make invite creation a secondary action.
- P1: Add reusable invite status and permission messaging.

## Profile Page

### Current Route and Files

- Route: `/profile`
- Page: `apps/web/src/app/profile/page.tsx`
- Data/helpers: `apps/web/src/lib/user.ts`, `apps/web/src/lib/app-auth.ts`

### What It Currently Does

- Requires app auth and loads the signed-in user.
- Shows dark header with Home, Workspace settings, and Members links.
- Shows profile fields as cards: name, email, user ID, workspace ID, role, created at.
- Shows amber unavailable state when auth exists but the user record cannot be loaded.

### Layout Problems

- Profile is a read-only metadata grid with no account actions, preferences, security controls, or session management beyond nav elsewhere.
- Header/navigation are duplicated from other pages.
- User and workspace IDs are presented as primary cards, which is more developer/admin metadata than user profile content.

### Visual Hierarchy Problems

- Title `Account shell` reads as scaffolding.
- All profile cards have equal weight even though name/email/role matter more than raw IDs.
- The unavailable state is a full card, but there is no recovery action.

### Spacing/Typography Problems

- Large cards for small pieces of metadata make the page sparse.
- Repeated uppercase labels and large radii match the rest of the app but are not tuned for account settings.

### Status/Error Signaling Problems

- Missing user record is shown as amber warning but not actionable.
- No page-level error boundary for failed fetch.
- No loading state.

### Responsive/Mobile Risks

- Metadata cards stack cleanly, but the page becomes a long list of low-value cards.
- Long IDs use `break-all`, which can create visually noisy mobile cards.

### V1 Admin/Operator Fit Risks

- Future account/profile settings need editable fields, notification preferences, security/session controls, and identity-provider state. The current read-only card grid has no form/action structure.
- No shared settings shell.

### Duplicate UI Patterns to Share

- Profile/workspace metadata card.
- Header/nav.
- Warning empty/error state.

### Highest-Priority Fixes

- P1: Move profile into shared settings shell and prioritize user-facing account controls.
- P2: Demote raw IDs or put them in a developer/details section.

## Current Agent Controls

### Current Route and Files

- Route: `/conversations/[conversationId]`
- UI: `apps/web/src/app/conversations/[conversationId]/page.tsx`
- Actions: `apps/web/src/app/conversations/[conversationId]/actions.ts`
- Logic/data: `apps/web/src/lib/agent-assignments.ts`, `apps/web/src/lib/agent-trigger-rules.ts`, `apps/web/src/lib/agent-draft-flow.ts`, `apps/web/src/lib/agent-trigger-runtime.ts`

### What It Currently Does

- Shows an `Agent Assignment` panel near the top of the thread page.
- Displays active assignment goal, instructions, tone, and enabled trigger rules.
- Lets users with `ASSIGN_AGENTS` create/replace assignment by setting goal, instructions, tone, and trigger-rule checkboxes.
- Lets users unassign an agent.
- Lets users run the agent manually when an active assignment exists.

### Layout Problems

- Controls are embedded inline above the message history and manual reply, so agent administration dominates thread reading.
- Assignment editing is a full form every time, even when the likely operator action is "run", "pause", "inspect", or "change trigger".
- Run Agent is visually separated from the assignment form but still depends on it; the relationship is not structured.

### Visual Hierarchy Problems

- Current assignment summary, edit form, unassign, run, and disabled hint all share similar visual weight.
- Trigger-rule labels are plain checkboxes; no state explanation, last-run signal, or policy source is shown.
- `Run Agent` uses cyan while most primary actions use slate, creating an ad hoc action hierarchy.

### Spacing/Typography Problems

- Goal/instructions/tone fields are large and stacked, which is costly for a common thread page.
- Trigger-rule checklist inside a rounded nested block adds more card chrome than actual information.

### Status/Error Signaling Problems

- Agent action results are scattered across URL-param banners at the top of the page.
- No inline status near the controls for last run, current run, failure, escalation, or generated draft.
- Permission denial is a short text paragraph, not a structured disabled/permission state.
- Button pending state exists for reply and approvals, but not for assign/unassign/run controls.

### Responsive/Mobile Risks

- Controls create a long mobile preamble before the conversation.
- Unassign and Run Agent actions may appear far from the assignment fields they affect.

### V1 Admin/Operator Fit Risks

- Future controls need assigned agent identity, version, rules, tools, memory/context, last run, run history, generated artifacts, escalation reasons, and pause/resume state. The current single form cannot absorb that.
- No reusable agent-control component for list rows, details, or admin settings.

### Duplicate UI Patterns to Share

- Agent assignment summary.
- Agent control action group.
- Trigger-rule checklist.
- Inline permission/disabled state.
- Agent run status banner.

### Highest-Priority Fixes

- P0: Extract agent controls into a reusable component with summary, actions, status, and edit mode.
- P1: Move controls into a dedicated operator panel/rail or collapsible section.
- P1: Add pending and result state close to the action that caused it.

## Banners, Alerts, Loading States, Empty States, and Error States

### Current Route and Files

- Repeated banners: `apps/web/src/app/conversations/[conversationId]/page.tsx`, `apps/web/src/app/approvals/[approvalRequestId]/page.tsx`, `apps/web/src/app/settings/workspace/page.tsx`, `apps/web/src/app/members/page.tsx`
- Empty states: `apps/web/src/app/page.tsx`, `apps/web/src/app/conversations/[conversationId]/page.tsx`, `apps/web/src/app/approvals/page.tsx`, `apps/web/src/app/members/page.tsx`, `apps/web/src/app/profile/page.tsx`, `apps/web/src/app/settings/workspace/page.tsx`
- Submit pending components: `apps/web/src/app/conversations/[conversationId]/reply-submit-button.tsx`, `apps/web/src/app/approvals/[approvalRequestId]/approval-submit-button.tsx`
- Missing route states: no `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` files under `apps/web/src/app`

### What They Currently Do

- Success/error/warning/info messages are inline route-specific sections, usually driven by search params after server actions redirect.
- Empty states are dashed or standard cards with short copy.
- Pending states exist for manual reply and approval submit buttons using `useFormStatus`.
- Other forms rely on default browser submission behavior and route redirects.

### Layout Problems

- Banners are inserted above page headers or sections and change page position after actions.
- Empty states vary between dashed boxes, white cards, amber cards, and plain local warnings.
- There is no reusable placement rule for global alert versus section alert versus inline field error.

### Visual Hierarchy Problems

- Success, warning, and error sections are all large rounded cards; severity is mostly color.
- Some neutral outcomes use slate, some warning outcomes use amber, and some operational failures use amber rather than rose.
- Empty states often read as documentation/scaffolding rather than actionable product states.

### Spacing/Typography Problems

- Alert padding and radius are large relative to message length.
- Uppercase labels in empty/error cards add noise.
- No iconography or consistent title/body/action structure.

### Status/Error Signaling Problems

- No shared severity taxonomy.
- URL-param messages can become stale on refresh.
- No dismiss behavior.
- No retry/action slots.
- No route-level loading or error boundaries.
- No skeletons for queues or thread pages.
- No field-level validation presentation beyond native required controls and redirect errors.

### Responsive/Mobile Risks

- Large banners stack above content and consume substantial mobile viewport height.
- Search-param messages with long provider errors may wrap into very tall alerts.

### V1 Admin/Operator Fit Risks

- Operator tooling needs consistent, durable, actionable signals for sync health, send failures, permission limits, retries, background jobs, and partial success. Current one-off banners will fragment quickly.

### Duplicate UI Patterns to Share

- `Alert` / `Banner` with severity, title, body, action, dismiss option.
- `EmptyState` with title, body, primary action, secondary action.
- `PageLoading` / route skeletons.
- `PageError` / section error.
- `StatusBadge`.
- `FormSubmitButton`.

### Highest-Priority Fixes

- P0: Add shared alert, empty, status badge, and route loading/error primitives.
- P1: Replace search-param-only transient result messages with durable inline status for critical operations.
- P1: Add pending states for all mutating forms.

## Screenshot Inventory

Capture both data-rich and empty/error variants where possible. Use seeded data that includes Gmail, Slack, assigned/unassigned conversations, pending approvals, reviewed approvals, send failures, integration errors, members, and invites.

| Major page | Route | Purpose | Screenshot needed | Viewport size to capture | Notes on what to inspect |
| --- | --- | --- | --- | --- | --- |
| Inbox | `/` | Unified conversation queue with filters and workspace navigation. | Full inbox with several conversations, mixed platforms, assignment states, and at least one send failure. | Desktop `1440x1000`, tablet `834x1112`, mobile `390x844`. | Inspect header wrapping, identity cards above queue, filter alignment, row density, badge hierarchy, long participant/title behavior, raw conversation ID noise, and empty-filter state. |
| Inbox empty/filtered | `/` with filters that produce zero results | Empty state for no matching conversations. | Empty queue under active filters. | Desktop `1440x900`, mobile `390x844`. | Verify copy distinguishes filtered-zero from no-data; check filter form height and reset visibility. |
| Conversation thread | `/conversations/[conversationId]` | Read one canonical conversation, manage assignment, run agent, and send manual reply. | Thread with active agent, trigger rules, recent send failure, attachments, and long messages. | Desktop `1440x1200`, tablet `834x1112`, mobile `390x1200`. | Inspect banner stacking, header pill wrapping, agent controls before messages, form height, message card readability, attachment affordances, and long IDs on mobile. |
| Conversation thread without assignment | `/conversations/[conversationId]` | Thread state where Run Agent is disabled. | No active assignment, disabled Run Agent, no messages or short message list if available. | Desktop `1440x1000`, mobile `390x844`. | Inspect disabled reason, empty assignment state, permission text if captured as non-admin, and how quickly messages are reachable. |
| Approvals queue pending | `/approvals` | Pending human review queue. | Pending approvals with Gmail/Slack rows and varied draft lengths. | Desktop `1440x1000`, tablet `834x1112`, mobile `390x844`. | Inspect queue row density, pending/reviewed toggle, mobile stacked row labels, draft preview wrapping, count copy, role pill, and lack of pagination. |
| Approvals queue reviewed | `/approvals?view=reviewed` | Recently reviewed approvals. | Reviewed list with approved and rejected items. | Desktop `1440x1000`, mobile `390x844`. | Inspect whether copy still says ready for review, status hierarchy, timestamp column, and empty reviewed state. |
| Approval detail pending | `/approvals/[approvalRequestId]` | Review one generated draft. | Pending approval with long draft, recent context, approve/edit/reject forms. | Desktop `1440x1200`, tablet `834x1112`, mobile `390x1200`. | Inspect decision hierarchy, reject placement, context sidebar readability, form height, draft versus context distinction, and mobile order. |
| Approval detail reviewed | `/approvals/[approvalRequestId]` | Reviewed approval outcome and rejected revision flow. | Approved detail and rejected detail with reviewer feedback/revise form. | Desktop `1440x1200`, mobile `390x1200`. | Inspect outcome status durability, revise form hierarchy, metadata wrapping, recent context empty/non-empty cases, and send-failed banner if available. |
| Workspace settings | `/settings/workspace` | Workspace metadata, integration management, dev helpers, and observability snapshot. | Admin view with dev helpers, connected and errored integrations, and observability metrics. | Desktop `1440x1400`, tablet `834x1112`, mobile `390x1200`. | Inspect section order, dev-only prominence, integration card action wrapping, reconnect warning, diagnostics text, metric card hierarchy, and long preview output. |
| Workspace settings permission variant | `/settings/workspace` | Non-integration-manager settings view. | User with view settings but without integration management if available. | Desktop `1440x1000`, mobile `390x844`. | Inspect missing sections, whether page still explains permissions, and header/nav consistency. |
| Members | `/members` | Member list and invite creation. | Admin view with members and pending invites. | Desktop `1440x1100`, tablet `834x1112`, mobile `390x1000`. | Inspect fixed grid overflow, invite form placement, role badge, long emails, invite link affordance, success/error banners, and empty invite state. |
| Members no-invite permission | `/members` | Member view for a user without invite permissions. | Member list with permission warning in invite section. | Desktop `1440x1000`, mobile `390x844`. | Inspect whether invite section should appear, warning clarity, and table responsiveness. |
| Profile | `/profile` | Signed-in account metadata. | Normal profile with name, email, IDs, role, created date. | Desktop `1440x900`, mobile `390x844`. | Inspect sparse metadata layout, raw ID prominence, header copy, and navigation wrapping. |
| Profile unavailable | `/profile` with missing user record if seedable | Fallback when auth exists but user load fails. | Amber unavailable state. | Desktop `1440x900`, mobile `390x844`. | Inspect recovery guidance and whether warning is actionable. |
| Agent controls | `/conversations/[conversationId]` | Current agent assignment and manual run controls inside thread page. | Focused capture of assignment summary, edit form, trigger rules, unassign, and Run Agent. | Desktop `1440x900`, mobile `390x1000`. | Inspect controls as a standalone pattern: hierarchy, pending state absence, disabled state, trigger-rule labels, and relationship to thread content. |
| Alerts and banners | Multiple routes with action query params | Transient result and error messaging. | Conversation reply error/success, approval review send-failed/error, integration sync/connect error, invite error/success. | Desktop `1440x900`, mobile `390x844`. | Inspect severity consistency, stale URL-param behavior, long error wrapping, banner placement above headers, and action/retry absence. |
| Route loading/error | Any slow/failing route | Framework fallback because app has no route-level state files. | Simulated slow fetch/failure if possible. | Desktop `1440x900`, mobile `390x844`. | Confirm absence of Envoy-specific loading skeletons and route error UI. |

## Problem Priority

Priority definitions:

- P0 = blocks V1 frontend foundation
- P1 = should fix during redesign
- P2 = polish
- P3 = later

### P0

1. No shared application shell or persistent admin/operator navigation.
   - Evidence: `apps/web/src/app/layout.tsx` only renders `{children}`; every major route duplicates `main`, gradient background, `max-w-5xl`, dark header, and nav links.
   - Impact: V1 admin areas, settings sections, queues, and operator workflows will fragment.

2. No shared UI primitives despite repeated patterns.
   - Evidence: `packages/ui` is empty; route files inline badges, cards, alerts, buttons, table grids, empty states, and headers.
   - Impact: New V1 surfaces will copy/paste divergent UI and status semantics.

3. No route-level loading or error boundaries.
   - Evidence: no `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` under `apps/web/src/app`.
   - Impact: Slow/failing inbox, thread, approvals, settings, and member pages do not have product-grade operator states.

4. Queue/table foundation is missing.
   - Evidence: inbox, approvals, members, and invites all use hand-built CSS grids in `apps/web/src/app/page.tsx`, `apps/web/src/app/approvals/page.tsx`, and `apps/web/src/app/members/page.tsx`.
   - Impact: Sorting, pagination, bulk actions, row actions, mobile labels, saved views, and admin list consistency will be expensive to add.

5. Status and alert semantics are route-local.
   - Evidence: conversation, approval detail, workspace settings, and members each render custom success/error/warning sections from search params.
   - Impact: Critical states such as send failure, reconnect required, review outcome, permission denial, and empty data will not be consistent or actionable.

6. Agent controls are embedded as a one-off thread form.
   - Evidence: `apps/web/src/app/conversations/[conversationId]/page.tsx` renders assignment summary, edit fields, trigger checkboxes, unassign, and Run Agent inline before messages.
   - Impact: V1 agent operations need reusable controls, run status, logs, policies, and diagnostics that cannot fit cleanly in the current block.

7. Settings/admin information architecture is not established.
   - Evidence: `apps/web/src/app/settings/workspace/page.tsx` combines workspace metadata, dev-only helpers, integrations, and observability in one page.
   - Impact: Future admin/operator tooling has no scalable section model.

### P1

1. Inbox hierarchy prioritizes account metadata over queue work.
   - Evidence: `/` shows email, user ID, workspace ID, and role cards before the conversation queue.
   - Fix during redesign: make the queue the primary object and move identity/workspace details into shell/settings.

2. Mobile responsiveness is inconsistent across table-like surfaces.
   - Evidence: inbox and approvals have partial responsive grids; members and invites use fixed four-column grids without breakpoints.
   - Fix during redesign: shared responsive data-list/table behavior.

3. Approval detail decision hierarchy is weak.
   - Evidence: quick approve, edit-and-approve, and reject are stacked as similar cards.
   - Fix during redesign: primary review surface plus decision rail, with destructive flow separated.

4. Thread page puts admin controls before conversation reading.
   - Evidence: agent assignment and manual reply blocks are above participants/messages.
   - Fix during redesign: operator side panel, collapsible controls, or sticky composer pattern.

5. Integration management lacks operation history and strong recovery guidance.
   - Evidence: settings uses one-off banners and card warnings for sync/connect/disconnect/reconnect states.
   - Fix during redesign: connector health component with last operation, retry, reconnect, diagnostics, and history.

6. Pending states are incomplete.
   - Evidence: only `ReplySubmitButton` and `ApprovalSubmitButton` use `useFormStatus`; assign/unassign/run agent, invite, integration, and dev helper forms have no consistent pending UI.
   - Fix during redesign: shared submit/action button and form status model.

7. Empty states do not distinguish causes.
   - Evidence: inbox and approvals use generic no-results/no-requests text; profile/settings unavailable states have no recovery action.
   - Fix during redesign: empty, filtered-zero, permission-limited, load-failed, and first-run states.

8. Header copy and scaffolding labels feel unfinished.
   - Evidence: `Workspace shell`, `Account shell`, `Server-rendered...`, and `future... flows` appear in production routes.
   - Fix during redesign: replace with task-oriented product copy.

9. Raw IDs are too prominent.
   - Evidence: inbox rows show `conversationId`; profile/workspace cards emphasize user/workspace IDs; approval metadata displays long IDs as paragraph text.
   - Fix during redesign: move IDs into copyable details/diagnostics areas.

10. Dev-only tooling is too prominent in settings.
    - Evidence: amber `Dev Only` approval seed and draft preview helpers appear before integration management for admins.
    - Fix during redesign: move behind developer route/flag/section.

### P2

1. Excessive rounded radii and shadows reduce operational density.
   - Evidence: repeated `rounded-[28px]`, `rounded-[24px]`, and large shadows across pages.
   - Polish: reduce chrome after product layout is set.

2. Uppercase labels use heavy letter spacing everywhere.
   - Evidence: repeated `tracking-[0.25em]` and `tracking-[0.3em]` in headers, cards, tables, and badges.
   - Polish: reserve uppercase tracking for limited section labels or remove from table headers.

3. Badge capitalization is inconsistent.
   - Evidence: some enum labels use `toLowerCase()`, some `replaceAll("_", " ")`, some uppercase tracking.
   - Polish: shared label formatter for status enums.

4. Message cards lack directional differentiation.
   - Evidence: thread messages use similar cards for inbound/outbound/agent/system with only small pills.
   - Polish: improve timeline grouping and sender/status styling.

5. Attachment cards are metadata-only.
   - Evidence: `apps/web/src/lib/thread.ts` exposes `externalUrl`, but thread UI only renders filename, MIME type, and size.
   - Polish: add open/download affordance when product policy is defined.

6. Observability cards lack trend/severity context.
   - Evidence: workspace operational snapshot shows numbers without thresholds or prior-period comparison.
   - Polish: add severity and trend after admin dashboard direction is set.

7. Form fields lack helper/error structure.
   - Evidence: server action errors redirect to page-level banners; fields do not show inline validation states.
   - Polish: shared form field component after action model is decided.

### P3

1. Add icons to common actions and alerts.
   - Rationale: useful after component extraction, but not foundational.

2. Add copy/share affordances for invite links and IDs.
   - Rationale: valuable for admin usability, but can follow table/detail redesign.

3. Add user preference/account-edit controls to profile.
   - Rationale: profile is currently low-risk read-only metadata; major admin/operator surfaces are higher priority.

4. Add saved views or advanced filters.
   - Rationale: important later, but depends on P0 queue/filter primitives.

5. Add skeleton polish for each route.
   - Rationale: route loading primitives are P0; highly tailored skeletons can follow.
