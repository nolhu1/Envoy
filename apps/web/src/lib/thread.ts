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

type ThreadPlatform = "EMAIL";

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
  integration: {
    status: "PENDING" | "CONNECTED" | "SYNC_IN_PROGRESS" | "ERROR" | "DISCONNECTED";
    displayName: string | null;
  };
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
  conversationFacts: Array<{
    id: string;
    key: string;
    valueText: string;
    confidence: number | null;
    updatedAt: Date;
  }>;
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
      platform: ThreadPlatform;
      externalAttachmentId: string | null;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
      externalUrl: string | null;
      platformMetadataJson: unknown;
    }>;
    approvalRequests: Array<{
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
      editedContent: string | null;
    }>;
  }>;
};

export type ThreadAttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeLabel: string | null;
  downloadUrl: string | null;
  downloadUnavailableReason: string | null;
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
  groupedWithPrevious: boolean;
  providerContext: string | null;
  recoveryState: "none" | "retryable" | "retrying" | "dead_lettered" | "waiting_for_reconnect";
  failureSummary: string | null;
  runtimeJob: {
    id: string;
    status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "DEAD_LETTERED" | "CANCELLED";
    attemptsMade: number;
    maxAttempts: number;
    failedAt: Date | null;
    deadLetteredAt: Date | null;
  } | null;
  approval: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    editedBeforeSend: boolean;
  } | null;
};

export type ConversationThread = {
  conversationId: string;
  platform: ThreadPlatform;
  title: string;
  participantSummary: string;
  subject: string | null;
  conversationState: ThreadConversationRecord["state"];
  integrationStatus: ThreadConversationRecord["integration"]["status"];
  integrationLabel: string;
  lastActivityAt: Date;
  assignedAgentLabel: string | null;
  assignedAgent: ThreadConversationRecord["assignedAgent"] | null;
  enabledTriggerTypes: AgentTriggerType[];
  hasConfiguredTriggerRules: boolean;
  participants: ThreadConversationRecord["participants"];
  facts: ThreadConversationRecord["conversationFacts"];
  messages: ThreadMessageRow[];
  recentSendFailure: {
    messageId: string;
    failedAt: Date;
    errorSummary: string | null;
  } | null;
};

type RuntimeJobForMessage = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "DEAD_LETTERED" | "CANCELLED";
  payloadJson: unknown;
  attemptsMade: number;
  maxAttempts: number;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
  lastErrorJson: unknown;
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRuntimeJobMessageId(payloadJson: unknown) {
  return isJsonObject(payloadJson) ? readString(payloadJson.messageId) : null;
}

function readFailureSummaryFromRuntimeJob(runtimeJob: RuntimeJobForMessage | null) {
  if (!runtimeJob?.lastErrorJson) {
    return null;
  }

  if (isJsonObject(runtimeJob.lastErrorJson)) {
    return sanitizeUiErrorMessage(readString(runtimeJob.lastErrorJson.message));
  }

  return sanitizeUiErrorMessage(String(runtimeJob.lastErrorJson));
}

