import "server-only";

import {
  APPROVAL_REQUEST_STATUSES,
  createRevisedApprovalRequestFromRejectedApproval,
  getApprovalRequestDetail,
  getPrisma,
  listApprovalRequests,
  reviewApprovalRequest,
  type ApprovalQueueFilter,
  type ApprovalQueueListItem,
  type ApprovalRequestDetail,
  type ApprovalReviewerFeedback,
} from "@envoy/db";

import {
  buildConversationTitle,
  formatParticipantSummary,
  getParticipantDisplayName,
} from "@/lib/conversation-display";
import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "@/lib/event-publisher";
import { hasPermission, PERMISSIONS, requirePermission } from "@/lib/permissions";
import {
  WORKER_JOB_TYPES,
} from "../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../worker/src/queues";

type QueueConversationDisplay = {
  platform: ApprovalQueueListItem["conversation"]["platform"];
  subject: string | null;
  participants: ApprovalQueueListItem["conversation"]["participants"];
};

export type ApprovalQueueListFilters = {
  filter?: ApprovalQueueFilter;
  limit?: number;
  reviewedSince?: Date | null;
};

export type ApprovalQueueListRow = ApprovalQueueListItem & {
  title: string;
  participantSummary: string;
  draftPreview: string;
  assignedAgentLabel: string | null;
};

export type ApprovalQueueDetailMessageRow = ApprovalRequestDetail["recentMessages"][number] & {
  senderLabel: string;
  timestamp: Date;
};

export type ApprovalQueueDetailView = Omit<
  ApprovalRequestDetail,
  "recentMessages"
> & {
  title: string;
  participantSummary: string;
  assignedAgentLabel: string | null;
  draftPreview: string;
  reviewerFeedback: ApprovalReviewerFeedback | null;
  recentMessages: ApprovalQueueDetailMessageRow[];
};

type WorkspaceScopedApprovalDecisionInput = {
  workspaceId: string;
  actorUserId: string;
  approvalRequestId: string;
  nextConversationState?: Parameters<typeof reviewApprovalRequest>[0]["nextConversationState"];
};

type ApprovedDraftQueueResult = {
  runtimeJobId: string;
  bullJobId: string | null;
  created: boolean;
  queued: boolean;
  approvalRequestId: string;
  draftMessageId: string;
};

export type ApprovalContinuationResult = {
  review: Awaited<ReturnType<typeof reviewApprovalRequest>>;
  queue: ApprovedDraftQueueResult | null;
};

export type ApprovalRevisionResult = Awaited<
  ReturnType<typeof createRevisedApprovalRequestFromRejectedApproval>
>;

function buildAssignedAgentLabel(
  assignedAgent: ApprovalQueueListItem["conversation"]["assignedAgent"],
) {
  if (!assignedAgent || !assignedAgent.isActive) {
    return null;
  }

  return assignedAgent.goal?.trim() || "Assigned agent";
}

function buildDraftPreview(input: {
  bodyText: string | null;
  bodyHtml: string | null;
}) {
  const preview =
    input.bodyText?.trim() ||
    input.bodyHtml?.trim() ||
    "Draft content unavailable.";

  return preview.length > 200 ? `${preview.slice(0, 197)}...` : preview;
}

