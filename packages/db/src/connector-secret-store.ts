import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { ConnectorSecret } from "@prisma/client";

import { getPrisma } from "./client";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const ENVOY_SECRET_ENCRYPTION_KEY = "ENVOY_SECRET_ENCRYPTION_KEY";

type SecretEnvelope = {
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type SecretPayload = Record<string, unknown>;

export type StoredSecret<TPayload extends SecretPayload = SecretPayload> = {
  id: string;
  workspaceId: string;
  integrationId: string | null;
  secretType: string;
  secretRef: string;
  version: number;
  payload: TPayload;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
};

export type CreateSecretInput<TPayload extends SecretPayload = SecretPayload> = {
  workspaceId: string;
  integrationId?: string | null;
  secretType: string;
  payload: TPayload;
  secretRef?: string;
};

export type GetSecretInput = {
  secretRef: string;
  workspaceId?: string;
  includeRevoked?: boolean;
};

export type UpdateSecretInput<TPayload extends SecretPayload = SecretPayload> = {
  secretRef: string;
  workspaceId?: string;
  integrationId?: string | null;
  secretType?: string;
  payload: TPayload;
};

export type RotateSecretInput<TPayload extends SecretPayload = SecretPayload> = {
  secretRef: string;
  workspaceId?: string;
  integrationId?: string | null;
  secretType?: string;
  payload: TPayload;
};

export type RevokeSecretInput = {
  secretRef: string;
  workspaceId?: string;
};

function getEncryptionKey() {
  const rawKey = process.env[ENVOY_SECRET_ENCRYPTION_KEY];

  if (!rawKey) {
    throw new Error(`${ENVOY_SECRET_ENCRYPTION_KEY} is not set`);
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  const base64Key = Buffer.from(rawKey, "base64");

  if (base64Key.length === 32) {
    return base64Key;
  }

  return createHash("sha256").update(rawKey, "utf8").digest();
}

function encryptPayload(payload: SecretPayload) {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope: SecretEnvelope = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  return JSON.stringify(envelope);
}

function decryptPayload<TPayload extends SecretPayload>(encryptedPayload: string) {
  const envelope = JSON.parse(encryptedPayload) as SecretEnvelope;
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(envelope.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as TPayload;
}

function mapStoredSecret<TPayload extends SecretPayload>(record: ConnectorSecret) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    integrationId: record.integrationId,
    secretType: record.secretType,
    secretRef: record.secretRef,
    version: record.version,
    payload: decryptPayload<TPayload>(record.encryptedPayload),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revokedAt: record.revokedAt,
  } satisfies StoredSecret<TPayload>;
}

export async function createSecret<TPayload extends SecretPayload>(
  input: CreateSecretInput<TPayload>,
) {
  const prisma = getPrisma();
  const record = await prisma.connectorSecret.create({
    data: {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId ?? null,
      secretType: input.secretType,
      secretRef: input.secretRef,
      encryptedPayload: encryptPayload(input.payload),
    },
  });

  return mapStoredSecret<TPayload>(record);
}

export async function getSecret<TPayload extends SecretPayload>(
  input: GetSecretInput,
) {
  const prisma = getPrisma();
  const record = await prisma.connectorSecret.findFirst({
    where: {
      secretRef: input.secretRef,
      workspaceId: input.workspaceId,
      revokedAt: input.includeRevoked ? undefined : null,
    },
  });

  if (!record) {
    return null;
  }

  return mapStoredSecret<TPayload>(record);
}

export async function updateSecret<TPayload extends SecretPayload>(
  input: UpdateSecretInput<TPayload>,
) {
  const prisma = getPrisma();
  const existing = await prisma.connectorSecret.findFirst({
    where: {
      secretRef: input.secretRef,
      workspaceId: input.workspaceId,
      revokedAt: null,
    },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.connectorSecret.update({
    where: {
      id: existing.id,
    },
    data: {
      integrationId:
        input.integrationId === undefined ? existing.integrationId : input.integrationId,
      secretType: input.secretType ?? existing.secretType,
      encryptedPayload: encryptPayload(input.payload),
    },
  });

  return mapStoredSecret<TPayload>(record);
}

export async function rotateSecret<TPayload extends SecretPayload>(
  input: RotateSecretInput<TPayload>,
) {
  const prisma = getPrisma();
  const existing = await prisma.connectorSecret.findFirst({
    where: {
      secretRef: input.secretRef,
      workspaceId: input.workspaceId,
      revokedAt: null,
    },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.connectorSecret.update({
    where: {
      id: existing.id,
    },
    data: {
      integrationId:
        input.integrationId === undefined ? existing.integrationId : input.integrationId,
      secretType: input.secretType ?? existing.secretType,
      encryptedPayload: encryptPayload(input.payload),
      version: {
        increment: 1,
      },
    },
  });

  return mapStoredSecret<TPayload>(record);
}

export async function revokeSecret(input: RevokeSecretInput) {
  const prisma = getPrisma();
  const existing = await prisma.connectorSecret.findFirst({
    where: {
      secretRef: input.secretRef,
      workspaceId: input.workspaceId,
      revokedAt: null,
    },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.connectorSecret.update({
    where: {
      id: existing.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return mapStoredSecret<SecretPayload>(record);
}
