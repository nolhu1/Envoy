import "server-only";

import { getPrisma } from "@envoy/db";

import {
  parsePositiveLimit,
  readErrorSummary,
  readOperatorDate,
  readOperatorString,
  readPayloadString,
  summarizeOperatorMetadata,
} from "@/lib/operator-utils";

export type ApprovalHistoryFilters = {
  status?: string | null;
  reviewerId?: string | null;
  conversationId?: string | null;
  platform?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: string | number | null;
};

export type ApprovalHistoryRow = {
  id: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewer: string;
  reviewerId: string | null;
  conversationId: string;
  conversationTitle: string;
  platform: "EMAIL";
  draftMessageId: string;
  draftStatus: string;
  draftPreview: string;
  editedContentIndicator: string;
  rejectionReason: string | null;
  sendResult: string;
  runtimeJobId: string | null;
  deadLetterId: string | null;
  runtimeError: string | null;
  proposedByAgentAssignmentId: string | null;
  revisedDraftChain: string;
};

function normalizePlatform(value: string | null | undefined) {
  const normalized = value?.toUpperCase();
  return normalized === "EMAIL" ? normalized : null;
}

function dateRange(filters: ApprovalHistoryFilters) {
  const from = readOperatorDate(filters.from);
  const to = readOperatorDate(filters.to);

  return from || to
    ? {
        gte: from ?? undefined,
        lte: to ?? undefined,
      }
    : undefined;
}

function preview(value: string | null) {
  const text = value?.trim() || "Draft content unavailable.";

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function title(conversation: {
  subject: string | null;
  platform: "EMAIL";
  externalConversationId: string;
}) {
  return (
    conversation.subject?.trim() ||
    `Gmail ${conversation.externalConversationId}`
  );
}

function payloadApprovalId(value: unknown) {
  return readPayloadString(value, "approvalRequestId");
}

function payloadMessageId(value: unknown) {
  return readPayloadString(value, "messageId");
}

export async function listApprovalHistory(input: {
  workspaceId: string;
  filters?: ApprovalHistoryFilters;
}) {
  const prisma = getPrisma();
  const filters = input.filters ?? {};
  const platform = normalizePlatform(filters.platform);
  const status = readOperatorString(filters.status);
  const [approvals, runtimeJobs, deadLetters] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: status ? (status as never) : undefined,
        reviewedByUserId: readOperatorString(filters.reviewerId) ?? undefined,
        conversationId: readOperatorString(filters.conversationId) ?? undefined,
        createdAt: dateRange(filters),
        conversation: { platform: platform ?? "EMAIL" },
      },
      orderBy: [{ createdAt: "desc" }],
      take: parsePositiveLimit(filters.limit, 150, 500),
      select: {
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        reviewedByUserId: true,
        rejectionReason: true,
        editedContent: true,
        draftMessageId: true,
        proposedByAgentAssignmentId: true,
        reviewedByUser: {
          select: {
            email: true,
            name: true,
          },
        },
        draftMessage: {
          select: {
            id: true,
            status: true,
            bodyText: true,
            bodyHtml: true,
            platformMetadataJson: true,
          },
        },
        conversation: {
          select: {
            id: true,
            platform: true,
            subject: true,
            externalConversationId: true,
          },
        },
      },
    }),
    prisma.runtimeJob.findMany({
      where: {
        workspaceId: input.workspaceId,
        jobType: "outbound.send_message",
      },
      orderBy: [{ queuedAt: "desc" }],
      take: 300,
      select: {
        id: true,
        status: true,
        payloadJson: true,
        lastErrorJson: true,
      },
    }),
    prisma.deadLetterRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        runtimeJobId: true,
        errorJson: true,
      },
    }),
  ]);
  const deadLetterByRuntimeJobId = new Map(
    deadLetters.flatMap((record) =>
      record.runtimeJobId ? [[record.runtimeJobId, record] as const] : [],
    ),
  );

  return approvals.map((approval): ApprovalHistoryRow => {
    const relatedJob =
      runtimeJobs.find(
        (job) => payloadApprovalId(job.payloadJson) === approval.id,
      ) ??
      runtimeJobs.find(
        (job) => payloadMessageId(job.payloadJson) === approval.draftMessageId,
      ) ??
      null;
    const deadLetter = relatedJob
      ? deadLetterByRuntimeJobId.get(relatedJob.id) ?? null
      : null;
    const reviewer =
      approval.reviewedByUser?.name ??
      approval.reviewedByUser?.email ??
      (approval.reviewedByUserId ? `user:${approval.reviewedByUserId}` : "Not reviewed");
    const editedContentIndicator = approval.editedContent
      ? "Edited during approval"
      : "Original draft";
    const sendResult = relatedJob
      ? `${relatedJob.status} via worker`
      : ["QUEUED", "SENT", "DELIVERED", "FAILED"].includes(
            approval.draftMessage.status,
          )
        ? approval.draftMessage.status
        : "No send attempted";

    return {
      id: approval.id,
      status: approval.status,
      createdAt: approval.createdAt,
      reviewedAt: approval.reviewedAt,
      reviewer,
      reviewerId: approval.reviewedByUserId,
      conversationId: approval.conversation.id,
      conversationTitle: title(approval.conversation),
      platform: "EMAIL",
      draftMessageId: approval.draftMessageId,
      draftStatus: approval.draftMessage.status,
      draftPreview: preview(
        approval.editedContent ??
          approval.draftMessage.bodyText ??
          approval.draftMessage.bodyHtml,
      ),
      editedContentIndicator,
      rejectionReason: approval.rejectionReason,
      sendResult,
      runtimeJobId: relatedJob?.id ?? null,
      deadLetterId: deadLetter?.id ?? null,
      runtimeError:
        readErrorSummary(relatedJob?.lastErrorJson) ??
        readErrorSummary(deadLetter?.errorJson),
      proposedByAgentAssignmentId: approval.proposedByAgentAssignmentId,
      revisedDraftChain: summarizeOperatorMetadata(
        approval.draftMessage.platformMetadataJson,
      ),
    };
  });
}