function buildSenderLabel(
  message: ApprovalRequestDetail["recentMessages"][number],
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

function buildTimestamp(
  message: ApprovalRequestDetail["recentMessages"][number],
) {
  return message.sentAt || message.receivedAt || message.createdAt;
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function toApprovalQueueListRow(item: ApprovalQueueListItem): ApprovalQueueListRow {
  return {
    ...item,
    title: buildConversationTitle(item.conversation as QueueConversationDisplay),
    participantSummary: formatParticipantSummary(
      item.conversation.platform,
      item.conversation.participants,
    ),
    draftPreview: buildDraftPreview(item.draftMessage),
    assignedAgentLabel: buildAssignedAgentLabel(item.conversation.assignedAgent),
  };
}

function toApprovalQueueDetailView(
  detail: ApprovalRequestDetail,
): ApprovalQueueDetailView {
  return {
    ...detail,
    title: buildConversationTitle(detail.conversation as QueueConversationDisplay),
    participantSummary: formatParticipantSummary(
      detail.conversation.platform,
      detail.conversation.participants,
    ),
    assignedAgentLabel: buildAssignedAgentLabel(detail.conversation.assignedAgent),
    draftPreview: buildDraftPreview(detail.draftMessage),
    recentMessages: detail.recentMessages.map((message) => ({
      ...message,
      senderLabel: buildSenderLabel(message),
      timestamp: buildTimestamp(message),
    })),
  };
}

export async function listWorkspaceApprovalQueue(
  input: ApprovalQueueListFilters & {
    workspaceId: string;
  },
): Promise<ApprovalQueueListRow[]> {
  const items = await listApprovalRequests({
    workspaceId: input.workspaceId,
    filter: input.filter ?? APPROVAL_REQUEST_STATUSES.PENDING,
    limit: input.limit,
    reviewedSince: input.reviewedSince ?? null,
  });

  return items.map(toApprovalQueueListRow);
}

export async function getWorkspaceApprovalQueueDetail(input: {
  workspaceId: string;
  approvalRequestId: string;
  recentMessageLimit?: number;
}): Promise<ApprovalQueueDetailView | null> {
  const detail = await getApprovalRequestDetail({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    recentMessageLimit: input.recentMessageLimit,
  });

  return detail ? toApprovalQueueDetailView(detail) : null;
}

export async function approveWorkspaceApprovalRequest(
  input: WorkspaceScopedApprovalDecisionInput,
): Promise<ApprovalContinuationResult> {
  const approvalDetail = await getWorkspaceApprovalQueueDetail({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    recentMessageLimit: 1,
  });

  if (!approvalDetail) {
    throw new Error("The approval request could not be loaded.");
  }

  const review = await reviewApprovalRequest({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    reviewedByUserId: input.actorUserId,
    decision: APPROVAL_REQUEST_STATUSES.APPROVED,
    nextConversationState: input.nextConversationState ?? null,
  });

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.APPROVAL_APPROVED,
      workspaceId: input.workspaceId,
      entityType: ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST,
      entityId: review.approvalRequestId,
      source: ENVOY_EVENT_SOURCES.APPROVAL,
      payload: {
        approvalRequestId: review.approvalRequestId,
        conversationId: review.conversationId,
        draftMessageId: review.draftMessageId,
        reviewedByUserId: review.reviewedByUserId ?? input.actorUserId,
        metadata: {
          provider: null,
          conversationState: review.conversationState,
          edited: false,
        },
      },
    }),
  );

  return {
    review,
    queue: await queueApprovedDraftSend({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      approvalRequestId: review.approvalRequestId,
      draftMessageId: review.draftMessageId,
    }),
  };
}

export async function rejectWorkspaceApprovalRequest(
  input: WorkspaceScopedApprovalDecisionInput & {
    rejectionReason: string;
  },
) {
  const review = await reviewApprovalRequest({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    reviewedByUserId: input.actorUserId,
    decision: APPROVAL_REQUEST_STATUSES.REJECTED,
    rejectionReason: input.rejectionReason,
    nextConversationState: input.nextConversationState ?? null,
  });

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.APPROVAL_REJECTED,
      workspaceId: input.workspaceId,
      entityType: ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST,
      entityId: review.approvalRequestId,
      source: ENVOY_EVENT_SOURCES.APPROVAL,
      payload: {
        approvalRequestId: review.approvalRequestId,
        conversationId: review.conversationId,
        draftMessageId: review.draftMessageId,
        reviewedByUserId: review.reviewedByUserId ?? input.actorUserId,
        rejectionReason: review.rejectionReason ?? input.rejectionReason,
        metadata: {
          provider: null,
          autoAgentTriggerEligible: true,
          conversationState: review.conversationState,
        },
      },
    }),
  );

  return review;
}

