import { notFound } from "next/navigation";

import {
  Badge,
  EmptyState,
  MetadataList,
  PageContainer,
  PageHeader,
  Panel,
  QueueContainer,
  QueueTable,
  Timeline,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import { getAgentRunDetail } from "@/lib/agent-run-history";
import { formatOperatorType } from "@/lib/operator-utils";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AgentRunDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function link(href: string, label: string) {
  return (
    <a href={href} className="font-medium text-slate-950 underline">
      {label}
    </a>
  );
}

export default async function AgentRunDetailPage({
  params,
}: AgentRunDetailPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const { id } = await params;
  const detail = await getAgentRunDetail({
    workspaceId: authContext.workspaceId,
    runtimeJobId: id,
  });

  if (!detail) {
    notFound();
  }

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Agent Run Detail"
          description="Runtime job, attempts, source trigger, draft/approval result, and related action logs."
        />

        <Panel className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="platform">{formatOperatorType(detail.jobType)}</Badge>
            <Badge variant="neutral">{detail.status}</Badge>
          </div>
          <MetadataList
            items={[
              { label: "Runtime job", value: detail.id, copyValue: detail.id },
              { label: "Trigger", value: formatOperatorType(detail.triggerType) },
              {
                label: "Conversation",
                value: detail.conversationId
                  ? link(`/conversations/${detail.conversationId}`, detail.conversationTitle)
                  : "Not recorded",
              },
              { label: "Assignment", value: detail.assignmentId ?? "Not recorded" },
              { label: "Requested by", value: detail.requestedByUserId ?? "Not recorded" },
              { label: "Source event", value: detail.sourceEventId ?? "Not recorded" },
              { label: "Source message", value: detail.sourceMessageId ?? "Not recorded" },
              { label: "Source approval", value: detail.sourceApprovalRequestId ?? "Not recorded" },
              {
                label: "Draft",
                value: detail.draftMessageId ?? "Not recorded",
              },
              {
                label: "Approval",
                value: detail.approvalRequestId
                  ? link(`/approvals/${detail.approvalRequestId}`, detail.approvalRequestId)
                  : "Not recorded",
              },
              { label: "Escalation/suppression", value: detail.escalationOrSuppressionReason ?? "Not recorded" },
              { label: "Error", value: detail.errorSummary ?? "None recorded" },
            ]}
          />
        </Panel>

        <QueueContainer title="Timeline" description="Durable job timing and related logs.">
          <Timeline
            items={[
              {
                id: "queued",
                label: "Queued",
                timestamp: formatDate(detail.queuedAt),
                severity: "info",
              },
              {
                id: "started",
                label: "Started",
                timestamp: formatDate(detail.startedAt),
                severity: "info",
              },
              {
                id: "finished",
                label: detail.status,
                timestamp: formatDate(detail.completedAt ?? detail.failedAt ?? detail.deadLetteredAt),
                severity:
                  detail.status === "COMPLETED"
                    ? "success"
                    : detail.status === "FAILED" || detail.status === "DEAD_LETTERED"
                      ? "critical"
                      : "neutral",
                description: detail.escalationOrSuppressionReason ?? detail.errorSummary ?? "No result issue recorded.",
              },
            ]}
          />
        </QueueContainer>

        <QueueContainer title="Attempts" description="RuntimeJobAttempt records for this agent run.">
          <QueueTable
            rows={detail.attempts}
            getRowId={(attempt) => attempt.id}
            columns={[
              { id: "attempt", header: "Attempt", cell: (attempt) => attempt.attempt },
              { id: "status", header: "Status", cell: (attempt) => attempt.status },
              { id: "worker", header: "Worker", cell: (attempt) => attempt.workerId ?? "Not recorded" },
              { id: "time", header: "Time", cell: (attempt) => `${formatDate(attempt.startedAt)} - ${formatDate(attempt.finishedAt)}` },
              { id: "result", header: "Result", cell: (attempt) => attempt.errorSummary ?? attempt.resultSummary },
            ]}
            emptyState={<EmptyState variant="noData" title="No attempts" description="No attempts are recorded for this runtime job." />}
          />
        </QueueContainer>

        <QueueContainer title="Related agent action logs" description="Planner/generation/escalation records where available.">
          <QueueTable
            rows={detail.relatedActionLogs}
            getRowId={(log) => log.id}
            columns={[
              { id: "created", header: "Created", cell: (log) => formatDate(log.createdAt) },
              { id: "action", header: "Action", cell: (log) => formatOperatorType(log.actionType) },
              { id: "links", header: "Links", cell: (log) => `message ${log.messageId ?? "n/a"} approval ${log.approvalRequestId ?? "n/a"}` },
              { id: "metadata", header: "Metadata", cell: (log) => log.metadataSummary },
            ]}
            emptyState={<EmptyState variant="noData" title="No related logs" description="No agent action logs were found for this run." />}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
