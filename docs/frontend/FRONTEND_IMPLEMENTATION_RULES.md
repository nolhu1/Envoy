# Frontend Implementation Rules

Source documents:

- `docs/frontend/FRONTEND_GAP_AUDIT.md`
- `docs/frontend/FRONTEND_DESIGN_FOUNDATION.md`
- `docs/frontend/INFORMATION_ARCHITECTURE_V1.md`
- `docs/frontend/COMPONENT_SYSTEM.md`

This document is binding guidance for future Envoy frontend work. It turns the V1 audit, information architecture, design foundation, and component system into implementation rules for Codex and human contributors.

## App Shell And Page Composition

- Authenticated product pages must use the shared shell/page contract: app background, persistent navigation, workspace context, user/profile access, and global alerts are shell-owned concerns.
- Route files should compose data and shared components. They should not recreate page shells, local navigation bars, dark hero headers, gradient backgrounds, or custom app chrome.
- Page content starts with `PageContainer` and `PageHeader`, followed by an optional page-local status region and the main queue, detail, settings, or operator surface.
- Page titles are compact and literal: `Inbox`, `Approvals`, `Members`, `Workspace settings`, `Profile`, or the record being inspected.
- Workspace and user IDs are metadata, not primary page content. Put raw IDs in `MetadataList`/`CopyableField`.
- Route-local back links are acceptable on detail pages. Route-local primary navigation is not.

## Queue And Table Rules

- Queue-like surfaces must use the shared queue system: `QueueContainer`, `FilterBar`, `FilterField`, `ActiveFilters`, `QueueTable`, `QueuePagination`, `QueueEmpty`, and `QueueLoading` where applicable.
- This applies to inbox, approvals, members, invites, audit logs, approval history, agent runs, integration operations, and future admin lists.
- Rows must expose the primary object, status, owner/assignment when relevant, source/platform when relevant, recency, and next action or failure state when relevant.
- Mobile rows must keep field labels visible after column headers disappear.
- Empty states must distinguish first-run/no-data from filtered-no-results.
- Do not build fixed route-local grid tables such as `grid-cols-[1.5fr_...]` for admin lists.
- Do not inline badge, status, row hover, or table header styles in routes.

## Detail Page Layout Rules

- Detail pages use `DetailLayout` or the same layout contract: primary content, action rail, metadata/context, and timeline/audit zones.
- Primary content is the object under review: conversation messages, approval draft, agent run output, integration operation log, or member/account record.
- Operator controls belong in `ActionRail`, `ActionGroup`, `DecisionPanel`, or scoped panels. They should not block access to primary content.
- Destructive actions must be visually separated from safe primary actions.
- Metadata belongs in `MetadataList`; timelines belong in `Timeline`/`TimelineItem`; messages belong in `MessageList`/`MessageItem`.
- Do not make a detail page a stack of unrelated full-width cards.

## Form Rules

- Forms must use shared form primitives: `FormSection`, `FormField`, `FormLabel`, `FormHelper`, `FormError`, and `SubmitButton`.
- Inputs use shared primitives: `Input`, `Textarea`, `Select`, and `Checkbox`.
- Every mutating form must have a clear submit action, disabled/pending behavior when applicable, and visible validation or action-result messaging.
- Large configuration forms should live in settings sections, drawers, or edit mode. Do not place large always-open admin forms above the main operational content.
- Invite, integration, profile, workspace, approval, and agent forms must preserve server-side permission checks. UI gating is not a substitute for enforcement.

## Alert And Status Rules

- Use `Alert`, `ErrorState`, `PermissionState`, `ReconnectPrompt`, `SyncErrorCard`, `FailedSendState`, `PendingApprovalState`, `EscalatedState`, and `AgentState` instead of route-local alert markup.
- Use `StatusBadge` for domain statuses and `Badge` for role/platform/neutral metadata.
- Critical means work is blocked or failed and must use critical styling with impact and recovery guidance when recovery is possible.
- Warning means attention is needed but the workflow is not hard-blocked.
- Success is reserved for user-requested operation completion.
- Platform badges are metadata, not severity.
- Status labels must be human-readable sentence case. Do not render raw enum strings as primary UI.

