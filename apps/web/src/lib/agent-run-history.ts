import "server-only";

import { getPrisma } from "@envoy/db";

import {
  formatOperatorType,
  isOperatorObject,
  parsePositiveLimit,
  readErrorSummary,
  readOperatorString,
  readPayloadString,
  sanitizeOperatorMetadata,
  summarizeOperatorMetadata,
} from "@/lib/operator-utils";

export type AgentRunHistoryFilters = {
  status?: string | null;
  triggerType?: string | null;
  conversationId?: string | null;
  limit?: string | number | null;
};

export type AgentRunHistoryRow = {
  id: string;
  jobType: string;
  status: string;
  triggerType: string | null;
  conversationId: string | null;
  conversationTitle: string;
  assignmentId: string | null;
  requestedByUserId: string | null;
  sourceEventId: string | null;
  sourceMessageId: string | null;
  sourceApprovalRequestId: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
  escalationOrSuppressionReason: string | null;
  draftMessageId: string | null;
  approvalRequestId: string | null;
  errorSummary: string | null;
  attemptCount: number;
  latencyMs: number | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorClass: string | null;
};

export type AgentRunMetrics = {
  totalRuns: number;
  completedRuns: number;
  suppressedRuns: number;
  escalatedRuns: number;
  failedRuns: number;
  draftAcceptanceRate: number | null;
  rejectionRevisionRate: number | null;
  averageLatencyMs: number | null;
};

export type AgentRunDetail = AgentRunHistoryRow & {
  payloadJson: Record<string, unknown>;
  resultJson: Record<string, unknown>;
  metadataSummary: string;
  attempts: Array<{
    id: string;
    attempt: number;
    workerId: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
    errorSummary: string | null;
    resultSummary: string;
  }>;
  relatedActionLogs: Array<{
    id: string;
    actionType: string;
    createdAt: Date;
    messageId: string | null;
    approvalRequestId: string | null;
    metadataSummary: string;
  }>;
  deadLetters: Array<{
    id: string;
    reason: string;
    createdAt: Date;
    errorSummary: string | null;
  }>;
};

function outputFromResult(value: unknown) {
  return isOperatorObject(value) && isOperatorObject(value.output)
    ? value.output
    : {};
}

function parseRuntimePayload(value: unknown) {
  return isOperatorObject(value) ? value : {};
}

function parseRuntimeOutput(value: unknown) {
  return outputFromResult(value);
}

function deriveReason(input: {
  resultJson: unknown;
  lastErrorJson: unknown;
}) {
  const output = parseRuntimeOutput(input.resultJson);

  return (
    readOperatorString(output.escalationReasonCode) ??
    readOperatorString(output.reason) ??
    readOperatorString(output.suppressionReason) ??
    readErrorSummary(input.lastErrorJson)
  );
}

function deriveLatencyMs(job: {
  queuedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
}) {
  const end = job.completedAt ?? job.failedAt ?? job.deadLetteredAt;
  return end ? Math.max(0, end.getTime() - job.queuedAt.getTime()) : null;
}

function titleForConversation(
  conversation:
    | {
        subject: string | null;
        platform: "EMAIL";
        externalConversationId: string;
      }
    | undefined,
) {
  if (!conversation) {
    return "Not recorded";
  }

  return (
    conversation.subject?.trim() ||
    `Gmail ${conversation.externalConversationId}`
  );
}

