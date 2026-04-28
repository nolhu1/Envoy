import "server-only";

import { getPrisma } from "@envoy/db";
import type { AgentTriggerType } from "@envoy/db";

import { requireAppAuthContext } from "@/lib/app-auth";
import {
  getEnabledAgentTriggerTypes,
  hasConfiguredAgentTriggerRules,
} from "@/lib/agent-trigger-rules";
import {
  buildConversationTitle,
  formatParticipantSummary,
  getParticipantDisplayName,
} from "@/lib/conversation-display";
import { sanitizeUiErrorMessage } from "@/lib/security";

type ThreadPlatform = "EMAIL" | "SLACK";

type ThreadConversationRecord = {
  id: string;
  workspaceId: string;
  platform: ThreadPlatform;
  subject: string | null;
  state:
    | "UNASSIGNED"
    | "ACTIVE"
    | "WAITING"
    | "FOLLOW_UP_DUE"
    | "AWAITING_APPROVAL"
    | "ESCALATED"
    | "COMPLETED"
    | "CLOSED";
  lastMessageAt: Date | null;
  createdAt: Date;
  platformMetadataJson: unknown;
  participants: Array<{
    id: string;
    externalParticipantId: string | null;
    displayName: string | null;
    email: string | null;
    handle: string | null;
    isInternal: boolean;
    platformMetadataJson: unknown;
  }>;
  assignedAgent: {
    id: string;
    goal: string;
    instructions: string | null;
    tone: string | null;
    escalationRulesJson: unknown;
    isActive: boolean;
  } | null;
  messages: Array<{
    id: string;
    platform: ThreadPlatform;
    externalMessageId: string | null;
    status:
      | "RECEIVED"
      | "DRAFT"
      | "PENDING_APPROVAL"
      | "APPROVED"
      | "REJECTED"
      | "QUEUED"
      | "SENT"
      | "DELIVERED"
      | "FAILED";
    senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
    bodyText: string | null;
    bodyHtml: string | null;
    sentAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
    platformMetadataJson: unknown;
    senderParticipant: {
      id: string;
      externalParticipantId: string | null;
      displayName: string | null;
      email: string | null;
      handle: string | null;
      isInternal: boolean;
    } | null;
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
      externalUrl: string | null;
    }>;
  }>;
};

export type ThreadAttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeLabel: string | null;
  externalUrl: string | null;
};

export type ThreadMessageRow = {
  id: string;
  platform: ThreadPlatform;
  externalMessageId: string | null;
  status: ThreadConversationRecord["messages"][number]["status"];
  senderLabel: string;
  senderType: ThreadConversationRecord["messages"][number]["senderType"];
  direction: ThreadConversationRecord["messages"][number]["direction"];
  bodyText: string;
  timestamp: Date;
  attachments: ThreadAttachmentRow[];
};

export type ConversationThread = {
  conversationId: string;
  platform: ThreadPlatform;
  title: string;
  participantSummary: string;
  subject: string | null;
  conversationState: ThreadConversationRecord["state"];
  lastActivityAt: Date;
  assignedAgentLabel: string | null;
  assignedAgent: ThreadConversationRecord["assignedAgent"] | null;
  enabledTriggerTypes: AgentTriggerType[];
  hasConfiguredTriggerRules: boolean;
  participants: ThreadConversationRecord["participants"];
  messages: ThreadMessageRow[];
  recentSendFailure: {
    messageId: string;
    failedAt: Date;
    errorSummary: string | null;
  } | null;
};

function buildAssignedAgentLabel(record: ThreadConversationRecord) {
  if (!record.assignedAgent || !record.assignedAgent.isActive) {
    return null;
  }

  return record.assignedAgent.goal?.trim() || "Assigned agent";
}

function buildMessageTimestamp(
  message: ThreadConversationRecord["messages"][number],
) {
  return message.sentAt || message.receivedAt || message.createdAt;
}

function buildMessageBody(
  message: ThreadConversationRecord["messages"][number],
) {
  return (
    message.bodyText?.trim() ||
    message.bodyHtml?.trim() ||
    "Message content unavailable."
  );
}

