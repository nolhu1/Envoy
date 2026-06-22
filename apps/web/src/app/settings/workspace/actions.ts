"use server";

import { buildGmailAuthorizationUrl } from "@envoy/connectors";
import {
  AGENT_TRIGGER_TYPES,
  createApprovalRequestForAgentDraft,
  getPrisma,
  revokeSecret,
} from "@envoy/db";
import { redirect } from "next/navigation";
import {
  WORKER_JOB_TYPES,
} from "../../../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../../../worker/src/queues";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { PERMISSIONS } from "@/lib/permissions";
import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "@/lib/event-publisher";
import { sanitizeUiErrorMessage } from "@/lib/security";
import { assertRateLimit } from "@/lib/rate-limit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";
import { generateDraftFromPlanner } from "@/lib/draft-generator";
import {
  renewGmailWatchForIntegration,
  setGmailLiveSyncEnabledForIntegration,
} from "@/lib/gmail-ingestion";
import { planAgentResponseForWorkspace } from "@/lib/response-planner";

export async function startGmailConnectAction() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  try {
    assertRateLimit({
      key: `connect:gmail:${authContext.userId}`,
      limit: 6,
      windowMs: 15 * 60_000,
    });
  } catch (error) {
    redirect(
      `/settings/workspace?integration=gmail&action=reconnect&status=error&message=${encodeURIComponent(
        sanitizeUiErrorMessage(error) || "Gmail reconnect is temporarily rate limited.",
      )}`,
    );
  }
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  const { authorizationUrl } = buildGmailAuthorizationUrl({
    workspaceId: workspace.id,
    initiatingUserId: authContext.userId,
    loginHint: authContext.email,
  });

  redirect(authorizationUrl);
}

function toSyncErrorMessage(error: unknown) {
  return sanitizeUiErrorMessage(error) || "Unable to sync integration.";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildDisconnectedMetadata(input: {
  previousMetadata: unknown;
  provider: "gmail";
}) {
  const previous = isJsonObject(input.previousMetadata)
    ? input.previousMetadata
    : {};

  return {
    ...previous,
    provider: input.provider,
    disconnectedAt: new Date().toISOString(),
    recovery: {
      historyPreserved: true,
      reconnectRequired: true,
    },
  };
}

function buildManualSyncDedupeKey(input: {
  workspaceId: string;
  integrationId: string;
  requestedAt: Date;
}) {
  const doubleSubmitBucketMs = 10_000;
  const requestBucket = Math.floor(
    input.requestedAt.getTime() / doubleSubmitBucketMs,
  );

  return `sync:${input.workspaceId}:${input.integrationId}:manual:${requestBucket}`;
}

async function requireWorkspaceForIntegrationManagement() {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CONNECT_INTEGRATIONS,
  });
  const workspace = await getCurrentWorkspace();

  if (!workspace || workspace.id !== authContext.workspaceId) {
    throw new Error("The current workspace could not be loaded.");
  }

  return {
    authContext,
    workspace,
  };
}

async function requireAdminWorkspaceDevAccess() {
  const { authContext, workspace } =
    await requireWorkspaceForIntegrationManagement();

  if (process.env.NODE_ENV === "production") {
    throw new Error("Workspace review tools are disabled in production.");
  }

  if (authContext.role !== "ADMIN") {
    throw new Error("Only admins can use workspace review tools.");
  }

  return {
    authContext,
    workspace,
  };
}

async function getManagedIntegration(input: {
  workspaceId: string;
  integrationId: string;
}) {
  const prisma = getPrisma();

  return prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      platform: {
        in: ["EMAIL"],
      },
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      displayName: true,
      externalAccountId: true,
      status: true,
      platformMetadataJson: true,
    },
  });
}

async function resolveDevConversation(input: {
  workspaceId: string;
  requestedConversationId: string;
}) {
  const prisma = getPrisma();

  return input.requestedConversationId
    ? prisma.conversation.findFirst({
        where: {
          id: input.requestedConversationId,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          subject: true,
          assignedAgentId: true,
          assignedAgent: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      })
    : prisma.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          platform: true,
          subject: true,
          assignedAgentId: true,
          assignedAgent: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      });
}