function rowFromJob(
  job: {
    id: string;
    jobType: string;
    status: string;
    payloadJson: unknown;
    resultJson: unknown;
    queuedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    deadLetteredAt: Date | null;
    lastErrorJson: unknown;
    attempts: unknown[];
  },
  conversationById: Map<string, {
    subject: string | null;
    platform: "EMAIL";
    externalConversationId: string;
    assignedAgentId: string | null;
  }>,
): AgentRunHistoryRow {
  const payload = parseRuntimePayload(job.payloadJson);
  const output = parseRuntimeOutput(job.resultJson);
  const conversationId = readPayloadString(payload, "conversationId");
  const conversation = conversationId
    ? conversationById.get(conversationId)
    : undefined;

  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    triggerType: readPayloadString(payload, "triggerType"),
    conversationId,
    conversationTitle: titleForConversation(conversation),
    assignmentId:
      readPayloadString(output, "assignmentId") ??
      conversation?.assignedAgentId ??
      null,
    requestedByUserId: readPayloadString(payload, "requestedByUserId"),
    sourceEventId: readPayloadString(payload, "sourceEventId"),
    sourceMessageId: readPayloadString(payload, "sourceMessageId"),
    sourceApprovalRequestId: readPayloadString(
      payload,
      "sourceApprovalRequestId",
    ),
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    deadLetteredAt: job.deadLetteredAt,
    escalationOrSuppressionReason: deriveReason({
      resultJson: job.resultJson,
      lastErrorJson: job.lastErrorJson,
    }),
    draftMessageId: readPayloadString(output, "draftMessageId"),
    approvalRequestId: readPayloadString(output, "approvalRequestId"),
    errorSummary: readErrorSummary(job.lastErrorJson),
    attemptCount: job.attempts.length,
    latencyMs: deriveLatencyMs(job),
    provider: readOperatorString(output.provider),
    model: readOperatorString(output.model),
    promptVersion: readOperatorString(output.promptVersion),
    errorClass: isOperatorObject(job.lastErrorJson)
      ? readOperatorString(job.lastErrorJson.name)
      : null,
  };
}

export async function listAgentRunHistory(input: {
  workspaceId: string;
  filters?: AgentRunHistoryFilters;
}) {
  const prisma = getPrisma();
  const filters = input.filters ?? {};
  const status = readOperatorString(filters.status);
  const jobs = await prisma.runtimeJob.findMany({
    where: {
      workspaceId: input.workspaceId,
      jobType: {
        in: [
          "agent.run_from_trigger",
          "agent.run_manual",
          "agent.evaluate_follow_ups",
        ],
      },
      status: status ? (status as never) : undefined,
    },
    orderBy: [{ queuedAt: "desc" }],
    take: parsePositiveLimit(filters.limit, 100, 300),
    select: {
      id: true,
      jobType: true,
      status: true,
      payloadJson: true,
      resultJson: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      deadLetteredAt: true,
      lastErrorJson: true,
      attempts: { select: { id: true } },
    },
  });
  const conversationIds = [
    ...new Set(
      jobs
        .map((job) => readPayloadString(job.payloadJson, "conversationId"))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { in: conversationIds },
      platform: "EMAIL",
    },
    select: {
      id: true,
      subject: true,
      platform: true,
      externalConversationId: true,
      assignedAgentId: true,
    },
  });
  const conversationById = new Map(
    conversations.map((conversation) => [
      conversation.id,
      {
        ...conversation,
        platform: "EMAIL" as const,
      },
    ]),
  );

  return jobs
    .map((job) => rowFromJob(job, conversationById))
    .filter((row) => {
      const triggerFilter = readOperatorString(filters.triggerType);
      const conversationFilter = readOperatorString(filters.conversationId);

      if (triggerFilter && row.triggerType !== triggerFilter) {
        return false;
      }

      if (conversationFilter && row.conversationId !== conversationFilter) {
        return false;
      }

      if (row.conversationId && !conversationById.has(row.conversationId)) {
        return false;
      }

      return true;
    });
}

