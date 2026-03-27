import { createWorkerJobRegistry } from "./handlers";
import { InMemoryJobQueue, InMemoryWorkerRunner } from "./in-memory-runner";
import { WORKER_JOB_TYPES } from "./jobs";

async function main() {
  const registry = createWorkerJobRegistry();
  const queue = new InMemoryJobQueue();
  const runner = new InMemoryWorkerRunner(registry, queue);

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
    });

    const results = await runner.processAll();
    console.log("[worker] processed jobs:", JSON.stringify(results, null, 2));
    return;
  }

  console.log("[worker] idle");
}

void main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exitCode = 1;
});