## Cards, Panels, Tables, And Timelines

- Use `Panel` for one bounded tool, setting section, context panel, or compact repeated card when a table is not appropriate.
- Use `QueueTable`/`Table` for repeated records that users scan, compare, filter, or act on.
- Use `MetadataList` for label/value diagnostics, IDs, timestamps, and support details.
- Use `Timeline` for chronological operational events, approval lifecycle entries, audit records, and agent runs.
- Use message components for conversation content; do not repurpose generic cards for message timelines.
- Avoid nested cards. If content is already inside a panel, use dividers, `MetadataList`, or subtle panels only where structure is needed.

## Accessibility Requirements

- Interactive controls must have accessible names. Icon-only buttons require `aria-label` and, when meaning is not obvious, a tooltip.
- Use native form controls where possible. Labels must connect to inputs or wrap them.
- Alerts with critical severity should use alert semantics; non-critical status updates should not interrupt unnecessarily.
- Disabled actions need visible reason text near the action or in a permission/status state.
- Do not convey status by color alone. Include labels such as `Failed`, `Pending review`, `Connected`, or `Reconnect required`.
- Preserve keyboard navigation through tables, forms, tabs, and detail actions.
- Focus states must remain visible and use the shared sky focus ring treatment.

## Responsive Breakpoints

- Mobile starts from the base layout. Use `md:` for tablet/desktop row/table transitions and `lg:` for app shell/sidebar or multi-column detail layouts.
- Page gutters follow the shared container rules: base `px-4`, desktop `lg:px-8` through `PageContainer`.
- Queue/table rows become labeled stacked rows on mobile; they must not rely on horizontal scrolling for core content.
- Action groups may wrap. Primary actions should stay discoverable and destructive actions should remain separated after wrapping.
- Detail pages should stack primary content before action/context rails on narrow screens.
- Long IDs, emails, URLs, message bodies, and metadata must wrap or truncate intentionally.

## Dark Mode Decision

- V1 is light mode only.
- Use semantic tokens and shared components so dark mode can be added later without route rewrites.
- Do not add page-specific dark blocks, dark hero headers, dark shells, or dark-mode-only route styling.
- Code/log viewers may use high-contrast treatment only when required for readability, while the app shell remains light.

## Icon And Motion Rules

- Use icons only when they improve scan or replace a familiar command label. Icons must not be the only way to understand a workflow.
- Prefer the app's established icon library when one is present; do not hand-roll decorative SVG icons in route files.
- Motion is limited to state communication: hover, focus, pressed, short disclosure, loading, or subtle status transitions.
- Use `transition-colors` and short durations. Avoid decorative animation, shimmer-heavy loading, animated gradients, glow effects, and AI-themed motion.
- Respect reduced motion. No workflow should depend on animation to be understood.

## Do Not Rules For Future Codex Work

- Do not create dark hero headers, full-page gradients, large custom radii, decorative shadows, or flashy AI visuals.
- Do not create route-local button, badge, alert, card, table, tab, or form variants.
- Do not add fixed custom grid tables for queues or admin lists.
- Do not put workspace/user identity cards above operational queues.
- Do not make raw IDs primary visual content.
- Do not place dev-only tools inside production settings without an isolated developer section or explicit developer route.
- Do not change database schema, connector/runtime behavior, or permission enforcement while doing visual migration work unless the task explicitly asks for it.
- Do not hide validation, lint, typecheck, or build errors. If an error is unrelated and pre-existing, list it clearly.
- Do not redesign additional pages during enforcement cleanup. Keep cleanup scoped to dead imports, unused helpers, and documented violations in files already being touched.

## Acceptance Criteria

- New pages can be composed from `@envoy/ui` without route-local visual systems.
- Queues, detail views, settings forms, admin tools, alerts, statuses, empty states, loading states, and permission states use shared components.
- Mobile layouts preserve scan, labels, actions, and readable text without horizontal overflow.
- Destructive and permission-limited actions remain clearly separated and explained.
- Light mode remains the only V1 theme.
- Future frontend changes can be reviewed against this document without re-reading the full audit.