function buildProviderContext(
  message: ThreadConversationRecord["messages"][number],
) {
  const metadata = isJsonObject(message.platformMetadataJson)
    ? message.platformMetadataJson
    : {};
  const parts = [
    "Gmail",
    readString(metadata.from) ? `from ${readString(metadata.from)}` : null,
    readString(metadata.to) ? `to ${readString(metadata.to)}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : null;
}

function buildAttachmentDownloadState(
  attachment: ThreadConversationRecord["messages"][number]["attachments"][number],
) {
  if (attachment.platform === "EMAIL") {
    const metadata = isJsonObject(attachment.platformMetadataJson)
      ? attachment.platformMetadataJson
      : {};
    const hasAttachmentReference = Boolean(
      readString(metadata.attachmentId) ?? attachment.externalAttachmentId,
    );

    return hasAttachmentReference
      ? {
          downloadUrl: `/api/attachments/${attachment.id}/download`,
          downloadUnavailableReason: null,
        }
      : {
          downloadUrl: null,
          downloadUnavailableReason: "Download unavailable",
        };
  }

  return {
    downloadUrl: null,
    downloadUnavailableReason: "Unsupported attachment provider",
  };
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
  runtimeJob: RuntimeJobForMessage | null,
  previous: ThreadConversationRecord["messages"][number] | null,
  integrationStatus: ThreadConversationRecord["integration"]["status"],
): ThreadMessageRow {
  const timestamp = buildMessageTimestamp(message);
  const previousTimestamp = previous ? buildMessageTimestamp(previous) : null;
  const senderLabel = buildMessageSenderLabel(message);
  const approval = message.approvalRequests[0] ?? null;
  const groupedWithPrevious = Boolean(
    previous &&
      previous.direction === message.direction &&
      buildMessageSenderLabel(previous) === senderLabel &&
      previousTimestamp &&
      Math.abs(timestamp.getTime() - previousTimestamp.getTime()) <= 5 * 60_000,
  );
  const runtimeStatus = runtimeJob?.status ?? null;
  const recoveryState =
    message.status === "FAILED" && integrationStatus !== "CONNECTED"
      ? "waiting_for_reconnect"
      : message.status === "QUEUED" ||
          runtimeStatus === "QUEUED" ||
          runtimeStatus === "RUNNING"
        ? "retrying"
        : runtimeStatus === "DEAD_LETTERED"
          ? "dead_lettered"
          : message.status === "FAILED"
            ? "retryable"
            : "none";

  return {
    id: message.id,
    platform: "EMAIL",
    externalMessageId: message.externalMessageId,
    status: message.status,
    senderLabel,
    senderType: message.senderType,
    direction: message.direction,
    bodyText: buildMessageBody(message),
    timestamp,
    groupedWithPrevious,
    providerContext: buildProviderContext(message),
    recoveryState,
    failureSummary:
      readFailureSummaryFromMetadata(message.platformMetadataJson) ??
      readFailureSummaryFromRuntimeJob(runtimeJob),
    runtimeJob: runtimeJob
      ? {
          id: runtimeJob.id,
          status: runtimeJob.status,
          attemptsMade: runtimeJob.attemptsMade,
          maxAttempts: runtimeJob.maxAttempts,
          failedAt: runtimeJob.failedAt,
          deadLetteredAt: runtimeJob.deadLetteredAt,
        }
      : null,
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          editedBeforeSend: Boolean(approval.editedContent?.trim()),
        }
      : null,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeLabel: formatAttachmentSize(attachment.sizeBytes),
      ...buildAttachmentDownloadState(attachment),
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

function toConversationThread(
  record: ThreadConversationRecord,
  runtimeJobsByMessageId: Map<string, RuntimeJobForMessage>,
): ConversationThread {
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
    platform: "EMAIL",
    title: buildConversationTitle(record),
    participantSummary: formatParticipantSummary(record.platform, record.participants),
    subject: record.subject,
    conversationState: record.state,
    integrationStatus: record.integration.status,
    integrationLabel:
      record.integration.displayName ??
      "Gmail",
    lastActivityAt: buildLastActivityAt(record),
    assignedAgentLabel: buildAssignedAgentLabel(record),
    assignedAgent: record.assignedAgent?.isActive ? record.assignedAgent : null,
    enabledTriggerTypes,
    hasConfiguredTriggerRules,
    participants: record.participants,
    facts: record.conversationFacts,
    messages: record.messages.map((message, index) =>
      toThreadMessageRow(
        message,
        runtimeJobsByMessageId.get(message.id) ?? null,
        record.messages[index - 1] ?? null,
        record.integration.status,
      ),
    ),
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
      platform: "EMAIL",
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
      integration: {
        select: {
          status: true,
          displayName: true,
        },
      },
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
      conversationFacts: {
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
        select: {
          id: true,
          key: true,
          valueText: true,
          confidence: true,
          updatedAt: true,
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
              platform: true,
              externalAttachmentId: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              externalUrl: true,
              platformMetadataJson: true,
            },
            orderBy: [{ createdAt: "asc" }],
          },
          approvalRequests: {
            select: {
              id: true,
              status: true,
              editedContent: true,
            },
            orderBy: [{ createdAt: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ sentAt: "asc" }, { receivedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!conversation) {
    return null;
  }

  const typedConversation = conversation as ThreadConversationRecord;
  const outboundMessageIds = typedConversation.messages
    .filter((message) => message.direction === "OUTBOUND")
    .map((message) => message.id)
    .slice(-100);
  const runtimeJobs = outboundMessageIds.length
    ? await prisma.runtimeJob.findMany({
        where: {
          workspaceId: authContext.workspaceId,
          queueName: "outbound-send",
          jobType: "outbound.send_message",
          OR: outboundMessageIds.map((messageId) => ({
            payloadJson: {
              path: ["messageId"],
              equals: messageId,
            },
          })),
        },
        select: {
          id: true,
          status: true,
          payloadJson: true,
          attemptsMade: true,
          maxAttempts: true,
          failedAt: true,
          deadLetteredAt: true,
          lastErrorJson: true,
        },
        orderBy: [{ queuedAt: "desc" }],
        take: 100,
      })
    : [];
  const runtimeJobsByMessageId = new Map<string, RuntimeJobForMessage>();

  for (const runtimeJob of runtimeJobs as RuntimeJobForMessage[]) {
    const messageId = readRuntimeJobMessageId(runtimeJob.payloadJson);

    if (messageId && !runtimeJobsByMessageId.has(messageId)) {
      runtimeJobsByMessageId.set(messageId, runtimeJob);
    }
  }

  return toConversationThread(typedConversation, runtimeJobsByMessageId);
}
