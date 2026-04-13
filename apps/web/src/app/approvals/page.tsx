import Link from "next/link";

import { listCurrentWorkspaceApprovalQueue } from "@/lib/approval-queue";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ApprovalQueuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ApprovalQueueView = "pending" | "reviewed";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readApprovalQueueView(
  searchParams?: Record<string, string | string[] | undefined>,
): ApprovalQueueView {
  return readSearchParam(searchParams?.view) === "reviewed"
    ? "reviewed"
    : "pending";
}

function formatTimestamp(value: Date | null) {
  if (!value) {
    return "Pending review";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function ApprovalQueuePage({
  searchParams,
}: ApprovalQueuePageProps) {
  const authContext = await requirePermission(PERMISSIONS.APPROVE_DRAFTS);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const view = readApprovalQueueView(resolvedSearchParams);
  const rows = await listCurrentWorkspaceApprovalQueue({
    filter: view === "reviewed" ? "RECENTLY_REVIEWED" : "PENDING",
    limit: 100,
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                Approval Queue
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Human review
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Review AI-generated outbound drafts before they are allowed to continue.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
              >
                Back to inbox
              </Link>
              <span className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-slate-200">
                {authContext.role}
              </span>
            </div>
          </div>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Workspace approvals
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                {view === "reviewed" ? "Recently reviewed drafts" : "Pending drafts"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rows.length === 0
                  ? "No approval requests match the current view."
                  : `${rows.length} approval requests ready for review.`}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/approvals"
                className={`inline-flex rounded-full px-4 py-2 text-sm font-medium transition ${
                  view === "pending"
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Pending
              </Link>
              <Link
                href="/approvals?view=reviewed"
                className={`inline-flex rounded-full px-4 py-2 text-sm font-medium transition ${
                  view === "reviewed"
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Recently reviewed
              </Link>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600">
              {view === "reviewed"
                ? "No reviewed approval requests are available yet."
                : "No pending approval requests are waiting in this workspace."}
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:grid">
                <span>Conversation</span>
                <span>Draft</span>
                <span>Assignment</span>
                <span>{view === "reviewed" ? "Reviewed" : "Created"}</span>
              </div>

              <div className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <Link
                    key={row.approvalRequestId}
                    href={`/approvals/${row.approvalRequestId}`}
                    className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            row.conversation.platform === "SLACK"
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {row.conversation.platform === "SLACK" ? "Slack" : "Gmail"}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-700">
                          {row.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-base font-semibold text-slate-950">
                        {row.title}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        {row.participantSummary}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm leading-6 text-slate-700">
                        {row.draftPreview}
                      </p>
                    </div>

                    <div className="text-sm text-slate-700">
                      {row.assignedAgentLabel ?? "Unassigned"}
                    </div>

                    <div className="text-sm text-slate-500">
                      {formatTimestamp(
                        view === "reviewed" ? row.reviewedAt : row.createdAt,
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
