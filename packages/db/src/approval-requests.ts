import {
  CONVERSATION_STATES,
  CONVERSATION_WORKFLOW_TRIGGER_TYPES,
  transitionConversationState,
  type ConversationState,
} from "../../events/src";

import { getPrisma } from "./client";

export const APPROVAL_REQUEST_STATUSES = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type ApprovalRequestStatus =
  (typeof APPROVAL_REQUEST_STATUSES)[keyof typeof APPROVAL_REQUEST_STATUSES];

export type ApprovalReviewDecision =
  | typeof APPROVAL_REQUEST_STATUSES.APPROVED
  | typeof APPROVAL_REQUEST_STATUSES.REJECTED;

export const APPROVAL_ACTION_TYPES = {
  MESSAGE_DRAFTED: "MESSAGE_DRAFTED",
  APPROVAL_REQUESTED: "APPROVAL_REQUESTED",
  APPROVAL_APPROVED: "APPROVAL_APPROVED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  STATE_CHANGED: "STATE_CHANGED",
} as const;

export type ApprovalActionType =
  (typeof APPROVAL_ACTION_TYPES)[keyof typeof APPROVAL_ACTION_TYPES];

export type ApprovalActorContext = {
  actorType: "USER" | "AGENT" | "SYSTEM";
  actorUserId?: string | null;
  actorAgentAssignmentId?: string | null;
};

export type ApprovalActionLogRecord = {
  id: string;
  actionType: ApprovalActionType;
  actorType: ApprovalActorContext["actorType"];
  createdAt: Date;
};

export type CreateApprovalRequestForAgentDraftInput = {
  workspaceId: string;
  conversationId: string;
  bodyText: string;
  bodyHtml?: string | null;
  proposedByAgentAssignmentId?: string | null;
  actorContext?: ApprovalActorContext | null;
  platformMetadataJson?: unknown;
};

export type CreateApprovalRequestForAgentDraftResult = {
  workspaceId: string;
  conversationId: string;
  approvalRequestId: string;
  draftMessageId: string;
  approvalStatus: ApprovalRequestStatus;
  messageStatus: "PENDING_APPROVAL";
  previousConversationState: ConversationState;
  conversationState: ConversationState;
  actionLogs: ApprovalActionLogRecord[];
};

export type ReviewApprovalRequestInput = {
  workspaceId: string;
  approvalRequestId: string;
  reviewedByUserId: string;
  decision: ApprovalReviewDecision;
  rejectionReason?: string | null;
  editedContent?: string | null;
  nextConversationState?: ConversationState | null;
};

export type ReviewApprovalRequestResult = {
  workspaceId: string;
  conversationId: string;
  approvalRequestId: string;
  draftMessageId: string;
  approvalStatus: ApprovalReviewDecision;
  messageStatus: "APPROVED" | "REJECTED";
  reviewedAt: Date;
  reviewedByUserId: string;
  rejectionReason: string | null;
  editedContent: string | null;
  previousConversationState: ConversationState;
  conversationState: ConversationState;
  actionLogs: ApprovalActionLogRecord[];
};

export type ApprovalQueueFilter =
  | typeof APPROVAL_REQUEST_STATUSES.PENDING
  | "RECENTLY_REVIEWED"
  | "ALL";

export type ApprovalQueueParticipant = {
  id: string;
  externalParticipantId: string | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  isInternal: boolean;
};

export type ApprovalQueueConversationSummary = {
  id: string;
  platform: "EMAIL" | "SLACK";
  subject: string | null;
  state: ConversationState;
  lastMessageAt: Date | null;
  participants: ApprovalQueueParticipant[];
  assignedAgent: {
    id: string;
    goal: string;
    isActive: boolean;
  } | null;
};

export type ApprovalQueueMessageSummary = {
  id: string;
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
  bodyText: string | null;
  bodyHtml: string | null;
  senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  senderParticipant: ApprovalQueueParticipant | null;
};

