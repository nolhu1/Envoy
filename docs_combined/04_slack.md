# Envoy Slack Docs



---

> Source: `docs/SLACK_CONNECTOR_SCOPE_V1.md`

# Envoy Slack Connector Scope v1

## Purpose

This document locks the Slack connector scope for the Envoy MVP.

Slack is the second messaging connector after Gmail.
It must integrate through the shared connector framework and canonical conversation model without forcing Slack to behave exactly like email.

For MVP, Slack scope is intentionally narrow:
- Slack DMs only

This avoids premature complexity from public channels, private channels, and broad workspace message ingestion.

---

## Provider Choice

### Selected provider
- Slack Web API + Slack Events/OAuth app model

### Initial Slack scope
- direct messages only

### Not included in this phase
- public channels
- private channels
- Slack Connect shared channels
- multi-workspace routing complexity
- message edits/deletes beyond minimal metadata preservation
- broad channel history sync

---

## Why DMs only first

Slack differs from email in important ways:
- no email-style subject
- channel and thread semantics differ
- user identity and participant modeling differ
- bot install and token behavior differ

Starting with DMs only keeps the first Slack integration aligned with the canonical model while minimizing product and connector complexity.

---

## Auth Model

### Auth type
- Slack app OAuth install flow

### Credential handling
- bot token and related auth material stored through the shared secret storage abstraction
- integration record stores non-secret metadata and secret reference only

### Connect flow outcome
Successful install should produce:
- integration record creation or update
- external workspace/account identifier
- provider display label
- secret reference
- lifecycle state update to connected when valid

---

## Initial Slack MVP Capabilities

### 1. Connect Slack workspace
Support:
- Slack app install flow
- bot token storage through secret store
- integration record creation

### 2. Import DM conversations
Support:
- sync DM conversations for the installed workspace
- normalize DM threads/messages into canonical conversations/messages
- preserve Slack-specific thread metadata in metadata fields

### 3. Read Slack DMs in Envoy
Support:
- render DM conversation history
- show sender identity
- show thread replies when present in DM-thread scope
- preserve Slack timestamps and user identifiers in metadata

### 4. Reply from Envoy
Support:
- send outbound bot replies into Slack DMs
- reflect canonical outbound status updates
- preserve Slack thread context in metadata

---

## Canonical Mapping Assumptions

### Conversation mapping
Map Slack DM or DM-thread identity to:
- `conversations.external_conversation_id`

Slack conversations do not require email-style subjects:
- `conversations.subject = null`

Map most recent DM activity to:
- `conversations.last_message_at`

### Message mapping
Map Slack message timestamp or normalized Slack message key to:
- `messages.external_message_id`

Map Slack text to:
- `messages.body_text`

Map Slack provider timestamps to canonical timing fields.

### Participant mapping
Preserve:
- Slack user id
- display name
- handle
- team/workspace hints in metadata when useful

### Metadata
Slack-specific non-canonical details belong in:
- `raw_payload_json`
- `platform_metadata_json`

Do not add Slack-only core columns.

---

## Initial Sync Scope

### Included
- DM sync only
- recent conversation import
- thread replies inside DM scope if available
- limited recent history

### Deferred
- public channel sync
- private channel sync
- workspace-wide archive import
- advanced channel membership handling

---

## Outbound Scope

### Included
- send bot reply in existing DM conversation
- send bot reply in Slack DM thread context when needed
- canonical status updates
- safe provider diagnostics

### Deferred
- channel posting
- rich interactive Slack app features
- slash commands
- workflow builder integration
- advanced block-kit authoring beyond basic message support

---

## Attachment/File Scope

### Included
- preserve file metadata when present in DM messages
- support thread rendering of file metadata
- keep Slack-specific file detail in metadata

### Deferred
- full Slack file download/storage pipeline
- preview generation
- cross-platform file unification beyond canonical attachment metadata

---

## Lifecycle Expectations

The Slack connector must use the shared integration lifecycle:
- pending
- connected
- sync_in_progress
- error
- disconnected

It must not invent Slack-only lifecycle states.

---

## Idempotency Expectations

The Slack connector must use the shared idempotency contract for:
- event ingestion
- DM sync
- outbound replies
- retry-safe send behavior

It must not invent a separate Slack-only dedupe model outside the shared framework.

---

## Security and Workspace Rules

