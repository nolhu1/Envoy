import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { requireAppAuthContext } from "@/lib/app-auth";
import { getCurrentWorkspaceInboxRows } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authContext = await requireAppAuthContext();
  const inboxRows = await getCurrentWorkspaceInboxRows();

  function formatRelativeActivity(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return formatter.format(value);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
              Envoy
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Unified Inbox
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Canonical conversations from Gmail and Slack appear together here,
              using the shared inbox model rather than provider APIs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/profile"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Profile
            </Link>
            <Link
              href="/members"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Members
            </Link>
            <Link
              href="/settings/workspace"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Workspace settings
            </Link>
            <SignOutButton />
          </div>
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Email
            </p>
            <p className="mt-3 text-lg font-medium text-slate-950">
              {authContext.email}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              User ID
            </p>
            <p className="mt-3 break-all text-sm font-medium text-slate-950">
              {authContext.userId}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Workspace ID
            </p>
            <p className="mt-3 break-all text-sm font-medium text-slate-950">
              {authContext.workspaceId}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Role
            </p>
            <p className="mt-3 text-lg font-medium text-slate-950">
              {authContext.role}
            </p>
          </article>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Workspace Queue
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Conversations
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {inboxRows.length === 0
                  ? "No canonical conversations have been ingested yet."
                  : `${inboxRows.length} conversations across Gmail and Slack.`}
              </p>
            </div>

            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              {authContext.role}
            </div>
          </div>

          {inboxRows.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600">
              Connect an integration and run sync from workspace settings to
              populate the inbox.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:grid">
                <span>Conversation</span>
                <span>Participants</span>
                <span>Assignment</span>
                <span>Activity</span>
              </div>

              <div className="divide-y divide-slate-200">
                {inboxRows.map((row) => (
                  <article
                    key={row.conversationId}
                    className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-start"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            row.platform === "SLACK"
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {row.platform === "SLACK" ? "Slack" : "Gmail"}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          {row.conversationState.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-base font-semibold text-slate-950">
                        {row.title}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {row.lastMessagePreview}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:hidden">
                        Participants
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-700 md:mt-0">
                        {row.participantSummary}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:hidden">
                        Assignment
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-3 py-1.5 text-sm font-medium md:mt-0 ${
                          row.assignedAgentLabel
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.assignedAgentLabel ?? "Unassigned"}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:hidden">
                        Last activity
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-700 md:mt-0">
                        {formatRelativeActivity(row.lastActivityAt)}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {row.conversationId}
                      </p>
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
