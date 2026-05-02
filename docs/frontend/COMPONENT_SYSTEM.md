# Component System

Source documents:

- `docs/frontend/FRONTEND_GAP_AUDIT.md`
- `docs/frontend/FRONTEND_DESIGN_FOUNDATION.md`
- `docs/frontend/INFORMATION_ARCHITECTURE_V1.md`

This document defines the reusable UI component system required for Envoy V1. It is not visual design and not page implementation. It defines the architecture and contracts that all V1 pages should use.

## 1. Component Architecture

### Package Location

Shared components live in `packages/ui`.

Application routes in `apps/web/src/app` should import shared UI from `packages/ui` once the package is implemented. Route files should compose data and page structure; they should not define one-off buttons, badges, alerts, tables, cards, or layout shells.

Domain-specific data mapping can live in `apps/web/src/lib` or feature-level app code, but reusable presentation components belong in `packages/ui`.

### Folder Structure

Recommended package structure:

```text
packages/ui/
  src/
    primitives/
      button.tsx
      input.tsx
      textarea.tsx
      select.tsx
      checkbox.tsx
      badge.tsx
      alert.tsx
      panel.tsx
      modal.tsx
      drawer.tsx
      tabs.tsx
      tooltip.tsx
    layout/
      app-shell.tsx
      sidebar-nav.tsx
      topbar.tsx
      page-container.tsx
      page-header.tsx
      section-header.tsx
      split-layout.tsx
    data-display/
      table.tsx
      empty-state.tsx
      loading-skeleton.tsx
      error-state.tsx
      status-badge.tsx
      timeline.tsx
    queue/
      queue-container.tsx
      filter-bar.tsx
      active-filters.tsx
      queue-table.tsx
      queue-pagination.tsx
      queue-state.tsx
    detail/
      detail-layout.tsx
      action-rail.tsx
      metadata-list.tsx
      copyable-field.tsx
      action-group.tsx
      decision-panel.tsx
      message-list.tsx
      attachment-item.tsx
    forms/
      form-field.tsx
      form-section.tsx
      submit-button.tsx
    domain/
      conversations/
        conversation-row.tsx
        message-item.tsx
      approvals/
        approval-row.tsx
        approval-card.tsx
      agents/
        agent-summary.tsx
        agent-control-panel.tsx
      integrations/
        integration-health-card.tsx
      members/
        member-row.tsx
    status/
      mappings.ts
      labels.ts
    index.ts
```

### Naming Conventions

- Components use PascalCase: `Button`, `QueueTable`, `AgentControlPanel`.
- Files use kebab-case: `agent-control-panel.tsx`.
- Props use `ComponentNameProps`: `ButtonProps`, `QueueRowProps`.
- Variant props use stable string unions: `variant="primary"`, `severity="critical"`, `size="sm"`.
- Domain components include the domain noun: `ConversationRow`, `ApprovalRow`, `AgentSummary`.
- Avoid names that describe styling only, such as `BlueBadge` or `BigCard`.

### Component Layering

#### Primitives

