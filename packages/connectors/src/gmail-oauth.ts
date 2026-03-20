import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { GMAIL_MVP_SCOPES, GMAIL_PROVIDER } from "./gmail";

export const GMAIL_OAUTH_AUTH_BASE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GMAIL_OAUTH_DEFAULT_STATE_TTL_SECONDS = 10 * 60;
export const GMAIL_OAUTH_RESPONSE_TYPE = "code";
export const GMAIL_OAUTH_ACCESS_TYPE = "offline";
export const GMAIL_OAUTH_INCLUDE_GRANTED_SCOPES = "true";
export const GMAIL_OAUTH_PROMPT = "consent";

const GMAIL_OAUTH_CLIENT_ID_ENV = "GMAIL_OAUTH_CLIENT_ID";
const GMAIL_OAUTH_REDIRECT_URI_ENV = "GMAIL_OAUTH_REDIRECT_URI";
const GMAIL_OAUTH_STATE_SECRET_ENV = "GMAIL_OAUTH_STATE_SECRET";
const GMAIL_OAUTH_STATE_TTL_ENV = "GMAIL_OAUTH_STATE_TTL_SECONDS";
const GMAIL_OAUTH_AUTH_BASE_URL_ENV = "GMAIL_OAUTH_AUTH_BASE_URL";

export type GmailOAuthStatePayload = {
  workspaceId: string;
  initiatingUserId: string;
  provider: typeof GMAIL_PROVIDER;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type GmailOAuthConfig = {
  clientId: string;
  redirectUri: string;
  authorizationBaseUrl: string;
  stateSecret: string;
  stateTtlSeconds: number;
  scopes: readonly string[];
};

export type GmailAuthorizationUrlInput = {
  workspaceId: string;
  initiatingUserId: string;
  loginHint?: string | null;
  statePayload?: Partial<Pick<GmailOAuthStatePayload, "nonce">>;
};

export type GmailAuthorizationUrlResult = {
  authorizationUrl: string;
  state: string;
  statePayload: GmailOAuthStatePayload;
};

type SignedStateEnvelope = {
  payload: string;
  signature: string;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function createStateSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseStateEnvelope(state: string): SignedStateEnvelope {
  const [payload, signature] = state.split(".");

  if (!payload || !signature) {
    throw new Error("Invalid Gmail OAuth state format");
  }

  return { payload, signature };
}

export function getGmailOAuthConfig(): GmailOAuthConfig {
  const ttlValue = process.env[GMAIL_OAUTH_STATE_TTL_ENV];
  const parsedTtl = ttlValue ? Number(ttlValue) : GMAIL_OAUTH_DEFAULT_STATE_TTL_SECONDS;

  if (!Number.isFinite(parsedTtl) || parsedTtl <= 0) {
    throw new Error(`${GMAIL_OAUTH_STATE_TTL_ENV} must be a positive number`);
  }

  return {
    clientId: getRequiredEnv(GMAIL_OAUTH_CLIENT_ID_ENV),
    redirectUri: getRequiredEnv(GMAIL_OAUTH_REDIRECT_URI_ENV),
    authorizationBaseUrl:
      process.env[GMAIL_OAUTH_AUTH_BASE_URL_ENV] ?? GMAIL_OAUTH_AUTH_BASE_URL,
    stateSecret: getRequiredEnv(GMAIL_OAUTH_STATE_SECRET_ENV),
    stateTtlSeconds: parsedTtl,
    scopes: GMAIL_MVP_SCOPES,
  };
}

export function createGmailOAuthStatePayload(input: {
  workspaceId: string;
  initiatingUserId: string;
  nonce?: string;
  now?: Date;
  ttlSeconds?: number;
}): GmailOAuthStatePayload {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const ttlSeconds =
    input.ttlSeconds ?? getGmailOAuthConfig().stateTtlSeconds;

  return {
    workspaceId: input.workspaceId,
    initiatingUserId: input.initiatingUserId,
    provider: GMAIL_PROVIDER,
    nonce: input.nonce ?? randomBytes(16).toString("hex"),
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
}

export function signAndEncodeGmailOAuthState(
  payload: GmailOAuthStatePayload,
  secret = getGmailOAuthConfig().stateSecret,
) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createStateSignature(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function decodeAndVerifyGmailOAuthState(
  state: string,
  secret = getGmailOAuthConfig().stateSecret,
): GmailOAuthStatePayload {
  const { payload, signature } = parseStateEnvelope(state);
  const expectedSignature = createStateSignature(payload, secret);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error("Invalid Gmail OAuth state signature");
  }

  return JSON.parse(base64UrlDecode(payload)) as GmailOAuthStatePayload;
}

export function validateGmailOAuthStatePayload(
  payload: GmailOAuthStatePayload,
  now = new Date(),
) {
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (payload.provider !== GMAIL_PROVIDER) {
    throw new Error("Invalid Gmail OAuth state provider");
  }

  if (!payload.workspaceId || !payload.initiatingUserId || !payload.nonce) {
    throw new Error("Invalid Gmail OAuth state payload");
  }

  if (payload.expiresAt <= nowSeconds) {
    throw new Error("Expired Gmail OAuth state");
  }

  if (payload.issuedAt > nowSeconds + 60) {
    throw new Error("Invalid Gmail OAuth state issuedAt");
  }

  return payload;
}

export function decodeVerifyAndValidateGmailOAuthState(
  state: string,
  options?: {
    secret?: string;
    now?: Date;
  },
) {
  const payload = decodeAndVerifyGmailOAuthState(state, options?.secret);

  return validateGmailOAuthStatePayload(payload, options?.now);
}

export function buildGmailAuthorizationUrl(
  input: GmailAuthorizationUrlInput,
): GmailAuthorizationUrlResult {
  const config = getGmailOAuthConfig();
  const statePayload = createGmailOAuthStatePayload({
    workspaceId: input.workspaceId,
    initiatingUserId: input.initiatingUserId,
    nonce: input.statePayload?.nonce,
    ttlSeconds: config.stateTtlSeconds,
  });
  const state = signAndEncodeGmailOAuthState(statePayload, config.stateSecret);
  const url = new URL(config.authorizationBaseUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", GMAIL_OAUTH_RESPONSE_TYPE);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", GMAIL_OAUTH_ACCESS_TYPE);
  url.searchParams.set(
    "include_granted_scopes",
    GMAIL_OAUTH_INCLUDE_GRANTED_SCOPES,
  );
  url.searchParams.set("prompt", GMAIL_OAUTH_PROMPT);

  if (input.loginHint) {
    url.searchParams.set("login_hint", input.loginHint);
  }

  return {
    authorizationUrl: url.toString(),
    state,
    statePayload,
  };
}