async function ensureActiveDevAgentAssignment(input: {
  workspaceId: string;
  conversationId: string;
  assignedByUserId: string;
  assignedAgentId: string | null;
  assignedAgentIsActive: boolean;
  requireDraftReplyAction?: boolean;
}) {
  const prisma = getPrisma();
  const existingActiveAssignment =
    input.assignedAgentIsActive && input.assignedAgentId
      ? await prisma.agentAssignment.findFirst({
          where: {
            id: input.assignedAgentId,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            isActive: true,
          },
          select: {
            id: true,
            allowedActionsJson: true,
          },
        })
      : null;

  const requiresDraftReply = Boolean(input.requireDraftReplyAction);
  const hasDraftReplyPermission = isDraftReplyAllowed(
    existingActiveAssignment?.allowedActionsJson,
  );

  let agentAssignmentId =
    existingActiveAssignment &&
    (!requiresDraftReply || hasDraftReplyPermission)
      ? existingActiveAssignment.id
      : null;

  if (!agentAssignmentId) {
    await prisma.agentAssignment.updateMany({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        isActive: true,
      },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    const agentAssignment = await prisma.agentAssignment.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        goal: "Workspace draft preview",
        instructions:
          "Used by the workspace draft preview tool.",
        tone: "Clear and concise",
        allowedActionsJson: ["draft_reply", "ask_for_missing_information", "wait", "escalate"],
        escalationRulesJson: {
          createdFor: "draft_generator_preview",
        } as never,
        assignedByUserId: input.assignedByUserId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    agentAssignmentId = agentAssignment.id;

    await prisma.conversation.update({
      where: {
        id: input.conversationId,
      },
      data: {
        assignedAgentId: agentAssignment.id,
      },
    });
  }

  return agentAssignmentId;
}

function isDraftReplyAllowed(value: unknown) {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => item === "draft_reply");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const allowedActions = record.allowedActions;
    if (Array.isArray(allowedActions)) {
      return allowedActions.some((item) => item === "draft_reply");
    }

    if (typeof record.draft_reply === "boolean") {
      return record.draft_reply;
    }
  }

  return false;
}

export async function syncIntegrationAction(formData: FormData) {
  const { authContext, workspace } =
    await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration) {
    throw new Error("No managed integration is connected for this workspace.");
  }

  try {
    assertRateLimit({
      key: `manual-sync:${authContext.userId}:${integration.id}`,
      limit: 12,
      windowMs: 10 * 60_000,
    });
  } catch (error) {
    redirect(
      `/settings/workspace?integration=${
        "gmail"
      }&action=sync&status=error&message=${encodeURIComponent(
        toSyncErrorMessage(error),
      )}`,
    );
  }

  if (
    integration.status !== "ERROR" &&
    integration.status !== "CONNECTED" &&
    integration.status !== "SYNC_IN_PROGRESS"
  ) {
    redirect(
      `/settings/workspace?integration=${
        "gmail"
      }&action=sync&status=error&message=${encodeURIComponent(
        "Reconnect this integration before syncing.",
      )}`,
    );
  }

  let queuedRedirectHref: string;

  try {
    const provider = "gmail";
    const jobType = WORKER_JOB_TYPES.SYNC_GMAIL_INTEGRATION;
    const requestedAtDate = new Date();
    const requestedAt = requestedAtDate.toISOString();
    const enqueueResult = await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.SYNC,
      jobType,
      workspaceId: workspace.id,
      payload: {
        workspaceId: workspace.id,
        integrationId: integration.id,
        requestedByUserId: authContext.userId,
        reason: "manual",
        requestedAt,
      },
      dedupeKey: buildManualSyncDedupeKey({
        workspaceId: workspace.id,
        integrationId: integration.id,
        requestedAt: requestedAtDate,
      }),
      retryPolicy: {
        maxAttempts: 3,
      },
    });

    queuedRedirectHref =
      `/settings/workspace?integration=${provider}` +
      `&action=sync&status=queued&jobId=${enqueueResult.runtimeJobId}`;
  } catch (error) {
    const message = toSyncErrorMessage(error);
    redirect(
      `/settings/workspace?integration=${
        "gmail"
      }&action=sync&status=error&message=${encodeURIComponent(message)}`,
    );
  }

  redirect(queuedRedirectHref);
}

function buildManualWatchRenewalDedupeKey(input: {
  workspaceId: string;
  integrationId: string;
  requestedAt: Date;
}) {
  const doubleSubmitBucketMs = 10_000;
  const requestBucket = Math.floor(
    input.requestedAt.getTime() / doubleSubmitBucketMs,
  );

  return `gmail-watch:${input.workspaceId}:${input.integrationId}:manual:${requestBucket}`;
}

