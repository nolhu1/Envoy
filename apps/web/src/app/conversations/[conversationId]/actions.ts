"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getPrisma } from "@envoy/db";

import {
  assignAgentToConversationForWorkspace,
  unassignAgentFromConversationForWorkspace,
} from "@/lib/agent-assignments";
import {
  buildEscalationRulesWithEnabledTriggers,
  DEFAULT_ENABLED_AGENT_TRIGGER_TYPES,
  normalizeAgentTriggerTypes,
} from "@/lib/agent-trigger-rules";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";
import { sanitizeUiErrorMessage } from "@/lib/security";
import {
  WORKER_JOB_TYPES,
} from "../../../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../../../worker/src/queues";

function buildThreadRedirect(
  conversationId: string,
  params?: Record<string, string>,
) {
  const searchParams = new URLSearchParams(params);
  const suffix = searchParams.toString();

  return suffix
    ? `/conversations/${conversationId}?${suffix}`
    : `/conversations/${conversationId}`;
}

export async function sendManualReplyAction(formData: FormData) {
  const authContext = await requirePermission(PERMISSIONS.SEND_MESSAGES);
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();

  if (!conversationId) {
    redirect("/");
  }

  if (!bodyText) {
    redirect(buildThreadRedirect(conversationId, {
      reply: "error",
      message: "Reply body is required.",
    }));
  }

  const prisma = getPrisma();
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      integrationId: true,
      platform: true,
    },
  });

  if (!conversation) {
    redirect(buildThreadRedirect(conversationId, {
      reply: "error",
      message: "The conversation could not be loaded.",
    }));
  }

  if (conversation.platform !== "EMAIL" && conversation.platform !== "SLACK") {
    redirect(buildThreadRedirect(conversation.id, {
      reply: "error",
      message: "Manual reply is not supported for this platform.",
    }));
  }

  let message: { id: string } | null = null;
  try {
    message = await prisma.message.create({
      data: {
        workspaceId: authContext.workspaceId,
        conversationId: conversation.id,
        platform: conversation.platform,
        senderType: "USER",
        direction: "OUTBOUND",
        bodyText,
        status: "QUEUED",
        platformMetadataJson: {
          composer: "manual_thread_reply",
          queuedByUserId: authContext.userId,
          queuedAt: new Date().toISOString(),
        } as never,
      },
      select: {
        id: true,
      },
    });

    await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.OUTBOUND_SEND,
      jobType: WORKER_JOB_TYPES.OUTBOUND_SEND_MESSAGE,
      workspaceId: authContext.workspaceId,
      payload: {
        workspaceId: authContext.workspaceId,
        conversationId: conversation.id,
        messageId: message.id,
        integrationId: conversation.integrationId,
        platform: conversation.platform,
        requestedByUserId: authContext.userId,
        sendSource: "manual",
        approvalRequestId: null,
        requestedAt: new Date().toISOString(),
      },
      dedupeKey: `outbound-send:${authContext.workspaceId}:${message.id}:manual`,
      retryPolicy: {
        maxAttempts: 3,
      },
    });

    redirect(buildThreadRedirect(conversation.id, {
      reply: "queued",
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (message) {
      await prisma.message.updateMany({
        where: {
          id: message.id,
          workspaceId: authContext.workspaceId,
          status: "QUEUED",
        },
        data: {
          status: "FAILED",
        },
      });
    }

    redirect(buildThreadRedirect(conversation.id, {
      reply: "error",
      message: sanitizeUiErrorMessage(error),
    }));
  }
}

export async function assignConversationAgentAction(formData: FormData) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const tone = String(formData.get("tone") ?? "").trim();
  const triggerRulesConfigured =
    String(formData.get("enabledTriggerTypesConfigured") ?? "").trim() === "1";
  const selectedTriggerTypes = normalizeAgentTriggerTypes(
    formData.getAll("enabledTriggerTypes"),
  );
  const enabledTriggerTypes = triggerRulesConfigured
    ? selectedTriggerTypes
    : [...DEFAULT_ENABLED_AGENT_TRIGGER_TYPES];

  if (!conversationId) {
    redirect("/");
  }

  if (!goal) {
    redirect(
      buildThreadRedirect(conversationId, {
        agent: "error",
        message: "Goal is required.",
      }),
    );
  }

  const prisma = getPrisma();
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      assignedAgent: {
        select: {
          id: true,
          isActive: true,
          allowedActionsJson: true,
          escalationRulesJson: true,
        },
      },
    },
  });

  if (!conversation) {
    redirect(
      buildThreadRedirect(conversationId, {
        agent: "error",
        message: "The conversation could not be loaded.",
      }),
    );
  }

  try {
    await assignAgentToConversationForWorkspace({
      conversationId: conversation.id,
      goal,
      instructions: instructions || null,
      tone: tone || null,
      allowedActionsJson:
        conversation.assignedAgent?.isActive
          ? conversation.assignedAgent.allowedActionsJson
          : undefined,
      escalationRulesJson: buildEscalationRulesWithEnabledTriggers({
        baseEscalationRulesJson:
          conversation.assignedAgent?.isActive
            ? conversation.assignedAgent.escalationRulesJson
            : null,
        enabledTriggerTypes,
      }),
    });

    redirect(
      buildThreadRedirect(conversation.id, {
        agent: "saved",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildThreadRedirect(conversation.id, {
        agent: "error",
        message:
          sanitizeUiErrorMessage(error),
      }),
    );
  }
}

export async function unassignConversationAgentAction(formData: FormData) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);
  const conversationId = String(formData.get("conversationId") ?? "").trim();

  if (!conversationId) {
    redirect("/");
  }

  const prisma = getPrisma();
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!conversation) {
    redirect(
      buildThreadRedirect(conversationId, {
        agent: "error",
        message: "The conversation could not be loaded.",
      }),
    );
  }

  try {
    await unassignAgentFromConversationForWorkspace({
      conversationId: conversation.id,
      reason: "Manual unassignment from conversation thread view.",
    });

    redirect(
      buildThreadRedirect(conversation.id, {
        agent: "unassigned",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildThreadRedirect(conversation.id, {
        agent: "error",
        message:
          sanitizeUiErrorMessage(error),
      }),
    );
  }
}

export async function runConversationAgentAction(formData: FormData) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const submittedRequestNonce = String(
    formData.get("requestNonce") ?? "",
  ).trim();
  const requestNonce =
    submittedRequestNonce || `bucket-${Math.floor(Date.now() / 15_000)}`;

  if (!conversationId) {
    redirect("/");
  }

  const prisma = getPrisma();
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!conversation) {
    redirect(
      buildThreadRedirect(conversationId, {
        agentRun: "error",
        agentRunMessage: "The conversation could not be loaded.",
      }),
    );
  }

  try {
    await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.AGENT,
      jobType: WORKER_JOB_TYPES.AGENT_RUN_MANUAL,
      workspaceId: authContext.workspaceId,
      payload: {
        workspaceId: authContext.workspaceId,
        conversationId: conversation.id,
        requestedByUserId: authContext.userId,
        requestedAt: new Date().toISOString(),
        requestNonce,
        triggerType: "manual_regenerate",
      },
      dedupeKey: [
        "agent",
        "manual_regenerate",
        authContext.workspaceId,
        conversation.id,
        authContext.userId,
        requestNonce,
      ].join(":"),
      retryPolicy: {
        maxAttempts: 1,
      },
    });

    redirect(
      buildThreadRedirect(conversation.id, {
        agentRun: "queued",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildThreadRedirect(conversation.id, {
        agentRun: "error",
        agentRunMessage:
          sanitizeUiErrorMessage(error),
      }),
    );
  }
}
