"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getPrisma } from "@envoy/db";

import { sendWorkspaceGmailReply } from "@/lib/gmail-send";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";
import { sendWorkspaceSlackReply } from "@/lib/slack-send";

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
      message:
        error instanceof Error ? error.message : "Unable to send the reply.",
    }));
  }
}
