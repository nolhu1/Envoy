import {
  Prisma,
  RuntimeJobAttemptStatus as PrismaRuntimeJobAttemptStatus,
  RuntimeJobStatus as PrismaRuntimeJobStatus,
  type DeadLetterRecord,
  type RuntimeJob,
  type RuntimeJobAttempt,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { getPrisma } from "./client";

type JsonPrimitive = boolean | number | string | null;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const RUNTIME_JOB_STATUS_FALLBACK = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD_LETTERED: "DEAD_LETTERED",
  CANCELLED: "CANCELLED",
} as const;

const RUNTIME_JOB_ATTEMPT_STATUS_FALLBACK = {
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const;

export const RuntimeJobStatus = (PrismaRuntimeJobStatus ??
  RUNTIME_JOB_STATUS_FALLBACK) as typeof RUNTIME_JOB_STATUS_FALLBACK;

export const RuntimeJobAttemptStatus = (PrismaRuntimeJobAttemptStatus ??
  RUNTIME_JOB_ATTEMPT_STATUS_FALLBACK) as typeof RUNTIME_JOB_ATTEMPT_STATUS_FALLBACK;

type RuntimeJobStatusValue =
  (typeof RuntimeJobStatus)[keyof typeof RuntimeJobStatus];
type RuntimeJobAttemptStatusValue =
  (typeof RuntimeJobAttemptStatus)[keyof typeof RuntimeJobAttemptStatus];

export type CreateRuntimeJobInput = {
  workspaceId: string;
  queueName: string;
  jobType: string;
  payloadJson: unknown;
  dedupeKey?: string | null;
  maxAttempts: number;
  runAt?: Date | null;
  replayOfJobId?: string | null;
  sourceEventId?: string | null;
  idempotencyRecordId?: string | null;
};

export type CreateRuntimeJobResult = {
  job: RuntimeJob;
  created: boolean;
};

export type CreateRuntimeJobAttemptInput = {
  runtimeJobId: string;
  attempt: number;
  workerId?: string | null;
  startedAt?: Date;
};

export type FinishRuntimeJobAttemptInput = {
  runtimeJobAttemptId: string;
  status: RuntimeJobAttemptStatusValue;
  resultJson?: unknown;
  error?: unknown;
  finishedAt?: Date;
};

export type CreateDeadLetterRecordInput = {
  workspaceId: string;
  kind: string;
  reason: string;
  payloadJson: unknown;
  sourceEventId?: string | null;
  runtimeJobId?: string | null;
  queueName?: string | null;
  error?: unknown;
};

export type RuntimeJobHealthSummary = {
  countsByStatus: Record<RuntimeJobStatusValue, number>;
  countsByQueue: Array<{
    queueName: string;
    status: RuntimeJobStatusValue;
    count: number;
  }>;
  oldestQueuedJobAgeMs: number | null;
  stuckJobCount: number;
  deadLetterCount: number;
  recentFailureCount: number;
};

function createEmptyRuntimeJobStatusCounts() {
  return Object.fromEntries(
    Object.values(RuntimeJobStatus).map((status) => [status, 0]),
  ) as Record<RuntimeJobStatusValue, number>;
}

function createEmptyRuntimeJobHealthSummary(): RuntimeJobHealthSummary {
  return {
    countsByStatus: createEmptyRuntimeJobStatusCounts(),
    countsByQueue: [],
    oldestQueuedJobAgeMs: null,
    stuckJobCount: 0,
    deadLetterCount: 0,
    recentFailureCount: 0,
  };
}

function hasRuntimeHealthDelegates(prisma: ReturnType<typeof getPrisma>) {
  const runtimeJob = prisma.runtimeJob as
    | {
        groupBy?: unknown;
        findFirst?: unknown;
        count?: unknown;
      }
    | undefined;
  const deadLetterRecord = prisma.deadLetterRecord as
    | {
        count?: unknown;
      }
    | undefined;

  return (
    typeof runtimeJob?.groupBy === "function" &&
    typeof runtimeJob.findFirst === "function" &&
    typeof runtimeJob.count === "function" &&
    typeof deadLetterRecord?.count === "function"
  );
}

function hasRuntimeJobWriteDelegate(prisma: ReturnType<typeof getPrisma>) {
  const runtimeJob = prisma.runtimeJob as
    | {
        findUnique?: unknown;
        create?: unknown;
        update?: unknown;
      }
    | undefined;

  return (
    typeof runtimeJob?.findUnique === "function" &&
    typeof runtimeJob.create === "function" &&
    typeof runtimeJob.update === "function"
  );
}

function toJsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toPrismaJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toSafeErrorJson(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 1000),
      stack: error.stack?.slice(0, 4000) ?? null,
    };
  }

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const message =
      typeof errorRecord.message === "string" && errorRecord.message.trim()
        ? errorRecord.message.slice(0, 1000)
        : "Unknown object error.";

    return {
      message,
      details: toPrismaJsonValue(error) as JsonValue,
    };
  }

  return {
    message: String(error).slice(0, 1000),
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createRuntimeJob(
  input: CreateRuntimeJobInput,
): Promise<CreateRuntimeJobResult> {
  const prisma = getPrisma();
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts));

  if (!hasRuntimeJobWriteDelegate(prisma)) {
    return createRuntimeJobWithSqlFallback(input, maxAttempts);
  }

  if (input.dedupeKey) {
    const existing = await prisma.runtimeJob.findUnique({
      where: {
        queueName_dedupeKey: {
          queueName: input.queueName,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    if (existing) {
      if (existing.workspaceId !== input.workspaceId) {
        throw new Error(
          `Runtime job dedupe key collision across workspaces for ${input.queueName}:${input.dedupeKey}.`,
        );
      }

      return {
        job: existing,
        created: false,
      };
    }

    try {
      const job = await prisma.runtimeJob.create({
        data: {
          workspaceId: input.workspaceId,
          queueName: input.queueName,
          jobType: input.jobType,
          dedupeKey: input.dedupeKey,
          status: RuntimeJobStatus.QUEUED,
          payloadJson: toPrismaJsonValue(input.payloadJson)!,
          maxAttempts,
          runAt: input.runAt ?? null,
          replayOfJobId: input.replayOfJobId ?? null,
          sourceEventId: input.sourceEventId ?? null,
          idempotencyRecordId: input.idempotencyRecordId ?? null,
        },
      });

      return {
        job,
        created: true,
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await prisma.runtimeJob.findUnique({
        where: {
          queueName_dedupeKey: {
            queueName: input.queueName,
            dedupeKey: input.dedupeKey,
          },
        },
      });

      if (!existing) {
        throw error;
      }

      if (existing.workspaceId !== input.workspaceId) {
        throw new Error(
          `Runtime job dedupe key collision across workspaces for ${input.queueName}:${input.dedupeKey}.`,
        );
      }

      return {
        job: existing,
        created: false,
      };
    }
  }

  const job = await prisma.runtimeJob.create({
    data: {
      workspaceId: input.workspaceId,
      queueName: input.queueName,
      jobType: input.jobType,
      dedupeKey: null,
      status: RuntimeJobStatus.QUEUED,
      payloadJson: toPrismaJsonValue(input.payloadJson)!,
      maxAttempts,
      runAt: input.runAt ?? null,
      replayOfJobId: input.replayOfJobId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      idempotencyRecordId: input.idempotencyRecordId ?? null,
    },
  });

  return {
    job,
    created: true,
  };
}

async function createRuntimeJobWithSqlFallback(
  input: CreateRuntimeJobInput,
  maxAttempts: number,
): Promise<CreateRuntimeJobResult> {
  const prisma = getPrisma();
  const payloadJson = toJsonString(toPrismaJsonValue(input.payloadJson));

  if (input.dedupeKey) {
    const existing = await prisma.$queryRaw<RuntimeJob[]>`
      SELECT *
      FROM "RuntimeJob"
      WHERE "queueName" = ${input.queueName}
        AND "dedupeKey" = ${input.dedupeKey}
      LIMIT 1
    `;

    if (existing[0]) {
      if (existing[0].workspaceId !== input.workspaceId) {
        throw new Error(
          `Runtime job dedupe key collision across workspaces for ${input.queueName}:${input.dedupeKey}.`,
        );
      }

      return {
        job: existing[0],
        created: false,
      };
    }
  }

  const id = randomUUID();
  const created = await prisma.$queryRaw<RuntimeJob[]>`
    INSERT INTO "RuntimeJob" (
      "id",
      "workspaceId",
      "queueName",
      "jobType",
      "dedupeKey",
      "status",
      "payloadJson",
      "maxAttempts",
      "runAt",
      "replayOfJobId",
      "sourceEventId",
      "idempotencyRecordId"
    )
    VALUES (
      ${id},
      ${input.workspaceId},
      ${input.queueName},
      ${input.jobType},
      ${input.dedupeKey ?? null},
      ${RuntimeJobStatus.QUEUED}::"RuntimeJobStatus",
      ${payloadJson}::jsonb,
      ${maxAttempts},
      ${input.runAt ?? null},
      ${input.replayOfJobId ?? null},
      ${input.sourceEventId ?? null},
      ${input.idempotencyRecordId ?? null}
    )
    ON CONFLICT ("queueName", "dedupeKey") DO NOTHING
    RETURNING *
  `;

  if (created[0]) {
    return {
      job: created[0],
      created: true,
    };
  }

  if (!input.dedupeKey) {
    throw new Error("Runtime job could not be created.");
  }

  const existing = await prisma.$queryRaw<RuntimeJob[]>`
    SELECT *
    FROM "RuntimeJob"
    WHERE "queueName" = ${input.queueName}
      AND "dedupeKey" = ${input.dedupeKey}
    LIMIT 1
  `;

  if (!existing[0]) {
    throw new Error("Runtime job could not be loaded after dedupe conflict.");
  }

  if (existing[0].workspaceId !== input.workspaceId) {
    throw new Error(
      `Runtime job dedupe key collision across workspaces for ${input.queueName}:${input.dedupeKey}.`,
    );
  }

  return {
    job: existing[0],
    created: false,
  };
}

export async function setRuntimeJobBullJobId(input: {
  runtimeJobId: string;
  bullJobId: string;
}) {
  const prisma = getPrisma();

  if (!hasRuntimeJobWriteDelegate(prisma)) {
    const updated = await prisma.$queryRaw<RuntimeJob[]>`
      UPDATE "RuntimeJob"
      SET "bullJobId" = ${input.bullJobId}
      WHERE "id" = ${input.runtimeJobId}
      RETURNING *
    `;

    if (!updated[0]) {
      throw new Error("Runtime job could not be updated with BullMQ job id.");
    }

    return updated[0];
  }

  return prisma.runtimeJob.update({
    where: {
      id: input.runtimeJobId,
    },
    data: {
      bullJobId: input.bullJobId,
    },
  });
}

export async function getRuntimeJobById(runtimeJobId: string) {
  const prisma = getPrisma();

  if (!hasRuntimeJobWriteDelegate(prisma)) {
    const rows = await prisma.$queryRaw<RuntimeJob[]>`
      SELECT *
      FROM "RuntimeJob"
      WHERE "id" = ${runtimeJobId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  return prisma.runtimeJob.findUnique({
    where: {
      id: runtimeJobId,
    },
  });
}

export async function markRuntimeJobRunning(input: {
  runtimeJobId: string;
  attemptsMade: number;
  startedAt?: Date;
}) {
  const prisma = getPrisma();

  return prisma.runtimeJob.update({
    where: {
      id: input.runtimeJobId,
    },
    data: {
      status: RuntimeJobStatus.RUNNING,
      attemptsMade: Math.max(0, Math.trunc(input.attemptsMade)),
      startedAt: input.startedAt ?? new Date(),
      failedAt: null,
      lastErrorJson: Prisma.JsonNull,
    },
  });
}

export async function markRuntimeJobCompleted(input: {
  runtimeJobId: string;
  resultJson?: unknown;
  completedAt?: Date;
}) {
  const prisma = getPrisma();

  return prisma.runtimeJob.update({
    where: {
      id: input.runtimeJobId,
    },
    data: {
      status: RuntimeJobStatus.COMPLETED,
      completedAt: input.completedAt ?? new Date(),
      failedAt: null,
      deadLetteredAt: null,
      lastErrorJson: Prisma.JsonNull,
      resultJson:
        input.resultJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultJson),
    },
  });
}

export async function markRuntimeJobFailed(input: {
  runtimeJobId: string;
  attemptsMade: number;
  error: unknown;
  failedAt?: Date;
}) {
  const prisma = getPrisma();

  return prisma.runtimeJob.update({
    where: {
      id: input.runtimeJobId,
    },
    data: {
      status: RuntimeJobStatus.FAILED,
      attemptsMade: Math.max(0, Math.trunc(input.attemptsMade)),
      failedAt: input.failedAt ?? new Date(),
      lastErrorJson: toPrismaJsonValue(toSafeErrorJson(input.error)),
    },
  });
}

export async function markRuntimeJobDeadLettered(input: {
  runtimeJobId: string;
  attemptsMade: number;
  error: unknown;
  deadLetteredAt?: Date;
}) {
  const prisma = getPrisma();

  return prisma.runtimeJob.update({
    where: {
      id: input.runtimeJobId,
    },
    data: {
      status: RuntimeJobStatus.DEAD_LETTERED,
      attemptsMade: Math.max(0, Math.trunc(input.attemptsMade)),
      deadLetteredAt: input.deadLetteredAt ?? new Date(),
      lastErrorJson: toPrismaJsonValue(toSafeErrorJson(input.error)),
    },
  });
}

export async function findStuckRunningRuntimeJobs(input: {
  olderThan: Date;
  limit?: number;
}) {
  const prisma = getPrisma();

  return prisma.runtimeJob.findMany({
    where: {
      status: RuntimeJobStatus.RUNNING,
      startedAt: {
        lt: input.olderThan,
      },
    },
    orderBy: [{ startedAt: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 100, 1000)),
  });
}

export async function requeueRuntimeJob(runtimeJobId: string) {
  const prisma = getPrisma();

  return prisma.runtimeJob.update({
    where: {
      id: runtimeJobId,
    },
    data: {
      status: RuntimeJobStatus.QUEUED,
      runAt: null,
      failedAt: null,
      deadLetteredAt: null,
      lastErrorJson: Prisma.JsonNull,
    },
  });
}

export async function deadLetterRuntimeJob(input: {
  runtimeJobId: string;
  reason: string;
  error?: unknown;
}) {
  const prisma = getPrisma();
  const runtimeJob = await prisma.runtimeJob.findUnique({
    where: {
      id: input.runtimeJobId,
    },
  });

  if (!runtimeJob) {
    throw new Error("Runtime job could not be loaded for dead-lettering.");
  }

  const errorJson = input.error ?? {
    message: input.reason,
  };

  const [updated] = await prisma.$transaction([
    prisma.runtimeJob.update({
      where: {
        id: runtimeJob.id,
      },
      data: {
        status: RuntimeJobStatus.DEAD_LETTERED,
        deadLetteredAt: new Date(),
        failedAt: runtimeJob.failedAt ?? new Date(),
        lastErrorJson: toPrismaJsonValue(toSafeErrorJson(errorJson)),
      },
    }),
    prisma.deadLetterRecord.create({
      data: {
        workspaceId: runtimeJob.workspaceId,
        kind: "job",
        sourceEventId: runtimeJob.sourceEventId,
        runtimeJobId: runtimeJob.id,
        queueName: runtimeJob.queueName,
        reason: input.reason,
        payloadJson: toPrismaJsonValue(runtimeJob.payloadJson)!,
        errorJson: toPrismaJsonValue(toSafeErrorJson(errorJson)),
      },
    }),
  ]);

  return updated;
}

export async function requestRuntimeJobReplay(runtimeJobId: string) {
  const prisma = getPrisma();

  const runtimeJob = await prisma.runtimeJob.findUnique({
    where: {
      id: runtimeJobId,
    },
  });

  if (!runtimeJob) {
    throw new Error("Runtime job could not be loaded for replay request.");
  }

  return prisma.deadLetterRecord.create({
    data: {
      workspaceId: runtimeJob.workspaceId,
      kind: "job_replay_request",
      sourceEventId: runtimeJob.sourceEventId,
      runtimeJobId: runtimeJob.id,
      queueName: runtimeJob.queueName,
      reason: "operator_replay_requested",
      payloadJson: toPrismaJsonValue(runtimeJob.payloadJson)!,
      replayRequestedAt: new Date(),
      resolutionJson: toPrismaJsonValue({
        requestedRuntimeJobId: runtimeJob.id,
        conservativeReplay: true,
      }),
    },
  });
}

export async function createRuntimeJobAttempt(
  input: CreateRuntimeJobAttemptInput,
): Promise<RuntimeJobAttempt> {
  const prisma = getPrisma();
  const runtimeJob = await prisma.runtimeJob.findUnique({
    where: {
      id: input.runtimeJobId,
    },
    select: {
      id: true,
      workspaceId: true,
      queueName: true,
      jobType: true,
    },
  });

  if (!runtimeJob) {
    throw new Error("Runtime job could not be loaded for attempt.");
  }

  return prisma.runtimeJobAttempt.upsert({
    where: {
      runtimeJobId_attempt: {
        runtimeJobId: runtimeJob.id,
        attempt: input.attempt,
      },
    },
    create: {
      workspaceId: runtimeJob.workspaceId,
      runtimeJobId: runtimeJob.id,
      queueName: runtimeJob.queueName,
      jobType: runtimeJob.jobType,
      attempt: input.attempt,
      workerId: input.workerId ?? null,
      startedAt: input.startedAt ?? new Date(),
      status: RuntimeJobAttemptStatus.RUNNING,
    },
    update: {
      workerId: input.workerId ?? null,
      startedAt: input.startedAt ?? new Date(),
      finishedAt: null,
      status: RuntimeJobAttemptStatus.RUNNING,
      errorJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
    },
  });
}

export async function finishRuntimeJobAttempt(
  input: FinishRuntimeJobAttemptInput,
) {
  const prisma = getPrisma();

  return prisma.runtimeJobAttempt.update({
    where: {
      id: input.runtimeJobAttemptId,
    },
    data: {
      status: input.status,
      finishedAt: input.finishedAt ?? new Date(),
      resultJson:
        input.resultJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultJson),
      errorJson:
        input.error === undefined
          ? undefined
          : toPrismaJsonValue(toSafeErrorJson(input.error)),
    },
  });
}

export async function createDeadLetterRecord(
  input: CreateDeadLetterRecordInput,
): Promise<DeadLetterRecord> {
  const prisma = getPrisma();

  return prisma.deadLetterRecord.create({
    data: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      sourceEventId: input.sourceEventId ?? null,
      runtimeJobId: input.runtimeJobId ?? null,
      queueName: input.queueName ?? null,
      reason: input.reason,
      payloadJson: toPrismaJsonValue(input.payloadJson)!,
      errorJson:
        input.error === undefined
          ? undefined
          : toPrismaJsonValue(toSafeErrorJson(input.error)),
    },
  });
}

export async function getRuntimeWorkerHealthCounts() {
  const prisma = getPrisma();

  if (!hasRuntimeHealthDelegates(prisma)) {
    return {
      deadLetterCount: 0,
      runningJobCount: 0,
    };
  }

  const [deadLetterCount, runningJobCount] = await Promise.all([
    prisma.deadLetterRecord.count({
      where: {
        resolvedAt: null,
      },
    }),
    prisma.runtimeJob.count({
      where: {
        status: RuntimeJobStatus.RUNNING,
      },
    }),
  ]);

  return {
    deadLetterCount,
    runningJobCount,
  };
}

export async function getRuntimeJobHealthSummary(input: {
  staleRunningOlderThan?: Date;
  recentFailureSince?: Date;
} = {}): Promise<RuntimeJobHealthSummary> {
  const prisma = getPrisma();

  if (!hasRuntimeHealthDelegates(prisma)) {
    return createEmptyRuntimeJobHealthSummary();
  }

  const now = new Date();
  const staleRunningOlderThan =
    input.staleRunningOlderThan ?? new Date(now.getTime() - 15 * 60_000);
  const recentFailureSince =
    input.recentFailureSince ?? new Date(now.getTime() - 24 * 60 * 60_000);

  const [
    countsByStatusRaw,
    countsByQueueRaw,
    oldestQueuedJob,
    stuckJobCount,
    deadLetterCount,
    recentFailureCount,
  ] = await Promise.all([
    prisma.runtimeJob.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.runtimeJob.groupBy({
      by: ["queueName", "status"],
      _count: {
        _all: true,
      },
    }),
    prisma.runtimeJob.findFirst({
      where: {
        status: RuntimeJobStatus.QUEUED,
      },
      orderBy: [{ queuedAt: "asc" }],
      select: {
        queuedAt: true,
      },
    }),
    prisma.runtimeJob.count({
      where: {
        status: RuntimeJobStatus.RUNNING,
        startedAt: {
          lt: staleRunningOlderThan,
        },
      },
    }),
    prisma.deadLetterRecord.count({
      where: {
        resolvedAt: null,
      },
    }),
    prisma.runtimeJob.count({
      where: {
        status: {
          in: [RuntimeJobStatus.FAILED, RuntimeJobStatus.DEAD_LETTERED],
        },
        OR: [
          {
            failedAt: {
              gte: recentFailureSince,
            },
          },
          {
            deadLetteredAt: {
              gte: recentFailureSince,
            },
          },
        ],
      },
    }),
  ]);

  const countsByStatus = createEmptyRuntimeJobStatusCounts();

  for (const row of countsByStatusRaw) {
    countsByStatus[row.status] = row._count._all;
  }

  return {
    countsByStatus,
    countsByQueue: countsByQueueRaw.map((row) => ({
      queueName: row.queueName,
      status: row.status,
      count: row._count._all,
    })),
    oldestQueuedJobAgeMs: oldestQueuedJob
      ? Math.max(0, now.getTime() - oldestQueuedJob.queuedAt.getTime())
      : null,
    stuckJobCount,
    deadLetterCount,
    recentFailureCount,
  };
}

export type { RuntimeJob, RuntimeJobAttempt, DeadLetterRecord };
