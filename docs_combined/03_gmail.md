# Envoy Gmail Docs



---

> Source: `docs/GMAIL_CONNECTOR_SCOPE_V1.md`

# Envoy Gmail Connector Scope v1

## Purpose

This document locks the first real email connector scope for the Envoy MVP.

Envoy will ship email before Slack.
For MVP, Envoy will support one concrete email provider path first:
- Gmail API only

This avoids the complexity of universal IMAP/SMTP support and keeps the first connector aligned with the canonical integration framework.

---

## Provider Choice

### Selected provider
- Gmail API

### Not included in this phase
- Microsoft Graph mail
- generic IMAP
- generic SMTP
- multi-provider email abstraction beyond the shared connector framework
- custom SMTP relay support

---

## Auth Model

### Auth type
- OAuth 2.0 with Gmail/Google account connection

### Credential handling
- access token and refresh token resolved through the shared connector credential model
- secret material stored through the secret storage abstraction
- integration record stores non-secret metadata and secret reference only

### Connect flow outcome
Successful connect should produce:
- integration record creation or update
- external account identifier
- provider display label
- secret reference
- lifecycle state update to connected when valid

---

## Initial Gmail MVP Capabilities

### 1. Connect account
Support:
- OAuth connect
- token storage through secret store
- integration record creation

### 2. Import recent threads
Support:
- import recent Gmail threads after connect
- store checkpoint/cursor metadata for future incremental sync
- avoid full historical import in MVP

### 3. Read threads in Envoy
Support:
- normalize Gmail threads into canonical conversations
- normalize senders/participants
- normalize messages
- normalize attachment metadata

### 4. Reply from Envoy
Support:
- reply in an existing Gmail thread
- reflect canonical outbound status updates
- preserve provider reply/thread context in metadata

### 5. Attachment metadata
Support:
- store attachment metadata
- display attachment information in thread view
- allow later download handling
- do not build full attachment binary storage pipeline in the first Gmail connector step unless needed

---

## Gmail Thread Mapping Assumptions

### Conversation mapping
Map Gmail thread id to:
- `conversations.external_conversation_id`

Map Gmail subject to:
- `conversations.subject`

Map latest Gmail thread activity to:
- `conversations.last_message_at`

### Message mapping
Map Gmail message id to:
- `messages.external_message_id`

Map plain text body to:
- `messages.body_text`

Map HTML body to:
- `messages.body_html`

Map provider send/receive timestamps to:
- `messages.sent_at`
- `messages.received_at`

Preserve Gmail-specific thread and header detail in:
- `raw_payload_json`
- `platform_metadata_json`

This must remain aligned with the canonical message and conversation model.

---

## Initial Sync Scope

### Included
- recent thread import only
- incremental sync preparation
- limited backfill window
- thread metadata needed for unified inbox and reply

### Deferred
- full mailbox historical import
- advanced folder/label sync semantics
- archive/trash actions
- complex mailbox management
- bulk export

---

## Outbound Scope

### Included
- send reply within an existing Gmail thread
- status updates in canonical message state
- provider message id capture
- safe provider diagnostics

### Deferred
- advanced compose flows outside thread-first MVP usage
- draft sync with Gmail native drafts
- send scheduling
- alias/send-as management
- mailbox management actions

---

## Attachment Scope

### Included
- attachment metadata normalization
- file name
- MIME type
- size
- provider attachment identifiers
- thread rendering support

### Deferred
- full attachment ingestion/storage pipeline
- virus scanning
- OCR
- attachment preview generation

---

## Lifecycle Expectations

The Gmail connector must use the shared integration lifecycle:
- pending
- connected
- sync_in_progress
- error
- disconnected

It must not invent Gmail-only lifecycle states.

---

## Idempotency Expectations

The Gmail connector must use the shared idempotency contract for:
- history sync ingestion
- webhook or push ingestion if added
- outbound replies
- retry-safe sends

It must not invent its own standalone dedupe model outside the shared framework.

---

## Security and Metadata Rules

### Secrets
- never store Gmail tokens in integration metadata
- use the secret storage abstraction

### Metadata
- Gmail-specific non-secret thread or header details belong in metadata fields
- do not add Gmail-only core columns to canonical tables

