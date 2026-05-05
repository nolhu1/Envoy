import {
  Queue,
  Worker,
  type BackoffOptions,
  type ConnectionOptions,
  type Job,
} from "bullmq";
import IORedis from "ioredis";

import {
  createDeadLetterRecord,
  createRuntimeJob,
  createRuntimeJobAttempt,
  deadLetterRuntimeJob,
  findStuckRunningRuntimeJobs,
  finishRuntimeJobAttempt,
  getRuntimeJobHealthSummary,
  getRuntimeJobById,
  markRuntimeJobCompleted,
  markRuntimeJobDeadLettered,
  markRuntimeJobFailed,
  markRuntimeJobRunning,
  requeueRuntimeJob as markRuntimeJobRequeued,
  RuntimeJobAttemptStatus,
  RuntimeJobStatus,
  setRuntimeJobBullJobId,
} from "../../../packages/db/src/index";
import type { WorkerJob, WorkerJobPayloadByType, WorkerJobType } from "./jobs";
import {
  WorkerJobRegistry,
  WORKER_JOB_STATUSES,
  type WorkerJobLogEntry,
  type WorkerJobLogger,
} from "./registry";
import {
  WORKER_BACKOFF_STRATEGIES,
  resolveWorkerRetryPolicy,
  type WorkerRetryPolicyInput,
} from "./retry";

export const WORKER_QUEUE_NAMES = {
  EVENTS: "events",
  SYNC: "sync",
  OUTBOUND_SEND: "outbound-send",
  AGENT: "agent",
  MAINTENANCE: "maintenance",
} as const;

export type WorkerQueueName =
  (typeof WORKER_QUEUE_NAMES)[keyof typeof WORKER_QUEUE_NAMES];

export const REGISTERED_WORKER_QUEUE_NAMES = Object.values(WORKER_QUEUE_NAMES);

export const DEFAULT_REDIS_URL = "redis://localhost:6379";

type RuntimeJobData = {
  runtimeJobId: string;
};

export type EnqueueRuntimeJobInput<TType extends WorkerJobType = WorkerJobType> = {
  queueName: WorkerQueueName;
  jobType: TType;
  workspaceId: string;
  payload: WorkerJobPayloadByType[TType];
  dedupeKey?: string | null;
  sourceEventId?: string | null;
  runAt?: Date | null;
  replayOfJobId?: string | null;
  idempotencyRecordId?: string | null;
  retryPolicy?: WorkerRetryPolicyInput | null;
};

export type EnqueueRuntimeJobResult = {
  runtimeJobId: string;
  bullJobId: string | null;
  created: boolean;
  queued: boolean;
};

export type WorkerRuntimeHealth = {
  workerId: string;
  redisConnected: boolean;
  queuesRegistered: WorkerQueueName[];
  processedCount: number;
  failedCount: number;
  queuedJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  deadLetterCount: number;
  runningJobCount: number;
  oldestQueuedJobAgeMs: number | null;
  stuckJobCount: number;
  recentFailureCount: number;
};

export type RecoverStuckRuntimeJobsResult = {
  scanned: number;
  leftActive: number;
  requeued: number;
  markedFailed: number;
  deadLettered: number;
  skipped: number;
  actions: Array<{
    runtimeJobId: string;
    queueName: string;
    jobType: string;
    action: "left_active" | "requeued" | "failed" | "dead_lettered" | "skipped";
    reason: string;
  }>;
};

export type BullMqRuntimeOptions = {
  redisUrl?: string;
  workerId?: string;
  logger?: WorkerJobLogger;
};

export class BullMqWorkerRuntime {
  private readonly connection: IORedis;
  private readonly connectionOptions: ConnectionOptions;
  private readonly queues = new Map<WorkerQueueName, Queue>();
  private readonly workers: Worker<RuntimeJobData>[] = [];
  private processedCount = 0;
  private failedCount = 0;

  readonly workerId: string;