export async function getAgentRunDetail(input: {
  workspaceId: string;
  runtimeJobId: string;
}) {
  const prisma = getPrisma();
  const job = await prisma.runtimeJob.findFirst({
    where: {
      id: input.runtimeJobId,
      workspaceId: input.workspaceId,
      jobType: {
        in: [
          "agent.run_from_trigger",
          "agent.run_manual",
          "agent.evaluate_follow_ups",
        ],
      },
    },
    select: {
      id: true,
      jobType: true,
      status: true,
      payloadJson: true,
      resultJson: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      deadLetteredAt: true,
      lastErrorJson: true,
      attempts: {
        orderBy: [{ attempt: "asc" }],
        select: {
          id: true,
          attempt: true,
          workerId: true,
          startedAt: true,
          finishedAt: true,
          status: true,
          errorJson: true,
          resultJson: true,
        },
      },
    },
  });

  if (!job) {
    return null;
  }

  const conversationId = readPayloadString(job.payloadJson, "conversationId");
  const [conversation, actionLogs, deadLetters] = await Promise.all([
    conversationId
      ? prisma.conversation.findFirst({
          where: {
            id: conversationId,
            workspaceId: input.workspaceId,
            platform: "EMAIL",
          },
          select: {
            id: true,
            subject: true,
            platform: true,
            externalConversationId: true,
            assignedAgentId: true,
          },
        })
      : null,
    prisma.actionLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        conversationId: conversationId ?? undefined,
        actionType: { contains: "AGENT" },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        actionType: true,
        createdAt: true,
        messageId: true,
        approvalRequestId: true,
        metadataJson: true,
      },
    }),
    prisma.deadLetterRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
        runtimeJobId: input.runtimeJobId,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        reason: true,
        createdAt: true,
        errorJson: true,
      },
    }),
  ]);
  const conversationById = new Map(
    conversation
      ? [[
          conversation.id,
          {
            ...conversation,
            platform: "EMAIL" as const,
          },
        ] as const]
      : [],
  );
  const base = rowFromJob(job, conversationById);
  const payloadJson = sanitizeOperatorMetadata(job.payloadJson);
  const resultJson = sanitizeOperatorMetadata(job.resultJson);

  return {
    ...base,
    payloadJson,
    resultJson,
    metadataSummary: summarizeOperatorMetadata({
      payloadJson,
      resultJson,
    }),
    attempts: job.attempts.map((attempt) => ({
      id: attempt.id,
      attempt: attempt.attempt,
      workerId: attempt.workerId,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      status: attempt.status,
      errorSummary: readErrorSummary(attempt.errorJson),
      resultSummary: summarizeOperatorMetadata(attempt.resultJson),
    })),
    relatedActionLogs: actionLogs.map((log) => ({
      id: log.id,
      actionType: log.actionType,
      createdAt: log.createdAt,
      messageId: log.messageId,
      approvalRequestId: log.approvalRequestId,
      metadataSummary: summarizeOperatorMetadata(log.metadataJson),
    })),
    deadLetters: deadLetters.map((record) => ({
      id: record.id,
      reason: record.reason,
      createdAt: record.createdAt,
      errorSummary: readErrorSummary(record.errorJson),
    })),
  } satisfies AgentRunDetail;
}

export async function getAgentRunMetrics(input: {
  workspaceId: string;
}): Promise<AgentRunMetrics> {
  const prisma = getPrisma();
  const [jobs, approvals] = await Promise.all([
    prisma.runtimeJob.findMany({
      where: {
        workspaceId: input.workspaceId,
        jobType: {
          in: [
            "agent.run_from_trigger",
            "agent.run_manual",
            "agent.evaluate_follow_ups",
          ],
        },
      },
      select: {
        status: true,
        queuedAt: true,
        completedAt: true,
        failedAt: true,
        deadLetteredAt: true,
        resultJson: true,
      },
      take: 1000,
      orderBy: [{ queuedAt: "desc" }],
    }),
    prisma.approvalRequest.findMany({
      where: {
        workspaceId: input.workspaceId,
        draftMessage: {
          is: {
            senderType: "AGENT",
          },
        },
      },
      select: {
        status: true,
        editedContent: true,
      },
      take: 1000,
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);
  const latencies = jobs
    .map((job) => deriveLatencyMs(job))
    .filter((latency): latency is number => latency != null);
  const completedApprovals = approvals.filter(
    (approval) => approval.status === "APPROVED",
  ).length;
  const rejectedOrEdited = approvals.filter(
    (approval) =>
      approval.status === "REJECTED" || Boolean(approval.editedContent?.trim()),
  ).length;

  return {
    totalRuns: jobs.length,
    completedRuns: jobs.filter((job) => job.status === "COMPLETED").length,
    suppressedRuns: jobs.filter(
      (job) => readOperatorString(outputFromResult(job.resultJson).status) === "suppressed",
    ).length,
    escalatedRuns: jobs.filter(
      (job) => readOperatorString(outputFromResult(job.resultJson).flowStatus) === "escalated",
    ).length,
    failedRuns: jobs.filter(
      (job) => job.status === "FAILED" || job.status === "DEAD_LETTERED",
    ).length,
    draftAcceptanceRate:
      approvals.length > 0 ? completedApprovals / approvals.length : null,
    rejectionRevisionRate:
      approvals.length > 0 ? rejectedOrEdited / approvals.length : null,
    averageLatencyMs:
      latencies.length > 0
        ? Math.round(
            latencies.reduce((sum, value) => sum + value, 0) /
              latencies.length,
          )
        : null,
  };
}

export function formatAgentRunJobType(value: string) {
  return formatOperatorType(value);
}