export type ApprovalQueueListItem = {
  approvalRequestId: string;
  workspaceId: string;
  conversationId: string;
  draftMessageId: string;
  proposedByAgentAssignmentId: string | null;
  status: ApprovalRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  editedContent: string | null;
  conversation: ApprovalQueueConversationSummary;
  draftMessage: ApprovalQueueMessageSummary;
};

export type ApprovalQueueListInput = {
  workspaceId: string;
  filter?: ApprovalQueueFilter;
  limit?: number;
  reviewedSince?: Date | null;
};

export type ApprovalRequestDetail = {
  approvalRequestId: string;
  workspaceId: string;
  conversationId: string;
  draftMessageId: string;
  proposedByAgentAssignmentId: string | null;
  status: ApprovalRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  editedContent: string | null;
  conversation: ApprovalQueueConversationSummary;
  draftMessage: ApprovalQueueMessageSummary;
  recentMessages: ApprovalQueueMessageSummary[];
};

export type ApprovalRequestDetailInput = {
  workspaceId: string;
  approvalRequestId: string;
  recentMessageLimit?: number;
};

export class ApprovalRequestTransitionError extends Error {
  readonly from: ApprovalRequestStatus;
  readonly to: ApprovalRequestStatus;
  readonly allowedNextStatuses: readonly ApprovalRequestStatus[];

  constructor(input: {
    from: ApprovalRequestStatus;
    to: ApprovalRequestStatus;
    allowedNextStatuses: readonly ApprovalRequestStatus[];
  }) {
    super(
      [
        `Invalid approval status transition ${input.from} -> ${input.to}.`,
        `Allowed next statuses: ${input.allowedNextStatuses.join(", ") || "none"}.`,
      ].join(" "),
    );
    this.name = "ApprovalRequestTransitionError";
    this.from = input.from;
    this.to = input.to;
    this.allowedNextStatuses = input.allowedNextStatuses;
  }
}

export const ALLOWED_APPROVAL_REQUEST_STATUS_TRANSITIONS: Readonly<
  Record<ApprovalRequestStatus, readonly ApprovalRequestStatus[]>
> = {
  PENDING: [
    APPROVAL_REQUEST_STATUSES.APPROVED,
    APPROVAL_REQUEST_STATUSES.REJECTED,
    APPROVAL_REQUEST_STATUSES.CANCELLED,
  ],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
} as const;

export function getAllowedApprovalRequestStatusTransitions(
  status: ApprovalRequestStatus,
) {
  return ALLOWED_APPROVAL_REQUEST_STATUS_TRANSITIONS[status];
}

export function isValidApprovalRequestStatusTransition(
  from: ApprovalRequestStatus,
  to: ApprovalRequestStatus,
) {
  if (from === to) {
    return true;
  }

  return getAllowedApprovalRequestStatusTransitions(from).includes(to);
}

