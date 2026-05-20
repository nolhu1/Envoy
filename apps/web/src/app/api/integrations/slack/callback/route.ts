import {
  decodeVerifyAndValidateSlackOAuthState,
  exchangeSlackAuthorizationCode,
  fetchSlackWorkspaceIdentity,
} from "@envoy/connectors";
import { createSecret, getPrisma, rotateSecret } from "@envoy/db";
import { NextResponse } from "next/server";
import {
  WORKER_JOB_TYPES,
} from "../../../../../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../../../../../worker/src/queues";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "@/lib/event-publisher";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { sanitizeErrorMessage } from "@/lib/security";
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

function buildSuccessRedirect(input: {
  request: Request;
  reconnect: boolean;
  recoveryStatus: "queued" | "failed";
}) {
  const params = new URLSearchParams({
    integration: "slack",
    action: input.reconnect ? "reconnect" : "connect",
    status: "connected",
    recovery: input.recoveryStatus,
  });

  return buildSettingsRedirect(input.request, params);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearRecoverableSlackMetadata(input: {
  previousMetadata: unknown;
  nextMetadata: Record<string, unknown>;
  reconnect: boolean;
  recoveryStatus?: "queued" | "failed";
}) {
  const previous = isObject(input.previousMetadata) ? input.previousMetadata : {};
  const now = new Date().toISOString();

  return {
    ...previous,
    ...input.nextMetadata,
    connectError: null,
    lastFailureCategory: null,
    lastReconnectAt: input.reconnect ? now : null,
    connectedAt: previous.connectedAt ?? now,
    recovery: {
      historyPreserved: input.reconnect,
      syncQueuedAt: input.recoveryStatus === "queued" ? now : null,
      status: input.recoveryStatus ?? "queued",
    },
  };
}

function buildFailedSlackConnectMetadata(input: {
  previousMetadata: unknown;
  error: unknown;
}) {
  const previous = isObject(input.previousMetadata) ? input.previousMetadata : {};

  return {
    ...previous,
    provider: "slack",
    connectError: sanitizeErrorMessage(
      input.error,
      "Unknown Slack connect error.",
    ),
    lastFailedReconnectAt: new Date().toISOString(),
  };
}

function buildRecoverySyncDedupeKey(input: {
  workspaceId: string;
  integrationId: string;
  requestedAt: Date;
}) {
  const bucket = Math.floor(input.requestedAt.getTime() / 10_000);

  return `sync:${input.workspaceId}:${input.integrationId}:reconnect:${bucket}`;
}

async function enqueueSlackRecoverySync(input: {
  workspaceId: string;
  integrationId: string;
  userId: string;
  reconnect: boolean;
}) {
  const requestedAtDate = new Date();
  const requestedAt = requestedAtDate.toISOString();

  try {
    await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.SYNC,
      jobType: WORKER_JOB_TYPES.SYNC_SLACK_INTEGRATION,
      workspaceId: input.workspaceId,
      payload: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        requestedByUserId: input.userId,
        reason: input.reconnect ? "retry" : "initial",
        requestedAt,
      },
      dedupeKey: buildRecoverySyncDedupeKey({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        requestedAt: requestedAtDate,
      }),
      retryPolicy: {
        maxAttempts: 3,
      },
    });

    return "queued" as const;
  } catch {
    return "failed" as const;
  }
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
    const nextProviderMetadata = {
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
        platformMetadataJson: true,
        status: true,
      },
    });
    const reconnect = Boolean(existingIntegration);

    const integration = existingIntegration
      ? existingIntegration
      : await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            platform: "SLACK",
            externalAccountId,
            displayName,
            authType: "oauth",
            status: "PENDING",
            platformMetadataJson: nextProviderMetadata,
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

    const secretOperation = existingSecret ? "rotated" : "created";

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
        externalAccountId,
        deletedAt: null,
        platformMetadataJson: clearRecoverableSlackMetadata({
          previousMetadata: existingIntegration?.platformMetadataJson,
          nextMetadata: nextProviderMetadata,
          reconnect,
        }),
      },
    });

    const recoveryStatus = await enqueueSlackRecoverySync({
      workspaceId: workspace.id,
      integrationId: integration.id,
      userId: authContext.userId,
      reconnect,
    });

    if (recoveryStatus !== "queued") {
      await prisma.integration.update({
        where: {
          id: integration.id,
        },
        data: {
          platformMetadataJson: clearRecoverableSlackMetadata({
            previousMetadata: existingIntegration?.platformMetadataJson,
            nextMetadata: nextProviderMetadata,
            reconnect,
            recoveryStatus,
          }),
        },
      });
      console.warn("[slack-connect] recovery sync enqueue failed");
    }

    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.INTEGRATION_CONNECTED,
        workspaceId: workspace.id,
        entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
        entityId: integration.id,
        source: ENVOY_EVENT_SOURCES.UI,
        payload: {
          integrationId: integration.id,
          platform: "SLACK",
          externalAccountId,
          status: "CONNECTED",
          metadata: {
            provider: "slack",
            slackTeamId: identity.teamId,
            slackTeamName: identity.teamName ?? null,
            secretOperation,
          },
        },
      }),
    );

    return buildSuccessRedirect({
      request,
      reconnect,
      recoveryStatus,
    });
  } catch (error) {
    if (integrationId) {
      const prisma = getPrisma();
      const existing = await prisma.integration.findUnique({
        where: {
          id: integrationId,
        },
        select: {
          platformMetadataJson: true,
        },
      });

      await prisma.integration.update({
        where: {
          id: integrationId,
        },
        data: {
          status: "ERROR",
          platformMetadataJson: buildFailedSlackConnectMetadata({
            previousMetadata: existing?.platformMetadataJson,
            error,
          }),
        },
      });
    }

    return buildErrorRedirect(
      request,
      sanitizeErrorMessage(error, "Unable to complete Slack install."),
    );
  }
}
