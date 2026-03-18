# Envoy Workspace Model v1

## Purpose

This document defines the workspace ownership and membership model for the Envoy MVP.

Envoy is a workspace-scoped application.
All business data belongs to a workspace.
Users act inside exactly one workspace in MVP.

This model is designed to support:
- tenant isolation
- team collaboration
- invitations
- role-based authorization
- workspace-scoped integrations and conversations

---

## Core Rules

### 1. Workspace is the tenant boundary
A workspace is the top-level owner of customer data.

All of the following belong to a workspace:
- users
- integrations
- conversations
- participants
- messages
- attachments
- agent assignments
- approval requests
- action logs
- conversation facts

### 2. MVP membership model
In MVP, each user belongs to exactly one workspace.

That means:
- one `User` row maps to one workspace
- a user cannot switch between multiple workspaces in v1 unless the data model changes later
- workspace switching UI is not required for true multi-workspace tenancy in MVP

### 3. Signup behavior
When a new user signs up directly:
- a new workspace is created automatically
- the new user becomes the first member of that workspace
- the new user role is `ADMIN`

This is a temporary MVP onboarding path and may later be replaced with a more explicit onboarding flow.

### 4. Invitation behavior
An existing workspace admin can invite another user into the workspace.

The invited user:
- is created inside the inviter’s workspace
- receives one role on entry:
  - `ADMIN`
  - `MEMBER`
  - `VIEWER`

### 5. Workspace switching
For MVP v1:
- true multi-workspace switching is not supported
- if a workspace switcher UI exists, it should only reflect the currently active single workspace or remain hidden

### 6. Data access
A user may only access data where:
- `resource.workspace_id == session.user.workspaceId`

This rule applies to:
- page loads
- API routes
- server actions
- background actions initiated on behalf of a user

---

## Workspace Creation Paths

### Path A — Direct sign-up
1. user submits sign-up form
2. system creates workspace
3. system creates user linked to that workspace
4. user becomes `ADMIN`
5. session starts inside that workspace

### Path B — Invite acceptance
1. workspace admin creates invite
2. invited user accepts invite
3. system creates user inside inviter workspace
4. invited user gets assigned role
5. session starts inside that workspace

---

## Roles in the workspace

### ADMIN
Can:
- manage workspace settings
- invite members
- manage member roles
- connect integrations
- send messages
- approve AI drafts
- assign agents
- view audit logs

### MEMBER
Can:
- send messages
- approve AI drafts if allowed by policy
- assign agents if allowed by policy
- view normal workspace data

### VIEWER
Can:
- view permitted workspace data
- not send messages
- not connect integrations
- not approve drafts
- not assign agents

Final permission mapping is defined separately in RBAC documentation.

---

## Integration ownership

Integrations are always scoped to a workspace.

That means:
- a Gmail integration belongs to one workspace
- a Slack integration belongs to one workspace
- conversations imported through that integration belong to the same workspace

A user from another workspace must never access or send through that integration.

---

## Current MVP decisions

For v1:
- `User.workspaceId` is required
- single-workspace membership is the supported model
- direct sign-up creates a workspace automatically
- invite flows will add users into an existing workspace
- all route and query protection must be workspace-based

---

## Non-Goals

This version does not support:
- multi-workspace membership for one user
- organization hierarchies
- cross-workspace shared inboxes
- enterprise tenant management
- workspace transfer between owners

---

## Acceptance Test

This model is correct only if all of the following are true:

1. A newly signed-up user always lands in a valid workspace.
2. Every authenticated user session has exactly one workspace ID.
3. Every workspace-scoped resource can be filtered by `workspaceId`.
4. A user from workspace A cannot access workspace B data.
5. Integrations, conversations, and approvals remain workspace-scoped.