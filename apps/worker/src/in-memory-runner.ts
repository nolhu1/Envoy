import { randomUUID } from "node:crypto";

import type { WorkerJob, WorkerJobEnvelope, WorkerJobPayloadByType, WorkerJobType } from "./jobs";
import { WorkerJobRegistry, type WorkerJobContext, type WorkerJobResult } from "./registry";

export class InMemoryJobQueue {
  private readonly jobs: WorkerJob[] = [];

  enqueue<TType extends WorkerJobType>(input: {
    jobType: TType;
    workspaceId: string;
    payload: WorkerJobPayloadByType[TType];
    runAt?: string | null;
  }) {
    const job = {
      jobId: randomUUID(),
      jobType: input.jobType,
      workspaceId: input.workspaceId,
      payload: input.payload,
      queuedAt: new Date().toISOString(),
      runAt: input.runAt ?? null,
      attempt: 0,
    } satisfies WorkerJobEnvelope<TType>;

    this.jobs.push(job as WorkerJob);

    return job;
  }

  size() {
    return this.jobs.length;
  }

  drain() {
    const jobs = [...this.jobs];
    this.jobs.length = 0;
    return jobs;
  }
}

export class InMemoryWorkerRunner {
  constructor(
    private readonly registry: WorkerJobRegistry,
    private readonly queue: InMemoryJobQueue,
  ) {}

  async processAll(context: WorkerJobContext = {}) {
    const jobs = this.queue.drain();
    const results: Array<{ job: WorkerJob; result: WorkerJobResult }> = [];

    for (const job of jobs) {
      results.push({
        job,
        result: await this.registry.dispatch(job, context),
      });
    }

    return results;
  }
}
