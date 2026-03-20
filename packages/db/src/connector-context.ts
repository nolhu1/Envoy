import type {
  ConnectorAuthMaterial,
  ConnectorContext,
  JsonValue,
} from "../../connectors/src";
import type { Integration } from "@prisma/client";

import { getPrisma } from "./client";
import { getSecret } from "./connector-secret-store";

type ResolvableIntegrationRecord = Pick<
  Integration,
  | "id"
  | "workspaceId"
  | "platform"
  | "externalAccountId"
  | "configJson"
  | "platformMetadataJson"
>;

export type ResolveConnectorContextByIdInput = {
  workspaceId: string;
  integrationId: string;
};

export type ResolveConnectorContextFromIntegrationInput = {
  workspaceId: string;
  integration: ResolvableIntegrationRecord;
  secretRef?: string | null;
};

function assertIntegrationWorkspaceOwnership(
  integration: ResolvableIntegrationRecord,
  workspaceId: string,
) {
  if (integration.workspaceId !== workspaceId) {
    throw new Error("Integration does not belong to the requested workspace");
  }
}

async function findActiveSecretForIntegration(
  workspaceId: string,
  integrationId: string,
) {
  const prisma = getPrisma();

  return prisma.connectorSecret.findFirst({
    where: {
      workspaceId,
      integrationId,
      revokedAt: null,
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
  });
}

async function resolveIntegrationSecret(
  input: ResolveConnectorContextFromIntegrationInput,
) {
  const resolvedSecretRef =
    input.secretRef ??
    (
      await findActiveSecretForIntegration(
        input.workspaceId,
        input.integration.id,
      )
    )?.secretRef;

  if (!resolvedSecretRef) {
    return {
      authMaterial: null,
      secretRef: null,
    } satisfies Pick<ConnectorContext, "authMaterial" | "secretRef">;
  }

  const secretRecord = await getSecret<ConnectorAuthMaterial>({
    secretRef: resolvedSecretRef,
    workspaceId: input.workspaceId,
  });

  if (!secretRecord) {
    return {
      authMaterial: null,
      secretRef: null,
    } satisfies Pick<ConnectorContext, "authMaterial" | "secretRef">;
  }

  if (
    secretRecord.integrationId &&
    secretRecord.integrationId !== input.integration.id
  ) {
    throw new Error("Secret does not belong to the requested integration");
  }

  return {
    authMaterial: secretRecord.payload,
    secretRef: {
      id: resolvedSecretRef,
      version: String(secretRecord.version),
    },
  } satisfies Pick<ConnectorContext, "authMaterial" | "secretRef">;
}

function mapIntegrationToConnectorContext(
  integration: ResolvableIntegrationRecord,
  resolvedSecret: Pick<ConnectorContext, "authMaterial" | "secretRef">,
) {
  return {
    workspaceId: integration.workspaceId,
    integrationId: integration.id,
    platform: integration.platform,
    externalAccountId: integration.externalAccountId,
    config: integration.configJson as JsonValue | null,
    platformMetadataJson: integration.platformMetadataJson as JsonValue | null,
    secretRef: resolvedSecret.secretRef,
    authMaterial: resolvedSecret.authMaterial,
  } satisfies ConnectorContext;
}

export async function resolveConnectorContextForWorkspaceIntegration(
  input: ResolveConnectorContextByIdInput,
) {
  const prisma = getPrisma();
  const integration = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      externalAccountId: true,
      configJson: true,
      platformMetadataJson: true,
    },
  });

  if (!integration) {
    return null;
  }

  return resolveConnectorContextFromIntegration({
    workspaceId: input.workspaceId,
    integration,
  });
}

export async function resolveConnectorContextFromIntegration(
  input: ResolveConnectorContextFromIntegrationInput,
) {
  assertIntegrationWorkspaceOwnership(input.integration, input.workspaceId);

  const resolvedSecret = await resolveIntegrationSecret(input);

  return mapIntegrationToConnectorContext(input.integration, resolvedSecret);
}
