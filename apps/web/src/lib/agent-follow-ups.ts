import "server-only";

import { AGENT_TRIGGER_TYPES, getPrisma } from "@envoy/db";
import {
  CONVERSATION_STATES,
  isTerminalConversationState,
} from "../../../../packages/events/src/index";
import { WORKER_JOB_TYPES } from "../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../worker/src/queues";

import { isAgentTriggerEnabled } from "@/lib/agent-trigger-rules";

type FollowUpEvaluationReason = "scheduled" | "manual" | "recovery";

type FollowUpCandidate = {
  id: string;
  workspaceId: string;
  state: string;
  lastMessageAt: Date | null;
  platformMetadataJson: unknown;
  assignedAgentId: string | null;
  assignedAgent: {
    id: string;
    isActive: boolean;
    escalationRulesJson: unknown;
  } | null;
  approvalRequests: Array<{ id: string }>;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
    createdAt: Date;
    receivedAt: Date | null;
  }>;
};

export type FollowUpEvaluationResult = {
  scanned: number;
  enqueued: number;
  suppressed: number;
  suppressions: Array<{
    conversationId: string;
    reason: string;
  }>;
  enqueuedJobs: Array<{
    conversationId: string;
    runtimeJobId: string;
  }>;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDueAt(metadata: unknown) {
  const record = isJsonObject(metadata) ? metadata : {};
  const followUp = isJsonObject(record.agentFollowUp) ? record.agentFollowUp : {};
  const dueAtValue =
    typeof followUp.dueAt === "string" && followUp.dueAt.trim()
      ? followUp.dueAt.trim()
      : null;

  if (!dueAtValue) {
    return null;
  }

  const dueAt = new Date(dueAtValue);
  return Number.isFinite(dueAt.getTime()) ? dueAt : null;
}

function suppress(reason: string, candidate: FollowUpCandidate) {
  return {
    conversationId: candidate.id,
    reason,
  };
}

function getLatestInbound(candidate: FollowUpCandidate) {
  return candidate.messages.find((message) => message.direction === "INBOUND") ?? null;
}

export async function evaluateAndEnqueueDueAgentFollowUps(input: {
  workspaceId?: string | null;
  requestedAt: string;
  reason: FollowUpEvaluationReason;
  limit?: number | null;
}): Promise<FollowUpEvaluationResult> {
  const prisma = getPrisma();
  const requestedAt = new Date(input.requestedAt);
  const now = Number.isFinite(requestedAt.getTime()) ? requestedAt : new Date();
  const allCandidates = await prisma.conversation.findMany({
    where: {
      workspaceId: input.workspaceId ?? undefined,
      deletedAt: null,
      assignedAgentId: {
        not: null,
      },
    },
    select: {
      id: true,
      workspaceId: true,
      state: true,
      lastMessageAt: true,
      platformMetadataJson: true,
      assignedAgentId: true,
      assignedAgent: {
        select: {
          id: true,
          isActive: true,
          escalationRulesJson: true,
        },
      },
      approvalRequests: {
        where: {
          status: "PENDING",
        },
        select: {
          id: true,
        },
        take: 1,
      },
      messages: {
        where: {
          deletedAt: null,
        },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          direction: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ lastMessageAt: "asc" }, { updatedAt: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 100, 500)),
  });
  const candidates = (allCandidates as FollowUpCandidate[]).filter((candidate) => {
    const dueAt = readDueAt(candidate.platformMetadataJson);
    return (
      candidate.state === CONVERSATION_STATES.FOLLOW_UP_DUE ||
      Boolean(dueAt && dueAt.getTime() <= now.getTime())
    );
  });
  const result: FollowUpEvaluationResult = {
    scanned: candidates.length,
    enqueued: 0,
    suppressed: 0,
    suppressions: [],
    enqueuedJobs: [],
  };

  for (const candidate of candidates) {
    const dueAt = readDueAt(candidate.platformMetadataJson);
    const latestInbound = getLatestInbound(candidate);

    if (!candidate.assignedAgent?.isActive) {
      result.suppressions.push(suppress("no_active_assignment", candidate));
      continue;
    }

    if (isTerminalConversationState(candidate.state as never)) {
      result.suppressions.push(suppress("terminal_state", candidate));
      continue;
    }

    if (
      candidate.state === CONVERSATION_STATES.AWAITING_APPROVAL ||
      candidate.approvalRequests.length > 0
    ) {
      result.suppressions.push(suppress("unresolved_approval_path", candidate));
      continue;
    }

    if (
      !isAgentTriggerEnabled({
        escalationRulesJson: candidate.assignedAgent.escalationRulesJson,
        triggerType: AGENT_TRIGGER_TYPES.FOLLOW_UP_DUE,
        fallbackEnabled: true,
      })
    ) {
      result.suppressions.push(suppress("trigger_disabled", candidate));
      continue;
    }

    if (
      dueAt &&
      latestInbound &&
      (latestInbound.receivedAt ?? latestInbound.createdAt).getTime() > dueAt.getTime()
    ) {
      result.suppressions.push(suppress("recent_inbound_activity", candidate));
      continue;
    }

    const enqueueResult = await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.AGENT,
      jobType: WORKER_JOB_TYPES.AGENT_RUN_FROM_TRIGGER,
      workspaceId: candidate.workspaceId,
      payload: {
        workspaceId: candidate.workspaceId,
        conversationId: candidate.id,
        triggerType: AGENT_TRIGGER_TYPES.FOLLOW_UP_DUE,
        sourceEventId: null,
        sourceMessageId: null,
        sourceApprovalRequestId: null,
        requestedAt: now.toISOString(),
      },
      dedupeKey: [
        "agent",
        "follow_up_due",
        candidate.workspaceId,
        candidate.id,
        dueAt?.toISOString() ?? now.toISOString().slice(0, 13),
      ].join(":"),
      retryPolicy: {
        maxAttempts: 1,
      },
    });

    result.enqueued += 1;
    result.enqueuedJobs.push({
      conversationId: candidate.id,
      runtimeJobId: enqueueResult.runtimeJobId,
    });
  }

  result.suppressed = result.suppressions.length;
  return result;
}
