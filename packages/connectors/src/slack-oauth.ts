import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { SLACK_MVP_SCOPES, SLACK_PROVIDER } from "./slack";

export const SLACK_OAUTH_AUTH_BASE_URL =
  "https://slack.com/oauth/v2/authorize";
export const SLACK_OAUTH_DEFAULT_STATE_TTL_SECONDS = 10 * 60;

const SLACK_OAUTH_CLIENT_ID_ENV = "SLACK_OAUTH_CLIENT_ID";
const SLACK_OAUTH_REDIRECT_URI_ENV = "SLACK_OAUTH_REDIRECT_URI";
const SLACK_OAUTH_STATE_SECRET_ENV = "SLACK_OAUTH_STATE_SECRET";
const SLACK_OAUTH_STATE_TTL_ENV = "SLACK_OAUTH_STATE_TTL_SECONDS";
const SLACK_OAUTH_AUTH_BASE_URL_ENV = "SLACK_OAUTH_AUTH_BASE_URL";

export type SlackOAuthStatePayload = {
  workspaceId: string;
  initiatingUserId: string;
  provider: typeof SLACK_PROVIDER;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type SlackOAuthConfig = {
  clientId: string;
  redirectUri: string;
  authorizationBaseUrl: string;
  stateSecret: string;
  stateTtlSeconds: number;
  scopes: readonly string[];
};

export type SlackAuthorizationUrlInput = {
  workspaceId: string;
  initiatingUserId: string;
  statePayload?: Partial<Pick<SlackOAuthStatePayload, "nonce">>;
};

export type SlackAuthorizationUrlResult = {
  authorizationUrl: string;
  state: string;
  statePayload: SlackOAuthStatePayload;
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
    throw new Error("Invalid Slack OAuth state format");
  }

  return { payload, signature };
}

export function getSlackOAuthConfig(): SlackOAuthConfig {
  const ttlValue = process.env[SLACK_OAUTH_STATE_TTL_ENV];
  const parsedTtl = ttlValue ? Number(ttlValue) : SLACK_OAUTH_DEFAULT_STATE_TTL_SECONDS;

  if (!Number.isFinite(parsedTtl) || parsedTtl <= 0) {
    throw new Error(`${SLACK_OAUTH_STATE_TTL_ENV} must be a positive number`);
  }

  return {
    clientId: getRequiredEnv(SLACK_OAUTH_CLIENT_ID_ENV),
    redirectUri: getRequiredEnv(SLACK_OAUTH_REDIRECT_URI_ENV),
    authorizationBaseUrl:
      process.env[SLACK_OAUTH_AUTH_BASE_URL_ENV] ?? SLACK_OAUTH_AUTH_BASE_URL,
    stateSecret: getRequiredEnv(SLACK_OAUTH_STATE_SECRET_ENV),
    stateTtlSeconds: parsedTtl,
    scopes: SLACK_MVP_SCOPES,
  };
}

export function createSlackOAuthStatePayload(input: {
  workspaceId: string;
  initiatingUserId: string;
  nonce?: string;
  now?: Date;
  ttlSeconds?: number;
}): SlackOAuthStatePayload {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const ttlSeconds =
    input.ttlSeconds ?? getSlackOAuthConfig().stateTtlSeconds;

  return {
    workspaceId: input.workspaceId,
    initiatingUserId: input.initiatingUserId,
    provider: SLACK_PROVIDER,
    nonce: input.nonce ?? randomBytes(16).toString("hex"),
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
}

export function signAndEncodeSlackOAuthState(
  payload: SlackOAuthStatePayload,
  secret = getSlackOAuthConfig().stateSecret,
) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createStateSignature(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function decodeAndVerifySlackOAuthState(
  state: string,
  secret = getSlackOAuthConfig().stateSecret,
): SlackOAuthStatePayload {
  const { payload, signature } = parseStateEnvelope(state);
  const expectedSignature = createStateSignature(payload, secret);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error("Invalid Slack OAuth state signature");
  }

  return JSON.parse(base64UrlDecode(payload)) as SlackOAuthStatePayload;
}

export function validateSlackOAuthStatePayload(
  payload: SlackOAuthStatePayload,
  now = new Date(),
) {
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (payload.provider !== SLACK_PROVIDER) {
    throw new Error("Invalid Slack OAuth state provider");
  }

  if (!payload.workspaceId || !payload.initiatingUserId || !payload.nonce) {
    throw new Error("Invalid Slack OAuth state payload");
  }

  if (payload.expiresAt <= nowSeconds) {
    throw new Error("Expired Slack OAuth state");
  }

  if (payload.issuedAt > nowSeconds + 60) {
    throw new Error("Invalid Slack OAuth state issuedAt");
  }

  return payload;
}

export function decodeVerifyAndValidateSlackOAuthState(
  state: string,
  options?: {
    secret?: string;
    now?: Date;
  },
) {
  const payload = decodeAndVerifySlackOAuthState(state, options?.secret);

  return validateSlackOAuthStatePayload(payload, options?.now);
}

export function buildSlackAuthorizationUrl(
  input: SlackAuthorizationUrlInput,
): SlackAuthorizationUrlResult {
  const config = getSlackOAuthConfig();
  const statePayload = createSlackOAuthStatePayload({
    workspaceId: input.workspaceId,
    initiatingUserId: input.initiatingUserId,
    nonce: input.statePayload?.nonce,
    ttlSeconds: config.stateTtlSeconds,
  });
  const state = signAndEncodeSlackOAuthState(statePayload, config.stateSecret);
  const url = new URL(config.authorizationBaseUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("state", state);

  return {
    authorizationUrl: url.toString(),
    state,
    statePayload,
  };
}