### Workspace boundary
- Gmail integrations are always workspace-scoped
- a user from another workspace must not access or send through the integration

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail connector phase:
- universal email provider support
- IMAP/SMTP abstraction
- Gmail labels as first-class canonical fields
- mailbox management actions
- autonomous sending
- Gmail-native draft sync
- deep admin tooling

---

## Acceptance Test

The Gmail connector scope is correct only if all of the following are true:

1. Gmail is the only email provider implemented in Phase F.
2. A user can connect a Gmail account through OAuth.
3. Recent Gmail threads can be normalized into canonical conversations and messages.
4. A user can reply from Envoy in an existing Gmail thread.
5. Attachment metadata is preserved without polluting the canonical model.
6. No Gmail-only logic leaks into the shared connector framework or canonical schema.

---

> Source: `docs/GMAIL_OAUTH_CONNECT_CONTRACT_V1.md`

# Envoy Gmail OAuth Connect Contract v1

## Purpose

This document defines the exact Gmail OAuth connect contract for the Envoy MVP.

It covers:
- how a workspace admin starts Gmail connection
- how OAuth callback exchange is handled
- what secret material is stored
- what integration record is created or updated
- how lifecycle state changes
- what errors are surfaced

This contract is limited to Gmail API connection for the MVP.

---

## Core Rules

1. Gmail connection is workspace-scoped.
2. Only users allowed to connect integrations may start or complete the connect flow.
3. Raw OAuth secrets and tokens must not be stored in integration metadata JSON.
4. Successful connection must end in a valid integration record plus secret reference.
5. The Gmail connector must use the shared integration lifecycle and shared credential handling rules.

---

## Authorized Actor

### Who can connect Gmail
Allowed role:
- `ADMIN`

Denied roles:
- `MEMBER`
- `VIEWER`

This follows the MVP RBAC policy for integration management.

---

## Connect Flow Overview

### Step 1 — Start connect
A workspace admin clicks “Connect Gmail” inside Envoy.

System responsibilities:
- confirm the user is authenticated
- confirm the user belongs to the active workspace
- confirm the user has `connect_integrations` permission
- generate OAuth state tied to the workspace and user
- redirect to Google OAuth consent

### Step 2 — Google consent
The user authorizes the Gmail integration with the requested scopes.

### Step 3 — OAuth callback
Envoy receives the callback with:
- authorization code
- state

System responsibilities:
- validate state
- exchange code for tokens
- fetch provider account identity needed for integration ownership
- create or update secret storage
- create or update integration record
- transition lifecycle appropriately
- trigger initial recent-thread sync later

---

## Required OAuth State Properties

The OAuth state must be sufficient to validate the callback and restore workspace context safely.

Recommended state contents:
- workspaceId
- initiatingUserId
- connector type = Gmail
- nonce
- createdAt or expiry marker

Rules:
- state must be signed or otherwise tamper-resistant
- state must expire
- callback must fail cleanly if state is missing, invalid, expired, or workspace-mismatched

---

## OAuth Scopes

The Gmail connector should request only the minimum scopes needed for MVP behavior.

MVP capabilities require:
- read recent threads
- read message/thread content
- send replies in existing threads

The exact Google scopes should be chosen to support:
- Gmail thread/message read
- Gmail send/reply

Rules:
- keep requested scopes minimal
- do not request unrelated Google account scopes
- document final scope strings in the implementation

---

## Connect Input Contract

### Start connect input
Inputs:
- authenticated app user
- workspace id
- connector type = Gmail

Outputs:
- Google authorization URL
- signed state payload

### Callback input
Inputs:
- authorization code
- state
- authenticated or correlation-safe callback context

Outputs:
- exchanged auth material
- external account identity
- integration create/update decision
- secret store result
- lifecycle update result

---

## Secret Storage Outcome

Successful OAuth callback should produce secret material compatible with the shared credential handling contract.

Expected stored auth material:
- access token
- refresh token if issued
- token expiry if available
- granted scopes summary if useful
- provider account identifier if useful

Rules:
- store secret material only through the secret storage abstraction
- integration record stores secret reference only
- do not store raw OAuth response in `platform_metadata_json`
- safe non-secret diagnostics may be stored separately

---

## Integration Record Outcome

Successful connect should create or update one `integrations` record scoped to the current workspace.

