import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentWorkspaceConversationThread } from "@/lib/thread";

export const dynamic = "force-dynamic";

type ConversationThreadPageProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function ConversationThreadPage({
  params,
}: ConversationThreadPageProps) {
  const { conversationId } = await params;
  const thread = await getCurrentWorkspaceConversationThread(conversationId);

  if (!thread) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                Unified Thread
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                {thread.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                {thread.subject?.trim()
                  ? thread.subject
                  : thread.participantSummary}
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Back to inbox
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.18em] ${
                thread.platform === "SLACK"
                  ? "bg-cyan-100 text-cyan-950"
                  : "bg-emerald-100 text-emerald-950"
              }`}
            >
              {thread.platform === "SLACK" ? "Slack" : "Gmail"}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              {thread.conversationState.replaceAll("_", " ")}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              {thread.assignedAgentLabel ?? "Unassigned"}
            </span>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200">
              Last activity {formatTimestamp(thread.lastActivityAt)}
            </span>
          </div>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Participants
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                {thread.participantSummary}
              </h2>
            </div>

            <p className="text-sm text-slate-600">
              {thread.messages.length} messages
            </p>
          </div>

          {thread.messages.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600">
              No canonical messages exist for this conversation yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {thread.messages.map((message) => (
                <article
                  key={message.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            message.platform === "SLACK"
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {message.platform === "SLACK" ? "Slack" : "Gmail"}
                        </span>
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          {message.direction.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-3 text-base font-semibold text-slate-950">
                        {message.senderLabel}
                      </p>
                    </div>

                    <div className="text-sm text-slate-500">
                      <p>{formatTimestamp(message.timestamp)}</p>
                      <p className="mt-1 break-all text-xs">
                        {message.externalMessageId ?? message.id}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {message.bodyText}
                  </div>

                  {message.attachments.length > 0 ? (
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Attachments
                      </p>
                      <div className="mt-3 space-y-3">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <p className="text-sm font-medium text-slate-900">
                              {attachment.fileName}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {[
                                attachment.mimeType ?? "Unknown MIME type",
                                attachment.sizeLabel,
                              ]
                                .filter(Boolean)
                                .join(" - ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
