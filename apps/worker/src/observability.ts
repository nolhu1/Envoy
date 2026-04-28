import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { WorkerQueueDepthSnapshot } from "./in-memory-runner";

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
