# Local Development

Envoy's intended local path is:

1. install dependencies
2. start Postgres and Redis
3. run migrations
4. start the web app and worker
5. sign up locally
6. connect Gmail
7. sync real inbox data

## Prerequisites

- `Node.js` 20+
- `pnpm` 10+
- Docker Desktop or another Docker runtime
- A Google Cloud OAuth app for Gmail connect

## One-Time Setup

Install dependencies:

```bash
pnpm install
```

Copy [.env.example](C:/Users/admin/Envoy/.env.example) to `.env` and fill in the required values.

Start infrastructure:

```bash
pnpm db:start
```

Prepare Prisma client and database schema:

```bash
pnpm db:prepare
```

## Run The App

Start the web app and worker together:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm dev:web
pnpm dev:worker
```

Open `http://localhost:3000`, create a local account, then go to `Settings -> Workspace` to connect Gmail.

## Gmail Notes

- The OAuth redirect URI for local development is `http://localhost:3000/api/integrations/gmail/callback`.
- Manual Gmail sync works without Pub/Sub configuration.
- Pub/Sub is only needed if you want live push updates instead of manual `Sync once now` runs.
- Gmail Pub/Sub push delivery will not work against a plain `localhost` URL; use a tunnel or deployed endpoint if you want live syncing.

## Important Behavior

- No seed data is required for the primary local path.
- The worker must be running for queued sync and watch-renewal jobs to execute.
- `OPENAI_API_KEY` is optional. Without it, the inbox and Gmail sync still work, but draft-generation features will not.

The optional `apps/api` service is not required for the current product flow; the Next web app owns the active API routes and webhooks.