Primitives are small, low-level building blocks:

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Checkbox`
- `Badge`
- `Alert`
- `Panel`
- `Modal`
- `Drawer`
- `Tabs`
- `Tooltip`

Rules:

- Primitives know visual variants and interaction states.
- Primitives do not know Envoy domain enums.
- Primitives are reusable across every app surface.

#### Composites

Composites combine primitives into reusable patterns:

- `Table`
- `Alert`
- `FormField`
- `EmptyState`
- `ErrorState`
- `QueueTable`
- `MetadataList`
- `ActionRail`

Rules:

- Composites own structure and accessibility patterns.
- Composites may accept render props or typed item data.
- Composites should not fetch data.

#### Domain Components

Domain components adapt Envoy data to reusable UI:

- `ConversationRow`
- `ApprovalRow`
- `ApprovalCard`
- `AgentControlPanel`
- `IntegrationHealthCard`
- `MemberRow`

Rules:

- Domain components may understand Envoy statuses and entity names.
- Domain components must use primitives/composites internally.
- Domain components must not define new visual variants inline.

## 2. Core Primitives

### Button

Purpose: all clickable command actions.

Required props:

- `children`
- `variant`: `primary | secondary | tertiary | danger | accent`
- `size`: `sm | md | lg`
- `loading?: boolean`
- `disabled?: boolean`
- `iconStart?: ReactNode`
- `iconEnd?: ReactNode`
- `type?: "button" | "submit" | "reset"`
- `aria-label?`

Variants:

- `primary`: default safe action.
- `secondary`: alternate action or navigation-like command.
- `tertiary`: low-emphasis inline command.
- `danger`: destructive action.
- `accent`: rare workflow action needing distinction.

States:

- Hover: subtle background/border shift.
- Active: pressed state.
- Disabled: non-interactive with visible disabled styling.
- Loading: disabled, shows spinner or loading label, preserves width where possible.

Usage rules:

- One primary button per action region.
- Destructive buttons must use `danger`.
- Do not create route-local rounded-full or color-specific button classes.
- Icon-only buttons require `aria-label` and tooltip when meaning is not obvious.

### Input

Purpose: single-line text entry.

Required props:

- Standard input props.
- `invalid?: boolean`
- `size?: "sm" | "md"`

Variants:

- `default`
- `search`

States:

- Default, hover, focus, invalid, disabled.

Usage rules:

- Use through `FormField` when label, helper, or error is needed.
- Search inputs in queues should use `FilterField`.
- Do not place standalone labels disconnected from inputs.

### Textarea

Purpose: multi-line text entry for replies, drafts, instructions, rejection reasons.

Required props:

- Standard textarea props.
- `invalid?: boolean`
- `minRows?: number`
- `autoResize?: boolean`

States:

- Default, focus, invalid, disabled.

Usage rules:

- Message/draft textareas must have stable minimum height.
- Configuration textareas should not be always open on detail pages unless editing is the primary task.

### Select

Purpose: choose one option from a finite list.

Required props:

- `options: Array<{ value: string; label: string; disabled?: boolean }>`
- `value` or `defaultValue`
- `placeholder?`
- `invalid?: boolean`

States:

- Default, focus, invalid, disabled.

Usage rules:

- Use for compact option lists.
- For complex entity selection with search, define a separate combobox later rather than overloading `Select`.

### Checkbox

Purpose: binary or multi-select selection.

Required props:

- `checked` or `defaultChecked`
- `label`
- `description?`
- `invalid?: boolean`

States:

- Default, focus, checked, indeterminate, disabled.

Usage rules:

- Trigger rule checklists must use `Checkbox` inside `TriggerRuleList`.
- Checkbox text must explain what changes.

### Badge

Purpose: small metadata or status label.

Required props:

- `children`
- `variant`: `neutral | info | success | warning | critical | platform`
- `size?: "sm" | "md"`

States:

- Static by default.
- Optional interactive badge only when used as a filter token or removable chip.

Usage rules:

- Use `StatusBadge` for domain statuses.
- Do not inline badge classes in route files.
- Platform badges are metadata, not severity.

### Alert

Purpose: page, section, or inline status message.

Required props:

- `severity`: `critical | warning | success | info | neutral`
- `title`
- `children`
- `actions?: ReactNode`
- `dismissible?: boolean`

States:

- Static, dismissible, loading-related only when paired with operation state.

Usage rules:

- Critical alerts must include impact and recovery action when available.
- Local action results should render near the action, not in global alert region.
- Do not define one-off alert styles in pages.

### Card / Panel

Purpose: bounded container for one tool, form, repeated entity, or context panel.

Required props:

- `children`
- `variant?: "default" | "subtle" | "danger" | "warning"`
- `padding?: "none" | "sm" | "md" | "lg"`

Usage rules:

- Prefer `Panel` naming for app surfaces.
- Do not nest panels unless the inner panel represents a distinct bounded object.
- Do not use panels to frame every metadata field.

### Modal / Drawer

Purpose: focused overlay for confirmation, editing, or mobile navigation/filtering.

Required props:

- `open`
- `onOpenChange`
- `title`
- `description?`
- `children`

Variants:

- `Modal`: centered focused overlay.
- `Drawer`: side or bottom panel for navigation, filters, or detail action on mobile.

States:

- Open, closed, loading content, error content.

Usage rules:

- Use modal for confirmation or focused short tasks.
- Use drawer for mobile nav, filter editing, and secondary detail panels.
- Destructive confirmation must use explicit action labels.

### Tabs

Purpose: switch peer views within the same route/resource.

Required props:

- `items: Array<{ value: string; label: string; count?: number }>`
- `value`
- `onValueChange` or link-based item hrefs.

Usage rules:

- Use tabs for peer filters, not for distinct settings pages.
- Use routes for major settings/admin sections.

### Tooltip

Purpose: clarify compact controls and truncated metadata.

Required props:

- `content`
- `children`

Usage rules:

- Required for icon-only controls unless the accessible name is visually obvious.
- Do not hide essential information only in a tooltip.

## 3. Layout Components

### AppShell

Purpose: authenticated product shell.

Required props:

- `navItems`
- `workspace`
- `user`
- `globalAlerts?`
- `children`

Owns:

- Sidebar/topbar structure.
- Global alert/status region.
- Main content outlet.
- Mobile nav drawer behavior.

Usage rules:

- All authenticated routes render inside `AppShell`.
- Route files must not recreate app background, global nav, user menu, or workspace context.

### SidebarNav

Purpose: desktop primary navigation.

Required props:

- `items: NavItem[]`
- `activePath`
- `operatorVisible?: boolean`

Usage rules:

- Contains Inbox, Approvals, Members, Settings, Operator.
- Permission-gated items are hidden or disabled with explanation depending on product decision.

### Topbar

Purpose: workspace context, global status entry, and user/profile menu.

Required props:

- `workspaceName`
- `workspaceStatus?`
- `user`
- `globalStatusSummary?`

Usage rules:

- Workspace context appears here, not in inbox cards.
- Profile and sign out appear in user menu.

### PageContainer

Purpose: consistent page width, gutters, and vertical rhythm.

Required props:

- `children`
- `width?: "standard" | "wide" | "full"`

Usage rules:

- Queues use `wide`.
- Detail pages use `wide` or `full` depending on side rail.
- Settings pages use `standard`.

### PageHeader

Purpose: compact page title, description, and page-level action.

Required props:

- `title`
- `description?`
- `actions?`
- `breadcrumbs?`

Usage rules:

- Replaces current dark hero headers.
- Copy must be task-oriented, not scaffolding text.

### SectionHeader

Purpose: heading for a panel or content section.

Required props:

- `title`
- `description?`
- `actions?`

Usage rules:

- Use only when the section needs scan or action context.
- Avoid loud uppercase labels.

### Panel

Purpose: bounded page section or context container.

See Card / Panel primitive.

### SplitLayout

Purpose: desktop detail layout with primary content and rail.

Required props:

- `primary`
- `rail`
- `timeline?`
- `railPosition?: "right" | "left"`

Usage rules:

- Powers `DetailLayout`.
- Mobile order must be critical status, header, primary action, primary content, secondary context.

## 4. Data Display Components

### Table

Purpose: structured tabular data.

Required props:

- `columns`
- `rows`
- `getRowId`
- `renderCell`
- `sort?`
- `onSortChange?`
- `rowActions?`
- `emptyState?`

Usage rules:

- Use for members, invites, audit logs, agent runs, approval history.
- Mobile behavior must preserve labels.

### TableRow

Purpose: row rendering within `Table` or `QueueTable`.

Required props:

- `id`
- `href?`
- `selected?`
- `actions?`
- `children`

Usage rules:

- Rows can be clickable but must still support secondary actions.

### TableHeader

Purpose: column labels and sorting controls.

Required props:

- `columns`
- `sort?`
- `onSortChange?`

Usage rules:

- Do not use heavy letter spacing or route-local header grid classes.

### EmptyState

Purpose: no-data, no-results, permission-limited, or first-run state.

Required props:

- `variant`: `firstRun | filtered | noData | permission | disconnected`
- `title`
- `description`
- `primaryAction?`
- `secondaryAction?`

Usage rules:

- Must distinguish first-run from filtered zero results.

### LoadingSkeleton

Purpose: preserve layout shape while loading.

Required props:

- `variant`: `page | queue | detail | table | panel | text`
- `rows?`

Usage rules:

- Use in route-level `loading.tsx` and component-level loading states.

### ErrorState

Purpose: recoverable or blocking error display.

Required props:

- `severity`: usually `critical` or `warning`
- `title`
- `description`
- `retryAction?`
- `detailsAction?`

Usage rules:

- Route errors use `ErrorState`.
- Critical errors include impact and recovery.

### StatusBadge

Purpose: domain status rendered through central mapping.

Required props:

- `domain`: `conversation | approval | integration | message | assignment | agentRun | severity`
- `status`
- `labelOverride?`

Usage rules:

- All domain statuses use `StatusBadge`; no raw enum rendering in pages.

### Timeline

Purpose: durable lifecycle and audit event list.

Required props:

- `items`
- `emptyState?`

Usage rules:

- Used by conversation, approval, agent run, integration ops, and audit contexts.

### TimelineItem

Required props:

- `timestamp`
- `label`
- `actor?`
- `source?`
- `severity?`
- `description?`
- `relatedLinks?`

Usage rules:

- Must show actor/source and timestamp when available.

## 5. Queue System Components

The queue system is mandatory for all queue-like pages. It replaces hand-built grids in inbox, approvals, members, invites, audit logs, agent runs, approval history, and integration operations.

### QueueContainer

Purpose: shared shell for queue pages.

Required props:

- `title`
- `description?`
- `filters`
- `activeFilters`
- `children`
- `actions?`
- `state`: `loading | empty | error | ready`

Usage rules:

- Owns filter/action/header structure for queues.
- Does not fetch data.

### FilterBar

Purpose: filter/search controls for queues.

Required props:

- `children`
- `onSubmit?`
- `resetHref?`
- `mobileMode?: "drawer" | "stack"`

Usage rules:

- More than three filters use collapsed mobile drawer behavior.
- Search, provider, state, assignment, reviewer, date range, and severity all use `FilterField`.

### FilterField

Purpose: labeled filter control.

Required props:

- `label`
- `name`
- `children`

Usage rules:

- Keeps filter labeling consistent.
- Do not hand-place ad hoc labels in queue routes.

### ActiveFilters

Purpose: visible summary of active filters.

Required props:

- `filters: Array<{ key: string; label: string; value: string; removeHref?: string }>`
- `clearHref?`

Usage rules:

- Required when any non-default filter is active.

### QueueTable

Purpose: shared queue list/table renderer.

Required props:

- `columns: QueueColumn[]`
- `rows`
- `getRowId`
- `getRowHref?`
- `renderPrimaryCell`
- `renderCell`
- `renderRowActions?`
- `sort?`
- `onSortChange?`

Required column concepts:

- Primary object/title.
- Status.
- Owner/assignment.
- Source/provider.
- Last activity/created/reviewed timestamp.
- Next action/failure when relevant.

Usage rules:

- Domain row components can wrap `QueueTable`, but cannot bypass its layout contract.
- Row action area must exist even if empty for now.

### QueueRow

Purpose: row primitive for queue records.

Required props:

- `id`
- `href?`
- `primary`
- `cells`
- `actions?`
- `status?`

Mobile behavior:

- Primary object appears first.
- Status and next action remain visible.
- Secondary cells render with labels.
- Row actions remain reachable.
- No horizontal overflow.

### QueuePagination

Purpose: pagination and result limit display.

Required props:

- `page`
- `pageSize`
- `totalCount?`
- `nextHref?`
- `previousHref?`
- `resultLabel?`

Usage rules:

- Required when result set can exceed current page size.
- If total count is unavailable, show `Showing first N` or `More results available`.

### QueueEmpty

Purpose: queue-specific empty state.

Required props:

- `variant`: `firstRun | filtered | noPermission | disconnected | noData`
- `clearFiltersHref?`
- `primaryAction?`

Usage rules:

- Inbox filtered zero and first-run no conversations are different variants.

### QueueLoading

Purpose: queue skeleton.

Required props:

- `rows?`
- `columns?`

Usage rules:

- Must preserve approximate table/list structure.

## 6. Detail Page Components

### DetailLayout

Purpose: standard detail page contract.

Required props:

- `header`
- `primary`
- `actionRail?`
- `metadata?`
- `timeline?`
- `statusRegion?`

Usage rules:

- Used by conversation detail, approval detail, agent run detail, profile/account detail when appropriate.

### ActionRail

Purpose: next actions and controls for the detail object.

Required props:

- `title?`
- `primaryAction?`
- `secondaryActions?`
- `dangerActions?`
- `status?`
- `children?`

Usage rules:

- One primary action region.
- Destructive actions separated.

### MetadataList

Purpose: structured key/value metadata.

Required props:

- `items: Array<{ label: string; value: ReactNode; copyValue?: string; href?: string }>`

Usage rules:

- Replaces paragraph metadata blocks.
- Long IDs use `CopyableField`.

### CopyableField

Purpose: display and copy raw IDs, tokens, URLs, diagnostics references.

Required props:

- `label?`
- `value`
- `truncate?: boolean`

Usage rules:

- Raw IDs are secondary; do not use as primary titles.

### ActionGroup

Purpose: grouped action buttons.

Required props:

- `actions`
- `orientation?: "horizontal" | "vertical"`
- `tone?: "default" | "danger"`

Usage rules:

- Groups related actions and separates danger actions.

### DecisionPanel

Purpose: approval decision surface.

Required props:

- `status`
- `draft`
- `approveAction`
- `editApproveAction`
- `rejectAction`
- `reviewOutcome?`

Usage rules:

- Approval actions must not be equal-weight stacked cards.
- Pending, reviewed, rejected, send-failed states are explicit variants.

### MessageList

Purpose: conversation message timeline/list.

Required props:

- `messages`
- `emptyState?`

Usage rules:

- Used in conversation detail and approval context.

### MessageItem

Required props:

- `sender`
- `direction`
- `status`
- `timestamp`
- `body`
- `attachments?`
- `metadata?`

Usage rules:

- Direction and failed outbound state must be visually distinguishable through shared variants.

### AttachmentItem

Required props:

- `fileName`
- `mimeType?`
- `sizeLabel?`
- `href?`
- `actions?`

Usage rules:

- Shows open/download action only when allowed.

## 7. Agent Components

### AgentSummary

Purpose: compact representation of current assignment.

Required props:

- `assigned`
- `goal?`
- `instructions?`
- `tone?`
- `triggerRules?`
- `lastRun?`

Usage rules:

- Long goal text is not a badge.
- Summary appears in detail rail or row metadata.

### AgentControlPanel

Purpose: conversation-level agent controls.

Required props:

- `assignment`
- `permissions`
- `status`
- `onAssign?`
- `onUnassign?`
- `onRun?`
- `editMode?`

Usage rules:

- Replaces always-open thread form.
- Contains summary, status, actions, and edit mode.

### AgentStatus

Purpose: agent run/assignment state.

Required props:

- `status`: `unassigned | assigned | running | completed | escalated | failed | disabled`
- `lastRunAt?`
- `message?`

Usage rules:

- Use near agent controls and in queue/detail metadata.

### AgentRunButton

Purpose: run agent action with loading and disabled reasoning.

Required props:

- `disabledReason?`
- `loading?`
- `onRun` or submit props.

Usage rules:

- Disabled state must explain why.

### TriggerRuleList

Purpose: display or edit enabled trigger rules.

Required props:

- `rules`
- `mode`: `read | edit`
- `onChange?`

Usage rules:

- Uses `Checkbox` in edit mode.
- Shows policy/source context when available.

## 8. Form System

### FormField

Required props:

- `label`
- `htmlFor`
- `helper?`
- `error?`
- `required?`
- `children`

Usage rules:

- All labeled inputs/selects/textareas use `FormField`.

### FormLabel

Required props:

- `children`
- `htmlFor`
- `required?`

Usage rules:

- Sentence case labels.

### FormHelper

Required props:

- `children`

Usage rules:

- Only include helper text that affects task completion or risk.

### FormError

Required props:

- `children`

Usage rules:

- Field-level validation renders here.

### FormSection

Required props:

- `title?`
- `description?`
- `children`
- `actions?`

Usage rules:

- Use for settings and larger forms.

### SubmitButton

Required props:

- `children`
- `loadingLabel?`
- `variant?`
- `loading?`
- `disabled?`

Usage rules:

- All server action submit buttons use loading state.
- Replaces one-off submit components when possible.

## 9. State Components

### Alert

Shared severities:

- `critical`
- `warning`
- `success`
- `info`
- `neutral`

Required behaviors:

- Title/body/action slots.
- Dismiss option when state is transient.
- No color-only severity.

### EmptyState

Variants:

- `firstRun`
- `filtered`
- `noData`
- `permission`
- `disconnected`
- `archived`

Required behaviors:

- Clear reason.
- Next action when available.
- Distinguish filtered zero from no data.

### LoadingSkeleton

Variants:

- `page`
- `queue`
- `detail`
- `table`
- `panel`
- `text`

Required behaviors:

- Preserve layout shape.
- Avoid decorative loading animation.

### ErrorState

Variants:

- `route`
- `section`
- `inline`

Required behaviors:

- Severity.
- Impact.
- Recovery action.
- Optional diagnostics/details action.

### PermissionState

Purpose: explain missing permissions and available alternatives.

Required props:

- `title`
- `description`
- `requiredPermission?`
- `currentRole?`
- `fallbackAction?`

Usage rules:

- Use for disabled admin/operator surfaces and actions.
- Do not silently hide important unavailable actions when the user needs to understand capability.

## 10. Status System

### Status Mapping Contract

All domain statuses map through one central status module:

```text
packages/ui/src/status/mappings.ts
```

Required output:

- `label`
- `badgeVariant`
- `severity`
- `description?`
- `requiresAction?: boolean`

### Conversation State

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `UNASSIGNED` | Unassigned | neutral | neutral |
| `ACTIVE` | Active | info | info |
| `WAITING` | Waiting | neutral | neutral |
| `FOLLOW_UP_DUE` | Follow-up due | warning | warning |
| `AWAITING_APPROVAL` | Awaiting approval | warning | warning |
| `ESCALATED` | Escalated | critical | warning |
| `COMPLETED` | Completed | success | success |
| `CLOSED` | Closed | neutral | neutral |

### Approval Status

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `PENDING` | Pending review | warning | warning |
| `APPROVED` | Approved | success | success |
| `REJECTED` | Rejected | critical | warning |
| `CANCELLED` | Cancelled | neutral | neutral |

### Integration Status

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `CONNECTED` | Connected | success | success |
| `PENDING` | Pending setup | warning | warning |
| `SYNC_IN_PROGRESS` | Syncing | info | info |
| `ERROR` | Error | critical | critical |
| `DISCONNECTED` | Disconnected | neutral | neutral |

### Message Status

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `RECEIVED` | Received | neutral | neutral |
| `DRAFT` | Draft | neutral | neutral |
| `PENDING_APPROVAL` | Pending approval | warning | warning |
| `APPROVED` | Approved | success | success |
| `REJECTED` | Rejected | critical | warning |
| `QUEUED` | Queued | info | info |
| `SENT` | Sent | success | success |
| `DELIVERED` | Delivered | success | success |
| `FAILED` | Failed | critical | critical |

### Assignment Status

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `assigned` | Assigned | info | info |
| `unassigned` | Unassigned | neutral | neutral |
| `disabled` | Disabled | neutral | warning |

### Agent Run Status

| Status | Label | Badge variant | Severity |
| --- | --- | --- | --- |
| `running` | Running | info | info |
| `completed` | Completed | success | success |
| `createdDraft` | Draft created | success | success |
| `escalated` | Escalated | warning | warning |
| `failed` | Failed | critical | critical |

### Badge Variant Rules

- `critical`: active failure or rejected/blocked state requiring attention.
- `warning`: pending human action, degraded state, follow-up due.
- `success`: completed successful state.
- `info`: active/in-progress neutral state.
- `neutral`: inactive, unassigned, closed, disconnected without active failure.
- `platform`: provider/source only.

### Severity Mapping Rules

- Send/sync/data-load failures are `critical`.
- Reconnect required is `warning` unless operations are already failing, then `critical`.
- Pending approval is `warning`.
- Approved/sent/connected are `success`.
- Unassigned is `neutral` unless the queue view is specifically asking for unassigned work, then it may be action-needed in copy but remains neutral visually.

## 11. Component Rules

### Strict Rules

- No inline badge styles in route files.
- No inline alert styles in route files.
- No new button variants outside `Button`.
- No route-local table/list grid systems for queues.
- No page-specific dark hero headers.
- No raw enum rendering in UI.
- No one-off form label/helper/error patterns.
- No status colors outside the central status system.
- No queue page without empty, loading, error, and pagination/limit states.
- No detail page without primary content, action rail, metadata/context, and timeline/audit zones when applicable.

### Extraction Rules

Extract a component when:

- A pattern appears on two or more routes.
- A pattern encodes status, severity, or permission behavior.
- A pattern has responsive behavior.
- A pattern has accessibility requirements.
- A pattern owns loading/error/empty state.

Keep local when:

- It is one-off content copy.
- It is route-specific data mapping.
- It is a temporary local adapter around a shared component.

### Reuse Rules

- Pages compose components; they do not restyle primitives.
- Domain components compose composites; composites compose primitives.
- Domain data should be normalized before entering shared UI when possible.
- Shared components must be usable by server-rendered pages unless interactivity requires a client boundary.
- Client components should be as small as possible: submit buttons, drawers, modals, tabs, tooltips, and interactive filters.

### Accessibility Rules

- All interactive components expose accessible names.
- Focus states are built into primitives.
- Alerts communicate severity with text, not color alone.
- Tables/lists preserve labels on mobile.
- Disabled actions include a reason when the reason is not obvious.

## 12. Acceptance Criteria

- Every UI in the app can be built from this system:
  - Inbox, conversation detail, approvals queue, approval detail, members, settings, profile, audit, agent runs, approval history, and integration ops all map to defined components.

- No page needs custom layout hacks:
  - Pages use `AppShell`, `PageContainer`, `PageHeader`, queue components, detail layout components, or settings panels.

- No duplicate UI patterns exist:
  - Buttons, badges, alerts, panels, forms, tables, empty states, loading states, and error states are centralized.

- Queue system supports all queues:
  - Inbox, approvals, members, invites, audit logs, agent runs, approval history, and integration operations can all use `QueueContainer`, `FilterBar`, `QueueTable`, and queue state components.

- Detail system supports all detail pages:
  - Conversation, approval, agent run, profile/account, and future integration operation details can all use `DetailLayout`, `ActionRail`, `MetadataList`, and `Timeline`.

- Status system is complete:
  - Conversation, approval, integration, message, assignment, agent run, and severity statuses map through shared labels, badge variants, and severity.

- The current audit gaps are structurally closed:
  - Route-local nav, dark hero headers, identity cards on inbox, inline badges, inline alerts, fixed custom grids, and route-specific form patterns are no longer allowed in V1 implementation.