export function assertValidApprovalRequestStatusTransition(
  from: ApprovalRequestStatus,
  to: ApprovalRequestStatus,
) {
  if (isValidApprovalRequestStatusTransition(from, to)) {
    return;
  }

  throw new ApprovalRequestTransitionError({
    from,
    to,
    allowedNextStatuses: getAllowedApprovalRequestStatusTransitions(from),
  });
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEditedContent(value: string | null | undefined) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value.trim();
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function toApprovalQueueParticipant(input: {
  id: string;
  externalParticipantId: string | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  isInternal: boolean;
}): ApprovalQueueParticipant {
  return input;
}

function toApprovalQueueMessageSummary(input: {
  id: string;
  status: ApprovalQueueMessageSummary["status"];
  bodyText: string | null;
  bodyHtml: string | null;
  senderType: ApprovalQueueMessageSummary["senderType"];
  direction: ApprovalQueueMessageSummary["direction"];
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  senderParticipant?: {
    id: string;
    externalParticipantId: string | null;
    displayName: string | null;
    email: string | null;
    handle: string | null;
    isInternal: boolean;
  } | null;
}): ApprovalQueueMessageSummary {
  return {
    id: input.id,
    status: input.status,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    senderType: input.senderType,
    direction: input.direction,
    createdAt: input.createdAt,
    sentAt: input.sentAt,
    receivedAt: input.receivedAt,
    senderParticipant: input.senderParticipant
      ? toApprovalQueueParticipant(input.senderParticipant)
      : null,
  };
}

function toApprovalQueueConversationSummary(input: {
  id: string;
  platform: "EMAIL" | "SLACK";
  subject: string | null;
  state: ConversationState;
  lastMessageAt: Date | null;
  participants: Array<{
    id: string;
    externalParticipantId: string | null;
    displayName: string | null;
    email: string | null;
    handle: string | null;
    isInternal: boolean;
  }>;
  assignedAgent: {
    id: string;
    goal: string;
    isActive: boolean;
  } | null;
}): ApprovalQueueConversationSummary {
  return {
    id: input.id,
    platform: input.platform,
    subject: input.subject,
    state: input.state,
    lastMessageAt: input.lastMessageAt,
    participants: input.participants.map(toApprovalQueueParticipant),
    assignedAgent: input.assignedAgent,
  };
}

function toApprovalQueueListItem(input: {
  id: string;
  workspaceId: string;
  conversationId: string;
  draftMessageId: string;
  proposedByAgentAssignmentId: string | null;
  status: ApprovalRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  editedContent: string | null;
  conversation: {
    id: string;
    platform: "EMAIL" | "SLACK";
    subject: string | null;
    state: ConversationState;
    lastMessageAt: Date | null;
    participants: Array<ApprovalQueueParticipant>;
    assignedAgent: {
      id: string;
      goal: string;
      isActive: boolean;
    } | null;
  };
  draftMessage: ApprovalQueueMessageSummary;
}): ApprovalQueueListItem {
  return {
    approvalRequestId: input.id,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    draftMessageId: input.draftMessageId,
    proposedByAgentAssignmentId: input.proposedByAgentAssignmentId,
    status: input.status,
    createdAt: input.createdAt,
    reviewedAt: input.reviewedAt,
    reviewedByUserId: input.reviewedByUserId,
    rejectionReason: input.rejectionReason,
    editedContent: input.editedContent,
    conversation: input.conversation,
    draftMessage: input.draftMessage,
  };
}

function toApprovalActionLogRecord(input: {
  id: string;
  actionType: string;
  actorType: string;
  createdAt: Date;
}): ApprovalActionLogRecord {
  return {
    id: input.id,
    actionType: input.actionType as ApprovalActionType,
    actorType: input.actorType as ApprovalActorContext["actorType"],
    createdAt: input.createdAt,
  };
}

function buildMessageDraftedActor(
  input: CreateApprovalRequestForAgentDraftInput,
): ApprovalActorContext {
  if (input.actorContext) {
    return input.actorContext;
  }

  if (input.proposedByAgentAssignmentId) {
    return {
      actorType: "AGENT",
      actorAgentAssignmentId: input.proposedByAgentAssignmentId,
    };
  }

  return {
    actorType: "SYSTEM",
  };
}

function assertValidActorContext(actorContext: ApprovalActorContext) {
  if (actorContext.actorType === "USER" && !actorContext.actorUserId) {
    throw new Error("A USER approval actor must include actorUserId.");
  }

  if (
    actorContext.actorType === "AGENT" &&
    !actorContext.actorAgentAssignmentId
  ) {
    throw new Error(
      "An AGENT approval actor must include actorAgentAssignmentId.",
    );
  }
}

function toMessageStatusFromApprovalDecision(decision: ApprovalReviewDecision) {
  return decision === APPROVAL_REQUEST_STATUSES.APPROVED
    ? "APPROVED"
    : "REJECTED";
}

function buildApprovalQueueWhere(input: ApprovalQueueListInput) {
  const filter = input.filter ?? APPROVAL_REQUEST_STATUSES.PENDING;

  if (filter === "ALL") {
    return {
      workspaceId: input.workspaceId,
    };
  }

  if (filter === "RECENTLY_REVIEWED") {
    return {
      workspaceId: input.workspaceId,
      status: {
        in: [
          APPROVAL_REQUEST_STATUSES.APPROVED,
          APPROVAL_REQUEST_STATUSES.REJECTED,
        ],
      },
      reviewedAt: input.reviewedSince
        ? {
            gte: input.reviewedSince,
          }
        : {
            not: null,
          },
    };
  }

  return {
    workspaceId: input.workspaceId,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
  };
}

export async function listApprovalRequests(
  input: ApprovalQueueListInput,
): Promise<ApprovalQueueListItem[]> {
  const prisma = getPrisma();
  const records = await prisma.approvalRequest.findMany({
    where: buildApprovalQueueWhere(input),
    orderBy:
      input.filter === "RECENTLY_REVIEWED"
        ? [{ reviewedAt: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 50, 200)),
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      draftMessageId: true,
      proposedByAgentAssignmentId: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      rejectionReason: true,
      editedContent: true,
      conversation: {
        select: {
          id: true,
          platform: true,
          subject: true,
          state: true,
          lastMessageAt: true,
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
          assignedAgent: {
            select: {
              id: true,
              goal: true,
              isActive: true,
            },
          },
        },
      },
      draftMessage: {
        select: {
          id: true,
          status: true,
          bodyText: true,
          bodyHtml: true,
          senderType: true,
          direction: true,
          createdAt: true,
          sentAt: true,
          receivedAt: true,
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
        },
      },
    },
  });

  return records.map((record) =>
    toApprovalQueueListItem({
      ...record,
      conversation: toApprovalQueueConversationSummary({
        ...record.conversation,
        participants: record.conversation.participants,
      }),
      draftMessage: toApprovalQueueMessageSummary(record.draftMessage),
    }),
  );
}

