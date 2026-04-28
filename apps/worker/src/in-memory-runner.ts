import { randomUUID } from "node:crypto";

import type {
  WorkerJob,
  WorkerJobEnvelope,
  WorkerJobErrorSnapshot,
  WorkerJobPayloadByType,
  WorkerJobType,
} from "./jobs";
import {
  WorkerJobRegistry,
  WORKER_JOB_STATUSES,
  type WorkerJobContext,
  type WorkerJobLogEntry,
  type WorkerJobLogger,
  type WorkerJobResult,
  type WorkerJobStatus,
} from "./registry";
import {
  calculateWorkerNextRunAt,
  resolveWorkerRetryPolicy,
  type WorkerRetryPolicyInput,
} from "./retry";

export const WORKER_EXECUTION_STATUSES = {
  COMPLETED: "completed",
  SKIPPED: "skipped",
  RETRY_SCHEDULED: "retry_scheduled",
  DEAD_LETTERED: "dead_lettered",
} as const;

export type WorkerExecutionStatus =
  (typeof WORKER_EXECUTION_STATUSES)[keyof typeof WORKER_EXECUTION_STATUSES];

export const WORKER_DEAD_LETTER_REASONS = {
  MAX_ATTEMPTS_EXCEEDED: "max_attempts_exceeded",
  NON_RETRYABLE_FAILURE: "non_retryable_failure",
} as const;

export type WorkerDeadLetterReason =
  (typeof WORKER_DEAD_LETTER_REASONS)[keyof typeof WORKER_DEAD_LETTER_REASONS];

export type WorkerExecutionRecord = {
  executionId: string;
  jobId: string;
  jobType: WorkerJobType;
  workspaceId: string;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  handledAt: string;
  status: WorkerExecutionStatus;
  handlerStatus: WorkerJobStatus;
  output?: Record<string, unknown> | null;
  error?: WorkerJobResult["error"];
  nextRunAt?: string | null;
  replayOfJobId?: string | null;
};

export type WorkerDeadLetterEntry = {
  deadLetterId: string;
  job: WorkerJob;
  deadLetteredAt: string;
  reason: WorkerDeadLetterReason;
  finalResult: WorkerJobResult;
  executionHistory: WorkerExecutionRecord[];
  replayedJobIds: string[];
};

type WorkerInFlightJobEntry = {
  job: WorkerJob;
  startedAt: string;
  heartbeatAt: string;
};

export type WorkerQueueDepthSnapshot = {
  queuedJobCount: number;
  inFlightJobCount: number;
  deadLetterCount: number;
  executionCount: number;
};

export type ProcessedWorkerJobResult = {
  job: WorkerJob;
  result: WorkerJobResult;
  execution: WorkerExecutionRecord;
  retryJob?: WorkerJob | null;
  deadLetter?: WorkerDeadLetterEntry | null;
};

export type InMemoryWorkerRunnerOptions = {
  logger?: WorkerJobLogger;
  now?: () => Date;
  recoverStuckJobs?: boolean;
  stuckJobThresholdMs?: number;
};

export class InMemoryJobQueue {
  private readonly jobs: WorkerJob[] = [];
  private readonly executionHistory: WorkerExecutionRecord[] = [];
  private readonly deadLetters: WorkerDeadLetterEntry[] = [];
  private readonly logs: WorkerJobLogEntry[] = [];
  private readonly inFlightJobs = new Map<string, WorkerInFlightJobEntry>();

  enqueue<TType extends WorkerJobType>(input: {
    jobType: TType;
    workspaceId: string;
    payload: WorkerJobPayloadByType[TType];
    runAt?: string | null;
    retryPolicy?: WorkerRetryPolicyInput | null;
    replayOfJobId?: string | null;
  }) {
    const job = {
      jobId: randomUUID(),
      jobType: input.jobType,
      workspaceId: input.workspaceId,
      payload: input.payload,
      queuedAt: new Date().toISOString(),
      runAt: input.runAt ?? null,
      attempt: 0,
      retryPolicy: resolveWorkerRetryPolicy(input.retryPolicy),
      lastAttemptedAt: null,
      lastError: null,
      replayOfJobId: input.replayOfJobId ?? null,
    } satisfies WorkerJobEnvelope<TType>;

    this.jobs.push(job as WorkerJob);

    return job;
  }

