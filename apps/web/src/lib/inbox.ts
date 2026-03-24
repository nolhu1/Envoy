import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";

type InboxPlatform = "EMAIL" | "SLACK";

type InboxConversationRecord = {
  id: string;
  platform: InboxPlatform;
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
  participants: Array<{
    id: string;
    externalParticipantId: string | null;
    displayName: string | null;
    email: string | null;
    handle: string | null;
    isInternal: boolean;
  }>;
  messages: Array<{
    id: string;
    bodyText: string | null;
    bodyHtml: string | null;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
    senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
    sentAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
  }>;
  assignedAgent: {
    id: string;
    goal: string;
    isActive: boolean;
  } | null;
};

export type InboxRow = {
  conversationId: string;
  platform: InboxPlatform;
  title: string;
  participantSummary: string;
  lastMessagePreview: string;
  lastActivityAt: Date;
  assignedAgentLabel: string | null;
  conversationState: InboxConversationRecord["state"];
};

function getParticipantDisplayName(
  participant: InboxConversationRecord["participants"][number],
) {
  return (
    participant.displayName ||
    participant.email ||
    participant.handle ||
    (participant.isInternal ? "Internal participant" : "External participant")
  );
}

function isSlackSystemParticipant(
  participant: InboxConversationRecord["participants"][number],
) {
  const displayName = participant.displayName?.trim().toLowerCase() ?? null;
  const handle = participant.handle?.trim().toLowerCase() ?? null;
  const externalParticipantId =
    participant.externalParticipantId?.trim().toLowerCase() ?? null;

  return (
    participant.isInternal ||
    displayName === "slackbot" ||
    handle === "@slackbot" ||
    externalParticipantId === "uslackbot" ||
    externalParticipantId?.startsWith("bot:") === true
  );
}

function formatParticipantSummary(
  platform: InboxPlatform,
  participants: InboxConversationRecord["participants"],
) {
  const preferredParticipants = participants.filter((participant) =>
    platform === "SLACK"
      ? !isSlackSystemParticipant(participant)
      : !participant.isInternal,
  );
  const source = preferredParticipants.length > 0 ? preferredParticipants : participants;
  const labels = Array.from(
    new Set(source.map((participant) => getParticipantDisplayName(participant)).filter(Boolean)),
  );

  if (labels.length === 0) {
    return "No participants";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels[0]}, ${labels[1]}, +${labels.length - 2} more`;
}

function buildSlackTitle(record: InboxConversationRecord) {
  const preferredParticipants = record.participants.filter(
    (participant) => !isSlackSystemParticipant(participant),
  );
  const labels = Array.from(
    new Set(
      (preferredParticipants.length > 0 ? preferredParticipants : record.participants).map(
        (participant) => getParticipantDisplayName(participant),
      ),
    ),
  ).filter(Boolean);

  if (labels.length === 0) {
    return "Slack DM";
  }

  return labels.length === 1 ? labels[0] : `Slack DM: ${labels.join(", ")}`;
}

function buildConversationTitle(record: InboxConversationRecord) {
  if (record.platform === "EMAIL") {
    return (
      record.subject?.trim() ||
      formatParticipantSummary(record.platform, record.participants) ||
      "Email thread"
    );
  }

  return buildSlackTitle(record);
}

function buildLastMessagePreview(record: InboxConversationRecord) {
  const latestMessage = record.messages[0];

  if (!latestMessage) {
    return "No messages yet.";
  }

  const preview =
    latestMessage.bodyText?.trim() || latestMessage.bodyHtml?.trim() || "Message content unavailable.";

  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

function buildAssignedAgentLabel(record: InboxConversationRecord) {
  if (!record.assignedAgent || !record.assignedAgent.isActive) {
    return null;
  }

  return record.assignedAgent.goal?.trim() || "Assigned agent";
}

function buildLastActivityAt(record: InboxConversationRecord) {
  const latestMessage = record.messages[0];

  return (
    latestMessage?.sentAt ||
    latestMessage?.receivedAt ||
    record.lastMessageAt ||
    latestMessage?.createdAt ||
    record.createdAt
  );
}

function toInboxRow(record: InboxConversationRecord): InboxRow {
  return {
    conversationId: record.id,
    platform: record.platform,
    title: buildConversationTitle(record),
    participantSummary: formatParticipantSummary(record.platform, record.participants),
    lastMessagePreview: buildLastMessagePreview(record),
    lastActivityAt: buildLastActivityAt(record),
    assignedAgentLabel: buildAssignedAgentLabel(record),
    conversationState: record.state,
  };
}

export async function getCurrentWorkspaceInboxRows() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      deletedAt: null,
      messages: {
        some: {
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      platform: true,
      subject: true,
      state: true,
      lastMessageAt: true,
      createdAt: true,
      participants: {
        select: {
          id: true,
          externalParticipantId: true,
          displayName: true,
          email: true,
          handle: true,
          isInternal: true,
        },
        orderBy: [{ isInternal: "asc" }, { createdAt: "asc" }],
      },
      messages: {
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          bodyText: true,
          bodyHtml: true,
          direction: true,
          senderType: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
        orderBy: [{ sentAt: "desc" }, { receivedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
      assignedAgent: {
        select: {
          id: true,
          goal: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });

  return conversations.map((conversation) =>
    toInboxRow(conversation as InboxConversationRecord),
  );
}
