import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_MATERIAL_TYPES, type OAuthAuthMaterial } from "./credentials";
import {
  SLACK_MVP_BOT_SCOPES,
  SLACK_MVP_USER_SCOPES,
  SLACK_PROVIDER,
} from "./slack";

export const SLACK_OAUTH_AUTH_BASE_URL =
  "https://slack.com/oauth/v2/authorize";
export const SLACK_OAUTH_DEFAULT_STATE_TTL_SECONDS = 10 * 60;
export const SLACK_OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access";
export const SLACK_AUTH_TEST_URL = "https://slack.com/api/auth.test";

const SLACK_OAUTH_CLIENT_ID_ENV = "SLACK_OAUTH_CLIENT_ID";
const SLACK_OAUTH_CLIENT_SECRET_ENV = "SLACK_OAUTH_CLIENT_SECRET";
const SLACK_OAUTH_REDIRECT_URI_ENV = "SLACK_OAUTH_REDIRECT_URI";
const SLACK_OAUTH_STATE_SECRET_ENV = "SLACK_OAUTH_STATE_SECRET";
const SLACK_OAUTH_STATE_TTL_ENV = "SLACK_OAUTH_STATE_TTL_SECONDS";
const SLACK_OAUTH_AUTH_BASE_URL_ENV = "SLACK_OAUTH_AUTH_BASE_URL";
const SLACK_OAUTH_ACCESS_URL_ENV = "SLACK_OAUTH_ACCESS_URL";
const SLACK_AUTH_TEST_URL_ENV = "SLACK_AUTH_TEST_URL";

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
  clientSecret: string;
  redirectUri: string;
  authorizationBaseUrl: string;
  accessUrl: string;
  authTestUrl: string;
  stateSecret: string;
  stateTtlSeconds: number;
  botScopes: readonly string[];
  userScopes: readonly string[];
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

export type SlackOAuthAccessResponse = {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id?: string;
    name?: string;
  };
  enterprise?: {
    id?: string;
    name?: string;
  };
  authed_user?: {
    id?: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  error?: string;
};

export type SlackWorkspaceIdentity = {
  teamId: string;
  teamName?: string | null;
  workspaceUrl?: string | null;
  botUserId?: string | null;
  userId?: string | null;
};

export type SlackOAuthExchangeResult = {
  authMaterial: OAuthAuthMaterial;
  accessResponse: SlackOAuthAccessResponse;
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
    clientSecret: getRequiredEnv(SLACK_OAUTH_CLIENT_SECRET_ENV),
    redirectUri: getRequiredEnv(SLACK_OAUTH_REDIRECT_URI_ENV),
    authorizationBaseUrl:
      process.env[SLACK_OAUTH_AUTH_BASE_URL_ENV] ?? SLACK_OAUTH_AUTH_BASE_URL,
    accessUrl:
      process.env[SLACK_OAUTH_ACCESS_URL_ENV] ?? SLACK_OAUTH_ACCESS_URL,
    authTestUrl:
      process.env[SLACK_AUTH_TEST_URL_ENV] ?? SLACK_AUTH_TEST_URL,
    stateSecret: getRequiredEnv(SLACK_OAUTH_STATE_SECRET_ENV),
    stateTtlSeconds: parsedTtl,
    botScopes: SLACK_MVP_BOT_SCOPES,
    userScopes: SLACK_MVP_USER_SCOPES,
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
  url.searchParams.set("scope", config.botScopes.join(","));
  if (config.userScopes.length > 0) {
    url.searchParams.set("user_scope", config.userScopes.join(","));
  }
  url.searchParams.set("state", state);

  return {
    authorizationUrl: url.toString(),
    state,
    statePayload,
  };
}

async function readJsonResponse<T>(response: Response) {
  const text = await response.text();

  if (!text) {
    return null as T | null;
  }

  return JSON.parse(text) as T;
}

export async function exchangeSlackAuthorizationCode(input: {
  code: string;
  redirectUri?: string;
}): Promise<SlackOAuthExchangeResult> {
  const config = getSlackOAuthConfig();
  const response = await fetch(config.accessUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: input.redirectUri ?? config.redirectUri,
    }),
    cache: "no-store",
  });
  const accessResponse = await readJsonResponse<SlackOAuthAccessResponse>(response);

  if (
    !response.ok ||
    !accessResponse?.ok ||
    !accessResponse.access_token ||
    !accessResponse.authed_user?.access_token
  ) {
    throw new Error("Slack OAuth code exchange failed.");
  }

  const botScopes = accessResponse.scope
    ? accessResponse.scope.split(",").filter(Boolean)
    : [...SLACK_MVP_BOT_SCOPES];
  const userScopes = accessResponse.authed_user.scope
    ? accessResponse.authed_user.scope.split(",").filter(Boolean)
    : [...SLACK_MVP_USER_SCOPES];

  return {
    authMaterial: {
      type: AUTH_MATERIAL_TYPES.OAUTH,
      accessToken: accessResponse.access_token,
      refreshToken: null,
      expiresAt: null,
      scopes: [...new Set([...botScopes, ...userScopes])],
      providerAccountId: accessResponse.team?.id ?? null,
      tokenType: accessResponse.token_type ?? "bot",
      idToken: null,
      providerAccessTokens: {
        botAccessToken: accessResponse.access_token,
        botScopes,
        userAccessToken: accessResponse.authed_user.access_token,
        userScopes,
        userId: accessResponse.authed_user.id ?? null,
        userTokenType: accessResponse.authed_user.token_type ?? "user",
      },
    },
    accessResponse,
  };
}

export async function fetchSlackWorkspaceIdentity(
  accessToken: string,
  options?: {
    botUserId?: string | null;
  },
): Promise<SlackWorkspaceIdentity> {
  const config = getSlackOAuthConfig();
  const response = await fetch(config.authTestUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const authTest = await readJsonResponse<{
    ok?: boolean;
    error?: string;
    url?: string;
    team?: string;
    user?: string;
    team_id?: string;
    user_id?: string;
    bot_id?: string;
  }>(response);

  if (!response.ok || !authTest?.ok || !authTest.team_id) {
    throw new Error("Unable to fetch Slack workspace identity.");
  }

  return {
    teamId: authTest.team_id,
    teamName: authTest.team ?? null,
    workspaceUrl: authTest.url ?? null,
    botUserId: authTest.bot_id ?? options?.botUserId ?? null,
    userId: authTest.user_id ?? null,
  };
}
