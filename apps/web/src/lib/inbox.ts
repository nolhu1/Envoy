import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import {
  buildConversationTitle,
  formatParticipantSummary,
} from "@/lib/conversation-display";

type InboxPlatform = "EMAIL" | "SLACK";
type InboxConversationState =
  | "UNASSIGNED"
  | "ACTIVE"
  | "WAITING"
  | "FOLLOW_UP_DUE"
  | "AWAITING_APPROVAL"
  | "ESCALATED"
  | "COMPLETED"
  | "CLOSED";

export type InboxAgentFilter = "any" | "has" | "none";

export type InboxFilters = {
  platform: InboxPlatform | "ALL";
  state: InboxConversationState | "ALL";
  assigneeId: string | "ALL";
  agent: InboxAgentFilter;
  awaitingApproval: boolean;
};

export type InboxAssigneeOption = {
  id: string;
  label: string;
};

type InboxConversationRecord = {
  id: string;
  platform: InboxPlatform;
  subject: string | null;
  state: InboxConversationState;
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

const INBOX_PLATFORM_OPTIONS = new Set<InboxFilters["platform"]>([
  "ALL",
  "EMAIL",
  "SLACK",
]);
const INBOX_STATE_OPTIONS = new Set<InboxFilters["state"]>([
  "ALL",
  "UNASSIGNED",
  "ACTIVE",
  "WAITING",
  "FOLLOW_UP_DUE",
  "AWAITING_APPROVAL",
  "ESCALATED",
  "COMPLETED",
  "CLOSED",
]);
const INBOX_AGENT_OPTIONS = new Set<InboxAgentFilter>(["any", "has", "none"]);

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function readInboxFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): InboxFilters {
  const platform = readSearchParam(searchParams?.platform);
  const state = readSearchParam(searchParams?.state);
  const assigneeId = readSearchParam(searchParams?.assignee);
  const agent = readSearchParam(searchParams?.agent);
  const awaitingApproval = readSearchParam(searchParams?.awaitingApproval);

  return {
    platform: INBOX_PLATFORM_OPTIONS.has(platform as InboxFilters["platform"])
      ? (platform as InboxFilters["platform"])
      : "ALL",
    state: INBOX_STATE_OPTIONS.has(state as InboxFilters["state"])
      ? (state as InboxFilters["state"])
      : "ALL",
    assigneeId: assigneeId?.trim() ? assigneeId : "ALL",
    agent: INBOX_AGENT_OPTIONS.has(agent as InboxAgentFilter)
      ? (agent as InboxAgentFilter)
      : "any",
    awaitingApproval:
      awaitingApproval === "true" ||
      awaitingApproval === "1" ||
      awaitingApproval === "on",
  };
}

function buildInboxConversationWhere(input: {
  workspaceId: string;
  filters: InboxFilters;
}) {
  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    deletedAt: null,
    messages: {
      some: {
        deletedAt: null,
      },
    },
  };

  if (input.filters.platform !== "ALL") {
    where.platform = input.filters.platform;
  }

  if (input.filters.state !== "ALL") {
    where.state = input.filters.state;
  }

  if (input.filters.assigneeId !== "ALL") {
    where.assignedAgentId = input.filters.assigneeId;
  } else if (input.filters.agent === "has") {
    where.assignedAgentId = {
      not: null,
    };
  } else if (input.filters.agent === "none") {
    where.assignedAgentId = null;
  }

  if (input.filters.awaitingApproval) {
    where.OR = [
      {
        state: "AWAITING_APPROVAL",
      },
      {
        approvalRequests: {
          some: {
            status: "PENDING",
          },
        },
      },
    ];
  }

  return where;
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
    where: buildInboxConversationWhere({
      workspaceId: authContext.workspaceId,
      filters: {
        platform: "ALL",
        state: "ALL",
        assigneeId: "ALL",
        agent: "any",
        awaitingApproval: false,
      },
    }),
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

export async function getCurrentWorkspaceInboxRowsWithFilters(
  filters: InboxFilters,
) {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();
  const conversations = await prisma.conversation.findMany({
    where: buildInboxConversationWhere({
      workspaceId: authContext.workspaceId,
      filters,
    }),
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

export async function getCurrentWorkspaceInboxAssigneeOptions() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();
  const assignments = await prisma.agentAssignment.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      isActive: true,
      currentForConversations: {
        some: {
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      goal: true,
    },
    orderBy: [{ goal: "asc" }, { createdAt: "asc" }],
  });

  return assignments.map((assignment) => ({
    id: assignment.id,
    label: assignment.goal?.trim() || "Assigned agent",
  })) satisfies InboxAssigneeOption[];
}
