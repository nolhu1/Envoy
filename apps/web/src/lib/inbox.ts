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
  query: string;
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
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
    senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
    sentAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
  }>;
  _count?: {
    messages?: number;
    approvalRequests?: number;
  };
  integration: {
    id: string;
    status: "PENDING" | "CONNECTED" | "SYNC_IN_PROGRESS" | "ERROR" | "DISCONNECTED";
    displayName: string | null;
    platformMetadataJson: unknown;
  };
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
  hasSendFailure: boolean;
  hasQueuedSend: boolean;
  hasPendingApproval: boolean;
  integrationStatus: InboxConversationRecord["integration"]["status"];
  integrationLabel: string;
  integrationNeedsAttention: boolean;
  syncInProgress: boolean;
};

export type InboxPagination = {
  page: number;
  pageSize: number;
};

export type InboxPage = {
  rows: InboxRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
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
const DEFAULT_INBOX_PAGE = 1;
const DEFAULT_INBOX_PAGE_SIZE = 25;
const MAX_INBOX_PAGE_SIZE = 100;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function readInboxFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): InboxFilters {
  const query = readSearchParam(searchParams?.q);
  const platform = readSearchParam(searchParams?.platform);
  const state = readSearchParam(searchParams?.state);
  const assigneeId = readSearchParam(searchParams?.assignee);
  const agent = readSearchParam(searchParams?.agent);
  const awaitingApproval = readSearchParam(searchParams?.awaitingApproval);

  return {
    query: query?.trim() ?? "",
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

export function readInboxPagination(
  searchParams?: Record<string, string | string[] | undefined>,
): InboxPagination {
  const rawPage = Number(readSearchParam(searchParams?.page) ?? DEFAULT_INBOX_PAGE);
  const rawPageSize = Number(
    readSearchParam(searchParams?.pageSize) ?? DEFAULT_INBOX_PAGE_SIZE,
  );
  const page = Number.isFinite(rawPage)
    ? Math.max(1, Math.trunc(rawPage))
    : DEFAULT_INBOX_PAGE;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.max(1, Math.min(Math.trunc(rawPageSize), MAX_INBOX_PAGE_SIZE))
    : DEFAULT_INBOX_PAGE_SIZE;

  return {
    page,
    pageSize,
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
  const andClauses: Record<string, unknown>[] = [];

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

  if (input.filters.query) {
    andClauses.push({
      OR: [
        {
          subject: {
            contains: input.filters.query,
            mode: "insensitive",
          },
        },
        {
          participants: {
            some: {
              OR: [
                {
                  displayName: {
                    contains: input.filters.query,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: input.filters.query,
                    mode: "insensitive",
                  },
                },
                {
                  handle: {
                    contains: input.filters.query,
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        },
        {
          messages: {
            some: {
              deletedAt: null,
              bodyText: {
                contains: input.filters.query,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    });
  }

  if (input.filters.awaitingApproval) {
    andClauses.push({
      OR: [
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
    ],
    });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
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
  const failedOutboundCount = record._count?.messages ?? 0;
  const latestMessage = record.messages[0];

  return {
    conversationId: record.id,
    platform: record.platform,
    title: buildConversationTitle(record),
    participantSummary: formatParticipantSummary(record.platform, record.participants),
    lastMessagePreview: buildLastMessagePreview(record),
    lastActivityAt: buildLastActivityAt(record),
    assignedAgentLabel: buildAssignedAgentLabel(record),
    conversationState: record.state,
    hasSendFailure: failedOutboundCount > 0,
    hasQueuedSend:
      latestMessage?.direction === "OUTBOUND" && latestMessage.status === "QUEUED",
    hasPendingApproval:
      record.state === "AWAITING_APPROVAL" ||
      (record._count?.approvalRequests ?? 0) > 0 ||
      latestMessage?.status === "PENDING_APPROVAL",
    integrationStatus: record.integration.status,
    integrationLabel: record.integration.displayName ?? (
      record.platform === "EMAIL" ? "Gmail" : "Slack"
    ),
    integrationNeedsAttention:
      record.integration.status === "ERROR" ||
      record.integration.status === "DISCONNECTED" ||
      record.integration.status === "PENDING",
    syncInProgress: record.integration.status === "SYNC_IN_PROGRESS",
  };
}

const inboxConversationSelect = {
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
    orderBy: [{ isInternal: "asc" as const }, { createdAt: "asc" as const }],
  },
  messages: {
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      bodyText: true,
      bodyHtml: true,
      status: true,
      direction: true,
      senderType: true,
      sentAt: true,
      receivedAt: true,
      createdAt: true,
    },
    orderBy: [
      { sentAt: "desc" as const },
      { receivedAt: "desc" as const },
      { createdAt: "desc" as const },
    ],
    take: 1,
  },
  _count: {
    select: {
      messages: {
        where: {
          deletedAt: null,
          direction: "OUTBOUND" as const,
          status: "FAILED" as const,
        },
      },
      approvalRequests: {
        where: {
          status: "PENDING" as const,
        },
      },
    },
  },
  integration: {
    select: {
      id: true,
      status: true,
      displayName: true,
      platformMetadataJson: true,
    },
  },
  assignedAgent: {
    select: {
      id: true,
      goal: true,
      isActive: true,
    },
  },
};

const inboxConversationOrderBy = [
  { lastMessageAt: "desc" as const },
  { updatedAt: "desc" as const },
  { id: "desc" as const },
];

export async function getCurrentWorkspaceInboxRows() {
  const page = await getCurrentWorkspaceInboxPageWithFilters({
    query: "",
    platform: "ALL",
    state: "ALL",
    assigneeId: "ALL",
    agent: "any",
    awaitingApproval: false,
  }, {
    page: DEFAULT_INBOX_PAGE,
    pageSize: MAX_INBOX_PAGE_SIZE,
  });

  return page.rows;
}

export async function getCurrentWorkspaceInboxRowsWithFilters(
  filters: InboxFilters,
) {
  const page = await getCurrentWorkspaceInboxPageWithFilters(filters, {
    page: DEFAULT_INBOX_PAGE,
    pageSize: MAX_INBOX_PAGE_SIZE,
  });

  return page.rows;
}

export async function getCurrentWorkspaceInboxPageWithFilters(
  filters: InboxFilters,
  pagination: InboxPagination,
): Promise<InboxPage> {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return {
      rows: [],
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }

  const prisma = getPrisma();
  const where = buildInboxConversationWhere({
    workspaceId: authContext.workspaceId,
    filters,
  });
  const skip = (pagination.page - 1) * pagination.pageSize;
  // Avoid the pg adapter's shared-client warning on concurrent transaction queries
  // during the post-login homepage render. These reads do not need snapshot semantics.
  const totalCount = await prisma.conversation.count({
    where,
  });
  const conversations = await prisma.conversation.findMany({
    where,
    select: inboxConversationSelect,
    orderBy: inboxConversationOrderBy,
    skip,
    take: pagination.pageSize,
  });
  const totalPages =
    totalCount === 0 ? 0 : Math.ceil(totalCount / pagination.pageSize);

  return {
    rows: conversations.map((conversation) =>
      toInboxRow(conversation as InboxConversationRecord),
    ),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalCount,
    totalPages,
    hasNextPage: pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1,
  };
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