export async function getApprovalRequestDetail(
  input: ApprovalRequestDetailInput,
): Promise<ApprovalRequestDetail | null> {
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
      proposedByAgentAssignmentId: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      rejectionReason: true,
      editedContent: true,
      conversation: {
        select: {
          id: true,
          platform: true,
          subject: true,
          state: true,
          lastMessageAt: true,
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
          assignedAgent: {
            select: {
              id: true,
              goal: true,
              isActive: true,
            },
          },
          messages: {
            where: {
              deletedAt: null,
            },
            orderBy: [{ createdAt: "desc" }],
            take: Math.max(1, Math.min(input.recentMessageLimit ?? 10, 50)),
            select: {
              id: true,
              status: true,
              bodyText: true,
              bodyHtml: true,
              senderType: true,
              direction: true,
              createdAt: true,
              sentAt: true,
              receivedAt: true,
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
            },
          },
        },
      },
      draftMessage: {
        select: {
          id: true,
          status: true,
          bodyText: true,
          bodyHtml: true,
          senderType: true,
          direction: true,
          createdAt: true,
          sentAt: true,
          receivedAt: true,
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
        },
      },
    },
  });

  if (!approvalRequest) {
    return null;
  }

  return {
    approvalRequestId: approvalRequest.id,
    workspaceId: approvalRequest.workspaceId,
    conversationId: approvalRequest.conversationId,
    draftMessageId: approvalRequest.draftMessageId,
    proposedByAgentAssignmentId: approvalRequest.proposedByAgentAssignmentId,
    status: approvalRequest.status,
    createdAt: approvalRequest.createdAt,
    reviewedAt: approvalRequest.reviewedAt,
    reviewedByUserId: approvalRequest.reviewedByUserId,
    rejectionReason: approvalRequest.rejectionReason,
    editedContent: approvalRequest.editedContent,
    conversation: toApprovalQueueConversationSummary({
      ...approvalRequest.conversation,
      participants: approvalRequest.conversation.participants,
    }),
    draftMessage: toApprovalQueueMessageSummary(approvalRequest.draftMessage),
    recentMessages: approvalRequest.conversation.messages
      .slice()
      .reverse()
      .map(toApprovalQueueMessageSummary),
  };
}

