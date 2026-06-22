import {
  decodeVerifyAndValidateGmailOAuthState,
  exchangeGmailAuthorizationCode,
  fetchGmailAccountProfile,
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

const GMAIL_SECRET_TYPE = "gmail_oauth";
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
    integration: "gmail",
    status: "error",
    message,
  });

  return buildSettingsRedirect(request, params);
}

function buildSuccessRedirect(input: {
  request: Request;
  reconnect: boolean;
  recoveryStatus: "queued" | "partial" | "failed";
}) {
  const params = new URLSearchParams({
    integration: "gmail",
    action: input.reconnect ? "reconnect" : "connect",
    status: "connected",
    recovery: input.recoveryStatus,
  });

  return buildSettingsRedirect(input.request, params);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearRecoverableGmailMetadata(input: {
  previousMetadata: unknown;
  nextMetadata: Record<string, unknown>;
  reconnect: boolean;
}) {
  const previous = isObject(input.previousMetadata) ? input.previousMetadata : {};
  const previousWatch = isObject(previous.gmailWatch) ? previous.gmailWatch : null;
  const now = new Date().toISOString();
  const nextWatch = previousWatch
    ? {
        ...previousWatch,
        status: "RENEWAL_QUEUED",
        lastError: null,
        lastRenewalQueuedAt: now,
      }
    : {
        status: "RENEWAL_QUEUED",
        lastError: null,
        lastRenewalQueuedAt: now,
      };

  return {
    ...previous,
    ...input.nextMetadata,
    gmailLiveSyncEnabled: true,
    connectError: null,
    lastFailureCategory: null,
    lastReconnectAt: input.reconnect ? now : null,
    connectedAt: previous.connectedAt ?? now,
    recovery: {
      historyPreserved: input.reconnect,
      pollingFallbackActive: true,
      syncQueuedAt: now,
      watchRenewalQueuedAt: now,
    },
    gmailWatch: nextWatch,
  };
}

function buildFailedGmailConnectMetadata(input: {
  previousMetadata: unknown;
  error: unknown;
}) {
  const previous = isObject(input.previousMetadata) ? input.previousMetadata : {};

  return {
    ...previous,
    provider: "gmail",
    connectError: sanitizeErrorMessage(
      input.error,
      "Unknown Gmail connect error.",
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

function buildRecoveryWatchDedupeKey(input: {
  workspaceId: string;
  integrationId: string;
  requestedAt: Date;
}) {
  const bucket = Math.floor(input.requestedAt.getTime() / 10_000);

  return `gmail-watch:${input.workspaceId}:${input.integrationId}:reconnect:${bucket}`;
}

async function enqueueGmailRecoveryJobs(input: {
  workspaceId: string;
  integrationId: string;
  userId: string;
  reconnect: boolean;
}) {
  const requestedAtDate = new Date();
  const requestedAt = requestedAtDate.toISOString();
  const results = await Promise.allSettled([
    enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.SYNC,
      jobType: WORKER_JOB_TYPES.SYNC_GMAIL_INTEGRATION,
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
    }),
    enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.MAINTENANCE,
      jobType: WORKER_JOB_TYPES.MAINTENANCE_RENEW_GMAIL_WATCH,
      workspaceId: input.workspaceId,
      payload: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        requestedAt,
        reason: "reconnect",
      },
      dedupeKey: buildRecoveryWatchDedupeKey({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        requestedAt: requestedAtDate,
      }),
      retryPolicy: {
        maxAttempts: 2,
      },
    }),
  ]);

  if (results.every((result) => result.status === "fulfilled")) {
    return "queued" as const;
  }

  if (results.some((result) => result.status === "fulfilled")) {
    return "partial" as const;
  }

  return "failed" as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return buildErrorRedirect(request, "Google OAuth connection was denied.");
  }

  if (!code || !state) {
    return buildErrorRedirect(request, "Missing Gmail OAuth callback parameters.");
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
    const validatedState = decodeVerifyAndValidateGmailOAuthState(state);

    if (
      validatedState.workspaceId !== authContext.workspaceId ||
      validatedState.initiatingUserId !== authContext.userId
    ) {
      throw new Error("Gmail OAuth state does not match the current session.");
    }

    const workspace = await getWorkspaceByIdForCurrentUser(validatedState.workspaceId);

    if (!workspace) {
      throw new Error("The current workspace could not be loaded.");
    }

    const { authMaterial } = await exchangeGmailAuthorizationCode({ code });
    const profile = await fetchGmailAccountProfile(authMaterial.accessToken);
    const prisma = getPrisma();
    const externalAccountId = profile.emailAddress;
    const displayName = profile.emailAddress;
    const nextProviderMetadata = {
      provider: "gmail",
      connectedEmail: profile.emailAddress,
      providerDisplayLabel: displayName,
      grantedScopes: authMaterial.scopes ?? [],
      gmailHistoryId: profile.historyId ?? null,
    };

    const existingIntegration = await prisma.integration.findFirst({
      where: {
        workspaceId: workspace.id,
        platform: "EMAIL",
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
    const supersededIntegrations = await prisma.integration.findMany({
      where: {
        workspaceId: workspace.id,
        platform: "EMAIL",
        deletedAt: null,
        status: {
          not: "DISCONNECTED",
        },
        id: existingIntegration
          ? {
              not: existingIntegration.id,
            }
          : undefined,
      },
      select: {
        id: true,
      },
    });
    const supersededIntegrationIds = supersededIntegrations.map(
      (integration) => integration.id,
    );

    if (supersededIntegrationIds.length > 0) {
      await prisma.$transaction([
        prisma.integration.updateMany({
          where: {
            id: {
              in: supersededIntegrationIds,
            },
            workspaceId: workspace.id,
          },
          data: {
            status: "DISCONNECTED",
            deletedAt: new Date(),
          },
        }),
        prisma.connectorSecret.updateMany({
          where: {
            workspaceId: workspace.id,
            integrationId: {
              in: supersededIntegrationIds,
            },
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        }),
      ]);
    }

    const integration = existingIntegration
      ? existingIntegration
      : await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            platform: "EMAIL",
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
        secretType: GMAIL_SECRET_TYPE,
        payload: authMaterial,
      });
    } else {
      await createSecret({
        workspaceId: workspace.id,
        integrationId: integration.id,
        secretType: GMAIL_SECRET_TYPE,
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
        platformMetadataJson: clearRecoverableGmailMetadata({
          previousMetadata: existingIntegration?.platformMetadataJson,
          nextMetadata: nextProviderMetadata,
          reconnect,
        }),
      },
    });

    const recoveryStatus = await enqueueGmailRecoveryJobs({
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
          platformMetadataJson: {
            ...clearRecoverableGmailMetadata({
              previousMetadata: existingIntegration?.platformMetadataJson,
              nextMetadata: nextProviderMetadata,
              reconnect,
            }),
            recovery: {
              historyPreserved: reconnect,
              pollingFallbackActive: true,
              status: recoveryStatus,
              lastError:
                "Gmail reconnected, but one or more recovery jobs could not be queued.",
              updatedAt: new Date().toISOString(),
            },
          },
        },
      });
      console.warn("[gmail-connect] recovery job enqueue was not fully successful");
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
          platform: "EMAIL",
          externalAccountId,
          status: "CONNECTED",
          metadata: {
            provider: "gmail",
            connectedEmail: profile.emailAddress,
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
          platformMetadataJson: buildFailedGmailConnectMetadata({
            previousMetadata: existing?.platformMetadataJson,
            error,
          }),
        },
      });
    }

    return buildErrorRedirect(
      request,
      sanitizeErrorMessage(error, "Unable to complete Gmail connect."),
    );
  }
}
