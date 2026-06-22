# Integration Setup

Envoy currently exposes one main integration path: Gmail.

## Gmail OAuth

Create a Google OAuth client and configure:

- Redirect URI: `{APP_URL}/api/integrations/gmail/callback`
- Local redirect URI: `http://localhost:3000/api/integrations/gmail/callback`

Required environment variables:

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REDIRECT_URI`
- `GMAIL_OAUTH_STATE_SECRET`

After the web app and worker are running:

1. create a local Envoy account
2. open `Settings -> Workspace`
3. click `Connect Gmail`
4. complete Google OAuth
5. let the worker process the queued recovery sync, or click `Sync once now`

## Gmail Pub/Sub

Pub/Sub is optional for local exploration. Manual sync is enough to evaluate the product.

Live Gmail Pub/Sub push delivery requires a publicly reachable webhook endpoint, so it will not work against a plain `localhost` dev server.

If you want live Gmail updates:

- Create the topic named by `GMAIL_PUBSUB_TOPIC`
- Configure the push endpoint at `{APP_URL}/api/integrations/gmail/pubsub`
- Configure request verification with `GMAIL_PUBSUB_VERIFICATION_TOKEN` or production OIDC settings
- Keep the worker running so watch-renewal jobs and sync jobs can complete

## Environment Recommendations

- Local: manual sync is the simplest path; Pub/Sub can wait.
- Staging: real Postgres, Redis, OAuth app, and webhook reachability.
- Production-style testing: add Pub/Sub verification and persistent worker runtime.
