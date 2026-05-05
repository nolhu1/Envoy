import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

export type WorkerQueueDepthSnapshot = {
  queuedJobCount: number;
  inFlightJobCount: number;
  completedJobCount?: number;
  failedJobCount?: number;
  deadLetterCount: number;
  stuckJobCount?: number;
  oldestQueuedJobAgeMs?: number | null;
  recentFailureCount?: number;
  redisConnected?: boolean;
  queuesRegistered?: string[];
  executionCount: number;
};

export const DEFAULT_WORKER_METRICS_PATH = "/tmp/envoy-worker-metrics.json";

export type WorkerRuntimeObservabilitySnapshot = WorkerQueueDepthSnapshot & {
  updatedAt: string;
};

export function buildWorkerRuntimeObservabilitySnapshot(input: {
  queueDepth: WorkerQueueDepthSnapshot;
  now?: Date;
}): WorkerRuntimeObservabilitySnapshot {
  return {
    ...input.queueDepth,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export async function writeWorkerMetricsSnapshot(input: {
  snapshot: WorkerRuntimeObservabilitySnapshot;
  filePath?: string;
}) {
  const filePath = input.filePath || process.env.ENVOY_WORKER_METRICS_PATH || DEFAULT_WORKER_METRICS_PATH;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(input.snapshot, null, 2), "utf8");
}