  size() {
    return this.jobs.length;
  }

  listQueuedJobs() {
    return [...this.jobs];
  }

  getExecutionHistory() {
    return [...this.executionHistory];
  }

  getDeadLetters() {
    return [...this.deadLetters];
  }

  getLogs() {
    return [...this.logs];
  }

  getInFlightJobs() {
    return [...this.inFlightJobs.values()].map((entry) => ({
      ...entry,
      job: {
        ...entry.job,
      },
    }));
  }

  getQueueDepthSnapshot(): WorkerQueueDepthSnapshot {
    return {
      queuedJobCount: this.jobs.length,
      inFlightJobCount: this.inFlightJobs.size,
      deadLetterCount: this.deadLetters.length,
      executionCount: this.executionHistory.length,
    };
  }

  drainReady(now: Date = new Date()) {
    const readyJobs: WorkerJob[] = [];
    const deferredJobs: WorkerJob[] = [];

    for (const job of this.jobs) {
      if (job.runAt && new Date(job.runAt).getTime() > now.getTime()) {
        deferredJobs.push(job);
        continue;
      }

      readyJobs.push(job);
    }

    this.jobs.length = 0;
    this.jobs.push(...deferredJobs);

    return readyJobs;
  }

  recordExecution(record: WorkerExecutionRecord) {
    this.executionHistory.push(record);
  }

  recordLog(entry: WorkerJobLogEntry) {
    this.logs.push(entry);
  }

  markInFlight(job: WorkerJob, startedAt: string) {
    this.inFlightJobs.set(job.jobId, {
      job,
      startedAt,
      heartbeatAt: startedAt,
    });
  }

  clearInFlight(jobId: string) {
    this.inFlightJobs.delete(jobId);
  }

  heartbeatInFlight(jobId: string, heartbeatAt: string) {
    const entry = this.inFlightJobs.get(jobId);
    if (!entry) {
      return;
    }

    this.inFlightJobs.set(jobId, {
      ...entry,
      heartbeatAt,
    });
  }

  requeue(job: WorkerJob) {
    this.jobs.push(job);
    return job;
  }

  addDeadLetter(entry: WorkerDeadLetterEntry) {
    this.deadLetters.push(entry);
    return entry;
  }

  replayDeadLetter(input: {
    deadLetterId: string;
    retryPolicy?: WorkerRetryPolicyInput | null;
  }) {
    const deadLetter = this.deadLetters.find(
      (entry) => entry.deadLetterId === input.deadLetterId,
    );

    if (!deadLetter) {
      return null;
    }

    const replayedJob = {
      ...deadLetter.job,
      jobId: randomUUID(),
      queuedAt: new Date().toISOString(),
      runAt: null,
      attempt: 0,
      retryPolicy: input.retryPolicy
        ? resolveWorkerRetryPolicy(input.retryPolicy)
        : deadLetter.job.retryPolicy,
      lastAttemptedAt: null,
      lastError: null,
      replayOfJobId: deadLetter.job.jobId,
    } satisfies WorkerJob;

    deadLetter.replayedJobIds.push(replayedJob.jobId);
    this.jobs.push(replayedJob);

    return replayedJob;
  }

