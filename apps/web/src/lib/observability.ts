import "server-only";

import { readFile } from "node:fs/promises";

import { getPrisma, getRuntimeJobHealthSummary } from "@envoy/db";

import { sanitizeDiagnostics } from "@/lib/security";

const DEFAULT_METRIC_WINDOW_DAYS = 14;
const DEFAULT_WORKER_METRICS_PATH = "/tmp/envoy-worker-metrics.json";

type WorkerMetricsSnapshot = {
  queuedJobCount: number;
  inFlightJobCount: number;
  completedJobCount?: number | null;
  failedJobCount?: number | null;
  deadLetterCount: number;
  stuckJobCount?: number | null;
  oldestQueuedJobAgeMs?: number | null;
  recentFailureCount?: number | null;
  redisConnected?: boolean | null;
  queuesRegistered?: string[] | null;
  executionCount: number;
  updatedAt: string;
};

type IntegrationFailureSummary = {
  integrationId: string;
  platform: "EMAIL" | "SLACK";
  status: string;
  displayName: string | null;
  lastSyncedAt: Date | null;
  diagnosticsSummary: string | null;
};

export type WorkspaceOperationalSnapshot = {
  observedAt: string;
  windowStartedAt: string;
  connectorSyncFailures: {
    activeErrorIntegrations: number;
    recentSyncFailureEvents: number;
    integrations: IntegrationFailureSummary[];
  };
  sendFailureRate: {
    totalOutboundAttempts: number;
    failedOutboundAttempts: number;
    failureRate: number;
  };
  workerQueueDepth: {
    queuedJobCount: number | null;
    inFlightJobCount: number | null;
    deadLetterCount: number | null;
    executionCount: number | null;
    updatedAt: string | null;
  };
  runtimeHealth: {
    redisConnected: boolean | null;
    queuesRegistered: string[];
    queuedJobCount: number;
    runningJobCount: number;
    completedJobCount: number;
    failedJobCount: number;
    deadLetteredJobCount: number;
    cancelledJobCount: number;
    deadLetterCount: number;
    stuckJobCount: number;
    oldestQueuedJobAgeMs: number | null;
    recentFailureCount: number;
  };
  averageAgentLatency: {
    sampleCount: number;
    averageLatencyMs: number | null;
  };
  approvalTurnaroundTime: {
    sampleCount: number;
    averageTurnaroundMs: number | null;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRunId(metadataJson: unknown) {
  if (!isObject(metadataJson)) {
    return null;
  }

  return typeof metadataJson.runId === "string" && metadataJson.runId.trim()
    ? metadataJson.runId.trim()
    : null;
}

function toFailureSummary(
  integration: {
    id: string;
    platform: "EMAIL" | "SLACK";
    status: string;
    displayName: string | null;
    lastSyncedAt: Date | null;
    platformMetadataJson: unknown;
  },
): IntegrationFailureSummary {
  const metadata = isObject(integration.platformMetadataJson)
    ? integration.platformMetadataJson
    : null;
  const checkpoint =
    isObject(metadata?.gmailSyncCheckpoint)
      ? metadata.gmailSyncCheckpoint
      : isObject(metadata?.slackSyncCheckpoint)
        ? metadata.slackSyncCheckpoint
        : null;
  const diagnosticsMessage =
    typeof metadata?.connectError === "string" && metadata.connectError
      ? metadata.connectError
      : checkpoint && isObject(checkpoint.diagnosticsSummary)
        ? (checkpoint.diagnosticsSummary.message as string | undefined)
        : null;

  return {
    integrationId: integration.id,
    platform: integration.platform,
    status: integration.status,
    displayName: integration.displayName,
    lastSyncedAt: integration.lastSyncedAt,
    diagnosticsSummary:
      typeof diagnosticsMessage === "string" && diagnosticsMessage.trim()
        ? diagnosticsMessage.trim()
        : null,
  };
}

async function readWorkerMetricsSnapshot(): Promise<WorkerMetricsSnapshot | null> {
  const path = process.env.ENVOY_WORKER_METRICS_PATH || DEFAULT_WORKER_METRICS_PATH;

  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as unknown;

    if (!isObject(parsed)) {
      return null;
    }

    const queuedJobCount = toNumber(parsed.queuedJobCount);
    const inFlightJobCount = toNumber(parsed.inFlightJobCount);
    const deadLetterCount = toNumber(parsed.deadLetterCount);
    const completedJobCount = toNumber(parsed.completedJobCount);
    const failedJobCount = toNumber(parsed.failedJobCount);
    const stuckJobCount = toNumber(parsed.stuckJobCount);
    const oldestQueuedJobAgeMs = toNumber(parsed.oldestQueuedJobAgeMs);
    const recentFailureCount = toNumber(parsed.recentFailureCount);
    const redisConnected =
      typeof parsed.redisConnected === "boolean" ? parsed.redisConnected : null;
    const queuesRegistered = Array.isArray(parsed.queuesRegistered)
      ? parsed.queuesRegistered.filter(
          (queueName): queueName is string => typeof queueName === "string",
        )
      : null;
    const executionCount = toNumber(parsed.executionCount);
    const updatedAt =
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : null;

    if (
      queuedJobCount == null ||
      inFlightJobCount == null ||
      deadLetterCount == null ||
      executionCount == null ||
      !updatedAt
    ) {
      return null;
    }

    return {
      queuedJobCount,
      inFlightJobCount,
      completedJobCount,
      failedJobCount,
      deadLetterCount,
      stuckJobCount,
      oldestQueuedJobAgeMs,
      recentFailureCount,
      redisConnected,
      queuesRegistered,
      executionCount,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getWorkspaceOperationalSnapshot(input: {
  workspaceId: string;
  windowDays?: number;
}): Promise<WorkspaceOperationalSnapshot> {
  const prisma = getPrisma();
  const now = new Date();
  const windowDays =
    typeof input.windowDays === "number" && input.windowDays > 0
      ? Math.floor(input.windowDays)
      : DEFAULT_METRIC_WINDOW_DAYS;
  const windowStartedAt = new Date(now);
  windowStartedAt.setDate(windowStartedAt.getDate() - windowDays);

  const [
    failingIntegrations,
    recentSyncFailureEvents,
    outboundTotalCount,
    outboundFailedCount,
    agentRunLogs,
    reviewedApprovals,
    workerMetrics,
    runtimeHealth,
  ] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        status: "ERROR",
      },
      select: {
        id: true,
        platform: true,
        status: true,
        displayName: true,
        lastSyncedAt: true,
        platformMetadataJson: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
    }),
    prisma.actionLog.count({
      where: {
        workspaceId: input.workspaceId,
        actionType: "INTEGRATION_SYNC_FAILED",
        createdAt: {
          gte: windowStartedAt,
        },
      },
    }),
    prisma.message.count({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        direction: "OUTBOUND",
        status: {
          in: ["SENT", "DELIVERED", "FAILED"],
        },
        createdAt: {
          gte: windowStartedAt,
        },
      },
    }),
    prisma.message.count({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        direction: "OUTBOUND",
        status: "FAILED",
        createdAt: {
          gte: windowStartedAt,
        },
      },
    }),
    prisma.actionLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        actionType: {
          in: ["AGENT_RUN_REQUESTED", "AGENT_RUN_COMPLETED"],
        },
        createdAt: {
          gte: windowStartedAt,
        },
      },
      select: {
        actionType: true,
        createdAt: true,
        metadataJson: true,
      },
      orderBy: [{ createdAt: "asc" }],
      take: 5000,
    }),
    prisma.approvalRequest.findMany({
      where: {
        workspaceId: input.workspaceId,
        reviewedAt: {
          not: null,
          gte: windowStartedAt,
        },
      },
      select: {
        createdAt: true,
        reviewedAt: true,
      },
      take: 5000,
    }),
    readWorkerMetricsSnapshot(),
    getRuntimeJobHealthSummary(),
  ]);

  const runStartedAtById = new Map<string, Date>();
  const runCompletedAtById = new Map<string, Date>();

  for (const log of agentRunLogs) {
    const runId = readRunId(log.metadataJson);
    if (!runId) {
      continue;
    }

    if (
      log.actionType === "AGENT_RUN_REQUESTED" &&
      !runStartedAtById.has(runId)
    ) {
      runStartedAtById.set(runId, log.createdAt);
      continue;
    }

    if (log.actionType === "AGENT_RUN_COMPLETED") {
      runCompletedAtById.set(runId, log.createdAt);
    }
  }

  const agentLatencies = [...runCompletedAtById.entries()].flatMap(
    ([runId, completedAt]) => {
      const startedAt = runStartedAtById.get(runId);
      if (!startedAt) {
        return [];
      }

      const latencyMs = completedAt.getTime() - startedAt.getTime();
      return latencyMs >= 0 ? [latencyMs] : [];
    },
  );

  const agentLatencyAverage =
    agentLatencies.length > 0
      ? agentLatencies.reduce((sum, latency) => sum + latency, 0) /
        agentLatencies.length
      : null;

  const approvalTurnaroundSamples = reviewedApprovals.flatMap((approval) => {
    const reviewedAt = approval.reviewedAt;
    if (!reviewedAt) {
      return [];
    }

    const latencyMs = reviewedAt.getTime() - approval.createdAt.getTime();
    return latencyMs >= 0 ? [latencyMs] : [];
  });

  const approvalTurnaroundAverage =
    approvalTurnaroundSamples.length > 0
      ? approvalTurnaroundSamples.reduce((sum, latency) => sum + latency, 0) /
        approvalTurnaroundSamples.length
      : null;

  return sanitizeDiagnostics({
    observedAt: now.toISOString(),
    windowStartedAt: windowStartedAt.toISOString(),
    connectorSyncFailures: {
      activeErrorIntegrations: failingIntegrations.length,
      recentSyncFailureEvents,
      integrations: failingIntegrations.map(toFailureSummary),
    },
    sendFailureRate: {
      totalOutboundAttempts: outboundTotalCount,
      failedOutboundAttempts: outboundFailedCount,
      failureRate:
        outboundTotalCount > 0 ? outboundFailedCount / outboundTotalCount : 0,
    },
    workerQueueDepth: {
      queuedJobCount: workerMetrics?.queuedJobCount ?? null,
      inFlightJobCount: workerMetrics?.inFlightJobCount ?? null,
      deadLetterCount: workerMetrics?.deadLetterCount ?? null,
      executionCount: workerMetrics?.executionCount ?? null,
      updatedAt: workerMetrics?.updatedAt ?? null,
    },
    runtimeHealth: {
      redisConnected: workerMetrics?.redisConnected ?? null,
      queuesRegistered: workerMetrics?.queuesRegistered ?? [],
      queuedJobCount: runtimeHealth.countsByStatus.QUEUED,
      runningJobCount: runtimeHealth.countsByStatus.RUNNING,
      completedJobCount: runtimeHealth.countsByStatus.COMPLETED,
      failedJobCount: runtimeHealth.countsByStatus.FAILED,
      deadLetteredJobCount: runtimeHealth.countsByStatus.DEAD_LETTERED,
      cancelledJobCount: runtimeHealth.countsByStatus.CANCELLED,
      deadLetterCount: runtimeHealth.deadLetterCount,
      stuckJobCount: runtimeHealth.stuckJobCount,
      oldestQueuedJobAgeMs: runtimeHealth.oldestQueuedJobAgeMs,
      recentFailureCount: runtimeHealth.recentFailureCount,
    },
    averageAgentLatency: {
      sampleCount: agentLatencies.length,
      averageLatencyMs: agentLatencyAverage,
    },
    approvalTurnaroundTime: {
      sampleCount: approvalTurnaroundSamples.length,
      averageTurnaroundMs: approvalTurnaroundAverage,
    },
  }) as WorkspaceOperationalSnapshot;
}