### Workspace boundary
- Slack integrations are workspace-scoped in Envoy
- a user from another Envoy workspace must not access or send through the Slack integration

### Secret boundary
- never store Slack bot tokens in integration metadata
- use the secret storage abstraction

### Metadata boundary
- non-secret Slack workspace, conversation, and thread detail may live in metadata fields
- do not add Slack-only core schema fields

---

## Explicit MVP Non-Goals

Do not build these in the first Slack connector phase:
- channel-wide support
- Slack Connect complexity
- message management features
- interactive app surfaces
- autonomous sending
- custom Slack workflow features

---

## Acceptance Test

The Slack connector scope is correct only if all of the following are true:

1. Slack DMs are the only Slack conversation type implemented in Phase G.
2. Slack can map into the same canonical conversation and message model as Gmail.
3. Slack-specific thread and user detail stay in metadata, not canonical schema.
4. Outbound Slack replies can later flow through the same shared outbound pipeline.
5. No Slack-only logic leaks into the shared connector framework or canonical model.

---

> Source: `docs/SLACK_OAUTH_CONNECT_CONTRACT_V1.md`

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

---

> Source: `docs/SLACK_INGESTION_STRATEGY_V1.md`

# Envoy Slack Ingestion Strategy v1

## Purpose

This document defines the Slack message ingestion strategy for the Envoy MVP.

The first Slack ingestion implementation will use:
- Slack DM sync first
- bounded recent-history import
- shared inbound pipeline handoff

It will not start with broad workspace event ingestion or channel-wide sync.

This keeps the first Slack connector aligned with the shared connector framework and canonical model.

---

## Strategy Decision

### Selected MVP ingestion mode
- Slack DMs only
- recent DM sync first

### Deferred
- public channel ingestion
- private channel ingestion
- workspace-wide event ingestion
- Slack Connect complexity
- broad historical import

---

## Why DM sync first

DM sync first is the simplest MVP path because it:
- matches the locked Slack DM-only scope
- avoids channel permission complexity
- proves the canonical multi-platform model with a second connector
- keeps provider-specific behavior inside the connector while using the shared inbound pipeline

Slack Events API can be layered in later without redesigning the canonical model.

---

## Ingestion Source

The Slack connector should fetch:
- recent DM conversations
- recent messages inside those DMs
- thread replies inside DM scope when present

The connector should then feed normalized results into the shared inbound ingestion pipeline.

The shared inbound stages remain:
1. validate source
2. parse payload
3. dedupe
4. normalize
5. upsert conversation
6. insert messages
7. emit events

The Slack connector must not bypass that shared pipeline.

---

## Initial Sync Scope

### Included
- recent DM sync only
- bounded recent history
- DM thread reply import when present
- user/workspace metadata needed for participant mapping

### Deferred
- public channel history
- private channel history
- workspace-wide archive import
- edits/deletes beyond metadata preservation if later needed

---

## Checkpoint Model

The integration should maintain non-secret Slack sync state in integration metadata.

Examples:
- last DM sync timestamp
- recent sync window bounds
- paging cursor if used
- sync diagnostics summary
- item counts

Secrets must not be stored in metadata.

---

## Canonical Mapping Requirement

The Slack connector must normalize Slack provider data into the existing canonical model:

### Conversations
- DM or DM-thread identity -> `external_conversation_id`
- no subject -> `subject = null`
- most recent activity -> `last_message_at`

### Messages
- Slack message timestamp or normalized key -> `external_message_id`
- text -> `body_text`
- provider timestamps -> canonical timing fields

### Participants
- Slack user id
- display name
- handle
- workspace/team hints in metadata when useful

### Metadata
Slack-specific non-canonical detail should go into:
- `raw_payload_json`
- `platform_metadata_json`

No Slack-only core columns should be added.

---

## Sync Frequency Assumption

For MVP:
- allow manual resync
- support recent polling-based DM sync
- do not require realtime Slack events yet

The design should leave room for later Slack Events API support without redesigning the connector framework.

---

## Idempotency and Dedupe

The Slack ingestion path must use the shared idempotency and inbound dedupe contracts.

That means:
- repeated DM sync must not create duplicate canonical messages
- repeated import of thread replies must converge to the same canonical state
- Slack must not invent a connector-only dedupe system outside the shared framework

---