Expected canonical integration fields:
- `workspace_id`
- `platform = EMAIL`
- `auth_type = oauth`
- `external_account_id`
- `display_name`
- `status`
- `config_json`
- `platform_metadata_json`

Expected metadata examples:
- provider = gmail
- connected email address
- granted scope summary if non-secret
- provider display label
- reconnect hints if needed later

Rules:
- no raw tokens in the integration record
- use one integration per connected Gmail account inside a workspace
- do not duplicate integrations for the same workspace/account without explicit reason

---

## Lifecycle Transitions

The Gmail connect flow must follow the shared integration lifecycle.

Recommended transition flow:
1. create or mark integration as `PENDING`
2. after successful code exchange and account validation, transition to `CONNECTED`
3. if exchange or validation fails, transition to `ERROR`
4. later initial import may move `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

Do not invent Gmail-only lifecycle states.

---

## Duplicate Connect Rule

If the same Gmail account is reconnected for the same workspace:
- prefer updating the existing integration and rotating secret material
- do not create unnecessary duplicate integration rows
- preserve prior normalized history when possible

If the same Gmail account is attempted in a different workspace:
- handle according to product policy later
- for MVP, at minimum keep workspace ownership explicit and do not cross-link data

---

## Error Cases

The connect flow must fail cleanly for at least these cases:

### Invalid or expired state
Result:
- reject callback
- do not exchange code
- do not create or update integration

### OAuth code exchange failure
Result:
- no successful connect
- integration may remain `PENDING` or move to `ERROR` depending on implementation path
- store safe diagnostics only

### Missing refresh token or insufficient auth material
Result:
- fail connection if MVP requires refreshable access
- surface reconnect guidance if useful

### Provider identity fetch failure
Result:
- do not finalize integration ownership
- fail safely
- avoid storing incomplete integration state as connected

### Secret store write failure
Result:
- do not mark integration connected
- avoid partial successful connect state

### Integration persistence failure
Result:
- do not report success
- preserve safe diagnostics
- avoid leaking secret material

---

## Security Rules

### Workspace boundary
The connect and callback flow must resolve to exactly one workspace.

### Permission boundary
Only users with integration management permission may complete the connect flow.

### Secret boundary
Tokens and secrets:
- must not be logged in plaintext
- must not be written to integration metadata JSON
- must only be persisted through the secret storage abstraction

### Metadata boundary
Use metadata JSON only for non-secret provider context.

This follows the normalization and credential handling rules already defined.

---

## Connect Result Contract

A successful Gmail connect should produce a connector-level result equivalent to:

- externalAccountId
- displayName
- integrationStatus = CONNECTED
- secretRef
- platformMetadata

This should align with the shared `connect()` connector contract.

---

## Deferred Items

Do not include these in the first connect implementation:
- Gmail push/webhook setup
- full mailbox import
- label management
- send-as alias support
- multi-account connect UX polish
- deep reconnect UI flows

Those come later.

---

## Acceptance Test

The Gmail OAuth connect contract is correct only if all of the following are true:

1. An admin can start Gmail OAuth for the current workspace.
2. The callback validates state and workspace context safely.
3. Secret material is stored only through the secret storage abstraction.
4. The integration record stores non-secret Gmail connection metadata only.
5. Successful connect results in a valid workspace-scoped integration in `CONNECTED` state.
6. The contract does not introduce Gmail-only fields into the canonical data model.

---

> Source: `docs/GMAIL_INGESTION_STRATEGY_V1.md`

# Envoy Gmail Ingestion Strategy v1

## Purpose

This document defines the Gmail message ingestion strategy for the Envoy MVP.

The first Gmail ingestion implementation will use:
- recent-thread polling first

It will not start with Gmail push/watch as the primary ingestion path.

This keeps the first connector narrow and aligned with the shared inbound pipeline.

---

## Strategy Decision

### Selected MVP ingestion mode
- polling recent Gmail threads

### Deferred
- Gmail push/watch setup
- Pub/Sub push delivery
- advanced mailbox sync
- full historical mailbox import

---

## Why polling first

Polling first is the simpler MVP path because it:
- avoids early webhook/watch setup complexity
- still proves the canonical ingestion framework
- is enough to power the first live inbox experience
- fits the recent-thread-first connector scope already locked for Gmail

Push/watch can be layered in later without changing the canonical model or connector framework.

---

## Ingestion Source

The Gmail connector should fetch:
- recent threads
- recent messages inside those threads

The connector should then feed normalized results into the shared inbound ingestion pipeline.

The shared inbound stages remain:
1. validate source
2. parse payload
3. dedupe
4. normalize
5. upsert conversation
6. insert messages
7. emit events

The Gmail connector must not bypass that shared pipeline.

---

## Initial Sync Window

### Included
- recent thread import only
- limited backfill window
- enough history to populate the inbox after connect

### Recommended MVP behavior
- fetch only a bounded recent window after first connect
- store a checkpoint or cursor in integration metadata for later incremental sync
- prefer recency over completeness in the first version

### Deferred
- full mailbox historical import
- large mailbox migration
- advanced folder/label sync semantics

---

## Checkpoint Model

The integration should maintain non-secret sync state in integration metadata.

Examples:
- last sync cursor
- last synced at
- recent sync window markers
- sync diagnostics

Secrets must not be stored in metadata.
Sync state should remain non-secret and connector-operational.

---

## Canonical Mapping Requirement

The Gmail connector must normalize Gmail provider data into the existing canonical model:

### Conversations
- Gmail thread id -> `external_conversation_id`
- subject -> `subject`
- latest thread activity -> `last_message_at`

### Messages
- Gmail message id -> `external_message_id`
- plain text -> `body_text`
- html body -> `body_html`
- send/receive timestamps -> canonical timing fields

### Metadata
Gmail-specific non-canonical detail should go into:
- `raw_payload_json`
- `platform_metadata_json`

No Gmail-only core columns should be added.

---

## Sync Frequency Assumption

For MVP:
- allow manual resync
- support a recent polling-based sync path
- do not require realtime delivery guarantees yet

The system should be designed so polling can later coexist with Gmail push/watch.

---

## Idempotency and Dedupe

The Gmail ingestion path must use the shared idempotency and inbound dedupe contracts.

That means:
- duplicate polling results must not create duplicate canonical messages
- message identity should converge on canonical uniqueness
- repeated syncs should converge to the same canonical state

The connector must not invent Gmail-only dedupe rules outside the shared framework.

---

## Lifecycle Interaction

When a connected Gmail integration runs an import or resync:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

If sync fails in a connector-health-relevant way:
- transition toward `ERROR` as appropriate

Do not invent Gmail-only lifecycle states.

---

## Attachment Handling During Ingestion

The first Gmail ingestion path should:
- normalize attachment metadata
- preserve provider attachment identifiers
- store file name, MIME type, size when available
- avoid full binary ingestion in the first sync implementation unless needed later

---

## Explicit MVP Non-Goals

Do not build these as part of the first Gmail ingestion step:
- Gmail push/watch as the primary path
- Pub/Sub consumer setup
- mailbox management actions
- full history migration
- label management as a first-class canonical concept
- advanced attachment ingestion pipeline

---

## Acceptance Test

The Gmail ingestion strategy is correct only if all of the following are true:

1. Gmail recent threads can be fetched through a bounded polling-based sync.
2. The connector feeds the shared inbound pipeline rather than custom Gmail-only write logic.
3. Repeated polling does not create duplicate canonical messages.
4. A sync checkpoint can be stored in non-secret integration metadata.
5. The strategy can later add Gmail push/watch without redesigning the canonical model.

---

> Source: `docs/GMAIL_NORMALIZATION_VALIDATION_V1.md`

# Envoy Gmail Normalization Validation v1

## Purpose

This document validates the Gmail normalization layer against real Gmail data before reply/send is implemented.

The goal is to confirm that Gmail provider-native thread and message payloads map correctly into the canonical Envoy model without Gmail-specific leakage into core tables.

---

## Validation Areas

### 1. Conversation mapping
Check that for real Gmail threads:
- Gmail thread id maps to `external_conversation_id`
- subject maps to `subject`
- latest message activity maps to `last_message_at`
- Gmail-only thread details remain in metadata fields

### 2. Participant mapping
Check that for real Gmail messages:
- sender email maps correctly
- sender display name maps correctly when present
- duplicate participants are not created unnecessarily
- internal vs external identity is handled consistently

### 3. Message mapping
Check that for real Gmail messages:
- Gmail message id maps to `external_message_id`
- plain text body extraction is correct
- HTML body extraction is correct
- sent and received timestamps are populated correctly
- message ordering inside a thread is stable

### 4. Attachment metadata mapping
Check that for real Gmail messages with attachments:
- attachment filename is captured
- MIME type is captured
- size is captured when available
- provider attachment identifiers are preserved in metadata
- no binary payloads are written into the canonical attachment model

### 5. Metadata preservation
Check that:
- `raw_payload_json` preserves enough Gmail source detail for debugging/replay
- `platform_metadata_json` preserves useful non-canonical Gmail details
- no secrets or auth material appear in message, attachment, or integration metadata

### 6. Canonical cleanliness
Check that:
- no Gmail-only core columns were needed
- Gmail labels/folder semantics are not leaking into canonical columns
- normalization outputs fit the existing canonical conversation/message model

---

## Real Data Test Cases

Use a small but varied sample of real Gmail threads:

1. simple single-message inbound thread
2. multi-message thread with replies
3. thread with HTML-heavy message body
4. thread with attachment metadata
5. thread with display name + email sender headers
6. thread with missing or unusual headers if available
7. thread with internal self-sent or self-reply behavior if available

---

## Validation Checklist

For each sampled thread, verify:

### Conversation
- [ ] external conversation id is correct
- [ ] subject is correct
- [ ] last message at is correct

### Participants
- [ ] participant identities are correct
- [ ] no unnecessary duplicates
- [ ] display name and email are mapped correctly

### Messages
- [ ] external message ids are correct
- [ ] body text is usable
- [ ] body html is preserved when available
- [ ] timestamps are correct
- [ ] ordering is correct

### Attachments
- [ ] attachment metadata exists when expected
- [ ] no binary content is stored
- [ ] provider metadata is preserved safely

### Metadata
- [ ] raw payload is preserved
- [ ] platform metadata is useful
- [ ] no secret/auth leakage

---

## Fix Categories

If a normalization issue is found, classify it as one of:

### A. Conversation mapping bug
Examples:
- wrong subject
- wrong last activity time
- thread identity mismatch

### B. Participant mapping bug
Examples:
- duplicate sender identities
- missing display name
- bad internal/external classification

### C. Message body bug
Examples:
- empty body text when content exists
- broken HTML capture
- incorrect text fallback

### D. Timestamp bug
Examples:
- sent/received reversed
- wrong timezone handling
- unstable ordering

### E. Attachment metadata bug
Examples:
- missing filename
- MIME type not extracted
- provider attachment id not preserved

### F. Metadata preservation bug
Examples:
- raw payload missing key source data
- useful Gmail thread hints missing
- auth-sensitive data leaking into metadata

---

## Required Output of This Step

After validating real data, produce:

1. a short list of actual normalization issues found, if any
2. the code fixes applied
3. confirmation that the canonical model still did not need Gmail-only fields

---

## Acceptance Test

This step is complete only if all of the following are true:

1. Real Gmail threads map cleanly to canonical conversations, participants, messages, and attachments.
2. Body extraction is good enough for inbox/thread reading.
3. Attachment handling remains metadata-only.
4. No Gmail-only fields were added to the canonical schema.
5. Raw payload and non-secret metadata are preserved well enough for debugging and replay.

---

> Source: `docs/GMAIL_SYNC_BACKFILL_CHECKPOINT_V1.md`

# Envoy Gmail Sync Backfill and Checkpoint Contract v1

## Purpose

This document defines the Gmail backfill and checkpoint contract for the Envoy MVP.

The Gmail connector must:
- import a bounded recent window after account connection
- maintain non-secret sync checkpoint state
- avoid full mailbox historical import in MVP
- support safe repeated polling without creating duplicate canonical records

---

## Core Rules

1. Gmail sync checkpoint data is non-secret and belongs in integration metadata.
2. Gmail sync must remain bounded in MVP.
3. Initial connect sync and later manual resync should share the same checkpoint model.
4. Full historical mailbox import is out of scope for MVP.
5. Repeated sync must converge on the same canonical state.

---

## Initial Backfill Scope

### Included
- recent-thread import after connect
- bounded lookback window
- limited thread count or similar guardrail
- enough history to populate the Envoy inbox meaningfully

### Recommended MVP defaults
- recent lookback window such as 7 to 14 days
- bounded maximum thread count per sync batch
- manual resync allowed for the same bounded window

### Deferred
- full historical mailbox import
- large mailbox migration
- unbounded sync
- advanced label/folder backfill semantics

---

## Checkpoint Storage

Checkpoint data should live in non-secret integration metadata.

Allowed checkpoint examples:
- `lastSyncedAt`
- `lastSuccessfulSyncAt`
- `lastRecentWindowStart`
- `lastRecentWindowEnd`
- `lastSyncThreadCount`
- `lastSyncMessageCount`
- `lastSyncStatus`
- sync diagnostics summary

Do not store:
- access tokens
- refresh tokens
- auth secrets

This follows the metadata and credential handling rules.

---

## Sync Modes

### 1. Initial connect sync
Purpose:
- populate the first recent inbox state after Gmail is connected

Expected behavior:
- run bounded recent-thread import
- write checkpoint metadata on success
- leave integration in healthy connected state after sync completes

### 2. Manual resync
Purpose:
- refresh recent Gmail thread state on demand

Expected behavior:
- rerun bounded recent-thread polling
- use shared inbound idempotency and canonical upsert rules
- update checkpoint metadata again on success

### 3. Future incremental sync
Deferred in implementation, but checkpoint design should leave room for:
- provider cursor
- history id
- incremental poll marker
- push/watch coexistence later

---

## Success Criteria for Checkpoint Updates

A sync may update checkpoint metadata only after:
- connector fetch succeeded
- normalization succeeded
- canonical persistence completed without fatal failure

Recommended metadata updates after success:
- sync timestamp
- recent window bounds
- item counts
- status summary
- connector diagnostics summary if useful

If sync fails:
- preserve safe diagnostics
- do not falsely mark successful checkpoint completion

---

## Lifecycle Interaction

Recommended Gmail sync lifecycle flow:
- `CONNECTED -> SYNC_IN_PROGRESS -> CONNECTED`

On meaningful connector failure:
- transition toward `ERROR` as appropriate

Do not invent Gmail-only lifecycle states.

---

## Dedupe and Idempotency

Repeated backfill or manual resync must not create duplicate canonical records.

Use:
- shared inbound dedupe rules
- canonical uniqueness for messages
- shared idempotency contract where applicable

The checkpoint model does not replace dedupe.
It only records sync progress and outcome.

---

## Metrics to Preserve in Metadata

Safe and useful examples:
- threads scanned
- messages normalized
- messages inserted
- messages matched
- attachments inserted
- sync duration summary
- last failure category

These are operational metadata, not business schema fields.

---

## Explicit MVP Non-Goals

Do not add these to the first backfill/checkpoint implementation:
- full mailbox history import
- Gmail push/watch as primary sync path
- Gmail label sync as a first-class canonical model
- advanced mailbox state replication
- background scheduling sophistication beyond basic manual/recent sync behavior

---

## Acceptance Test

The Gmail backfill/checkpoint contract is correct only if all of the following are true:

1. Initial Gmail connect can populate recent threads without full mailbox import.
2. Manual resync can safely rerun the same bounded recent sync window.
3. Checkpoint metadata remains non-secret and lives in integration metadata.
4. Repeated sync converges without duplicate canonical records.
5. The checkpoint model leaves room for future incremental sync or Gmail push/watch later.

---

> Source: `docs/GMAIL_ATTACHMENT_HANDLING_V1.md`

# Envoy Gmail Attachment Handling v1

## Purpose

This document defines the first Gmail attachment handling contract for the Envoy MVP.

The Gmail connector must support attachment handling well enough for:
- canonical metadata storage
- thread view rendering
- download-on-demand behavior later

The first implementation is metadata-first.

It does not include full binary ingestion or long-term file storage in the initial Gmail attachment step.

---

## Core Rules

1. Attachment handling is workspace-scoped through the parent message and conversation.
2. The canonical attachment model stores metadata, not Gmail-specific business logic.
3. Gmail-specific attachment detail belongs in metadata fields, not new core schema columns.
4. Attachment binaries are not ingested into long-term storage in the first Gmail attachment phase.
5. Secrets and auth material must never appear in attachment metadata.

---

## MVP Attachment Scope

### Included
- normalize attachment metadata from Gmail messages
- store canonical attachment rows
- preserve provider attachment identifiers in metadata
- show attachment information in thread view
- support later on-demand download using connector auth context

### Deferred
- full attachment binary ingestion pipeline
- object storage upload for all attachments
- preview generation
- OCR
- malware scanning
- attachment search indexing
- inline rich preview rendering beyond basic file info

---

## Canonical Attachment Fields

The canonical `attachments` model should be used as-is.

Expected canonical fields include:
- `workspace_id`
- `message_id`
- `platform`
- `external_attachment_id`
- `file_name`
- `mime_type`
- `size_bytes`
- `storage_key`
- `external_url`
- `platform_metadata_json`

For Gmail MVP:
- `storage_key` will usually remain null until a later binary ingestion phase
- `external_url` may remain null if Gmail does not expose a stable direct file URL for safe reuse
- the core value is canonical metadata plus provider attachment identifiers

This keeps the canonical model platform-agnostic.  [oai_citation:5‡DATA_MODEL_V1.md](sediment://file_00000000eb44722f911c7913e2821476)

---

## Gmail Metadata Rules

### What belongs in platform_metadata_json
Examples:
- Gmail attachment id
- Gmail message part id
- content disposition
- inline vs attachment hint
- provider file metadata useful for later download
- thumbnail or preview hints if safely available later

### What does not belong in canonical columns
Do not add Gmail-only fields like:
- Gmail part structure fields
- Gmail MIME part tree details
- Gmail-only preview fields as core columns

Use `platform_metadata_json` instead.  [oai_citation:6‡NORMALIZATION_METADATA_V1.md](sediment://file_000000009ff071f5b80b24106066bd63)

---

## Thread View Requirements

The first Gmail thread view should be able to show, for each attachment:
- file name
- MIME type
- size when available
- whether the file is an attachment or inline-related part when that distinction is useful
- enough metadata for a future download action

This is enough for MVP thread reading and basic operator trust.

---

## Download-On-Demand Contract

The first Gmail attachment phase should not pre-download every file.

Instead, later download behavior should work like this:

1. user requests a download from thread view
2. system validates:
   - auth
   - workspace ownership
   - permission to view the conversation
3. system resolves the connector context for the Gmail integration
4. system uses preserved Gmail attachment identifiers to fetch the file on demand
5. system returns the file or a streamed response safely

This contract is enough now even if the actual download endpoint is built later.

---

## Ingestion Rules

When Gmail messages are ingested:
- attachment metadata should be extracted during normalization
- canonical attachment rows should be inserted through the shared inbound write path
- duplicate syncs must not create duplicate attachment records for the same canonical message and external attachment identity
- binary content should not be stored in the first Gmail ingestion phase

This stays aligned with the shared inbound pipeline and idempotency rules. 

---

## Security Rules

### Workspace boundary
A user may only access attachment data where the parent resource belongs to the current workspace.  [oai_citation:7‡WORKSPACE_MODEL_V1.md](sediment://file_00000000376c722f9d3755c3e196f5a5)

### Secret boundary
Attachment metadata must never contain:
- access tokens
- refresh tokens
- auth headers
- raw connector secret material

### Logging boundary
Do not log raw attachment fetch auth data.
Only log safe diagnostics if later download errors occur.

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail attachment step:
- attachment object storage mirror
- virus scanning
- OCR
- preview thumbnails
- cross-thread attachment library
- content indexing
- Slack attachment unification beyond the shared canonical model

---

## Acceptance Test

The Gmail attachment handling contract is correct only if all of the following are true:

1. Gmail attachment metadata is stored in canonical attachment rows.
2. Thread view can display basic attachment information without binary ingestion.
3. Gmail-specific attachment details stay in metadata, not new core schema columns.
4. Attachment handling remains workspace-scoped and secret-safe.
5. The contract leaves room for later on-demand download without redesigning the canonical model.

---

> Source: `docs/GMAIL_REPLY_SEND_CONTRACT_V1.md`

# Envoy Gmail Reply/Send Contract v1

## Purpose

This document defines the Gmail outbound reply/send contract for the Envoy MVP.

The first Gmail send implementation is thread-first.

That means MVP send scope is:
- reply within an existing Gmail thread

It does not yet include broad standalone compose behavior beyond the thread-first workflow.

This contract aligns Gmail sending with:
- the canonical message model
- the shared outbound sending pipeline
- the approval system for AI-generated drafts
- the workspace and RBAC model

---

## Core Rules

1. Gmail outbound sending is workspace-scoped.
2. Only users allowed to send messages may trigger a Gmail send.
3. AI-generated Gmail drafts must be approved before send.
4. Gmail-specific reply/thread data must remain in metadata, not new core schema fields.
5. Canonical message status must reflect real send outcome.

---

## Supported MVP Send Modes

### Included
- human reply in an existing Gmail thread
- approved AI-generated reply in an existing Gmail thread

### Deferred
- standalone compose-first email outside an existing thread
- Gmail native draft sync
- send scheduling
- alias/send-as support
- mailbox management actions

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

A Gmail reply may be sent only when all of the following are true:

1. the message belongs to the current workspace
2. the integration belongs to the same workspace
3. the integration is in a send-capable lifecycle state
4. the canonical message has:
   - `direction = OUTBOUND`
   - an eligible outbound status
5. the parent conversation maps to a Gmail thread
6. the connector has enough Gmail thread context to construct a valid reply

For AI-generated drafts, also require:
7. a related `approval_request`
8. `approval_request.status = APPROVED`

This follows the shared outbound pipeline and approval rules. 

---

## Gmail Thread Reply Requirement

The first Gmail send implementation must reply inside an existing Gmail thread.

That means the connector must preserve and use enough Gmail provider context to build a real reply, such as:
- Gmail thread id
- message references needed for reply context when useful
- any non-secret Gmail reply metadata stored in canonical metadata fields

Canonical conversation identity remains:
- `conversations.external_conversation_id = Gmail thread id`

Canonical message identity remains:
- `messages.external_message_id = Gmail message id`

Do not add Gmail-only reply fields to canonical tables.

Use metadata fields where Gmail-specific reply details are needed. 

---

## Input to Gmail Send

The Gmail connector should receive, through the shared outbound pipeline:

- connector context with resolved Gmail OAuth auth material
- canonical conversation
- canonical outbound message
- optional approval context
- shared idempotency key
- actor context

The connector should not fetch raw tokens from business tables directly.
It should operate on resolved auth material from connector runtime context. 

---

## Gmail Provider Payload Expectations

The Gmail connector is responsible for converting canonical reply input into a Gmail-compatible outbound payload.

The connector payload builder should use:
- canonical message body
- canonical conversation/thread context
- Gmail thread id
- any provider-specific reply metadata needed for correct threading

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

Every Gmail outbound send should remain traceable through canonical audit records.

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

This follows the audit and approval design rules.  [oai_citation:4‡AGENT_TABLES_V1.md](sediment://file_0000000024d471f5b5200b44aed2c6a7)

---

## Metadata Rules

### Allowed in platform_metadata_json
Examples:
- Gmail thread id copy if useful for fast access
- provider send response summary
- reply header references
- Gmail-specific delivery diagnostics
- normalized provider thread hints

### Not allowed
- raw OAuth tokens
- refresh tokens
- client secrets
- arbitrary Gmail-only fields promoted into canonical schema

Secrets must stay in the secret storage abstraction, not metadata. 

---

## Idempotency Rules

The Gmail send path must use the shared outbound idempotency contract.

That means:
- one canonical outbound message corresponds to one logical send
- retries use a stable shared idempotency key
- if Gmail supports idempotency-like protection, it is additive
- repeated send attempts must not create uncontrolled duplicate Gmail messages

This follows the shared idempotency contract.  [oai_citation:5‡IDEMPOTENCY_CONTRACT_V1.md](sediment://file_00000000114871fdbe5f058f9931bf27)

---

## Explicit MVP Non-Goals

Do not build these in the first Gmail send step:
- new compose outside existing thread-first workflow
- send-as aliases
- Gmail draft sync
- scheduled send
- mailbox management actions
- autonomous AI sending

---

## Acceptance Test

The Gmail reply/send contract is correct only if all of the following are true:

1. A human can send a reply in an existing Gmail thread from Envoy.
2. An approved AI draft can send through the same shared outbound pipeline.
3. Gmail-specific reply context stays in metadata, not canonical schema.
4. Canonical message statuses reflect real send outcomes.
5. The contract does not require Gmail-only changes to the shared framework or core data model.