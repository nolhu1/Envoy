export const AUTH_MATERIAL_TYPES = {
  OAUTH: "oauth",
  API_KEY: "api_key",
  WEBHOOK_SECRET: "webhook_secret",
} as const;

export type AuthMaterialType =
  (typeof AUTH_MATERIAL_TYPES)[keyof typeof AUTH_MATERIAL_TYPES];

export type SecretRef = {
  id: string;
  handle?: string | null;
  version?: string | null;
};

export type OAuthAuthMaterial = {
  type: typeof AUTH_MATERIAL_TYPES.OAUTH;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  providerAccountId?: string | null;
  tokenType?: string | null;
  idToken?: string | null;
};

export type ApiKeyAuthMaterial = {
  type: typeof AUTH_MATERIAL_TYPES.API_KEY;
  apiKey: string;
  keyId?: string | null;
  label?: string | null;
  signingSecret?: string | null;
  expiresAt?: Date | null;
};

export type WebhookSecretMaterial = {
  type: typeof AUTH_MATERIAL_TYPES.WEBHOOK_SECRET;
  signingSecret?: string | null;
  verificationToken?: string | null;
  endpointSecret?: string | null;
};

export type ConnectorAuthMaterial =
  | OAuthAuthMaterial
  | ApiKeyAuthMaterial
  | WebhookSecretMaterial;
