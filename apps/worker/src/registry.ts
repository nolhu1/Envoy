import type { WorkerJob, WorkerJobEnvelope, WorkerJobType } from "./jobs";

export const WORKER_JOB_STATUSES = {
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type WorkerJobStatus =
  (typeof WORKER_JOB_STATUSES)[keyof typeof WORKER_JOB_STATUSES];

export type WorkerJobError = {
  message: string;
  code?: string | null;
  details?: Record<string, unknown> | null;
  stack?: string | null;
  retryable?: boolean | null;
};

export type WorkerJobResult = {
  status: WorkerJobStatus;
  handledAt: string;
  output?: Record<string, unknown> | null;
  error?: WorkerJobError | null;
};

export type WorkerJobLogLevel = "info" | "warn" | "error";

export type WorkerJobLogEntry = {
  level: WorkerJobLogLevel;
  occurredAt: string;
  message: string;
  jobId: string;
  jobType: WorkerJobType;
  workspaceId: string;
  attempt: number;
  error?: WorkerJobError | null;
  metadata?: Record<string, unknown> | null;
};

export type WorkerJobLogger = (
  entry: WorkerJobLogEntry,
) => void | Promise<void>;

export type WorkerJobContext = {
  signal?: AbortSignal;
  log?: WorkerJobLogger;
};

export type WorkerJobHandler<TType extends WorkerJobType = WorkerJobType> = (input: {
  job: WorkerJobEnvelope<TType>;
  context: WorkerJobContext;
}) => Promise<WorkerJobResult>;

function normalizeWorkerJobError(error: unknown): WorkerJobError {
  if (error instanceof Error) {
    const errorWithMetadata = error as Error & {
      code?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    };

    return {
      message: error.message,
      code: errorWithMetadata.code ?? null,
      details: errorWithMetadata.details ?? null,
      stack: error.stack ?? null,
      retryable: errorWithMetadata.retryable ?? null,
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
      retryable: null,
    };
  }

  return {
    message: "Unknown worker job failure.",
    details:
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : { value: error },
    retryable: null,
  };
}

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
        error: {
          message: `No handler registered for job type ${job.jobType}.`,
          retryable: false,
        },
      } satisfies WorkerJobResult;
    }

    try {
      return await handler({
        job: job as WorkerJobEnvelope,
        context,
      });
    } catch (error) {
      const normalizedError = normalizeWorkerJobError(error);
      const handledAt = new Date().toISOString();

      await context.log?.({
        level: "error",
        occurredAt: handledAt,
        message: "Worker job handler threw an uncaught error.",
        jobId: job.jobId,
        jobType: job.jobType,
        workspaceId: job.workspaceId,
        attempt: job.attempt + 1,
        error: normalizedError,
      });

      return {
        status: WORKER_JOB_STATUSES.FAILED,
        handledAt,
        error: normalizedError,
      } satisfies WorkerJobResult;
    }
  }
}
