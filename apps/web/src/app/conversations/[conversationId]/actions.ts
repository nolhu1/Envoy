"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { AGENT_TRIGGER_TYPES, getPrisma } from "@envoy/db";

import {
  assignAgentToConversationForWorkspace,
  unassignAgentFromConversationForWorkspace,
} from "@/lib/agent-assignments";
import {
  buildEscalationRulesWithEnabledTriggers,
  DEFAULT_ENABLED_AGENT_TRIGGER_TYPES,
  normalizeAgentTriggerTypes,
} from "@/lib/agent-trigger-rules";
import { generateDraftAndCreateApprovalForWorkspace } from "@/lib/agent-draft-flow";
import { sendWorkspaceGmailReply } from "@/lib/gmail-send";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";
import { sendWorkspaceSlackReply } from "@/lib/slack-send";
import { sanitizeUiErrorMessage } from "@/lib/security";

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
      platform: true,
    },
  });

  if (!conversation) {
    redirect(buildThreadRedirect(conversationId, {
      reply: "error",
      message: "The conversation could not be loaded.",
    }));
  }

  const message = await prisma.message.create({
    data: {
      workspaceId: authContext.workspaceId,
      conversationId: conversation.id,
      platform: conversation.platform,
      senderType: "USER",
      direction: "OUTBOUND",
      bodyText,
      status: "DRAFT",
      platformMetadataJson: {
        composer: "manual_thread_reply",
      } as never,
    },
    select: {
      id: true,
    },
  });

  try {
    let result:
      | Awaited<ReturnType<typeof sendWorkspaceGmailReply>>
      | Awaited<ReturnType<typeof sendWorkspaceSlackReply>>;

    if (conversation.platform === "EMAIL") {
      result = await sendWorkspaceGmailReply({
        workspaceId: authContext.workspaceId,
        actorUserId: authContext.userId,
        messageId: message.id,
      });
    } else if (conversation.platform === "SLACK") {
      result = await sendWorkspaceSlackReply({
        workspaceId: authContext.workspaceId,
        actorUserId: authContext.userId,
        messageId: message.id,
      });
    } else {
      throw new Error("Manual reply is not supported for this platform.");
    }

    if (result.sendStatus !== "ACCEPTED" && result.sendStatus !== "QUEUED") {
      throw new Error(`Reply send failed with status ${result.sendStatus}.`);
    }

    redirect(buildThreadRedirect(conversation.id, {
      reply: "sent",
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
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
    const result = await generateDraftAndCreateApprovalForWorkspace({
      workspaceId: authContext.workspaceId,
      actorUserId: authContext.userId,
      conversationId: conversation.id,
      trigger: {
        triggerType: AGENT_TRIGGER_TYPES.MANUAL_REGENERATE,
        triggerReason: "Manual run requested from conversation thread UI.",
        metadata: {
          source: "conversation_thread_ui",
        },
      },
    });

    if (result.status === "escalated") {
      redirect(
        buildThreadRedirect(conversation.id, {
          agentRun: "escalated",
          agentRunReason:
            result.escalation.escalationReasonCode ?? "escalation_required",
          agentRunMessage:
            result.escalation.escalationSummary ||
            "Escalation required. Draft was not created.",
        }),
      );
    }

    redirect(
      buildThreadRedirect(conversation.id, {
        agentRun: "created",
        approvalRequestId: result.approval.approvalRequestId,
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
