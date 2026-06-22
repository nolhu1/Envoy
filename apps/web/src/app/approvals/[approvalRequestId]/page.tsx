import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Alert,
  Badge,
  DecisionPanel,
  DetailLayout,
  FailedSendState,
  FormField,
  MessageList,
  MetadataList,
  PageContainer,
  PageHeader,
  Panel,
  StatusBadge,
  Textarea,
} from "@envoy/ui";

import { ApprovalSubmitButton } from "@/app/approvals/[approvalRequestId]/approval-submit-button";
import { ProductShell } from "@/components/product-shell";
import {
  approveApprovalRequestAction,
  editAndApproveApprovalRequestAction,
  rejectApprovalRequestAction,
  reviseRejectedApprovalRequestAction,
} from "@/app/approvals/[approvalRequestId]/actions";
import { getCurrentWorkspaceApprovalQueueDetail } from "@/lib/approval-queue";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ApprovalDetailPageProps = {
  params: Promise<{
    approvalRequestId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: Date | null) {
  if (!value) {
    return "Not yet reviewed";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function renderReviewAlert(input: {
  reviewStatus: string | undefined;
  reviewMessage: string | undefined;
}) {
  if (
    input.reviewStatus === "approved" ||
    input.reviewStatus === "approved-queued"
  ) {
    return (
      <Alert severity="success" title="Draft approved and queued">
        The draft was approved and queued for sending.
      </Alert>
    );
  }

  if (
    input.reviewStatus === "edit-approved" ||
    input.reviewStatus === "edit-approved-queued"
  ) {
    return (
      <Alert severity="success" title="Draft edited, approved, and queued">
        The reviewed draft was saved, approved, and queued for sending.
      </Alert>
    );
  }

  if (input.reviewStatus === "rejected") {
    return (
      <Alert severity="neutral" title="Draft rejected">
        The draft was rejected and recorded in approval history.
      </Alert>
    );
  }

  if (input.reviewStatus === "revised") {
    return (
      <Alert severity="info" title="Revised draft created">
        The revised draft was returned to the approval queue.
      </Alert>
    );
  }

  if (input.reviewStatus === "send-failed" && input.reviewMessage) {
    return (
      <FailedSendState
        title="Approved, but send failed"
        description={input.reviewMessage}
      />
    );
  }

  if (input.reviewStatus === "error" && input.reviewMessage) {
    return (
      <Alert severity="critical" title="Review failed">
        {input.reviewMessage}
      </Alert>
    );
  }

  return null;
}

export default async function ApprovalDetailPage({
  params,
  searchParams,
}: ApprovalDetailPageProps) {
  await requirePermission(PERMISSIONS.APPROVE_DRAFTS);

  const { approvalRequestId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const reviewStatus = readSearchParam(resolvedSearchParams?.review);
  const reviewMessage = readSearchParam(resolvedSearchParams?.message);
  const detail = await getCurrentWorkspaceApprovalQueueDetail({
    approvalRequestId,
    recentMessageLimit: 12,
  });

  if (!detail) {
    notFound();
  }

  const isPending = detail.status === "PENDING";
  const feedbackContext = detail.reviewerFeedback;
  const draftContent =
    detail.editedContent ??
    detail.draftMessage.bodyText ??
    "Draft content unavailable.";

  const statusRegion = renderReviewAlert({ reviewStatus, reviewMessage });

  const draftReview = isPending ? (
    <DecisionPanel
      status={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="approval" status={detail.status} />
          <Badge variant="platform">
            Gmail
          </Badge>
        </div>
      }
      draft={<div className="whitespace-pre-wrap text-sm leading-6">{draftContent}</div>}
      approveAction={
        <form action={approveApprovalRequestAction}>
          <input
            type="hidden"
            name="approvalRequestId"
            value={detail.approvalRequestId}
          />
          <ApprovalSubmitButton
            idleLabel="Approve draft"
            pendingLabel="Approving..."
          />
        </form>
      }
      rejectAction={
        <form action={rejectApprovalRequestAction} className="space-y-3">
          <input
            type="hidden"
            name="approvalRequestId"
            value={detail.approvalRequestId}
          />
          <FormField
            label="Rejection reason"
            helper="Explain what needs to change before this draft is acceptable."
          >
            <Textarea
              required
              name="rejectionReason"
              rows={4}
              placeholder="Explain what needs to change before this draft is acceptable."
            />
          </FormField>
          <ApprovalSubmitButton
            idleLabel="Reject draft"
            pendingLabel="Rejecting..."
            tone="danger"
          />
        </form>
      }
    />
  ) : (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge domain="approval" status={detail.status} />
        <Badge variant="platform">
          Gmail
        </Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">
        Review outcome
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
        <p>Reviewed at: {formatTimestamp(detail.reviewedAt)}</p>
        {detail.editedContent ? <p>Edited content was applied before approval.</p> : null}
        {detail.rejectionReason ? (
          <p>Rejection reason: {detail.rejectionReason}</p>
        ) : null}
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-950">Draft content</p>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
          {draftContent}
        </div>
      </div>
    </Panel>
  );

  const editAndApprove = isPending ? (
    <Panel>
      <h2 className="text-base font-semibold text-slate-950">Edit and approve</h2>
      <p className="mt-1 text-sm leading-5 text-slate-600">
        Adjust the draft content, then approve the reviewed version.
      </p>
      <form action={editAndApproveApprovalRequestAction} className="mt-4 space-y-4">
        <input
          type="hidden"
          name="approvalRequestId"
          value={detail.approvalRequestId}
        />
        <FormField label="Edited content">
          <Textarea
            required
            name="editedContent"
            rows={8}
            defaultValue={draftContent}
          />
        </FormField>
        <ApprovalSubmitButton
          idleLabel="Edit and approve"
          pendingLabel="Saving approval..."
          tone="secondary"
        />
      </form>
    </Panel>
  ) : null;

  const reviseRejected =
    !isPending && detail.status === "REJECTED" ? (
      <Panel variant="warning">
        <h2 className="text-base font-semibold text-amber-950">Revise draft</h2>
        <p className="mt-1 text-sm leading-5 text-amber-900">
          Create a new approval draft from this rejected version. The original
          rejection stays in history.
        </p>
        {feedbackContext?.rejectionReason ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white/80 p-4">
            <p className="text-sm font-medium text-amber-950">
              Reviewer feedback
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-amber-950">
              {feedbackContext.rejectionReason}
            </p>
          </div>
        ) : null}
        <form
          action={reviseRejectedApprovalRequestAction}
          className="mt-4 space-y-4"
        >
          <input
            type="hidden"
            name="approvalRequestId"
            value={detail.approvalRequestId}
          />
          <FormField label="Revised content">
            <Textarea
              required
              name="revisedContent"
              rows={8}
              defaultValue={draftContent}
            />
          </FormField>
          <ApprovalSubmitButton
            idleLabel="Create revised draft"
            pendingLabel="Creating revision..."
            tone="secondary"
          />
        </form>
      </Panel>
    ) : null;

  const primary = (
    <div className="space-y-6">
      {draftReview}
      {editAndApprove}
      {reviseRejected}
      <Panel>
        <h2 className="text-lg font-semibold text-slate-950">
          Recent thread context
        </h2>
        <MessageList
          className="mt-4"
          messages={detail.recentMessages.map((message) => ({
            id: message.id,
            sender: message.senderLabel,
            direction:
              message.direction === "OUTBOUND"
                ? "outbound"
                : message.direction === "INTERNAL"
                  ? "internal"
                  : "inbound",
            status: <StatusBadge domain="message" status={message.status} />,
            timestamp: formatTimestamp(message.timestamp),
            body:
              message.bodyText ??
              message.bodyHtml ??
              "Message content unavailable.",
          }))}
          emptyState={
            <Alert severity="neutral" title="No recent messages">
              No recent thread context is available for this approval.
            </Alert>
          }
        />
      </Panel>
    </div>
  );

  const metadata = (
    <MetadataList
      items={[
        {
          label: "Approval ID",
          value: detail.approvalRequestId,
          copyValue: detail.approvalRequestId,
        },
        { label: "Created", value: formatTimestamp(detail.createdAt) },
        { label: "Reviewed", value: formatTimestamp(detail.reviewedAt) },
        {
          label: "Draft message",
          value: detail.draftMessageId,
          copyValue: detail.draftMessageId,
        },
        {
          label: "Agent assignment",
          value: detail.proposedByAgentAssignmentId ?? "Unavailable",
          copyValue: detail.proposedByAgentAssignmentId ?? undefined,
        },
        {
          label: "Conversation",
          value: "Open thread",
          href: `/conversations/${detail.conversationId}`,
        },
        {
          label: "Assignment",
          value: detail.assignedAgentLabel ?? "Unassigned",
        },
      ]}
    />
  );

  return (
    <ProductShell activeSection="approvals">
      <PageContainer width="wide">
        <PageHeader
          title={detail.title}
          description={detail.participantSummary}
          breadcrumbs={
            <div className="flex flex-wrap gap-3">
              <Link
                href="/approvals"
                className="font-medium text-slate-700 underline"
              >
                Approvals
              </Link>
              <Link
                href={`/conversations/${detail.conversationId}`}
                className="font-medium text-slate-700 underline"
              >
                Thread
              </Link>
            </div>
          }
        />

        <DetailLayout
          statusRegion={statusRegion}
          primary={primary}
          metadata={metadata}
        />
      </PageContainer>
    </ProductShell>
  );
}