export async function createApprovalRequestForAgentDraft(
  input: CreateApprovalRequestForAgentDraftInput,
): Promise<CreateApprovalRequestForAgentDraftResult> {
  const prisma = getPrisma();
  const bodyText = input.bodyText.trim();

  if (!bodyText) {
    throw new Error("AI draft body text is required.");
  }

  const draftedByActor = buildMessageDraftedActor(input);
  assertValidActorContext(draftedByActor);

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        workspaceId: true,
        platform: true,
        state: true,
      },
    });

    if (!conversation) {
      throw new Error("The conversation for the approval draft could not be loaded.");
    }

    if (input.proposedByAgentAssignmentId) {
      const agentAssignment = await tx.agentAssignment.findFirst({
        where: {
          id: input.proposedByAgentAssignmentId,
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
        },
        select: {
          id: true,
        },
      });

      if (!agentAssignment) {
        throw new Error(
          "The proposed agent assignment does not belong to this conversation.",
        );
      }
    }

    const conversationTransition = transitionConversationState({
      conversationId: conversation.id,
      from: conversation.state,
      to: CONVERSATION_STATES.AWAITING_APPROVAL,
      event: {
        triggerType: CONVERSATION_WORKFLOW_TRIGGER_TYPES.APPROVAL_REQUIRED,
        source: "approval",
        metadata: {
          workspaceId: input.workspaceId,
        },
      },
      reason: "AI-generated outbound draft requires human review.",
    });

    const draftMessage = await tx.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        platform: conversation.platform,
        senderType: "AGENT",
        direction: "OUTBOUND",
        bodyText,
        bodyHtml: input.bodyHtml ?? null,
        status: "PENDING_APPROVAL",
        platformMetadataJson: toPrismaJsonValue({
          approvalRequired: true,
          draftOrigin: "agent",
          ...(input.platformMetadataJson &&
          typeof input.platformMetadataJson === "object" &&
          !Array.isArray(input.platformMetadataJson)
            ? (input.platformMetadataJson as Record<string, unknown>)
            : {}),
        }),
      },
      select: {
        id: true,
      },
    });

    const approvalRequest = await tx.approvalRequest.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        draftMessageId: draftMessage.id,
        proposedByAgentAssignmentId: input.proposedByAgentAssignmentId ?? null,
        status: APPROVAL_REQUEST_STATUSES.PENDING,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (conversationTransition.changed) {
      await tx.conversation.update({
        where: {
          id: conversation.id,
        },
        data: {
          state: conversationTransition.to,
        },
      });
    }

    const actionLogs = await Promise.all([
      tx.actionLog.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          messageId: draftMessage.id,
          approvalRequestId: approvalRequest.id,
          actorType: draftedByActor.actorType,
          actorUserId: draftedByActor.actorUserId ?? null,
          actorAgentAssignmentId: draftedByActor.actorAgentAssignmentId ?? null,
          actionType: APPROVAL_ACTION_TYPES.MESSAGE_DRAFTED,
          metadataJson: toPrismaJsonValue({
            messageStatus: "PENDING_APPROVAL",
            draftOrigin: "agent",
          }),
        },
        select: {
          id: true,
          actionType: true,
          actorType: true,
          createdAt: true,
        },
      }),
      tx.actionLog.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          messageId: draftMessage.id,
          approvalRequestId: approvalRequest.id,
          actorType: "SYSTEM",
          actionType: APPROVAL_ACTION_TYPES.APPROVAL_REQUESTED,
          metadataJson: toPrismaJsonValue({
            approvalStatus: approvalRequest.status,
            draftMessageId: draftMessage.id,
            proposedByAgentAssignmentId: input.proposedByAgentAssignmentId ?? null,
          }),
        },
        select: {
          id: true,
          actionType: true,
          actorType: true,
          createdAt: true,
        },
      }),
    ]);

    if (conversationTransition.changed) {
      actionLogs.push(
        await tx.actionLog.create({
          data: {
            workspaceId: input.workspaceId,
            conversationId: conversation.id,
            messageId: draftMessage.id,
            approvalRequestId: approvalRequest.id,
            actorType: "SYSTEM",
            actionType: APPROVAL_ACTION_TYPES.STATE_CHANGED,
            metadataJson: toPrismaJsonValue({
              previousState: conversationTransition.from,
              nextState: conversationTransition.to,
              triggerType: conversationTransition.event.triggerType,
              reason: conversationTransition.reason,
            }),
          },
          select: {
            id: true,
            actionType: true,
            actorType: true,
            createdAt: true,
          },
        }),
      );
    }

    return {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      approvalRequestId: approvalRequest.id,
      draftMessageId: draftMessage.id,
      approvalStatus: approvalRequest.status,
      messageStatus: "PENDING_APPROVAL",
      previousConversationState: conversation.state,
      conversationState: conversationTransition.to,
      actionLogs: actionLogs.map(toApprovalActionLogRecord),
    };
  });
}

