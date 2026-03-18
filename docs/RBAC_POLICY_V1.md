# Envoy RBAC Policy v1

## Purpose

This document defines the role-based access control policy for the Envoy MVP.

Envoy is workspace-scoped.
Permissions apply only within the user’s current workspace.

RBAC decisions must be enforced in:
- server-rendered pages
- server actions
- API routes
- background actions initiated on behalf of a user where applicable

---

## Roles

### ADMIN
Full workspace operator for MVP.

### MEMBER
Standard operator inside a workspace.

### VIEWER
Read-only user for MVP.

---

## Core Rule

A role check is never enough by itself.

A user may perform an action only if both are true:
1. the resource belongs to `session.user.workspaceId`
2. the user’s role permits the action

---

## MVP Permissions

### 1. Connect integrations
Description:
- connect Gmail
- connect Slack
- disconnect integrations
- resync integrations
- view integration management settings

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 2. Send messages
Description:
- manually send outbound messages from Envoy
- reply in existing conversations
- submit approved drafts for send when allowed by workflow

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

---

### 3. Approve AI drafts
Description:
- approve pending AI-generated drafts
- reject pending AI-generated drafts
- edit draft content before approval if allowed by product flow

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

Note:
This is the MVP default policy.
If approval authority needs tightening later, it can become admin-only or policy-based.

---

### 4. Assign agents
Description:
- assign an agent to a conversation
- update agent goal or instructions
- remove or end an agent assignment

Allowed roles:
- ADMIN
- MEMBER

Denied roles:
- VIEWER

---

### 5. View audit logs
Description:
- read action logs
- inspect approval history
- inspect agent activity history

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 6. Invite team members
Description:
- create workspace invites
- view pending invites

Allowed roles:
- ADMIN

Denied roles:
- MEMBER
- VIEWER

---

### 7. View workspace settings
Description:
- view workspace settings page
- view workspace metadata

Allowed roles:
- ADMIN
- MEMBER
- VIEWER

---

### 8. View members
Description:
- view workspace members list

Allowed roles:
- ADMIN
- MEMBER
- VIEWER

---

## Permission Matrix

| Action | ADMIN | MEMBER | VIEWER |
|---|---|---|---|
| View workspace settings | Yes | Yes | Yes |
| View members | Yes | Yes | Yes |
| Create invites | Yes | No | No |
| View pending invites | Yes | No | No |
| Connect integrations | Yes | No | No |
| Disconnect integrations | Yes | No | No |
| Send messages | Yes | Yes | No |
| Approve AI drafts | Yes | Yes | No |
| Assign agents | Yes | Yes | No |
| View audit logs | Yes | No | No |

---

## Enforcement Rules

### Rule 1 — Workspace boundary first
Before any role check, confirm the current user belongs to the same workspace as the resource.

### Rule 2 — Server-side enforcement required
RBAC must be enforced on the server.
UI hiding is not sufficient.

### Rule 3 — Deny by default
If an action is not explicitly allowed for a role, deny it.

### Rule 4 — Viewer is read-only
VIEWER must not be able to mutate workspace data.

### Rule 5 — Admin-only workspace management
Workspace-level management actions are admin-only in MVP.

---

## Initial Implementation Shape

The RBAC layer should provide:
- a normalized app auth context
- a role-to-permission mapping
- helpers like:
  - `hasPermission(role, permission)`
  - `requirePermission(permission)`
  - `canAccessWorkspaceResource(workspaceId)`

Permission checks should be reusable across:
- pages
- server actions
- route handlers

---

## Non-Goals

This version does not support:
- custom roles
- per-user exceptions
- per-conversation ACLs
- attribute-based access control
- multi-workspace permission overlays

---

## Acceptance Test

The RBAC model is correct only if all of the following are true:

1. A VIEWER cannot send messages.
2. A VIEWER cannot approve drafts.
3. A VIEWER cannot assign agents.
4. A MEMBER cannot connect integrations.
5. A MEMBER cannot create invites.
6. A MEMBER cannot view audit logs.
7. An ADMIN can perform all MVP workspace management actions.
8. No role can access data from another workspace.