  recoverStuckJobs(input: {
    now?: Date;
    stuckAfterMs: number;
    retryPolicy?: WorkerRetryPolicyInput | null;
  }) {
    const now = input.now ?? new Date();
    const recoveredJobs: WorkerJob[] = [];

    for (const [jobId, inFlight] of this.inFlightJobs.entries()) {
      const lastHeartbeatAt = new Date(inFlight.heartbeatAt).getTime();
      if (!Number.isFinite(lastHeartbeatAt)) {
        continue;
      }

      if (now.getTime() - lastHeartbeatAt < input.stuckAfterMs) {
        continue;
      }

      const recoveredJob = {
        ...inFlight.job,
        runAt: now.toISOString(),
        queuedAt: now.toISOString(),
        retryPolicy: input.retryPolicy
          ? resolveWorkerRetryPolicy(input.retryPolicy)
          : inFlight.job.retryPolicy,
        lastError: {
          message: "Recovered from in-flight stuck state.",
          code: "stuck_job_recovered",
          retryable: true,
          failedAt: now.toISOString(),
        },
      } satisfies WorkerJob;

      this.inFlightJobs.delete(jobId);
      this.jobs.push(recoveredJob);
      recoveredJobs.push(recoveredJob);
    }

    return recoveredJobs;
  }
}

export class InMemoryWorkerRunner {
  private readonly now: () => Date;
  private readonly logger?: WorkerJobLogger;
  private readonly recoverStuckJobs: boolean;
  private readonly stuckJobThresholdMs: number;

  constructor(
    private readonly registry: WorkerJobRegistry,
    private readonly queue: InMemoryJobQueue,
    options: InMemoryWorkerRunnerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
    this.recoverStuckJobs = options.recoverStuckJobs ?? true;
    this.stuckJobThresholdMs = Math.max(
      1_000,
      Math.trunc(options.stuckJobThresholdMs ?? 10 * 60_000),
    );
  }