export async function editAndApproveWorkspaceApprovalRequest(
  input: WorkspaceScopedApprovalDecisionInput & {
    editedContent: string;
  },
): Promise<ApprovalContinuationResult> {
  const approvalDetail = await getWorkspaceApprovalQueueDetail({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    recentMessageLimit: 1,
  });

  if (!approvalDetail) {
    throw new Error("The approval request could not be loaded.");
  }

  const review = await reviewApprovalRequest({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    reviewedByUserId: input.actorUserId,
    decision: APPROVAL_REQUEST_STATUSES.APPROVED,
    editedContent: input.editedContent,
    nextConversationState: input.nextConversationState ?? null,
  });

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.APPROVAL_APPROVED,
      workspaceId: input.workspaceId,
      entityType: ENVOY_EVENT_ENTITY_TYPES.APPROVAL_REQUEST,
      entityId: review.approvalRequestId,
      source: ENVOY_EVENT_SOURCES.APPROVAL,
      payload: {
        approvalRequestId: review.approvalRequestId,
        conversationId: review.conversationId,
        draftMessageId: review.draftMessageId,
        reviewedByUserId: review.reviewedByUserId ?? input.actorUserId,
        metadata: {
          provider: null,
          conversationState: review.conversationState,
          edited: true,
        },
      },
    }),
  );

  return {
    review,
    queue: await queueApprovedDraftSend({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      approvalRequestId: review.approvalRequestId,
      draftMessageId: review.draftMessageId,
    }),
  };
}

export async function reviseRejectedWorkspaceApprovalRequest(
  input: WorkspaceScopedApprovalDecisionInput & {
    revisedContent: string;
  },
): Promise<ApprovalRevisionResult> {
  return createRevisedApprovalRequestFromRejectedApproval({
    workspaceId: input.workspaceId,
    approvalRequestId: input.approvalRequestId,
    revisedBodyText: input.revisedContent,
    actorContext: {
      actorType: "USER",
      actorUserId: input.actorUserId,
    },
  });
}

export async function listCurrentWorkspaceApprovalQueue(
  filters: ApprovalQueueListFilters = {},
): Promise<ApprovalQueueListRow[]> {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);

  return listWorkspaceApprovalQueue({
    workspaceId: authContext.workspaceId,
    ...filters,
  });
}

export async function getCurrentWorkspaceApprovalQueueDetail(input: {
  approvalRequestId: string;
  recentMessageLimit?: number;
}): Promise<ApprovalQueueDetailView | null> {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);

  return getWorkspaceApprovalQueueDetail({
    workspaceId: authContext.workspaceId,
    approvalRequestId: input.approvalRequestId,
    recentMessageLimit: input.recentMessageLimit,
  });
}

export async function approveCurrentWorkspaceApprovalRequest(input: {
  approvalRequestId: string;
  nextConversationState?: Parameters<typeof approveWorkspaceApprovalRequest>[0]["nextConversationState"];
}) {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);
  assertCanSendApprovedDrafts(authContext.role);

  return approveWorkspaceApprovalRequest({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    approvalRequestId: input.approvalRequestId,
    nextConversationState: input.nextConversationState,
  });
}

export async function rejectCurrentWorkspaceApprovalRequest(input: {
  approvalRequestId: string;
  rejectionReason: string;
  nextConversationState?: Parameters<typeof rejectWorkspaceApprovalRequest>[0]["nextConversationState"];
}) {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);

  return rejectWorkspaceApprovalRequest({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    approvalRequestId: input.approvalRequestId,
    rejectionReason: input.rejectionReason,
    nextConversationState: input.nextConversationState,
  });
}

export async function editAndApproveCurrentWorkspaceApprovalRequest(input: {
  approvalRequestId: string;
  editedContent: string;
  nextConversationState?: Parameters<typeof editAndApproveWorkspaceApprovalRequest>[0]["nextConversationState"];
}) {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);
  assertCanSendApprovedDrafts(authContext.role);

  return editAndApproveWorkspaceApprovalRequest({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    approvalRequestId: input.approvalRequestId,
    editedContent: input.editedContent,
    nextConversationState: input.nextConversationState,
  });
}

export async function reviseRejectedCurrentWorkspaceApprovalRequest(input: {
  approvalRequestId: string;
  revisedContent: string;
}) {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);

  return reviseRejectedWorkspaceApprovalRequest({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    approvalRequestId: input.approvalRequestId,
    revisedContent: input.revisedContent,
  });
}

function assertCanSendApprovedDrafts(role: Parameters<typeof hasPermission>[0]) {
  if (!hasPermission(role, PERMISSIONS.SEND_MESSAGES)) {
    throw new Error(
      "You do not have permission to send approved drafts.",
    );
  }
}