## Lifecycle Interaction

When a connected Slack integration runs a DM import or resync:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

If sync fails in a connector-health-relevant way:
- transition toward `ERROR` as appropriate

Do not invent Slack-only lifecycle states.

---

## Attachment/File Handling During Ingestion

The first Slack ingestion path should:
- preserve file metadata when present
- attach file metadata to canonical attachment rows
- avoid full binary file ingestion in the first Slack implementation

---

## Explicit MVP Non-Goals

Do not build these in the first Slack ingestion step:
- public/private channel ingestion
- Slack Events API as the primary path
- broad historical import
- edit/delete synchronization as a first-class workflow
- full Slack file ingestion pipeline

---

## Acceptance Test

The Slack ingestion strategy is correct only if all of the following are true:

1. Recent Slack DMs can be fetched through a bounded sync path.
2. Slack DM and DM-thread data can feed the shared inbound pipeline.
3. Repeated sync does not create duplicate canonical messages.
4. Checkpoint metadata remains non-secret and lives in integration metadata.
5. The strategy can later add Slack Events API support without redesigning the canonical model.

---

> Source: `docs/SLACK_NORMALIZATION_VALIDATION_V1.md`

# Envoy Slack Normalization Validation v1

## Purpose

This document validates the Slack normalization layer against real Slack DM data before reply/send is implemented.

The goal is to confirm that Slack DM and DM-thread payloads map correctly into the canonical Envoy model without Slack-specific leakage into core tables.

---

## Validation Areas

### 1. Conversation mapping
Check that for real Slack DMs:
- DM identity maps correctly to `external_conversation_id`
- DM-thread identity maps correctly when replies exist
- `subject` is null
- `last_message_at` reflects the latest activity correctly
- Slack-only thread/channel detail remains in metadata fields

### 2. Participant mapping
Check that for real Slack messages:
- Slack user id maps correctly to `externalParticipantId`
- display name maps correctly
- handle maps correctly
- email maps when available and safe to fetch
- duplicate participants are not created unnecessarily
- internal vs external identity is handled consistently

### 3. Message mapping
Check that for real Slack messages:
- Slack timestamp or normalized message key maps to `externalMessageId`
- body text extraction is correct
- sent/received timing is populated correctly
- bot-authored messages are classified consistently
- thread reply ordering is stable

### 4. File metadata mapping
Check that for real Slack messages with files:
- file name is captured
- MIME type is captured
- size is captured when available
- provider file identifiers are preserved in metadata
- no binary file content is written into canonical attachment records

### 5. Metadata preservation
Check that:
- `raw_payload_json` preserves enough Slack source detail for debugging/replay
- `platform_metadata_json` preserves useful non-canonical Slack details
- no secret/auth material appears in message, attachment, or integration metadata

### 6. Canonical cleanliness
Check that:
- no Slack-only core columns were needed
- Slack channel/thread semantics are not leaking into canonical columns
- normalization outputs fit the existing canonical conversation/message model

---

## Real Data Test Cases

Use a small but varied sample of real Slack DMs:

1. simple one-message DM
2. multi-message DM
3. DM with thread replies
4. DM with file metadata
5. DM with bot-authored message if available
6. DM with user profile/display-name differences if available

---

## Validation Checklist

For each sampled DM or DM thread, verify:

### Conversation
- [ ] external conversation id is correct
- [ ] subject is null
- [ ] last message at is correct
- [ ] DM-thread grouping is correct when replies exist

### Participants
- [ ] participant identities are correct
- [ ] no unnecessary duplicates
- [ ] display name and handle are mapped correctly

### Messages
- [ ] external message ids are correct
- [ ] body text is usable
- [ ] timestamps are correct
- [ ] ordering is correct
- [ ] bot/system/internal classification is reasonable

### Files
- [ ] file metadata exists when expected
- [ ] no binary content is stored
- [ ] provider metadata is preserved safely

### Metadata
- [ ] raw payload is preserved
- [ ] platform metadata is useful
- [ ] no secret/auth leakage

---

## Fix Categories

If a normalization issue is found, classify it as one of:

### A. Conversation grouping bug
Examples:
- DM-thread replies grouped into the wrong conversation
- unstable external conversation id
- wrong last activity time

### B. Participant mapping bug
Examples:
- duplicate Slack user identities
- missing display name or handle
- bad internal/external classification

