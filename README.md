# Envoy

Envoy is a Gmail-first support inbox and agent-assist workspace built as a `pnpm` monorepo. A user signs up, connects Gmail, syncs real conversations into a shared inbox, and then reviews threads, approvals, agent runs, and workspace operations from one app.

## What You Can Do

- Create a workspace account locally
- Connect a Gmail inbox with OAuth
- Sync real Gmail threads into Envoy
- Review conversations, approvals, audit history, and runtime jobs
- Run the worker locally for sync and background processing
- Optionally enable OpenAI-backed draft generation

## Stack

- `Next.js 16` app router frontend in [apps/web](C:/Users/admin/Envoy/apps/web)
- Background worker in [apps/worker](C:/Users/admin/Envoy/apps/worker)
- Shared packages in [packages](C:/Users/admin/Envoy/packages)
- `Postgres` via Prisma
- `Redis` / BullMQ for job processing
- Gmail OAuth + Gmail API sync

## Quickstart

### 1. Install

```bash
pnpm install
```

### 2. Create Your Local Env File

Copy [.env.example](C:/Users/admin/Envoy/.env.example) to `.env`.

Minimum required values:

- `NEXTAUTH_SECRET`
- `ENVOY_SECRET_ENCRYPTION_KEY`
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_STATE_SECRET`

Use `http://localhost:3000/api/integrations/gmail/callback` as your Google OAuth redirect URI.

### 3. Start Postgres And Redis

```bash
pnpm db:start
```

### 4. Prepare The Database

```bash
pnpm db:prepare
```

### 5. Start The App And Worker

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000), create an account, go to Workspace Settings, connect Gmail, and run `Sync once now`.

If you want the quickest walkthrough:

1. Run the quickstart above.
2. Sign up for a local account.
3. Open `Settings -> Workspace`.
4. Click `Connect Gmail`.
5. Approve OAuth.
6. Wait for the worker to pick up the recovery sync, or click `Sync once now`.
7. Open the inbox home page and inspect imported conversations.

-Manual Gmail sync works without Pub/Sub. Live Gmail push updates need a publicly reachable webhook URL, so they will not work against a plain `localhost` dev server without a tunnel or deployed endpoint.

## Commands