  constructor(
    private readonly registry: WorkerJobRegistry,
    private readonly options: BullMqRuntimeOptions = {},
  ) {
    this.workerId =
      options.workerId ??
      process.env.ENVOY_WORKER_ID ??
      `worker-${process.pid}`;
    const redisUrl =
      options.redisUrl ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.connectionOptions = parseRedisConnectionOptions(redisUrl);

    for (const queueName of REGISTERED_WORKER_QUEUE_NAMES) {
      this.queues.set(
        queueName,
        new Queue(queueName, {
          connection: this.connectionOptions,
        }),
      );
    }
  }

  getQueueNames() {
    return [...this.queues.keys()];
  }

  async enqueue<TType extends WorkerJobType>(
    input: EnqueueRuntimeJobInput<TType>,
  ): Promise<EnqueueRuntimeJobResult> {
    const retryPolicy = resolveWorkerRetryPolicy(input.retryPolicy);
    const { job, created } = await createRuntimeJob({
      workspaceId: input.workspaceId,
      queueName: input.queueName,
      jobType: input.jobType,
      payloadJson: input.payload,
      dedupeKey: input.dedupeKey ?? null,
      maxAttempts: retryPolicy.maxAttempts,
      runAt: input.runAt ?? null,
      replayOfJobId: input.replayOfJobId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      idempotencyRecordId: input.idempotencyRecordId ?? null,
    });

    if (!created && job.bullJobId) {
      return {
        runtimeJobId: job.id,
        bullJobId: job.bullJobId,
        created,
        queued: false,
      };
    }

    const queue = this.getQueue(input.queueName);
    const bullJob = await queue.add(
      input.jobType,
      {
        runtimeJobId: job.id,
      },
      {
        jobId: job.id,
        attempts: retryPolicy.maxAttempts,
        backoff: toBullMqBackoff(retryPolicy.backoff),
        delay: input.runAt
          ? Math.max(0, input.runAt.getTime() - Date.now())
          : undefined,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    await setRuntimeJobBullJobId({
      runtimeJobId: job.id,
      bullJobId: bullJob.id ?? job.id,
    });

    return {
      runtimeJobId: job.id,
      bullJobId: bullJob.id ?? job.id,
      created,
      queued: true,
    };
  }

  startWorkers() {
    if (this.workers.length > 0) {
      return this.workers;
    }

    for (const queueName of this.getQueueNames()) {
      const worker = new Worker<RuntimeJobData>(
        queueName,
        async (job) => this.processBullMqJob(queueName, job),
        {
          connection: this.connectionOptions,
        },
      );

      worker.on("completed", () => {
        this.processedCount += 1;
      });
      worker.on("failed", () => {
        this.failedCount += 1;
      });
      this.workers.push(worker);
    }

    return this.workers;
  }

  async close() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }

  async getHealth(): Promise<WorkerRuntimeHealth> {
    const [healthSummary, pingResult] = await Promise.all([
      getRuntimeJobHealthSummary(),
      this.connection.ping().catch(() => null),
    ]);

    return {
      workerId: this.workerId,
      redisConnected: pingResult === "PONG",
      queuesRegistered: this.getQueueNames(),
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      queuedJobCount: healthSummary.countsByStatus.QUEUED,
      runningJobCount: healthSummary.countsByStatus.RUNNING,
      completedJobCount: healthSummary.countsByStatus.COMPLETED,
      failedJobCount: healthSummary.countsByStatus.FAILED,
      deadLetterCount: healthSummary.deadLetterCount,
      oldestQueuedJobAgeMs: healthSummary.oldestQueuedJobAgeMs,
      stuckJobCount: healthSummary.stuckJobCount,
      recentFailureCount: healthSummary.recentFailureCount,
    };
  }

  async recoverStuckJobs(input: {
    staleAfterMs?: number | null;
    limit?: number | null;
  } = {}): Promise<RecoverStuckRuntimeJobsResult> {
    const staleAfterMs = Math.max(
      60_000,
      Math.trunc(input.staleAfterMs ?? 15 * 60_000),
    );
    const olderThan = new Date(Date.now() - staleAfterMs);
    const stuckJobs = await findStuckRunningRuntimeJobs({
      olderThan,
      limit: input.limit ?? 100,
    });
    const result: RecoverStuckRuntimeJobsResult = {
      scanned: stuckJobs.length,
      leftActive: 0,
      requeued: 0,
      markedFailed: 0,
      deadLettered: 0,
      skipped: 0,
      actions: [],
    };

    for (const runtimeJob of stuckJobs) {
      const queue = this.queues.get(runtimeJob.queueName as WorkerQueueName);

      if (!queue) {
        result.skipped += 1;
        result.actions.push({
          runtimeJobId: runtimeJob.id,
          queueName: runtimeJob.queueName,
          jobType: runtimeJob.jobType,
          action: "skipped",
          reason: "queue_not_registered",
        });
        continue;
      }

      const bullJobId = runtimeJob.bullJobId ?? runtimeJob.id;
      const bullJob = await queue.getJob(bullJobId);
      const bullState = bullJob ? await bullJob.getState() : "missing";

      if (bullState === "active") {
        result.leftActive += 1;
        result.actions.push({
          runtimeJobId: runtimeJob.id,
          queueName: runtimeJob.queueName,
          jobType: runtimeJob.jobType,
          action: "left_active",
          reason: "bull_job_still_active",
        });
        continue;
      }

      const attemptsMade = Math.max(runtimeJob.attemptsMade, 0);
      const attemptsExhausted = attemptsMade >= runtimeJob.maxAttempts;
      const isProviderSend = runtimeJob.queueName === WORKER_QUEUE_NAMES.OUTBOUND_SEND;
      const error = {
        message: `Runtime job was stuck RUNNING but BullMQ state is ${bullState}.`,
        bullState,
        staleAfterMs,
      };

      if (attemptsExhausted) {
        await deadLetterRuntimeJob({
          runtimeJobId: runtimeJob.id,
          reason: "stuck_running_attempts_exhausted",
          error,
        });
        result.deadLettered += 1;
        result.actions.push({
          runtimeJobId: runtimeJob.id,
          queueName: runtimeJob.queueName,
          jobType: runtimeJob.jobType,
          action: "dead_lettered",
          reason: "attempts_exhausted",
        });
        continue;
      }

      if (isProviderSend) {
        await markRuntimeJobFailed({
          runtimeJobId: runtimeJob.id,
          attemptsMade,
          error,
        });
        result.markedFailed += 1;
        result.actions.push({
          runtimeJobId: runtimeJob.id,
          queueName: runtimeJob.queueName,
          jobType: runtimeJob.jobType,
          action: "failed",
          reason: "provider_send_requires_explicit_replay",
        });
        continue;
      }

      await markRuntimeJobRequeued(runtimeJob.id);
      if (bullJob && bullState !== "missing") {
        await bullJob.remove().catch(() => undefined);
      }
      const requeuedBullJob = await queue.add(
        runtimeJob.jobType,
        {
          runtimeJobId: runtimeJob.id,
        },
        {
          jobId: runtimeJob.id,
          attempts: Math.max(1, runtimeJob.maxAttempts - attemptsMade),
          backoff: toBullMqBackoff({
            strategy: WORKER_BACKOFF_STRATEGIES.EXPONENTIAL,
            delayMs: 1_000,
          }),
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
      await setRuntimeJobBullJobId({
        runtimeJobId: runtimeJob.id,
        bullJobId: requeuedBullJob.id ?? runtimeJob.id,
      });
      result.requeued += 1;
      result.actions.push({
        runtimeJobId: runtimeJob.id,
        queueName: runtimeJob.queueName,
        jobType: runtimeJob.jobType,
        action: "requeued",
        reason: `bull_state_${bullState}`,
      });
    }

    return result;
  }

  private getQueue(queueName: WorkerQueueName) {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Worker queue ${queueName} is not registered.`);
    }

    return queue;
  }

  private async processBullMqJob(
    queueName: WorkerQueueName,
    bullJob: Job<RuntimeJobData>,
  ) {
    const runtimeJob = await getRuntimeJobById(bullJob.data.runtimeJobId);

    if (!runtimeJob) {
      throw new Error(
        `Runtime job ${bullJob.data.runtimeJobId} could not be loaded.`,
      );
    }

    const attemptNumber = bullJob.attemptsMade + 1;
    const startedAt = new Date();
    const runtimeAttempt = await createRuntimeJobAttempt({
      runtimeJobId: runtimeJob.id,
      attempt: attemptNumber,
      workerId: this.workerId,
      startedAt,
    });

    await markRuntimeJobRunning({
      runtimeJobId: runtimeJob.id,
      attemptsMade: attemptNumber,
      startedAt,
    });

    const jobEnvelope = {
      jobId: runtimeJob.id,
      jobType: runtimeJob.jobType as WorkerJobType,
      workspaceId: runtimeJob.workspaceId,
      payload: runtimeJob.payloadJson,
      queuedAt: runtimeJob.queuedAt.toISOString(),
      runAt: runtimeJob.runAt?.toISOString() ?? null,
      attempt: attemptNumber - 1,
      retryPolicy: {
        maxAttempts: runtimeJob.maxAttempts,
        backoff: {
          strategy: WORKER_BACKOFF_STRATEGIES.EXPONENTIAL,
          delayMs: 1_000,
          maxDelayMs: 30_000,
        },
      },
      replayOfJobId: runtimeJob.replayOfJobId,
    } as WorkerJob;

    const result = await this.registry.dispatch(jobEnvelope, {
      log: async (entry) => this.log(entry),
    });

    if (result.status === WORKER_JOB_STATUSES.FAILED) {
      const error = result.error ?? {
        message: "Worker job failed.",
        retryable: true,
      };
      const exhausted = attemptNumber >= runtimeJob.maxAttempts;

      await finishRuntimeJobAttempt({
        runtimeJobAttemptId: runtimeAttempt.id,
        status: RuntimeJobAttemptStatus.FAILED,
        error,
        resultJson: result.output ?? null,
      });

      if (exhausted) {
        await markRuntimeJobDeadLettered({
          runtimeJobId: runtimeJob.id,
          attemptsMade: attemptNumber,
          error,
        });
        await createDeadLetterRecord({
          workspaceId: runtimeJob.workspaceId,
          kind: "job",
          runtimeJobId: runtimeJob.id,
          sourceEventId: runtimeJob.sourceEventId,
          queueName,
          reason: error.retryable === false
            ? "non_retryable_failure"
            : "max_attempts_exceeded",
          payloadJson: runtimeJob.payloadJson,
          error,
        });
      } else {
        await markRuntimeJobFailed({
          runtimeJobId: runtimeJob.id,
          attemptsMade: attemptNumber,
          error,
        });
      }

      throw new Error(error.message);
    }

    await finishRuntimeJobAttempt({
      runtimeJobAttemptId: runtimeAttempt.id,
      status: RuntimeJobAttemptStatus.SUCCEEDED,
      resultJson: result.output ?? {
        status: result.status,
        handledAt: result.handledAt,
      },
    });
    await markRuntimeJobCompleted({
      runtimeJobId: runtimeJob.id,
      resultJson: {
        status: result.status,
        handledAt: result.handledAt,
        output: result.output ?? null,
      },
    });

    return result;
  }

  private async log(entry: WorkerJobLogEntry) {
    await this.options.logger?.(entry);
  }
}

export function createBullMqWorkerRuntime(
  registry: WorkerJobRegistry,
  options: BullMqRuntimeOptions = {},
) {
  return new BullMqWorkerRuntime(registry, options);
}

export async function enqueueRuntimeJob<TType extends WorkerJobType>(
  input: EnqueueRuntimeJobInput<TType>,
  options: BullMqRuntimeOptions = {},
) {
  const runtime = createBullMqWorkerRuntime(new WorkerJobRegistry(), options);

  try {
    return await runtime.enqueue(input);
  } finally {
    await runtime.close();
  }
}

function toBullMqBackoff(input: {
  strategy: "fixed" | "exponential";
  delayMs: number;
}): BackoffOptions {
  return {
    type: input.strategy === WORKER_BACKOFF_STRATEGIES.FIXED ? "fixed" : "exponential",
    delay: input.delayMs,
  };
}

function parseRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname || "localhost",
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  } as ConnectionOptions;
}
