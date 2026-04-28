import Link from "next/link";

import { listWorkspaceAuditLogs } from "@/lib/audit-log-viewer";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function WorkspaceAuditPage({
  searchParams,
}: AuditPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const actionTypeFilter = readSearchParam(resolvedSearchParams?.actionType);
  const logs = await listWorkspaceAuditLogs({
    workspaceId: authContext.workspaceId,
    actionType: actionTypeFilter ?? null,
    limit: 250,
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                Audit Logs
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Workspace audit trail
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Append-only canonical action logs for integration, send, approval,
                and agent lifecycle events.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/settings/workspace"
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
              >
                Workspace settings
              </Link>
              <Link
                href="/"
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
              >
                Inbox
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Action type filter
              </span>
              <input
                name="actionType"
                defaultValue={actionTypeFilter ?? ""}
                placeholder="Ex: MESSAGE_SENT"
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Apply
              </button>
              <Link
                href="/settings/audit"
                className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                Reset
              </Link>
            </div>
          </form>

          {logs.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600">
              No audit records match the current filter.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,2fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:grid">
                <span>When</span>
                <span>Action</span>
                <span>Actor</span>
                <span>Context</span>
              </div>
              <div className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <article
                    key={log.id}
                    className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,2fr)]"
                  >
                    <div className="text-sm text-slate-700">
                      <p>{formatTimestamp(log.createdAt)}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{log.id}</p>
                    </div>

                    <div className="text-sm font-medium text-slate-900">
                      {log.actionType}
                    </div>

                    <div className="text-sm text-slate-700">
                      <p>{log.actorType}</p>
                      {log.actorUserId ? (
                        <p className="mt-1 break-all text-xs text-slate-500">
                          user:{log.actorUserId}
                        </p>
                      ) : null}
                      {log.actorAgentAssignmentId ? (
                        <p className="mt-1 break-all text-xs text-slate-500">
                          assignment:{log.actorAgentAssignmentId}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-xs leading-5 text-slate-600">
                      <p className="break-all">conversation: {log.conversationId}</p>
                      {log.messageId ? (
                        <p className="break-all">message: {log.messageId}</p>
                      ) : null}
                      {log.approvalRequestId ? (
                        <p className="break-all">approval: {log.approvalRequestId}</p>
                      ) : null}
                      <pre className="mt-2 overflow-x-auto rounded-[12px] border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                        {JSON.stringify(log.metadataJson, null, 2)}
                      </pre>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
