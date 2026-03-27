import type { WorkerJob, WorkerJobEnvelope, WorkerJobType } from "./jobs";

export const WORKER_JOB_STATUSES = {
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type WorkerJobStatus =
  (typeof WORKER_JOB_STATUSES)[keyof typeof WORKER_JOB_STATUSES];

export type WorkerJobResult = {
  status: WorkerJobStatus;
  handledAt: string;
  output?: Record<string, unknown> | null;
  error?: string | null;
};

export type WorkerJobContext = {
  signal?: AbortSignal;
};

export type WorkerJobHandler<TType extends WorkerJobType = WorkerJobType> = (input: {
  job: WorkerJobEnvelope<TType>;
  context: WorkerJobContext;
}) => Promise<WorkerJobResult>;

export class WorkerJobRegistry {
  private readonly handlers = new Map<WorkerJobType, WorkerJobHandler>();

  register<TType extends WorkerJobType>(
    jobType: TType,
    handler: WorkerJobHandler<TType>,
  ) {
    this.handlers.set(jobType, handler as WorkerJobHandler);
    return this;
  }

  has(jobType: WorkerJobType) {
    return this.handlers.has(jobType);
  }

  listJobTypes() {
    return [...this.handlers.keys()];
  }

  async dispatch(job: WorkerJob, context: WorkerJobContext = {}) {
    const handler = this.handlers.get(job.jobType);

    if (!handler) {
      return {
        status: WORKER_JOB_STATUSES.SKIPPED,
        handledAt: new Date().toISOString(),
        error: `No handler registered for job type ${job.jobType}.`,
      } satisfies WorkerJobResult;
    }

    return handler({
      job: job as WorkerJobEnvelope,
      context,
    });
  }
}