  async processAll(context: WorkerJobContext = {}) {
    if (this.recoverStuckJobs) {
      const recovered = this.queue.recoverStuckJobs({
        now: this.now(),
        stuckAfterMs: this.stuckJobThresholdMs,
      });

      for (const job of recovered) {
        await context.log?.({
          level: "warn",
          occurredAt: this.now().toISOString(),
          message: "Recovered stuck in-flight worker job and re-queued it.",
          jobId: job.jobId,
          jobType: job.jobType,
          workspaceId: job.workspaceId,
          attempt: job.attempt + 1,
          metadata: {
            stuckJobThresholdMs: this.stuckJobThresholdMs,
          },
        });
      }
    }

    const jobs = this.queue.drainReady(this.now());
    const results: ProcessedWorkerJobResult[] = [];

    const log: WorkerJobLogger = async (entry) => {
      this.queue.recordLog(entry);
      await this.logger?.(entry);
      await context.log?.(entry);
    };

    for (const job of jobs) {
      const startedAt = this.now().toISOString();
      this.queue.markInFlight(job, startedAt);
      try {
        const result = await this.registry.dispatch(job, {
          ...context,
          log,
        });
        const handledAt = result.handledAt;

        if (result.status === WORKER_JOB_STATUSES.FAILED) {
          const canRetry =
            (result.error?.retryable ?? true) &&
            job.attempt + 1 < job.retryPolicy.maxAttempts;

          if (canRetry) {
            const retryAttempt = job.attempt + 1;
            const nextRunAt = calculateWorkerNextRunAt({
              from: handledAt,
              backoff: job.retryPolicy.backoff,
              retryAttempt,
            });
            const retryJob = {
              ...job,
              runAt: nextRunAt,
              attempt: retryAttempt,
              lastAttemptedAt: handledAt,
              lastError: createJobErrorSnapshot(result, handledAt),
            } satisfies WorkerJob;
            const execution = createExecutionRecord({
              job,
              result,
              startedAt,
              status: WORKER_EXECUTION_STATUSES.RETRY_SCHEDULED,
              nextRunAt,
            });

            this.queue.requeue(retryJob);
            this.queue.recordExecution(execution);
            await log({
              level: "warn",
              occurredAt: handledAt,
              message: "Worker job failed and was scheduled for retry.",
              jobId: job.jobId,
              jobType: job.jobType,
              workspaceId: job.workspaceId,
              attempt: job.attempt + 1,
              error: result.error ?? null,
              metadata: {
                maxAttempts: job.retryPolicy.maxAttempts,
                nextRunAt,
              },
            });
            results.push({
              job,
              result,
              execution,
              retryJob,
            });
            continue;
          }

          const deadLetter = this.queue.addDeadLetter({
            deadLetterId: randomUUID(),
            job: {
              ...job,
              lastAttemptedAt: handledAt,
              lastError: createJobErrorSnapshot(result, handledAt),
            },
            deadLetteredAt: handledAt,
            reason:
              result.error?.retryable === false
                ? WORKER_DEAD_LETTER_REASONS.NON_RETRYABLE_FAILURE
                : WORKER_DEAD_LETTER_REASONS.MAX_ATTEMPTS_EXCEEDED,
            finalResult: result,
            executionHistory: [
              ...this.queue
                .getExecutionHistory()
                .filter((record) => record.jobId === job.jobId),
            ],
            replayedJobIds: [],
          });
          const execution = createExecutionRecord({
            job,
            result,
            startedAt,
            status: WORKER_EXECUTION_STATUSES.DEAD_LETTERED,
          });

          deadLetter.executionHistory.push(execution);
          this.queue.recordExecution(execution);
          await log({
            level: "error",
            occurredAt: handledAt,
            message: "Worker job moved to dead letter state.",
            jobId: job.jobId,
            jobType: job.jobType,
            workspaceId: job.workspaceId,
            attempt: job.attempt + 1,
            error: result.error ?? null,
            metadata: {
              deadLetterId: deadLetter.deadLetterId,
              reason: deadLetter.reason,
              maxAttempts: job.retryPolicy.maxAttempts,
            },
          });
          results.push({
            job,
            result,
            execution,
            deadLetter,
          });
          continue;
        }

        const execution = createExecutionRecord({
          job,
          result,
          startedAt,
          status:
            result.status === WORKER_JOB_STATUSES.SKIPPED
              ? WORKER_EXECUTION_STATUSES.SKIPPED
              : WORKER_EXECUTION_STATUSES.COMPLETED,
        });

        this.queue.recordExecution(execution);
        results.push({
          job,
          result,
          execution,
        });
      } finally {
        this.queue.clearInFlight(job.jobId);
      }
    }

    return results;
  }

  getQueueDepthSnapshot() {
    return this.queue.getQueueDepthSnapshot();
  }

  replayDeadLetter(input: {
    deadLetterId: string;
    retryPolicy?: WorkerRetryPolicyInput | null;
  }) {
    return this.queue.replayDeadLetter(input);
  }
}

function createExecutionRecord(input: {
  job: WorkerJob;
  result: WorkerJobResult;
  startedAt: string;
  status: WorkerExecutionStatus;
  nextRunAt?: string | null;
}) {
  return {
    executionId: randomUUID(),
    jobId: input.job.jobId,
    jobType: input.job.jobType,
    workspaceId: input.job.workspaceId,
    attempt: input.job.attempt + 1,
    maxAttempts: input.job.retryPolicy.maxAttempts,
    startedAt: input.startedAt,
    handledAt: input.result.handledAt,
    status: input.status,
    handlerStatus: input.result.status,
    output: input.result.output ?? null,
    error: input.result.error ?? null,
    nextRunAt: input.nextRunAt ?? null,
    replayOfJobId: input.job.replayOfJobId ?? null,
  } satisfies WorkerExecutionRecord;
}

function createJobErrorSnapshot(
  result: WorkerJobResult,
  failedAt: string,
): WorkerJobErrorSnapshot | null {
  if (!result.error) {
    return null;
  }

  return {
    ...result.error,
    failedAt,
  };
}