### C. Message mapping bug
Examples:
- empty text when content exists
- wrong message id mapping
- bot messages classified incorrectly

### D. Timestamp/order bug
Examples:
- reply ordering unstable
- wrong latest activity time
- bad timestamp parsing

### E. File metadata bug
Examples:
- missing filename
- missing MIME type
- provider file id not preserved

### F. Metadata preservation bug
Examples:
- raw payload missing important Slack event data
- thread hints missing
- secret/auth leakage into metadata

---

## Required Output of This Step

After validating real data, produce:

1. a short list of actual normalization issues found, if any
2. the code fixes applied
3. confirmation that the canonical model still did not need Slack-only fields

---

## Acceptance Test

This step is complete only if all of the following are true:

1. Real Slack DMs map cleanly to canonical conversations, participants, messages, and file metadata attachments.
2. DM-thread grouping is stable and usable for later reply/send.
3. File handling remains metadata-only.
4. No Slack-only fields were added to the canonical schema.
5. Raw payload and non-secret metadata are preserved well enough for debugging and replay.

---

> Source: `docs/SLACK_REPLY_SEND_CONTRACT_V1.md`

# Envoy Slack DM Reply/Send Contract v1

## Purpose

This document defines the Slack outbound reply/send contract for the Envoy MVP.

The first Slack send implementation is DM-first.

That means MVP send scope is:
- reply in an existing Slack DM
- reply in an existing Slack DM thread when thread context exists

It does not yet include public/private channel posting or broad compose behavior.

This contract aligns Slack sending with:
- the canonical message model
- the shared outbound sending pipeline
- the approval system for AI-generated drafts
- the workspace and RBAC model

---

## Core Rules

1. Slack outbound sending is workspace-scoped.
2. Only users allowed to send messages may trigger a Slack send.
3. AI-generated Slack drafts must be approved before send.
4. Slack-specific DM/thread data must remain in metadata, not new core schema fields.
5. Canonical message status must reflect real send outcome.

---

## Supported MVP Send Modes

### Included
- human reply in an existing Slack DM
- human reply in an existing Slack DM thread when thread context exists
- approved AI-generated reply in an existing Slack DM
- approved AI-generated reply in an existing Slack DM thread when thread context exists

### Deferred
- public channel posting
- private channel posting
- standalone compose outside existing DM-first workflow
- interactive Slack app message flows
- advanced block-kit authoring
- edit/delete synchronization as a send workflow
- autonomous AI sending

---

## Authorized Actors

### Human send
Allowed roles:
- ADMIN
- MEMBER

Denied:
- VIEWER

This follows the MVP RBAC policy for outbound messaging.

### AI-generated send
Allowed only when:
- the message is an AI-generated outbound draft
- the related approval request is approved
- the acting user has permission to send messages

---

## Canonical Send Preconditions

A Slack DM reply may be sent only when all of the following are true:

1. the message belongs to the current workspace
2. the integration belongs to the same workspace
3. the integration is in a send-capable lifecycle state
4. the canonical message has:
   - `direction = OUTBOUND`
   - an eligible outbound status
5. the parent conversation maps to a Slack DM or Slack DM-thread conversation
6. the connector has enough Slack provider context to construct a valid reply

For AI-generated drafts, also require:
7. a related `approval_request`
8. `approval_request.status = APPROVED`

This follows the shared outbound pipeline and approval rules.

---

## Slack DM Reply Requirement

The first Slack send implementation must send into an existing DM conversation.

That means the connector must preserve and use enough Slack provider context to build a real reply, such as:
- Slack DM conversation id
- Slack thread timestamp when replying inside a DM thread
- bot/user context needed for send

Canonical conversation identity remains:
- `conversations.external_conversation_id = Slack DM id or DM-thread composite id`

Canonical message identity remains:
- `messages.external_message_id = Slack message ts or normalized Slack message key`

Do not add Slack-only reply fields to canonical tables.

Use metadata fields where Slack-specific DM/thread details are needed. 

---

## Input to Slack Send

The Slack connector should receive, through the shared outbound pipeline:

- connector context with resolved Slack OAuth auth material
- canonical conversation
- canonical outbound message
- optional approval context
- shared idempotency key
- actor context

