import Link from "next/link";
import { notFound } from "next/navigation";

import { ApprovalSubmitButton } from "@/app/approvals/[approvalRequestId]/approval-submit-button";
import {
  approveApprovalRequestAction,
  editAndApproveApprovalRequestAction,
  rejectApprovalRequestAction,
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

function renderReviewBanner(input: {
  reviewStatus: string | undefined;
  reviewMessage: string | undefined;
}) {
  if (input.reviewStatus === "approved") {
    return (
      <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
        Draft approved successfully.
      </section>
    );
  }

  if (input.reviewStatus === "edit-approved") {
    return (
      <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
        Draft edited and approved successfully.
      </section>
    );
  }

  if (input.reviewStatus === "rejected") {
    return (
      <section className="mb-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
        Draft rejected successfully.
      </section>
    );
  }

  if (input.reviewStatus === "error" && input.reviewMessage) {
    return (
      <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
        Review failed: {input.reviewMessage}
      </section>
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {renderReviewBanner({
          reviewStatus,
          reviewMessage,
        })}

        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                Approval Review
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                {detail.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                {detail.participantSummary}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/approvals"
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
              >
                Back to queue
              </Link>
              <Link
                href={`/conversations/${detail.conversationId}`}
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
              >
                Open thread
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.18em] ${
                detail.conversation.platform === "SLACK"
                  ? "bg-cyan-100 text-cyan-950"
                  : "bg-emerald-100 text-emerald-950"
              }`}
            >
              {detail.conversation.platform === "SLACK" ? "Slack" : "Gmail"}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              Approval {detail.status.toLowerCase()}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              Conversation {detail.conversation.state.replaceAll("_", " ")}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              {detail.assignedAgentLabel ?? "Unassigned"}
            </span>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Draft
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Proposed reply
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review the canonical outbound draft before it is allowed to continue.
            </p>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>{detail.draftMessage.senderType}</span>
                <span>{detail.draftMessage.direction}</span>
                <span>{detail.draftMessage.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {detail.editedContent ?? detail.draftMessage.bodyText ?? "Draft content unavailable."}
              </div>
            </div>

            {isPending ? (
              <div className="mt-8 grid gap-6">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-semibold text-slate-950">
                    Quick approve
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Approve the current draft exactly as written.
                  </p>
                  <form
                    action={approveApprovalRequestAction}
                    className="mt-4 flex items-center justify-end"
                  >
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
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-semibold text-slate-950">
                    Edit and approve
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Adjust the draft content, then approve the reviewed version.
                  </p>
                  <form
                    action={editAndApproveApprovalRequestAction}
                    className="mt-4 space-y-4"
                  >
                    <input
                      type="hidden"
                      name="approvalRequestId"
                      value={detail.approvalRequestId}
                    />
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">
                        Edited content
                      </span>
                      <textarea
                        required
                        name="editedContent"
                        rows={8}
                        defaultValue={
                          detail.editedContent ??
                          detail.draftMessage.bodyText ??
                          ""
                        }
                        className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                      />
                    </label>
                    <div className="flex items-center justify-end">
                      <ApprovalSubmitButton
                        idleLabel="Edit and approve"
                        pendingLabel="Saving approval..."
                        tone="secondary"
                      />
                    </div>
                  </form>
                </div>

                <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5">
                  <h3 className="text-lg font-semibold text-rose-950">
                    Reject
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-rose-900">
                    Reject the draft and record why it should not proceed.
                  </p>
                  <form
                    action={rejectApprovalRequestAction}
                    className="mt-4 space-y-4"
                  >
                    <input
                      type="hidden"
                      name="approvalRequestId"
                      value={detail.approvalRequestId}
                    />
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-rose-900">
                        Rejection reason
                      </span>
                      <textarea
                        required
                        name="rejectionReason"
                        rows={4}
                        placeholder="Explain what needs to change before this draft is acceptable."
                        className="w-full rounded-[20px] border border-rose-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-rose-400"
                      />
                    </label>
                    <div className="flex items-center justify-end">
                      <ApprovalSubmitButton
                        idleLabel="Reject draft"
                        pendingLabel="Rejecting..."
                        tone="danger"
                      />
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Review outcome
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <p>
                    Reviewed at: {formatTimestamp(detail.reviewedAt)}
                  </p>
                  {detail.editedContent ? (
                    <p>Edited content was applied before approval.</p>
                  ) : null}
                  {detail.rejectionReason ? (
                    <p>Rejection reason: {detail.rejectionReason}</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Approval Metadata
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p>
                  <span className="font-medium text-slate-950">Approval ID:</span>{" "}
                  {detail.approvalRequestId}
                </p>
                <p>
                  <span className="font-medium text-slate-950">Created:</span>{" "}
                  {formatTimestamp(detail.createdAt)}
                </p>
                <p>
                  <span className="font-medium text-slate-950">Reviewed:</span>{" "}
                  {formatTimestamp(detail.reviewedAt)}
                </p>
                <p>
                  <span className="font-medium text-slate-950">Draft message:</span>{" "}
                  {detail.draftMessageId}
                </p>
                <p>
                  <span className="font-medium text-slate-950">Proposed by agent assignment:</span>{" "}
                  {detail.proposedByAgentAssignmentId ?? "Unavailable"}
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Recent Thread Context
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                Conversation history
              </h2>
              <div className="mt-5 space-y-4">
                {detail.recentMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {message.senderLabel}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {message.direction} · {message.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatTimestamp(message.timestamp)}
                      </p>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.bodyText ?? message.bodyHtml ?? "Message content unavailable."}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