async function queueApprovedDraftSend(input: {
  workspaceId: string;
  actorUserId: string;
  approvalRequestId: string;
  draftMessageId: string;
}): Promise<ApprovedDraftQueueResult> {
  const prisma = getPrisma();
  const approvalRequest = await prisma.approvalRequest.findFirst({
    where: {
      id: input.approvalRequestId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      draftMessageId: true,
      status: true,
      draftMessage: {
        select: {
          id: true,
          workspaceId: true,
          conversationId: true,
          platform: true,
          senderType: true,
          direction: true,
          status: true,
          platformMetadataJson: true,
        },
      },
      conversation: {
        select: {
          id: true,
          workspaceId: true,
          integrationId: true,
          platform: true,
        },
      },
    },
  });

  if (!approvalRequest) {
    throw new Error("The approved draft could not be loaded for queueing.");
  }

  if (approvalRequest.status !== APPROVAL_REQUEST_STATUSES.APPROVED) {
    throw new Error("Only approved drafts can be queued for send.");
  }

  if (
    approvalRequest.draftMessageId !== input.draftMessageId ||
    approvalRequest.draftMessage.id !== input.draftMessageId
  ) {
    throw new Error("Approval request draft does not match the queued message.");
  }

  if (
    approvalRequest.conversationId !== approvalRequest.draftMessage.conversationId ||
    approvalRequest.conversation.id !== approvalRequest.conversationId
  ) {
    throw new Error("Approval request conversation does not match the queued message.");
  }

  if (
    approvalRequest.draftMessage.workspaceId !== input.workspaceId ||
    approvalRequest.conversation.workspaceId !== input.workspaceId
  ) {
    throw new Error("Approval request draft does not belong to this workspace.");
  }

  if (
    approvalRequest.draftMessage.senderType !== "AGENT" ||
    approvalRequest.draftMessage.direction !== "OUTBOUND"
  ) {
    throw new Error("Only outbound AI drafts can be queued after approval.");
  }

  if (
    approvalRequest.draftMessage.status !== "APPROVED" &&
    approvalRequest.draftMessage.status !== "QUEUED"
  ) {
    throw new Error("Approved draft is not in a queueable message state.");
  }

  if (
    approvalRequest.conversation.platform !== "EMAIL" &&
    approvalRequest.conversation.platform !== "SLACK"
  ) {
    throw new Error("Approved draft platform is not send-capable.");
  }

  const enqueueResult = await enqueueRuntimeJob({
    queueName: WORKER_QUEUE_NAMES.OUTBOUND_SEND,
    jobType: WORKER_JOB_TYPES.OUTBOUND_SEND_MESSAGE,
    workspaceId: input.workspaceId,
    payload: {
      workspaceId: input.workspaceId,
      conversationId: approvalRequest.conversationId,
      messageId: approvalRequest.draftMessageId,
      integrationId: approvalRequest.conversation.integrationId,
      platform: approvalRequest.conversation.platform,
      requestedByUserId: input.actorUserId,
      sendSource: "approval",
      approvalRequestId: approvalRequest.id,
      requestedAt: new Date().toISOString(),
    },
    dedupeKey:
      `outbound-send:${input.workspaceId}:${approvalRequest.draftMessageId}` +
      `:approval:${approvalRequest.id}`,
    retryPolicy: {
      maxAttempts: 3,
    },
  });

  await prisma.message.updateMany({
    where: {
      id: approvalRequest.draftMessageId,
      workspaceId: input.workspaceId,
      status: {
        in: ["APPROVED", "QUEUED"],
      },
    },
    data: {
      status: "QUEUED",
      platformMetadataJson: toPrismaJsonValue({
        ...(approvalRequest.draftMessage.platformMetadataJson &&
        typeof approvalRequest.draftMessage.platformMetadataJson === "object" &&
        !Array.isArray(approvalRequest.draftMessage.platformMetadataJson)
          ? approvalRequest.draftMessage.platformMetadataJson
          : {}),
        queuedFromApproval: true,
        approvalRequestId: approvalRequest.id,
        queuedByUserId: input.actorUserId,
        queuedAt: new Date().toISOString(),
      }),
    },
  });

  return {
    ...enqueueResult,
    approvalRequestId: approvalRequest.id,
    draftMessageId: approvalRequest.draftMessageId,
  };
}