export async function renewGmailWatchAction(formData: FormData) {
  const { authContext, workspace } =
    await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration || integration.platform !== "EMAIL") {
    throw new Error("No Gmail integration is connected for this workspace.");
  }

  try {
    assertRateLimit({
      key: `gmail-watch-renew:${authContext.userId}:${integration.id}`,
      limit: 6,
      windowMs: 15 * 60_000,
    });
  } catch (error) {
    redirect(
      `/settings/workspace?integration=gmail&action=watch&status=error&message=${encodeURIComponent(
        sanitizeUiErrorMessage(error) || "Unable to renew Gmail watch.",
      )}`,
    );
  }

  let queuedRedirectHref: string;

  try {
    const requestedAtDate = new Date();
    const requestedAt = requestedAtDate.toISOString();
    const enqueueResult = await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.MAINTENANCE,
      jobType: WORKER_JOB_TYPES.MAINTENANCE_RENEW_GMAIL_WATCH,
      workspaceId: workspace.id,
      payload: {
        workspaceId: workspace.id,
        integrationId: integration.id,
        requestedAt,
        reason: "manual",
      },
      dedupeKey: buildManualWatchRenewalDedupeKey({
        workspaceId: workspace.id,
        integrationId: integration.id,
        requestedAt: requestedAtDate,
      }),
      retryPolicy: {
        maxAttempts: 2,
      },
    });

    queuedRedirectHref =
      `/settings/workspace?integration=gmail&action=watch&status=queued&jobId=${enqueueResult.runtimeJobId}`;
  } catch (error) {
    const message = sanitizeUiErrorMessage(error) || "Unable to renew Gmail watch.";
    redirect(
      `/settings/workspace?integration=gmail&action=watch&status=error&message=${encodeURIComponent(message)}`,
    );
  }

  redirect(queuedRedirectHref);
}

export async function toggleGmailLiveSyncAction(formData: FormData) {
  const { workspace } = await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();
  const enabledValue = String(formData.get("enabled") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  if (enabledValue !== "true" && enabledValue !== "false") {
    throw new Error("Enabled state is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration || integration.platform !== "EMAIL") {
    throw new Error("No Gmail integration is connected for this workspace.");
  }

  const enabled = enabledValue === "true";

  try {
    await setGmailLiveSyncEnabledForIntegration({
      workspaceId: workspace.id,
      integrationId: integration.id,
      enabled,
    });

    if (enabled) {
      const watchResult = await renewGmailWatchForIntegration({
        workspaceId: workspace.id,
        integrationId: integration.id,
      });

      if (watchResult.status === "error") {
        redirect(
          `/settings/workspace?integration=gmail&action=live-sync&status=error&message=${encodeURIComponent(
            watchResult.error ??
              "Live sync was enabled, but Gmail watch could not be started.",
          )}`,
        );
      }
    }
  } catch (error) {
    redirect(
      `/settings/workspace?integration=gmail&action=live-sync&status=error&message=${encodeURIComponent(
        sanitizeUiErrorMessage(error) || "Unable to update Gmail live sync.",
      )}`,
    );
  }

  redirect(
    `/settings/workspace?integration=gmail&action=live-sync&status=${
      enabled ? "enabled" : "disabled"
    }`,
  );
}

export async function disconnectIntegrationAction(formData: FormData) {
  const { workspace } = await requireWorkspaceForIntegrationManagement();
  const integrationId = String(formData.get("integrationId") ?? "").trim();

  if (!integrationId) {
    throw new Error("Integration id is required.");
  }

  const integration = await getManagedIntegration({
    workspaceId: workspace.id,
    integrationId,
  });

  if (!integration) {
    throw new Error("No managed integration is connected for this workspace.");
  }

  const prisma = getPrisma();
  const activeSecret = await prisma.connectorSecret.findFirst({
    where: {
      workspaceId: workspace.id,
      integrationId: integration.id,
      revokedAt: null,
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    select: {
      secretRef: true,
    },
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: "DISCONNECTED",
      deletedAt: null,
      platformMetadataJson: buildDisconnectedMetadata({
        previousMetadata: integration.platformMetadataJson,
        provider: "gmail",
      }),
    },
  });

  if (activeSecret?.secretRef) {
    await revokeSecret({
      workspaceId: workspace.id,
      secretRef: activeSecret.secretRef,
    });
  }

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.INTEGRATION_DISCONNECTED,
      workspaceId: workspace.id,
      entityType: ENVOY_EVENT_ENTITY_TYPES.INTEGRATION,
      entityId: integration.id,
      source: ENVOY_EVENT_SOURCES.UI,
      payload: {
        integrationId: integration.id,
        platform: "EMAIL",
        externalAccountId: integration.externalAccountId ?? null,
        status: "DISCONNECTED",
        metadata: {
          provider: "gmail",
          displayName: integration.displayName ?? null,
        },
      },
    }),
  );

  redirect(
    `/settings/workspace?integration=${
      "gmail"
    }&action=disconnect&status=completed`,
  );
}

