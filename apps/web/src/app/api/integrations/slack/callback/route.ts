import {
  decodeVerifyAndValidateSlackOAuthState,
  exchangeSlackAuthorizationCode,
  fetchSlackWorkspaceIdentity,
} from "@envoy/connectors";
import { createSecret, getPrisma, rotateSecret } from "@envoy/db";
import { NextResponse } from "next/server";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getWorkspaceByIdForCurrentUser } from "@/lib/workspace";

const SLACK_SECRET_TYPE = "slack_oauth";
const SETTINGS_PATH = "/settings/workspace";

function getRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`;
  }

  const host = request.headers.get("host");

  if (host) {
    return `${forwardedProto ?? url.protocol.replace(":", "")}://${host}`;
  }

  return url.origin;
}

function buildSettingsRedirect(request: Request, params?: URLSearchParams) {
  const url = new URL(SETTINGS_PATH, getRequestOrigin(request));

  if (params) {
    url.search = params.toString();
  }

  return NextResponse.redirect(url);
}

function buildErrorRedirect(request: Request, message: string) {
  const params = new URLSearchParams({
    integration: "slack",
    status: "error",
    message,
  });

  return buildSettingsRedirect(request, params);
}

function buildSuccessRedirect(request: Request) {
  const params = new URLSearchParams({
    integration: "slack",
    status: "connected",
  });

  return buildSettingsRedirect(request, params);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return buildErrorRedirect(request, "Slack OAuth install was denied.");
  }

  if (!code || !state) {
    return buildErrorRedirect(request, "Missing Slack OAuth callback parameters.");
  }

  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return NextResponse.redirect(new URL("/sign-in", getRequestOrigin(request)));
  }

  if (!hasPermission(authContext.role, PERMISSIONS.CONNECT_INTEGRATIONS)) {
    return buildErrorRedirect(
      request,
      "You do not have permission to connect integrations.",
    );
  }

  let integrationId: string | null = null;

  try {
    const validatedState = decodeVerifyAndValidateSlackOAuthState(state);

    if (
      validatedState.workspaceId !== authContext.workspaceId ||
      validatedState.initiatingUserId !== authContext.userId
    ) {
      throw new Error("Slack OAuth state does not match the current session.");
    }

    const workspace = await getWorkspaceByIdForCurrentUser(validatedState.workspaceId);

    if (!workspace) {
      throw new Error("The current workspace could not be loaded.");
    }

    const { authMaterial, accessResponse } = await exchangeSlackAuthorizationCode({ code });
    const identity = await fetchSlackWorkspaceIdentity(authMaterial.accessToken, {
      botUserId: accessResponse.bot_user_id ?? null,
    });
    const prisma = getPrisma();
    const externalAccountId = identity.teamId;
    const displayName = identity.teamName ?? identity.teamId;
    const platformMetadataJson = {
      provider: "slack",
      slackTeamId: identity.teamId,
      slackTeamName: identity.teamName ?? null,
      slackWorkspaceUrl: identity.workspaceUrl ?? null,
      slackBotUserId: identity.botUserId ?? null,
      slackInstallingUserId:
        authMaterial.providerAccessTokens?.userId ?? identity.userId ?? null,
      grantedScopes: authMaterial.scopes ?? [],
      grantedBotScopes: authMaterial.providerAccessTokens?.botScopes ?? [],
      grantedUserScopes: authMaterial.providerAccessTokens?.userScopes ?? [],
    };

    const existingIntegration = await prisma.integration.findFirst({
      where: {
        workspaceId: workspace.id,
        platform: "SLACK",
        externalAccountId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    const integration = existingIntegration
      ? await prisma.integration.update({
          where: {
            id: existingIntegration.id,
          },
          data: {
            authType: "oauth",
            displayName,
            status: "PENDING",
            platformMetadataJson,
            deletedAt: null,
          },
        })
      : await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            platform: "SLACK",
            externalAccountId,
            displayName,
            authType: "oauth",
            status: "PENDING",
            platformMetadataJson,
          },
        });

    integrationId = integration.id;

    const existingSecret = await prisma.connectorSecret.findFirst({
      where: {
        workspaceId: workspace.id,
        integrationId: integration.id,
        revokedAt: null,
      },
      select: {
        secretRef: true,
      },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    });

    authMaterial.providerAccountId = externalAccountId;

    if (existingSecret) {
      await rotateSecret({
        secretRef: existingSecret.secretRef,
        workspaceId: workspace.id,
        integrationId: integration.id,
        secretType: SLACK_SECRET_TYPE,
        payload: authMaterial,
      });
    } else {
      await createSecret({
        workspaceId: workspace.id,
        integrationId: integration.id,
        secretType: SLACK_SECRET_TYPE,
        payload: authMaterial,
      });
    }

    await prisma.integration.update({
      where: {
        id: integration.id,
      },
      data: {
        status: "CONNECTED",
        displayName,
        authType: "oauth",
        platformMetadataJson: {
          ...platformMetadataJson,
          connectedAt: new Date().toISOString(),
        },
      },
    });

    return buildSuccessRedirect(request);
  } catch (error) {
    if (integrationId) {
      await getPrisma().integration.update({
        where: {
          id: integrationId,
        },
        data: {
          status: "ERROR",
          platformMetadataJson: {
            provider: "slack",
            connectError: error instanceof Error ? error.message : "Unknown error",
          },
        },
      });
    }

    return buildErrorRedirect(
      request,
      error instanceof Error ? error.message : "Unable to complete Slack install.",
    );
  }
}
