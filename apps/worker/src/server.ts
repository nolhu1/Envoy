import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { getPrisma } from "../../../packages/db/src/index";
import { createWorkerJobRegistry } from "./handlers";
import { WORKER_JOB_TYPES } from "./jobs";
import {
  buildWorkerRuntimeObservabilitySnapshot,
  writeWorkerMetricsSnapshot,
} from "./observability";
import {
  WORKER_QUEUE_NAMES,
  createBullMqWorkerRuntime,
} from "./queues";

const WORKER_HEALTH_INTERVAL_MS = 5_000;

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function loadWorkerEnvironment() {
  const cwd = process.cwd();
  const candidateEnvFiles = [
    resolve(cwd, ".env"),
    resolve(cwd, ".env.local"),
    resolve(cwd, "apps/web/.env.local"),
    resolve(cwd, "../..", ".env"),
    resolve(cwd, "../web/.env.local"),
  ];

  for (const filePath of candidateEnvFiles) {
    loadEnvFile(filePath);
  }
}

async function writeHealthSnapshot(runtime: ReturnType<typeof createBullMqWorkerRuntime>) {
  const health = await runtime.getHealth();
  await writeWorkerMetricsSnapshot({
    snapshot: buildWorkerRuntimeObservabilitySnapshot({
      queueDepth: {
        queuedJobCount: health.queuedJobCount,
        inFlightJobCount: health.runningJobCount,
        completedJobCount: health.completedJobCount,
        failedJobCount: health.failedJobCount,
        deadLetterCount: health.deadLetterCount,
        stuckJobCount: health.stuckJobCount,
        oldestQueuedJobAgeMs: health.oldestQueuedJobAgeMs,
        recentFailureCount: health.recentFailureCount,
        redisConnected: health.redisConnected,
        queuesRegistered: health.queuesRegistered,
        executionCount: health.processedCount + health.failedCount,
      },
    }),
  });

  return health;
}

async function main() {
  loadWorkerEnvironment();

  const registry = createWorkerJobRegistry();
  const runtime = createBullMqWorkerRuntime(registry, {
    logger: (entry) => {
      console.log("[worker]", JSON.stringify(entry));
    },
  });

  console.log("[worker] booted");
  console.log("[worker] registered job types:", registry.listJobTypes().join(", "));
  console.log("[worker] registered queues:", runtime.getQueueNames().join(", "));
  runtime.startWorkers();

  if (process.env.WORKER_RUN_SAMPLE === "true") {
    const sampleWorkspaceId = await resolveSampleWorkspaceId();

    if (sampleWorkspaceId) {
      const enqueued = await runtime.enqueue({
        queueName: WORKER_QUEUE_NAMES.MAINTENANCE,
        jobType: WORKER_JOB_TYPES.MAINTENANCE_HEALTH_CHECK,
        workspaceId: sampleWorkspaceId,
        payload: {
          workspaceId: sampleWorkspaceId,
          requestedAt: new Date().toISOString(),
        },
        dedupeKey: `maintenance:health_check:${sampleWorkspaceId}:sample`,
      });

      console.log("[worker] sample job enqueued:", JSON.stringify(enqueued));
    } else {
      console.log("[worker] sample job skipped: no workspace found");
    }
  }

  const health = await writeHealthSnapshot(runtime);
  const healthTimer = setInterval(() => {
    void writeHealthSnapshot(runtime).catch((error) => {
      console.error("[worker] health snapshot failed", error);
    });
  }, WORKER_HEALTH_INTERVAL_MS);
  healthTimer.unref();

  console.log("[worker] health:", JSON.stringify(health));
  console.log("[worker] running");
}

void main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exitCode = 1;
});

async function resolveSampleWorkspaceId() {
  if (process.env.WORKER_SAMPLE_WORKSPACE_ID) {
    return process.env.WORKER_SAMPLE_WORKSPACE_ID;
  }

  const prisma = getPrisma();
  const workspace = await prisma.workspace.findFirst({
    select: {
      id: true,
    },
  });

  return workspace?.id ?? null;
}
