import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AgentControlPanel,
  AgentRunButton,
  AgentState,
  AgentSummary,
  Alert,
  AttachmentItem,
  Badge,
  Button,
  DetailLayout,
  FailedSendState,
  FormField,
  Input,
  MessageList,
  PageContainer,
  PageHeader,
  Panel,
  StatusBadge,
  Textarea,
  TriggerRuleList,
} from "@envoy/ui";

import { ReplySubmitButton } from "@/app/conversations/[conversationId]/reply-submit-button";
import { ProductShell } from "@/components/product-shell";
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

  const statusRegion = (
    <div className="space-y-3">
      {replyStatus === "sent" ? (
        <Alert severity="success" title="Reply sent">
          The manual reply was sent successfully.
        </Alert>
      ) : null}

      {replyStatus === "error" && replyMessage ? (
        <Alert severity="critical" title="Reply failed">
          {replyMessage}
        </Alert>
      ) : null}

      {thread.recentSendFailure ? (
        <FailedSendState
          description={`Last outbound send failed at ${formatTimestamp(
            thread.recentSendFailure.failedAt,
          )}.`}
          details={thread.recentSendFailure.errorSummary}
        />
      ) : null}

      {agentStatus === "saved" ? (
        <Alert severity="success" title="Agent assignment saved">
          The conversation agent assignment was updated.
        </Alert>
      ) : null}

      {agentStatus === "unassigned" ? (
        <Alert severity="neutral" title="Agent unassigned">
          The conversation no longer has an active agent assignment.
        </Alert>
      ) : null}

      {agentStatus === "error" && replyMessage ? (
        <Alert severity="critical" title="Agent assignment failed">
          {replyMessage}
        </Alert>
      ) : null}

      {agentRunStatus === "created" ? (
        <Alert
          severity="success"
          title="Draft created"
          actions={
            approvalRequestId ? (
              <a
                href={`/approvals/${approvalRequestId}`}
                className="text-sm font-medium underline"
              >
                Open approval
              </a>
            ) : null
          }
        >
          Agent run completed and created an approval request.
        </Alert>
      ) : null}

      {agentRunStatus === "escalated" ? (
        <AgentState
          status="escalated"
          title="Agent run escalated"
          description={
            agentRunMessage ??
            "A human review is required before drafting a response."
          }
          action={
            agentRunReason ? (
              <span className="text-xs text-slate-500">{agentRunReason}</span>
            ) : null
          }
        />
      ) : null}

      {agentRunStatus === "error" && agentRunMessage ? (
        <Alert severity="critical" title="Agent run failed">
          {agentRunMessage}
        </Alert>
      ) : null}
    </div>
  );

  const primaryContent = (
    <Panel>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {thread.participantSummary}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {thread.messages.length} messages
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="platform">
            {thread.platform === "SLACK" ? "Slack" : "Gmail"}
          </Badge>
          <StatusBadge domain="conversation" status={thread.conversationState} />
          <Badge variant={thread.assignedAgentLabel ? "info" : "neutral"}>
            {thread.assignedAgentLabel ?? "Unassigned"}
          </Badge>
        </div>
      </div>

      <MessageList
        messages={thread.messages.map((message) => ({
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
          body: message.bodyText,
          failed: message.status === "FAILED",
          metadata: message.externalMessageId ?? message.id,
          attachments:
            message.attachments.length > 0 ? (
              <div className="space-y-2">
                {message.attachments.map((attachment) => (
                  <AttachmentItem
                    key={attachment.id}
                    fileName={attachment.fileName}
                    mimeType={attachment.mimeType}
                    sizeLabel={attachment.sizeLabel}
                    href={attachment.externalUrl ?? undefined}
                  />
                ))}
              </div>
            ) : null,
        }))}
        emptyState={
          <Alert severity="neutral" title="No messages">
            No canonical messages exist for this conversation yet.
          </Alert>
        }
      />
    </Panel>
  );

  const actionRail = (
    <div className="space-y-4">
      <AgentControlPanel
        summary={
          <AgentSummary
            assigned={Boolean(thread.assignedAgent)}
            goal={thread.assignedAgent?.goal}
            instructions={thread.assignedAgent?.instructions}
            tone={thread.assignedAgent?.tone}
            triggerRules={
              <TriggerRuleList
                mode="read"
                rules={thread.enabledTriggerTypes.map((triggerType) => ({
                  value: triggerType,
                  label: formatTriggerRuleLabel(triggerType),
                  checked: true,
                }))}
              />
            }
          />
        }
        status={
          !canAssignAgents ? (
            <Alert severity="neutral" title="Permission required">
              You do not have permission to assign agents in this workspace.
            </Alert>
          ) : null
        }
        editForm={
          canAssignAgents ? (
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
              <FormField label="Goal">
                <Input
                  required
                  name="goal"
                  defaultValue={thread.assignedAgent?.goal ?? ""}
                  placeholder="Resolve billing question and move to next step"
                />
              </FormField>
              <FormField label="Instructions">
                <Textarea
                  name="instructions"
                  rows={3}
                  defaultValue={thread.assignedAgent?.instructions ?? ""}
                  placeholder="Be concise, confirm facts, ask one clarifying question before proposing options."
                />
              </FormField>
              <FormField label="Tone">
                <Input
                  name="tone"
                  defaultValue={thread.assignedAgent?.tone ?? ""}
                  placeholder="Clear and concise"
                />
              </FormField>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Trigger rules
                </p>
                <TriggerRuleList
                  mode="edit"
                  rules={AGENT_TRIGGER_RULE_TYPES.map((triggerType) => ({
                    value: triggerType,
                    label: formatTriggerRuleLabel(triggerType),
                    checked: enabledTriggerTypesForForm.includes(triggerType),
                  }))}
                />
              </div>
              <Button type="submit">
                {thread.assignedAgent ? "Replace assignment" : "Assign agent"}
              </Button>
            </form>
          ) : null
        }
        actions={
          canAssignAgents ? (
            <form action={runConversationAgentAction}>
              <input
                type="hidden"
                name="conversationId"
                value={thread.conversationId}
              />
              <AgentRunButton
                type="submit"
                disabledReason={
                  thread.assignedAgent
                    ? undefined
                    : "Assign an agent first to run the draft flow."
                }
              />
            </form>
          ) : null
        }
        dangerActions={
          canAssignAgents && thread.assignedAgent ? (
            <form action={unassignConversationAgentAction}>
              <input
                type="hidden"
                name="conversationId"
                value={thread.conversationId}
              />
              <Button type="submit" variant="danger">
                Unassign agent
              </Button>
            </form>
          ) : null
        }
      />

      <Panel>
        <h2 className="text-base font-semibold text-slate-950">Manual reply</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Send a plain text reply through the connected provider.
        </p>
        <form action={sendManualReplyAction} className="mt-4 space-y-4">
          <input type="hidden" name="conversationId" value={thread.conversationId} />
          <FormField label="Reply body">
            <Textarea
              required
              name="bodyText"
              rows={5}
              placeholder="Write a reply..."
            />
          </FormField>
          <ReplySubmitButton />
        </form>
      </Panel>
    </div>
  );

  return (
    <ProductShell activeSection="inbox">
      <PageContainer width="wide">
        <PageHeader
          title={thread.title}
          description={
            thread.subject?.trim() ? thread.subject : thread.participantSummary
          }
          breadcrumbs={
            <Link href="/" className="font-medium text-slate-700 underline">
              Inbox
            </Link>
          }
        />

        <DetailLayout
          statusRegion={statusRegion}
          primary={primaryContent}
          actionRail={actionRail}
        />
      </PageContainer>
    </ProductShell>
  );
}