export async function reviewApprovalRequest(
  input: ReviewApprovalRequestInput,
): Promise<ReviewApprovalRequestResult> {
  const prisma = getPrisma();
  const editedContent = normalizeEditedContent(input.editedContent);
  const rejectionReason = normalizeEditedContent(input.rejectionReason);

  if (
    input.decision === APPROVAL_REQUEST_STATUSES.APPROVED &&
    rejectionReason
  ) {
    throw new Error("Approved drafts cannot store a rejection reason.");
  }

  if (
    input.decision === APPROVAL_REQUEST_STATUSES.REJECTED &&
    editedContent
  ) {
    throw new Error("Rejected drafts cannot store edited content.");
  }

  return prisma.$transaction(async (tx) => {
    const approvalRequest = await tx.approvalRequest.findFirst({
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
        conversation: {
          select: {
            id: true,
            state: true,
          },
        },
        draftMessage: {
          select: {
            id: true,
            workspaceId: true,
            conversationId: true,
            direction: true,
            senderType: true,
            status: true,
            bodyText: true,
          },
        },
      },
    });

    if (!approvalRequest) {
      throw new Error("The approval request could not be loaded.");
    }

    if (approvalRequest.draftMessage.conversationId !== approvalRequest.conversationId) {
      throw new Error(
        "The approval request draft message does not belong to the approval conversation.",
      );
    }

    if (
      approvalRequest.draftMessage.workspaceId !== input.workspaceId ||
      approvalRequest.workspaceId !== input.workspaceId
    ) {
      throw new Error("The approval request does not belong to this workspace.");
    }

    if (approvalRequest.draftMessage.direction !== "OUTBOUND") {
      throw new Error("Only outbound drafts can be reviewed for approval.");
    }

    if (approvalRequest.draftMessage.senderType !== "AGENT") {
      throw new Error("Only agent-generated drafts can use the approval flow.");
    }

    assertValidApprovalRequestStatusTransition(
      approvalRequest.status,
      input.decision,
    );

    const reviewedAt = new Date();
    const nextConversationState =
      input.nextConversationState ??
      (approvalRequest.conversation.state === CONVERSATION_STATES.AWAITING_APPROVAL
        ? CONVERSATION_STATES.ACTIVE
        : approvalRequest.conversation.state);
    const conversationTransition = transitionConversationState({
      conversationId: approvalRequest.conversation.id,
      from: approvalRequest.conversation.state,
      to: nextConversationState,
      event: {
        triggerType: CONVERSATION_WORKFLOW_TRIGGER_TYPES.APPROVAL_RESOLVED,
        source: "approval",
        metadata: {
          approvalRequestId: approvalRequest.id,
          decision: input.decision,
        },
      },
      reason:
        input.decision === APPROVAL_REQUEST_STATUSES.APPROVED
          ? "Approval granted for AI-generated draft."
          : "Approval rejected for AI-generated draft.",
    });

    const messageStatus = toMessageStatusFromApprovalDecision(input.decision);

    await tx.message.update({
      where: {
        id: approvalRequest.draftMessage.id,
      },
      data: {
        status: messageStatus,
        bodyText:
          input.decision === APPROVAL_REQUEST_STATUSES.APPROVED && editedContent
            ? editedContent
            : undefined,
        bodyHtml:
          input.decision === APPROVAL_REQUEST_STATUSES.APPROVED && editedContent
            ? null
            : undefined,
        platformMetadataJson: editedContent
          ? toPrismaJsonValue({
              reviewedEditedContent: true,
            })
          : undefined,
      },
    });

    await tx.approvalRequest.update({
      where: {
        id: approvalRequest.id,
      },
      data: {
        status: input.decision,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt,
        rejectionReason:
          input.decision === APPROVAL_REQUEST_STATUSES.REJECTED
            ? rejectionReason
            : null,
        editedContent:
          input.decision === APPROVAL_REQUEST_STATUSES.APPROVED
            ? editedContent
            : null,
      },
    });

    if (conversationTransition.changed) {
      await tx.conversation.update({
        where: {
          id: approvalRequest.conversation.id,
        },
        data: {
          state: conversationTransition.to,
        },
      });
    }

    const actionLogs = [
      await tx.actionLog.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: approvalRequest.conversationId,
          messageId: approvalRequest.draftMessageId,
          approvalRequestId: approvalRequest.id,
          actorType: "USER",
          actorUserId: input.reviewedByUserId,
          actionType:
            input.decision === APPROVAL_REQUEST_STATUSES.APPROVED
              ? APPROVAL_ACTION_TYPES.APPROVAL_APPROVED
              : APPROVAL_ACTION_TYPES.APPROVAL_REJECTED,
          metadataJson: toPrismaJsonValue({
            approvalStatus: input.decision,
            rejectionReason:
              input.decision === APPROVAL_REQUEST_STATUSES.REJECTED
                ? rejectionReason
                : null,
            editedContentApplied:
              input.decision === APPROVAL_REQUEST_STATUSES.APPROVED &&
              Boolean(editedContent),
          }),
        },
        select: {
          id: true,
          actionType: true,
          actorType: true,
          createdAt: true,
        },
      }),
    ];

    if (conversationTransition.changed) {
      actionLogs.push(
        await tx.actionLog.create({
          data: {
            workspaceId: input.workspaceId,
            conversationId: approvalRequest.conversationId,
            messageId: approvalRequest.draftMessageId,
            approvalRequestId: approvalRequest.id,
            actorType: "USER",
            actorUserId: input.reviewedByUserId,
            actionType: APPROVAL_ACTION_TYPES.STATE_CHANGED,
            metadataJson: toPrismaJsonValue({
              previousState: conversationTransition.from,
              nextState: conversationTransition.to,
              triggerType: conversationTransition.event.triggerType,
              reason: conversationTransition.reason,
            }),
          },
          select: {
            id: true,
            actionType: true,
            actorType: true,
            createdAt: true,
          },
        }),
      );
    }

    return {
      workspaceId: input.workspaceId,
      conversationId: approvalRequest.conversationId,
      approvalRequestId: approvalRequest.id,
      draftMessageId: approvalRequest.draftMessageId,
      approvalStatus: input.decision,
      messageStatus,
      reviewedAt,
      reviewedByUserId: input.reviewedByUserId,
      rejectionReason:
        input.decision === APPROVAL_REQUEST_STATUSES.REJECTED
          ? rejectionReason
          : null,
      editedContent:
        input.decision === APPROVAL_REQUEST_STATUSES.APPROVED
          ? editedContent
          : null,
      previousConversationState: approvalRequest.conversation.state,
      conversationState: conversationTransition.to,
      actionLogs: actionLogs.map(toApprovalActionLogRecord),
    };
  });
}
