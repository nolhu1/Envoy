import { createPublicKey, createVerify } from "node:crypto";
import { getPrisma } from "@envoy/db";
import { NextResponse } from "next/server";

import { ingestGmailPushNotification } from "@/lib/gmail-ingestion";
import { readGmailLiveSyncEnabled } from "@/lib/gmail-sync-checkpoint";
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIpFromHeaders,
} from "@/lib/rate-limit";
import { sanitizeDiagnostics, sanitizeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

type PubSubPushEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GmailPubSubData = {
  emailAddress?: string;
  historyId?: string | number;
};

type GoogleJwk = {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
};

type GoogleJwks = {
  keys?: GoogleJwk[];
};

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
};

type GmailIntegrationRouteRecord = {
  id: string;
  workspaceId: string;
  platformMetadataJson: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

function decodeBase64Json<T>(value: string): T | null {
  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function getExpectedAudience(request: Request) {
  const configuredAudience = readString(process.env.GMAIL_PUBSUB_AUDIENCE);

  if (configuredAudience) {
    return configuredAudience;
  }

  const url = new URL(request.url);

  return `${url.origin}${url.pathname}`;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function verifyLocalToken(request: Request) {
  const configuredToken =
    readString(process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN) ??
    readString(process.env.GMAIL_PUBSUB_PATH_SECRET);

  if (!configuredToken) {
    return false;
  }

  const url = new URL(request.url);
  const providedToken =
    readString(request.headers.get("x-envoy-pubsub-token")) ??
    readString(url.searchParams.get("token")) ??
    readString(url.searchParams.get("secret"));

  return providedToken === configuredToken;
}

async function fetchGoogleJwk(kid: string) {
  const response = await fetch(GOOGLE_JWKS_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google JWKS request failed with status ${response.status}.`);
  }

  const jwks = (await response.json()) as GoogleJwks;

  return jwks.keys?.find((key) => key.kid === kid) ?? null;
}

async function verifyGoogleOidcJwt(token: string, request: Request) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson<JwtHeader>(encodedHeader);
  const payload = decodeBase64UrlJson<JwtPayload>(encodedPayload);

  if (!header || !payload || header.alg !== "RS256" || !header.kid) {
    return false;
  }

  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    return false;
  }

  const expectedAudience = getExpectedAudience(request);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

  if (!audiences.includes(expectedAudience)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < nowSeconds) {
    return false;
  }

  if (payload.iat && payload.iat > nowSeconds + 60) {
    return false;
  }

  const expectedServiceAccount = readString(
    process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL,
  );

  if (
    expectedServiceAccount &&
    payload.email?.toLowerCase() !== expectedServiceAccount.toLowerCase()
  ) {
    return false;
  }

  if (expectedServiceAccount && payload.email_verified === false) {
    return false;
  }

  const jwk = await fetchGoogleJwk(header.kid);

  if (!jwk) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  return verifier.verify(
    createPublicKey({
      key: jwk,
      format: "jwk",
    }),
    Buffer.from(encodedSignature, "base64url"),
  );
}

async function verifyPubSubRequest(request: Request) {
  if (verifyLocalToken(request)) {
    return true;
  }

  const bearerToken = getBearerToken(request);

  if (!bearerToken) {
    return false;
  }

  try {
    return await verifyGoogleOidcJwt(bearerToken, request);
  } catch (error) {
    console.error(
      "[gmail-pubsub] OIDC verification failed",
      JSON.stringify(
        sanitizeDiagnostics({
          error: sanitizeErrorMessage(
            error,
            "Unknown Gmail Pub/Sub OIDC verification error.",
          ),
        }),
      ),
    );

    return false;
  }
}

function toPubSubEnvelope(value: unknown): PubSubPushEnvelope | null {
  return isObject(value) ? (value as PubSubPushEnvelope) : null;
}

function readPubSubMessageId(envelope: PubSubPushEnvelope) {
  return (
    readString(envelope.message?.messageId) ??
    readString(envelope.message?.message_id)
  );
}

function readGmailPubSubData(envelope: PubSubPushEnvelope) {
  const encodedData = readString(envelope.message?.data);

  if (!encodedData) {
    return null;
  }

  const decoded = decodeBase64Json<GmailPubSubData>(encodedData);

  if (!decoded || !isObject(decoded)) {
    return null;
  }

  const emailAddress = readString(decoded.emailAddress);
  const historyId =
    typeof decoded.historyId === "number"
      ? String(decoded.historyId)
      : readString(decoded.historyId);

  if (!emailAddress || !historyId) {
    return null;
  }

  return {
    emailAddress,
    historyId,
  };
}

async function findConnectedGmailIntegration(emailAddress: string) {
  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      platform: "EMAIL",
      externalAccountId: emailAddress,
      status: {
        in: ["CONNECTED", "SYNC_IN_PROGRESS"],
      },
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      platformMetadataJson: true,
    },
    take: 2,
  });

  if (integrations.length !== 1) {
    return {
      integration: null,
      reason: integrations.length === 0
        ? "no_connected_integration"
        : "ambiguous_connected_integrations",
    };
  }

  return {
    integration: integrations[0] as GmailIntegrationRouteRecord,
    reason: null,
  };
}

function logIgnoredNotification(input: {
  emailAddress?: string | null;
  messageId?: string | null;
  reason: string;
}) {
  console.info(
    "[gmail-pubsub] ignored notification",
    JSON.stringify(
      sanitizeDiagnostics({
        emailAddress: input.emailAddress ?? null,
        messageId: input.messageId ?? null,
        reason: input.reason,
      }),
    ),
  );
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit({
    key: `gmail-pubsub:${getClientIpFromHeaders(request.headers)}`,
    limit: 300,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  if (!(await verifyPubSubRequest(request))) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_auth",
      },
      {
        status: 401,
      },
    );
  }

  const rawBody = await request.text();

  if (!rawBody) {
    return jsonResponse(
      {
        ok: false,
        error: "empty_body",
      },
      {
        status: 400,
      },
    );
  }

  let envelope: PubSubPushEnvelope | null = null;
  try {
    envelope = toPubSubEnvelope(JSON.parse(rawBody));
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: sanitizeErrorMessage(error, "invalid_json"),
      },
      {
        status: 400,
      },
    );
  }

  if (!envelope) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_payload",
      },
      {
        status: 400,
      },
    );
  }

  const pubSubMessageId = readPubSubMessageId(envelope);
  const data = readGmailPubSubData(envelope);

  if (!pubSubMessageId || !data) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_pubsub_message",
      },
      {
        status: 400,
      },
    );
  }

  const { integration, reason } = await findConnectedGmailIntegration(
    data.emailAddress,
  );

  if (!integration) {
    logIgnoredNotification({
      emailAddress: data.emailAddress,
      messageId: pubSubMessageId,
      reason: reason ?? "integration_not_found",
    });

    return jsonResponse(
      {
        ok: true,
        ignored: true,
        reason: reason ?? "integration_not_found",
      },
      {
        status: 202,
      },
    );
  }

  if (!readGmailLiveSyncEnabled(integration.platformMetadataJson)) {
    logIgnoredNotification({
      emailAddress: data.emailAddress,
      messageId: pubSubMessageId,
      reason: "live_sync_disabled",
    });

    return jsonResponse(
      {
        ok: true,
        ignored: true,
        reason: "live_sync_disabled",
      },
      {
        status: 202,
      },
    );
  }

  try {
    const result = await ingestGmailPushNotification({
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      emailAddress: data.emailAddress,
      pubSubMessageId,
      notificationHistoryId: data.historyId,
      receivedAt: new Date(),
      rawPayloadJson: envelope as Record<string, unknown>,
    });

    return jsonResponse({
      ok: true,
      ingested: result.status === "processed",
      status: result.status,
      threadCount: result.threadCount,
      messageCount: result.messageCount,
      insertedEventCount: result.insertedEventCount,
    });
  } catch (error) {
    console.error(
      "[gmail-pubsub] ingestion failed",
      JSON.stringify(
        sanitizeDiagnostics({
          emailAddress: data.emailAddress,
          pubSubMessageId,
          integrationId: integration.id,
          error: sanitizeErrorMessage(
            error,
            "Unknown Gmail Pub/Sub ingestion error.",
          ),
        }),
      ),
    );

    return jsonResponse(
      {
        ok: false,
        error: "ingestion_failed",
      },
      {
        status: 500,
      },
    );
  }
}