```bash
pnpm db:start
pnpm db:stop
pnpm db:prepare
pnpm dev
pnpm dev:web
pnpm dev:worker
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## Environment Notes

- Gmail connect requires your own Google OAuth app.
- `OPENAI_API_KEY` is optional. Without it, Gmail sync still works, but draft preview / agent generation features will fail until configured.
- `GMAIL_PUBSUB_TOPIC` is optional for local exploration. Manual sync is enough to evaluate the project.

More detail:

- [Local development](C:/Users/admin/Envoy/docs/LOCAL_DEVELOPMENT.md)
- [Environment variables](C:/Users/admin/Envoy/docs/ENVIRONMENT_VARIABLES.md)
- [Integration setup](C:/Users/admin/Envoy/docs/INTEGRATION_SETUP.md)
- [Testing](C:/Users/admin/Envoy/docs/TESTING.md)
- [Documentation guide](C:/Users/admin/Envoy/docs/README.md)

## Repo Map

- [apps/web](C:/Users/admin/Envoy/apps/web): main product UI and API routes
- [apps/worker](C:/Users/admin/Envoy/apps/worker): background jobs, sync, watch renewal
- [packages/db](C:/Users/admin/Envoy/packages/db): Prisma schema and persistence helpers
- [packages/connectors](C:/Users/admin/Envoy/packages/connectors): Gmail OAuth and sync logic
- [packages/ui](C:/Users/admin/Envoy/packages/ui): shared UI primitives
- [docs](C:/Users/admin/Envoy/docs): architecture and operational notes

## Documentation Guide

If you want to understand how Envoy works beyond the quickstart, these are the most useful docs:

### Product And Data Model

- [Conversation model](C:/Users/admin/Envoy/docs/CONVERSATION_MODEL_V1.md)
- [Message model](C:/Users/admin/Envoy/docs/MESSAGE_MODEL_V1.md)
- [Workspace model](C:/Users/admin/Envoy/docs/WORKSPACE_MODEL_V1.md)
- [Data model](C:/Users/admin/Envoy/docs/DATA_MODEL_V1.md)
- [Schema contracts](C:/Users/admin/Envoy/docs/SCHEMA_CONTRACTS.md)

### Gmail Integration

- [Gmail connector scope](C:/Users/admin/Envoy/docs/GMAIL_CONNECTOR_SCOPE_V1.md)
- [Gmail OAuth contract](C:/Users/admin/Envoy/docs/GMAIL_OAUTH_CONNECT_CONTRACT_V1.md)
- [Gmail ingestion strategy](C:/Users/admin/Envoy/docs/GMAIL_INGESTION_STRATEGY_V1.md)
- [Gmail normalization validation](C:/Users/admin/Envoy/docs/GMAIL_NORMALIZATION_VALIDATION_V1.md)
- [Gmail sync backfill checkpoint](C:/Users/admin/Envoy/docs/GMAIL_SYNC_BACKFILL_CHECKPOINT_V1.md)
- [Gmail reply send contract](C:/Users/admin/Envoy/docs/GMAIL_REPLY_SEND_CONTRACT_V1.md)
- [Gmail attachment handling](C:/Users/admin/Envoy/docs/GMAIL_ATTACHMENT_HANDLING_V1.md)

### Runtime And Operations

- [Deployment topology](C:/Users/admin/Envoy/docs/DEPLOYMENT_TOPOLOGY.md)
- [Release architecture](C:/Users/admin/Envoy/docs/RELEASE_ARCHITECTURE.md)
- [Operator guide](C:/Users/admin/Envoy/docs/OPERATOR_GUIDE.md)
- [Incident playbook](C:/Users/admin/Envoy/docs/INCIDENT_PLAYBOOK.md)
- [Production checks](C:/Users/admin/Envoy/docs/PRODUCTION_CHECKS.md)
- [Release checklist](C:/Users/admin/Envoy/docs/RELEASE_CHECKLIST.md)
- [Runtime plan](C:/Users/admin/Envoy/docs/runtime/V1_B_RUNTIME_PLAN.md)

### Agents, Events, And Workflows

- [Agent trigger rules](C:/Users/admin/Envoy/docs/AGENT_TRIGGER_RULES_V1.md)
- [Agent tables](C:/Users/admin/Envoy/docs/AGENT_TABLES_V1.md)
- [Draft generator](C:/Users/admin/Envoy/docs/DRAFT_GENERATOR_V1.md)
- [Event schema](C:/Users/admin/Envoy/docs/EVENT_SCHEMA_V1.md)
- [Inbound ingestion pipeline](C:/Users/admin/Envoy/docs/INBOUND_INGESTION_PIPELINE_V1.md)
- [Outbound sending pipeline](C:/Users/admin/Envoy/docs/OUTBOUND_SENDING_PIPELINE_V1.md)
- [Integration lifecycle](C:/Users/admin/Envoy/docs/INTEGRATION_LIFECYCLE_V1.md)
- [Idempotency contract](C:/Users/admin/Envoy/docs/IDEMPOTENCY_CONTRACT_V1.md)

### Frontend And UX

- [Information architecture](C:/Users/admin/Envoy/docs/frontend/INFORMATION_ARCHITECTURE_V1.md)
- [Component system](C:/Users/admin/Envoy/docs/frontend/COMPONENT_SYSTEM.md)
- [Frontend design foundation](C:/Users/admin/Envoy/docs/frontend/FRONTEND_DESIGN_FOUNDATION.md)
- [Frontend implementation rules](C:/Users/admin/Envoy/docs/frontend/FRONTEND_IMPLEMENTATION_RULES.md)
- [Frontend gap audit](C:/Users/admin/Envoy/docs/frontend/FRONTEND_GAP_AUDIT.md)

### Security And Access

- [RBAC policy](C:/Users/admin/Envoy/docs/RBAC_POLICY_V1.md)
- [Credential handling](C:/Users/admin/Envoy/docs/CREDENTIAL_HANDLING_V1.md)
- [Secret handling policy](C:/Users/admin/Envoy/docs/security/SECRET_HANDLING_POLICY.md)
- [Auth account lifecycle](C:/Users/admin/Envoy/docs/security/AUTH_ACCOUNT_LIFECYCLE.md)
- [Production security baseline](C:/Users/admin/Envoy/docs/security/PRODUCTION_SECURITY_BASELINE.md)
- [Tenancy audit summary](C:/Users/admin/Envoy/docs/security/TENANCY_AUDIT_SUMMARY.md)

### Validation

- [Testing](C:/Users/admin/Envoy/docs/TESTING.md)
- [Regression suite](C:/Users/admin/Envoy/docs/testing/REGRESSION_SUITE.md)