function formatAttachmentSize(sizeBytes: number | null) {
  if (!sizeBytes || sizeBytes <= 0) {
    return null;
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildMessageSenderLabel(
  message: ThreadConversationRecord["messages"][number],
) {
  if (message.senderParticipant) {
    return getParticipantDisplayName(message.senderParticipant);
  }

  if (message.senderType === "USER") {
    return "User";
  }

  if (message.senderType === "AGENT") {
    return "Agent";
  }

  if (message.senderType === "SYSTEM") {
    return "System";
  }

  return "External sender";
}

function buildLastActivityAt(record: ThreadConversationRecord) {
  const latestMessage = record.messages[record.messages.length - 1];

  return (
    latestMessage?.sentAt ||
    latestMessage?.receivedAt ||
    record.lastMessageAt ||
    latestMessage?.createdAt ||
    record.createdAt
  );
}

function toThreadMessageRow(
  message: ThreadConversationRecord["messages"][number],
): ThreadMessageRow {
  return {
    id: message.id,
    platform: message.platform,
    externalMessageId: message.externalMessageId,
    status: message.status,
    senderLabel: buildMessageSenderLabel(message),
    senderType: message.senderType,
    direction: message.direction,
    bodyText: buildMessageBody(message),
    timestamp: buildMessageTimestamp(message),
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeLabel: formatAttachmentSize(attachment.sizeBytes),
      externalUrl: attachment.externalUrl,
    })),
  };
}

function readFailureSummaryFromMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const lastSendDiagnostics =
    typeof record.lastSendDiagnostics === "object" &&
    record.lastSendDiagnostics !== null &&
    !Array.isArray(record.lastSendDiagnostics)
      ? (record.lastSendDiagnostics as Record<string, unknown>)
      : null;
  const topLevelError =
    typeof record.error === "string" ? record.error : null;
  const diagnosticsError =
    typeof lastSendDiagnostics?.error === "string"
      ? lastSendDiagnostics.error
      : null;

  if (!topLevelError && !diagnosticsError) {
    return null;
  }

  return sanitizeUiErrorMessage(diagnosticsError ?? topLevelError);
}

function resolveRecentSendFailure(record: ThreadConversationRecord) {
  const latestFailed = record.messages
    .slice()
    .reverse()
    .find(
      (message) =>
        message.direction === "OUTBOUND" && message.status === "FAILED",
    );

  if (!latestFailed) {
    return null;
  }

  return {
    messageId: latestFailed.id,
    failedAt:
      latestFailed.sentAt ||
      latestFailed.receivedAt ||
      latestFailed.createdAt,
    errorSummary: readFailureSummaryFromMetadata(
      latestFailed.platformMetadataJson,
    ),
  };
}

function toConversationThread(record: ThreadConversationRecord): ConversationThread {
  const enabledTriggerTypes =
    record.assignedAgent && record.assignedAgent.isActive
      ? getEnabledAgentTriggerTypes(record.assignedAgent.escalationRulesJson)
      : [];
  const hasConfiguredTriggerRules =
    record.assignedAgent && record.assignedAgent.isActive
      ? hasConfiguredAgentTriggerRules(record.assignedAgent.escalationRulesJson)
      : false;

  return {
    conversationId: record.id,
    platform: record.platform,
    title: buildConversationTitle(record),
    participantSummary: formatParticipantSummary(record.platform, record.participants),
    subject: record.subject,
    conversationState: record.state,
    lastActivityAt: buildLastActivityAt(record),
    assignedAgentLabel: buildAssignedAgentLabel(record),
    assignedAgent: record.assignedAgent?.isActive ? record.assignedAgent : null,
    enabledTriggerTypes,
    hasConfiguredTriggerRules,
    participants: record.participants,
    messages: record.messages.map(toThreadMessageRow),
    recentSendFailure: resolveRecentSendFailure(record),
  };
}

export async function getCurrentWorkspaceConversationThread(
  conversationId: string,
) {
  const authContext = await requireAppAuthContext();
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
      subject: true,
      state: true,
      lastMessageAt: true,
      createdAt: true,
      platformMetadataJson: true,
      participants: {
        select: {
          id: true,
          externalParticipantId: true,
          displayName: true,
          email: true,
          handle: true,
          isInternal: true,
          platformMetadataJson: true,
        },
        orderBy: [{ isInternal: "asc" }, { createdAt: "asc" }],
      },
      assignedAgent: {
        select: {
          id: true,
          goal: true,
          instructions: true,
          tone: true,
          escalationRulesJson: true,
          isActive: true,
        },
      },
      messages: {
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          externalMessageId: true,
          status: true,
          senderType: true,
          direction: true,
          bodyText: true,
          bodyHtml: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
          platformMetadataJson: true,
          senderParticipant: {
            select: {
              id: true,
              externalParticipantId: true,
              displayName: true,
              email: true,
              handle: true,
              isInternal: true,
            },
          },
          attachments: {
            where: {
              deletedAt: null,
            },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              externalUrl: true,
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ sentAt: "asc" }, { receivedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return conversation
    ? toConversationThread(conversation as ThreadConversationRecord)
    : null;
}