The connector should not fetch raw tokens from business tables directly.
It should operate on resolved auth material from connector runtime context.  [oai_citation:4‡CREDENTIAL_HANDLING_V1.md](sediment://file_000000004c3871fd89da2550bdb21c9f)

---

## Slack Provider Payload Expectations

The Slack connector is responsible for converting canonical reply input into a Slack-compatible outbound payload.

The connector payload builder should use:
- canonical message body
- canonical conversation/DM context
- Slack DM conversation id
- Slack thread timestamp when replying inside a DM thread
- any provider-specific metadata needed for correct threading

The connector should return:
- external provider message id
- provider-accepted timestamp if available
- safe provider response metadata
- retry-safe diagnostics

This aligns with the shared `sendMessage()` connector contract and the outbound pipeline contract. 

---

## Canonical Status Transitions

### Human reply path
Typical flow:
- `DRAFT -> QUEUED -> SENT`
or
- `DRAFT -> SENT`
depending on whether queueing is explicit in the implementation

### AI draft reply path
Typical flow:
- `PENDING_APPROVAL -> APPROVED -> QUEUED -> SENT`
or
- `PENDING_APPROVAL -> APPROVED -> SENT`

### Failure cases
On send failure:
- transition to `FAILED`
- preserve safe diagnostics
- do not falsely mark sent

Optional later:
- provider confirmation may move `SENT -> DELIVERED`

These transitions must align with the canonical message model. 

---

## Audit and Approval Linkage

Every Slack outbound send should remain traceable through canonical audit records.

For human sends:
- record send requested
- record send success or failure

For AI sends:
- record approval decision
- record send requested
- record send success or failure

AI sends must remain traceable to:
- conversation
- message
- approval request
- acting user or system actor

This follows the audit and approval design rules. 

---

## Metadata Rules

### Allowed in platform_metadata_json
Examples:
- Slack DM conversation id copy if useful for fast access
- Slack thread timestamp
- provider send response summary
- Slack-specific delivery diagnostics
- normalized provider thread hints

### Not allowed
- raw OAuth tokens
- bot token
- client secret
- arbitrary Slack-only fields promoted into canonical schema

Secrets must stay in the secret storage abstraction, not metadata. 

---

## Idempotency Rules

The Slack send path must use the shared outbound idempotency contract.

That means:
- one canonical outbound message corresponds to one logical send
- retries use a stable shared idempotency key
- if Slack supports dedupe behavior later, it is additive
- repeated send attempts must not create uncontrolled duplicate Slack messages

This follows the shared idempotency contract.  [oai_citation:5‡IDEMPOTENCY_CONTRACT_V1.md](sediment://file_00000000114871fdbe5f058f9931bf27)

---

## Explicit MVP Non-Goals

Do not build these in the first Slack send step:
- public/private channel posting
- standalone compose outside existing DM-first workflow
- advanced interactive Slack features
- workflow builder integrations
- autonomous AI sending

---

## Acceptance Test

The Slack DM reply/send contract is correct only if all of the following are true:

1. A human can send a reply in an existing Slack DM from Envoy.
2. A human can reply in a Slack DM thread when thread context exists.
3. An approved AI draft can send through the same shared outbound pipeline.
4. Slack-specific DM/thread context stays in metadata, not canonical schema.
5. Canonical message statuses reflect real send outcomes.
6. The contract does not require Slack-only changes to the shared framework or core data model.

---

> Source: `SLACK_PARTICIPANT_THREAD_MAPPING_V1.md`

# Envoy Slack Participant and Thread Mapping v1

## Purpose

This document defines the hardened participant and thread mapping rules for the Slack connector in the Envoy MVP.

Slack is now connected, DM sync works, and outbound DM replies work.
This document locks the identity and threading rules that must remain stable before the unified inbox and thread UI are built.

The goal is to preserve enough Slack-native identity and thread structure to support:
- correct participant rendering
- correct DM and DM-thread grouping
- correct outbound reply threading
- cross-platform consistency in the canonical model

This contract applies only to:
- Slack DMs
- Slack DM threads

It does not add public/private channel support.

---

## Core Rules

1. Slack user identity must be preserved through stable external participant identifiers.
2. Slack DM and Slack DM-thread conversation identity must remain stable across repeated sync and send operations.
3. Slack-specific thread and participant details belong in metadata, not new core schema fields.
4. Canonical conversation and message records must remain platform-agnostic.
5. Repeated sync and send behavior must converge on the same participant and thread identities.

---

## Participant Mapping Rules

### Canonical participant identity
Slack participants should be anchored on:
- `participants.external_participant_id = Slack user id`

This is the primary stable identity.

### Canonical participant fields
Use canonical fields when available:
- `display_name`
- `handle`
- `email` when available and safe
- `is_internal`

### Metadata preservation
Slack-specific participant detail may be preserved in:
- `raw_payload_json`
- `platform_metadata_json`

Examples:
- team/workspace hints
- profile image URL later if useful
- Slack display-name variants
- provider role hints

### Duplicate prevention
Repeated sync must not create duplicate participant rows for the same Slack user inside the same canonical conversation unless there is a real identity distinction.

---

## Conversation Identity Rules

### Root DM conversation
A root Slack DM should map to one canonical conversation.

Preferred identity:
- Slack DM conversation id as the base identity

Example:
- `external_conversation_id = D123456`

### DM-thread conversation
When Slack thread replies exist inside a DM scope, they should map consistently.

Preferred identity:
- DM-thread composite identity using DM conversation id + root thread timestamp

Example:
- `external_conversation_id = D123456:1741200000.000100`

This keeps thread replies grouped consistently without requiring Slack-only schema fields.

### Subject handling
Slack DM and DM-thread conversations must keep:
- `subject = null`

Do not introduce Slack-only subject logic.

---

## Message Identity Rules

### Canonical message identity
Slack messages should map to:
- `messages.external_message_id = Slack message ts or normalized Slack message key`

For thread replies, the message identity must still remain stable within the canonical conversation scope.

### Timing
Preserve provider timing through canonical fields:
- `sent_at`
- `received_at`

Preserve Slack-native timing detail in metadata when useful:
- message timestamp
- thread timestamp
- ordering hints

### Direction and sender
Slack DM inbound and outbound messages should still align with the canonical model:
- inbound DM -> `direction = INBOUND`
- outbound Envoy reply -> `direction = OUTBOUND`

Do not introduce Slack-only message direction fields.

---

## Required Metadata Preservation

The following Slack-native details should remain available in metadata when useful for correct rendering or reply behavior:

### Conversation/platform metadata
- Slack DM conversation id
- Slack thread timestamp
- Slack workspace/team id when useful
- normalized provider thread hints

### Message/platform metadata
- Slack message timestamp
- root thread timestamp if applicable
- Slack subtype when relevant
- bot-authored hint when relevant
- safe provider response metadata from sends

### Participant/platform metadata
- Slack user id copy if useful
- profile/display-name hints
- team/workspace hints

These belong in:
- `raw_payload_json`
- `platform_metadata_json`

Do not promote them into new canonical columns unless they become cross-platform business requirements.

---

## Reply Threading Rules

The outbound Slack reply path depends on stable thread context.

To support correct DM and DM-thread replies, the connector must be able to recover:
- DM conversation id
- thread timestamp when replying inside a thread

The canonical model should not add Slack-only reply fields.
Instead, recover reply context through:
- `external_conversation_id`
- `platform_metadata_json`
- normalized Slack thread hints

This is required so Slack outbound send can continue to work through the shared outbound pipeline without connector-specific schema changes.

---

## Unified Inbox / Thread UI Expectations

Before Phase H, this mapping must already support:

### Inbox list
- stable conversation identity
- stable participants
- correct latest activity

### Thread view
- chronological message rendering
- sender identity rendering
- DM-thread grouping that remains understandable to the user
- file metadata display later

### Cross-platform consistency
Slack must fit the same canonical list/thread surfaces as Gmail, even though it preserves Slack-native thread context in metadata.

---

## Explicit Non-Goals

Do not add these in this step:
- public/private channel identity rules
- Slack Connect identity rules
- channel membership modeling
- custom Slack-only schema tables
- rich Slack UI-specific rendering logic

---

## Acceptance Test

This mapping contract is correct only if all of the following are true:

1. Slack user ids remain stable across repeated sync and send operations.
2. Root DMs and DM threads map to stable canonical conversation identities.
3. Slack thread context required for outbound replies is recoverable without Slack-only schema changes.
4. Canonical conversation and message tables remain platform-agnostic.
5. The mapping is stable enough for the unified inbox and thread UI to be built next.