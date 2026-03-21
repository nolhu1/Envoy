# Envoy Slack OAuth Install Contract v1

## Purpose

This document defines the Slack OAuth install/connect contract for the Envoy MVP.

It covers:
- how a workspace admin installs the Slack app
- how OAuth callback is handled
- what token(s) are stored
- what integration record is created or updated
- lifecycle transitions
- error handling

This contract is limited to Slack DMs for MVP.

---

## Core Rules

1. Slack connection is workspace-scoped in Envoy.
2. Only users with `connect_integrations` permission may install Slack.
3. Slack tokens must not be stored in integration metadata.
4. Successful install must result in a valid integration record and secret reference.
5. Slack must use the shared integration lifecycle and credential handling rules.

---

## Authorized Actor

### Who can install Slack
Allowed:
- ADMIN

Denied:
- MEMBER
- VIEWER

---

## Install Flow Overview

### Step 1 — Start install
Admin clicks “Connect Slack”.

System:
- validates auth + workspace + permissions
- generates signed OAuth state
- redirects to Slack OAuth

### Step 2 — Slack authorization
User approves Slack app install.

### Step 3 — OAuth callback
Envoy receives:
- authorization code
- state

System:
- validates state
- exchanges code for Slack tokens
- fetches Slack workspace identity
- stores auth material in secret store
- creates or updates integration record
- transitions lifecycle state

---

## OAuth State Requirements

Must include:
- workspaceId
- initiatingUserId
- provider = slack
- nonce
- issuedAt / expiry

Rules:
- must be signed and tamper-resistant
- must expire
- callback must fail if invalid

---

## Required Slack Scopes (MVP)

Scopes should support:
- reading DM conversations
- reading DM messages
- sending messages as bot

Example categories:
- conversations:read (DMs)
- chat:write
- users:read

Rules:
- request minimal scopes
- avoid channel-wide scopes for MVP

---

## Token Handling

Slack OAuth returns:
- bot token (primary)
- workspace/team identifiers
- possibly user token (not required for MVP)

Expected stored auth material:
- bot token
- workspace/team id
- scope summary if useful

Rules:
- store tokens only in secret store
- integration stores only secretRef
- do not store tokens in metadata

---

## Integration Record Outcome

Successful install should create/update one integration:

Fields:
- workspace_id
- platform = SLACK
- auth_type = oauth
- external_account_id = Slack team/workspace id
- display_name = Slack workspace name
- status
- config_json
- platform_metadata_json

Metadata examples:
- Slack team id
- Slack team name
- bot user id
- scope summary

---

## Lifecycle Transitions

Recommended flow:
1. PENDING
2. CONNECTED on success
3. ERROR on failure

Later sync:
- CONNECTED → SYNC_IN_PROGRESS → CONNECTED

---

## Duplicate Install Rule

If Slack workspace already connected:
- update existing integration
- rotate token if needed
- do not duplicate integration rows

---

## Error Cases

Handle:
- invalid/expired state
- OAuth exchange failure
- missing bot token
- workspace identity fetch failure
- secret store failure
- integration persistence failure

All failures must:
- avoid partial success
- avoid leaking tokens
- preserve safe diagnostics only

---

## Security Rules

### Workspace boundary
Slack integration must belong to one Envoy workspace.

### Secret boundary
Do not:
- log tokens
- store tokens in metadata

### Metadata boundary
Store only non-secret Slack info in metadata.

---

## Connect Result Contract

Successful Slack connect returns:
- externalAccountId (team id)
- displayName (workspace name)
- integrationStatus = CONNECTED
- secretRef
- platformMetadata

Must align with shared connector `connect()` contract.

---

## Deferred

Do not include:
- Slack events/webhooks
- channel support
- user token flows
- advanced Slack features

---

## Acceptance Test

1. Admin can install Slack.
2. Callback validates state correctly.
3. Bot token is stored only in secret store.
4. Integration record is created correctly.
5. Integration ends in CONNECTED state.
6. No Slack-specific schema changes are required.