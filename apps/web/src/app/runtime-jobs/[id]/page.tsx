import { notFound } from "next/navigation";

import {
  Badge,
  EmptyState,
  MetadataList,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueTable,
} from "@envoy/ui";
import { getPrisma } from "@envoy/db";

import { ProductShell } from "@/components/product-shell";
import {
  formatOperatorType,
  readErrorSummary,
  summarizeOperatorMetadata,
} from "@/lib/operator-utils";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type RuntimeJobPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function RuntimeJobPage({ params }: RuntimeJobPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const { id } = await params;
  const prisma = getPrisma();
  const job = await prisma.runtimeJob.findFirst({
    where: {
      id,
      workspaceId: authContext.workspaceId,
    },
    select: {
      id: true,
      queueName: true,
      jobType: true,
      status: true,
      dedupeKey: true,
      bullJobId: true,
      payloadJson: true,
      resultJson: true,
      attemptsMade: true,
      maxAttempts: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      deadLetteredAt: true,
      lastErrorJson: true,
      sourceEventId: true,
      attempts: {
        orderBy: [{ attempt: "asc" }],
        select: {
          id: true,
          attempt: true,
          status: true,
          workerId: true,
          startedAt: true,
          finishedAt: true,
          errorJson: true,
          resultJson: true,
        },
      },
    },
  });

  if (!job) {
    notFound();
  }

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Runtime Job"
          description="Durable worker job metadata, attempts, result, and failure context."
        />

        <MetadataList
          items={[
            { label: "Job", value: job.id, copyValue: job.id },
            { label: "Queue", value: job.queueName },
            { label: "Type", value: formatOperatorType(job.jobType) },
            { label: "Status", value: <Badge variant="neutral">{job.status}</Badge> },
            { label: "Bull job", value: job.bullJobId ?? "Not recorded" },
            { label: "Dedupe key", value: job.dedupeKey ?? "Not recorded" },
            { label: "Attempts", value: `${job.attemptsMade}/${job.maxAttempts}` },
            { label: "Queued", value: formatDate(job.queuedAt) },
            { label: "Started", value: formatDate(job.startedAt) },
            { label: "Completed", value: formatDate(job.completedAt) },
            { label: "Failed", value: formatDate(job.failedAt) },
            { label: "Dead-lettered", value: formatDate(job.deadLetteredAt) },
            { label: "Source event", value: job.sourceEventId ?? "Not recorded" },
            { label: "Last error", value: readErrorSummary(job.lastErrorJson) ?? "None recorded" },
            { label: "Payload summary", value: summarizeOperatorMetadata(job.payloadJson) },
            { label: "Result summary", value: summarizeOperatorMetadata(job.resultJson) },
          ]}
        />

        <QueueContainer title="Attempts" description="Recorded RuntimeJobAttempt rows.">
          <QueueTable
            rows={job.attempts}
            getRowId={(attempt) => attempt.id}
            emptyState={<EmptyState variant="noData" title="No attempts" description="This job has no attempts recorded." />}
            columns={[
              { id: "attempt", header: "Attempt", cell: (attempt) => attempt.attempt },
              { id: "status", header: "Status", cell: (attempt) => attempt.status },
              { id: "worker", header: "Worker", cell: (attempt) => attempt.workerId ?? "Not recorded" },
              { id: "time", header: "Timing", cell: (attempt) => `${formatDate(attempt.startedAt)} - ${formatDate(attempt.finishedAt)}` },
              { id: "result", header: "Result", cell: (attempt) => readErrorSummary(attempt.errorJson) ?? summarizeOperatorMetadata(attempt.resultJson) },
            ]}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
