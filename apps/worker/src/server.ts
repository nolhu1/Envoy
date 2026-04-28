import { createWorkerJobRegistry } from "./handlers";
import { InMemoryJobQueue, InMemoryWorkerRunner } from "./in-memory-runner";
import { WORKER_JOB_TYPES } from "./jobs";
import {
  buildWorkerRuntimeObservabilitySnapshot,
  writeWorkerMetricsSnapshot,
} from "./observability";
import { WORKER_BACKOFF_STRATEGIES } from "./retry";

async function main() {
  const registry = createWorkerJobRegistry();
  const queue = new InMemoryJobQueue();
  const stuckJobThresholdMs = Number(process.env.WORKER_STUCK_JOB_THRESHOLD_MS);
  const runner = new InMemoryWorkerRunner(registry, queue, {
    logger: (entry) => {
      console.log("[worker]", JSON.stringify(entry));
    },
    stuckJobThresholdMs: Number.isFinite(stuckJobThresholdMs)
      ? stuckJobThresholdMs
      : undefined,
  });

  console.log("[worker] booted");
  console.log("[worker] registered job types:", registry.listJobTypes().join(", "));

  if (process.env.WORKER_RUN_SAMPLE === "true") {
    queue.enqueue({
      jobType: WORKER_JOB_TYPES.CONNECTOR_SYNC,
      workspaceId: "dev-workspace",
      payload: {
        workspaceId: "dev-workspace",
        integrationId: "dev-integration",
        platform: "EMAIL",
      },
      retryPolicy: {
        maxAttempts: 3,
        backoff: {
          strategy: WORKER_BACKOFF_STRATEGIES.FIXED,
          delayMs: 1_000,
        },
      },
    });

    const results = await runner.processAll();
    console.log("[worker] processed jobs:", JSON.stringify(results, null, 2));
    console.log(
      "[worker] queued jobs after run:",
      JSON.stringify(queue.listQueuedJobs(), null, 2),
    );
    console.log(
      "[worker] dead letters:",
      JSON.stringify(queue.getDeadLetters(), null, 2),
    );

    const deadLetterId = process.env.WORKER_REPLAY_DEAD_LETTER_ID;
    if (deadLetterId) {
      const replayed = runner.replayDeadLetter({
        deadLetterId,
      });
      console.log(
        "[worker] replay result:",
        JSON.stringify(replayed ?? { replayed: false }, null, 2),
      );
    }

    await writeWorkerMetricsSnapshot({
      snapshot: buildWorkerRuntimeObservabilitySnapshot({
        queueDepth: runner.getQueueDepthSnapshot(),
      }),
    });

    return;
  }

  await writeWorkerMetricsSnapshot({
    snapshot: buildWorkerRuntimeObservabilitySnapshot({
      queueDepth: runner.getQueueDepthSnapshot(),
    }),
  });

  console.log("[worker] idle");
}

void main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exitCode = 1;
});
