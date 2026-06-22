import "server-only";

import { validateSecretEncryptionConfig } from "@envoy/db";

const warned = new Set<string>();

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function warnOnce(key: string, message: string) {
  if (warned.has(key)) {
    return;
  }

  warned.add(key);
  console.warn(message);
}

function requireProductionEnv(name: string) {
  if (!readEnv(name)) {
    throw new Error(`${name} is required in production.`);
  }
}

export function validateProductionSecurityConfig() {
  if (process.env.NODE_ENV === "production") {
    validateSecretEncryptionConfig();
    requireProductionEnv("NEXTAUTH_SECRET");

    if (!readEnv("GMAIL_CLIENT_ID") || !readEnv("GMAIL_CLIENT_SECRET")) {
      warnOnce(
        "gmail-oauth-config",
        "[security] Gmail OAuth env is incomplete. Gmail connect/reconnect will be unavailable.",
      );
    }

    if (
      readEnv("GMAIL_PUBSUB_TOPIC") &&
      !readEnv("GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL") &&
      !readEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN") &&
      !readEnv("GMAIL_PUBSUB_PATH_SECRET")
    ) {
      warnOnce(
        "gmail-pubsub-auth-config",
        "[security] Gmail Pub/Sub push is configured without an OIDC service account or verification token.",
      );
    }
  }

  if (!readEnv("OPENAI_API_KEY")) {
    warnOnce(
      "openai-api-key",
      "[security] OPENAI_API_KEY is not configured. Agent draft generation will fail until it is provided.",
    );
  }
}