export async function createTestApprovalRequestAction(formData: FormData) {
  const { authContext, workspace } = await requireAdminWorkspaceDevAccess();
  const requestedConversationId = String(
    formData.get("conversationId") ?? "",
  ).trim();
  const conversation = await resolveDevConversation({
    workspaceId: workspace.id,
    requestedConversationId,
  });

  if (!conversation) {
    redirect(
      "/settings/workspace?integration=approval-test&action=create&status=error&message=No+eligible+conversation+was+found+for+test+approval+creation.",
    );
  }

  const agentAssignmentId = await ensureActiveDevAgentAssignment({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    assignedByUserId: authContext.userId,
    assignedAgentId: conversation.assignedAgentId,
    assignedAgentIsActive: Boolean(conversation.assignedAgent?.isActive),
  });

  const result = await createApprovalRequestForAgentDraft({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    proposedByAgentAssignmentId: agentAssignmentId,
    bodyText:
      "Hi there,\n\nThis Gmail draft was created from workspace settings so the approval flow can be reviewed.\n\nBest,\nEnvoy",
    actorContext: {
      actorType: "AGENT",
      actorAgentAssignmentId: agentAssignmentId,
    },
    platformMetadataJson: {
      createdFor: "approval_queue_review",
      createdByUserId: authContext.userId,
      sourceConversationId: conversation.id,
    },
  });

  redirect(`/approvals/${result.approvalRequestId}`);
}

export async function previewDraftGeneratorAction(formData: FormData) {
  const { authContext, workspace } = await requireAdminWorkspaceDevAccess();
  const requestedConversationId = String(
    formData.get("conversationId") ?? "",
  ).trim();

  const conversation = await resolveDevConversation({
    workspaceId: workspace.id,
    requestedConversationId,
  });

  if (!conversation) {
    redirect(
      "/settings/workspace?integration=draft-preview&action=preview&status=error&message=No+eligible+conversation+was+found+for+draft+preview.",
    );
  }

  await ensureActiveDevAgentAssignment({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    assignedByUserId: authContext.userId,
    assignedAgentId: conversation.assignedAgentId,
    assignedAgentIsActive: Boolean(conversation.assignedAgent?.isActive),
    requireDraftReplyAction: true,
  });

  try {
    const trigger = {
      triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
      triggerReason:
        "Workspace settings draft preview.",
    } as const;

    const { context, plan } = await planAgentResponseForWorkspace({
      conversationId: conversation.id,
      trigger,
    });

    if (plan.actionType !== "draft_reply") {
      redirect(
        `/settings/workspace?integration=draft-preview&action=preview&status=error&message=${encodeURIComponent(
          `Planner selected "${plan.actionType}" instead of "draft_reply". ${plan.rationaleSummary}`,
        )}`,
      );
    }

    const generation = await generateDraftFromPlanner({
      context,
      planner: plan,
      trigger,
    });

    const previewParams = new URLSearchParams({
      integration: "draft-preview",
      action: "preview",
      status: "completed",
      conversationId: conversation.id,
      plannerAction: plan.actionType,
      plannerConfidence: plan.confidence.toFixed(2),
      plannerRationale: plan.rationaleSummary,
      generationConfidence: generation.confidenceScore.toFixed(2),
      generationRationale: generation.rationaleSummary,
      suggestedState: generation.suggestedWorkflowStateChange?.to ?? "",
      extractedKeys:
        generation.extractedStructuredData
          .map((item) => item.key)
          .join(", ") || "none",
      proposedMessageText: generation.proposedMessageText.slice(0, 1600),
    });

    redirect(`/settings/workspace?${previewParams.toString()}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = sanitizeUiErrorMessage(error) || "Draft preview failed.";
    redirect(
      `/settings/workspace?integration=draft-preview&action=preview&status=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }
}
