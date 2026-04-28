import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplySubmitButton } from "@/app/conversations/[conversationId]/reply-submit-button";
import { requireAppAuthContext } from "@/lib/app-auth";
import { AGENT_TRIGGER_RULE_TYPES } from "@/lib/agent-trigger-rules";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getCurrentWorkspaceConversationThread } from "@/lib/thread";
import {
  assignConversationAgentAction,
  runConversationAgentAction,
  sendManualReplyAction,
  unassignConversationAgentAction,
} from "@/app/conversations/[conversationId]/actions";

export const dynamic = "force-dynamic";

type ConversationThreadPageProps = {
  params: Promise<{
    conversationId: string;
  }>;
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

function formatTriggerRuleLabel(triggerType: string) {
  if (triggerType === "inbound_message") {
    return "Inbound message";
  }

  if (triggerType === "approval_rejected") {
    return "Approval rejected";
  }

  if (triggerType === "follow_up_due") {
    return "Follow-up due";
  }

  if (triggerType === "manual_regenerate") {
    return "Manual regenerate";
  }

  return triggerType.replaceAll("_", " ");
}

export default async function ConversationThreadPage({
  params,
  searchParams,
}: ConversationThreadPageProps) {
  const authContext = await requireAppAuthContext();
  const canAssignAgents = hasPermission(
    authContext.role,
    PERMISSIONS.ASSIGN_AGENTS,
  );
  const { conversationId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const thread = await getCurrentWorkspaceConversationThread(conversationId);

  if (!thread) {
    notFound();
  }

  const replyStatus = readSearchParam(resolvedSearchParams?.reply);
  const replyMessage = readSearchParam(resolvedSearchParams?.message);
  const agentStatus = readSearchParam(resolvedSearchParams?.agent);
  const agentRunStatus = readSearchParam(resolvedSearchParams?.agentRun);
  const agentRunMessage = readSearchParam(resolvedSearchParams?.agentRunMessage);
  const agentRunReason = readSearchParam(resolvedSearchParams?.agentRunReason);
  const approvalRequestId = readSearchParam(
    resolvedSearchParams?.approvalRequestId,
  );
  const enabledTriggerTypesForForm =
    thread.hasConfiguredTriggerRules
      ? thread.enabledTriggerTypes
      : [...AGENT_TRIGGER_RULE_TYPES];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {replyStatus === "sent" ? (
          <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Reply sent successfully.
          </section>
        ) : null}

        {replyStatus === "error" && replyMessage ? (
          <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Reply failed: {replyMessage}
          </section>
        ) : null}

        {thread.recentSendFailure ? (
          <section className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Last outbound send failed at {formatTimestamp(thread.recentSendFailure.failedAt)}.
            {thread.recentSendFailure.errorSummary
              ? ` ${thread.recentSendFailure.errorSummary}`
              : ""}
          </section>
        ) : null}

        {agentStatus === "saved" ? (
          <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Agent assignment saved successfully.
          </section>
        ) : null}

        {agentStatus === "unassigned" ? (
          <section className="mb-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Agent unassigned successfully.
          </section>
        ) : null}

        {agentStatus === "error" && replyMessage ? (
          <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Agent assignment failed: {replyMessage}
          </section>
        ) : null}

        {agentRunStatus === "created" ? (
          <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Agent run completed. Draft and approval request were created.
            {approvalRequestId ? (
              <>
                {" "}
                <Link
                  href={`/approvals/${approvalRequestId}`}
                  className="font-semibold underline decoration-emerald-400 underline-offset-4"
                >
                  Open approval
                </Link>
                .
              </>
            ) : null}
          </section>
        ) : null}

        {agentRunStatus === "escalated" ? (
          <section className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Agent run escalated and no draft was created.
            {agentRunReason ? ` [${agentRunReason}]` : ""}{" "}
            {agentRunMessage ??
              "A human review is required before drafting a response."}
          </section>
        ) : null}

        {agentRunStatus === "error" && agentRunMessage ? (
          <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Run Agent failed: {agentRunMessage}
          </section>
        ) : null}

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
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Agent Assignment
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Conversation agent
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Assign a single active agent configuration for this conversation.
            </p>

            {thread.assignedAgent ? (
              <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">
                  Active assignment
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Goal:</span>{" "}
                  {thread.assignedAgent.goal}
                </p>
                {thread.assignedAgent.instructions ? (
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Instructions:</span>{" "}
                    {thread.assignedAgent.instructions}
                  </p>
                ) : null}
                {thread.assignedAgent.tone ? (
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Tone:</span>{" "}
                    {thread.assignedAgent.tone}
                  </p>
                ) : null}
                {thread.assignedAgent ? (
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">
                      Enabled trigger rules:
                    </span>{" "}
                    {thread.enabledTriggerTypes.length > 0
                      ? thread.enabledTriggerTypes
                          .map((triggerType) => formatTriggerRuleLabel(triggerType))
                          .join(", ")
                      : "None (automatic trigger execution disabled)"}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                No active assignment yet.
              </div>
            )}

            {canAssignAgents ? (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <form action={assignConversationAgentAction} className="space-y-4">
                    <input
                      type="hidden"
                      name="conversationId"
                      value={thread.conversationId}
                    />
                    <input
                      type="hidden"
                      name="enabledTriggerTypesConfigured"
                      value="1"
                    />
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Goal</span>
                      <input
                        required
                        name="goal"
                        defaultValue={thread.assignedAgent?.goal ?? ""}
                        className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                        placeholder="Resolve billing question and move to next step"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">
                        Instructions
                      </span>
                      <textarea
                        name="instructions"
                        rows={3}
                        defaultValue={thread.assignedAgent?.instructions ?? ""}
                        className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                        placeholder="Be concise, confirm facts, ask one clarifying question before proposing options."
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Tone</span>
                      <input
                        name="tone"
                        defaultValue={thread.assignedAgent?.tone ?? ""}
                        className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                        placeholder="Clear and concise"
                      />
                    </label>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-slate-700">
                        Trigger rules
                      </legend>
                      <p className="text-xs text-slate-500">
                        Select which trigger types are enabled for this assignment.
                      </p>
                      <div className="space-y-2 rounded-[16px] border border-slate-200 bg-white p-3">
                        {AGENT_TRIGGER_RULE_TYPES.map((triggerType) => (
                          <label
                            key={triggerType}
                            className="flex items-center gap-3 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name="enabledTriggerTypes"
                              value={triggerType}
                              defaultChecked={enabledTriggerTypesForForm.includes(
                                triggerType,
                              )}
                              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span>{formatTriggerRuleLabel(triggerType)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="flex items-center justify-end">
                      <button
                        type="submit"
                        className="inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        {thread.assignedAgent ? "Replace assignment" : "Assign agent"}
                      </button>
                    </div>
                  </form>

                  {thread.assignedAgent ? (
                    <form action={unassignConversationAgentAction}>
                      <input
                        type="hidden"
                        name="conversationId"
                        value={thread.conversationId}
                      />
                      <button
                        type="submit"
                        className="inline-flex rounded-full border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 transition hover:border-rose-400 hover:bg-rose-50"
                      >
                        Unassign agent
                      </button>
                    </form>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                  <form action={runConversationAgentAction}>
                    <input
                      type="hidden"
                      name="conversationId"
                      value={thread.conversationId}
                    />
                    <button
                      type="submit"
                      disabled={!thread.assignedAgent}
                      className="inline-flex rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                    >
                      Run Agent
                    </button>
                  </form>
                  {!thread.assignedAgent ? (
                    <p className="text-xs text-slate-600">
                      Assign an agent first to run the draft flow.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                You do not have permission to assign agents in this workspace.
              </p>
            )}
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Manual Reply
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Reply in this thread
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sends a plain text reply through the existing Gmail or Slack
              outbound path for this conversation.
            </p>

            <form action={sendManualReplyAction} className="mt-4 space-y-4">
              <input type="hidden" name="conversationId" value={thread.conversationId} />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Reply body
                </span>
                <textarea
                  required
                  name="bodyText"
                  rows={5}
                  className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                  placeholder="Write a reply..."
                />
              </label>

              <div className="flex items-center justify-end">
                <ReplySubmitButton />
              </div>
            </form>
          </div>

          <div className="mt-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
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
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          {message.status.toLowerCase().replaceAll("_", " ")}
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
