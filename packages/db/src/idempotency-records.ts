import {
  IdempotencyRecordStatus as PrismaIdempotencyRecordStatus,
  Prisma,
  type IdempotencyRecord,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { getPrisma } from "./client";

type JsonPrimitive = boolean | number | string | null;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

type IdempotencyScope = "inbound" | "outbound" | "approval" | "agent";
type ConnectorIdempotencyStatus =
  | "in_progress"
  | "completed"
  | "failed"
  | "duplicate";

type ConnectorIdempotencyDecisionType =
  | "new_operation"
  | "already_processed"
  | "in_progress"
  | "failed_prior_attempt"
  | "ambiguous_retry_safe";

const IDEMPOTENCY_RECORD_STATUS_FALLBACK = {
  STARTED: "STARTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DUPLICATE: "DUPLICATE",
} as const;

export const IdempotencyRecordStatus = (PrismaIdempotencyRecordStatus ??
  IDEMPOTENCY_RECORD_STATUS_FALLBACK) as typeof IDEMPOTENCY_RECORD_STATUS_FALLBACK;

type IdempotencyRecordStatusValue =
  (typeof IdempotencyRecordStatus)[keyof typeof IdempotencyRecordStatus];

export type PrismaIdempotencyKey = {
  key: string;
  scope: IdempotencyScope;
  workspaceId: string;
  integrationId?: string | null;
  operationType: string;
  externalEventId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestHash?: string | null;
};

export type PrismaIdempotencyRecordSummary = {
  id?: string;
  scope: IdempotencyScope;
  key: string;
  status: ConnectorIdempotencyStatus;
  workspaceId: string;
  integrationId?: string | null;
  operationType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  externalEventId?: string | null;
  requestHash?: string | null;
  resultSummaryJson?: JsonValue | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  expiresAt?: Date | null;
};

export type PrismaIdempotencyDecision = {
  decision: ConnectorIdempotencyDecisionType;
  retrySafe: boolean;
  key: PrismaIdempotencyKey;
  existingRecord?: PrismaIdempotencyRecordSummary | null;
  resultSummaryJson?: JsonValue | null;
  diagnostics?: JsonValue | null;
};

export type BeginIdempotencyOperationInput = {
  key: PrismaIdempotencyKey;
  expiresAt?: Date | null;
  lockOwner?: string | null;
  lockedAt?: Date | null;
};

export type CompleteIdempotencyOperationInput = {
  key: PrismaIdempotencyKey;
  resultSummaryJson?: JsonValue | null;
  completedAt?: Date;
};

export type FailIdempotencyOperationInput = {
  key: PrismaIdempotencyKey;
  error?: unknown;
  resultSummaryJson?: JsonValue | null;
  failedAt?: Date;
};

export type MarkDuplicateIdempotencyOperationInput = {
  key: PrismaIdempotencyKey;
  resultSummaryJson?: JsonValue | null;
  completedAt?: Date;
};

export type CreatePrismaIdempotencyServiceOptions = {
  lockOwner?: string | null;
  retryFailedOperations?: boolean;
};

function toPrismaJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toJsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function hasIdempotencyRecordDelegate(prisma: ReturnType<typeof getPrisma>) {
  const idempotencyRecord = prisma.idempotencyRecord as
    | {
        findUnique?: unknown;
        create?: unknown;
        update?: unknown;
      }
    | undefined;

  return (
    typeof idempotencyRecord?.findUnique === "function" &&
    typeof idempotencyRecord.create === "function" &&
    typeof idempotencyRecord.update === "function"
  );
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
    return {
      message: "Unknown object error.",
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

function assertSameWorkspace(
  record: Pick<IdempotencyRecord, "workspaceId" | "scope" | "key">,
  key: PrismaIdempotencyKey,
) {
  if (record.workspaceId !== key.workspaceId) {
    throw new Error(
      `Idempotency key collision across workspaces for ${record.scope}:${record.key}.`,
    );
  }
}

function toConnectorStatus(
  status: IdempotencyRecordStatusValue,
): ConnectorIdempotencyStatus {
  if (status === IdempotencyRecordStatus.STARTED) {
    return "in_progress";
  }

  if (status === IdempotencyRecordStatus.COMPLETED) {
    return "completed";
  }

  if (status === IdempotencyRecordStatus.FAILED) {
    return "failed";
  }

  return "duplicate";
}

function toRecordSummary(
  record: IdempotencyRecord,
  statusOverride?: ConnectorIdempotencyStatus,
): PrismaIdempotencyRecordSummary {
  return {
    id: record.id,
    scope: record.scope as IdempotencyScope,
    key: record.key,
    status: statusOverride ?? toConnectorStatus(record.status),
    workspaceId: record.workspaceId,
    integrationId: record.integrationId,
    operationType: record.operationType,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    externalEventId: record.externalEventId,
    requestHash: record.requestHash,
    resultSummaryJson: record.resultSummaryJson as JsonValue | null,
    startedAt: record.startedAt,
    completedAt: record.completedAt ?? record.failedAt,
    expiresAt: record.expiresAt,
  };
}

function decisionForRecord(
  key: PrismaIdempotencyKey,
  record: IdempotencyRecord,
  options: CreatePrismaIdempotencyServiceOptions,
): PrismaIdempotencyDecision {
  assertSameWorkspace(record, key);

  const existingRecord = toRecordSummary(record);

  if (record.status === IdempotencyRecordStatus.COMPLETED) {
    return {
      decision: "already_processed",
      retrySafe: true,
      key,
      existingRecord,
      resultSummaryJson: existingRecord.resultSummaryJson,
    };
  }

  if (record.status === IdempotencyRecordStatus.STARTED) {
    return {
      decision: "in_progress",
      retrySafe: true,
      key,
      existingRecord,
      resultSummaryJson: existingRecord.resultSummaryJson,
    };
  }

  if (record.status === IdempotencyRecordStatus.FAILED) {
    return {
      decision: options.retryFailedOperations
        ? "ambiguous_retry_safe"
        : "failed_prior_attempt",
      retrySafe: options.retryFailedOperations === true,
      key,
      existingRecord,
      resultSummaryJson: existingRecord.resultSummaryJson,
    };
  }

  return {
    decision: "already_processed",
    retrySafe: true,
    key,
    existingRecord,
    resultSummaryJson: existingRecord.resultSummaryJson,
  };
}

async function findRecordByKey(key: PrismaIdempotencyKey) {
  const prisma = getPrisma();

  if (!hasIdempotencyRecordDelegate(prisma)) {
    const rows = await prisma.$queryRaw<IdempotencyRecord[]>`
      SELECT *
      FROM "IdempotencyRecord"
      WHERE "scope" = ${key.scope}
        AND "key" = ${key.key}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  return prisma.idempotencyRecord.findUnique({
    where: {
      scope_key: {
        scope: key.scope,
        key: key.key,
      },
    },
  });
}

export async function getIdempotencyRecord(key: PrismaIdempotencyKey) {
  const record = await findRecordByKey(key);

  if (!record) {
    return null;
  }

  assertSameWorkspace(record, key);
  return toRecordSummary(record);
}

export async function beginIdempotencyOperation(
  input: BeginIdempotencyOperationInput,
): Promise<PrismaIdempotencyRecordSummary> {
  const prisma = getPrisma();
  const now = new Date();

  if (!hasIdempotencyRecordDelegate(prisma)) {
    const created = await prisma.$queryRaw<IdempotencyRecord[]>`
      INSERT INTO "IdempotencyRecord" (
        "id",
        "workspaceId",
        "scope",
        "key",
        "status",
        "integrationId",
        "operationType",
        "resourceType",
        "resourceId",
        "externalEventId",
        "requestHash",
        "startedAt",
        "expiresAt",
        "lockedAt",
        "lockOwner"
      )
      VALUES (
        ${randomUUID()},
        ${input.key.workspaceId},
        ${input.key.scope},
        ${input.key.key},
        ${IdempotencyRecordStatus.STARTED}::"IdempotencyRecordStatus",
        ${input.key.integrationId ?? null},
        ${input.key.operationType},
        ${input.key.resourceType ?? null},
        ${input.key.resourceId ?? null},
        ${input.key.externalEventId ?? null},
        ${input.key.requestHash ?? null},
        ${now},
        ${input.expiresAt ?? null},
        ${input.lockedAt ?? now},
        ${input.lockOwner ?? null}
      )
      ON CONFLICT ("scope", "key") DO NOTHING
      RETURNING *
    `;

    if (created[0]) {
      return toRecordSummary(created[0]);
    }

    const existing = await findRecordByKey(input.key);

    if (!existing) {
      throw new Error("Idempotency record could not be loaded after conflict.");
    }

    assertSameWorkspace(existing, input.key);

    if (existing.status === IdempotencyRecordStatus.STARTED) {
      return toRecordSummary(existing, "duplicate");
    }

    return toRecordSummary(existing);
  }

  try {
    const created = await prisma.idempotencyRecord.create({
      data: {
        workspaceId: input.key.workspaceId,
        scope: input.key.scope,
        key: input.key.key,
        status: IdempotencyRecordStatus.STARTED,
        integrationId: input.key.integrationId ?? null,
        operationType: input.key.operationType,
        resourceType: input.key.resourceType ?? null,
        resourceId: input.key.resourceId ?? null,
        externalEventId: input.key.externalEventId ?? null,
        requestHash: input.key.requestHash ?? null,
        startedAt: now,
        expiresAt: input.expiresAt ?? null,
        lockedAt: input.lockedAt ?? now,
        lockOwner: input.lockOwner ?? null,
      },
    });

    return toRecordSummary(created);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await findRecordByKey(input.key);

    if (!existing) {
      throw error;
    }

    assertSameWorkspace(existing, input.key);

    if (existing.status === IdempotencyRecordStatus.STARTED) {
      return toRecordSummary(existing, "duplicate");
    }

    return toRecordSummary(existing);
  }
}

export async function completeIdempotencyOperation(
  input: CompleteIdempotencyOperationInput,
) {
  const prisma = getPrisma();
  const existing = await findRecordByKey(input.key);

  if (!existing) {
    return null;
  }

  assertSameWorkspace(existing, input.key);

  if (!hasIdempotencyRecordDelegate(prisma)) {
    const rows = await prisma.$queryRaw<IdempotencyRecord[]>`
      UPDATE "IdempotencyRecord"
      SET
        "status" = ${IdempotencyRecordStatus.COMPLETED}::"IdempotencyRecordStatus",
        "completedAt" = ${input.completedAt ?? new Date()},
        "failedAt" = NULL,
        "lastErrorJson" = NULL,
        "resultSummaryJson" = COALESCE(
          ${input.resultSummaryJson === undefined ? null : toJsonString(toPrismaJsonValue(input.resultSummaryJson))}::jsonb,
          "resultSummaryJson"
        )
      WHERE "id" = ${existing.id}
      RETURNING *
    `;

    return rows[0] ? toRecordSummary(rows[0]) : null;
  }

  const updated = await prisma.idempotencyRecord.update({
    where: {
      id: existing.id,
    },
    data: {
      status: IdempotencyRecordStatus.COMPLETED,
      completedAt: input.completedAt ?? new Date(),
      failedAt: null,
      lastErrorJson: Prisma.JsonNull,
      resultSummaryJson:
        input.resultSummaryJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultSummaryJson),
    },
  });

  return toRecordSummary(updated);
}

export async function failIdempotencyOperation(
  input: FailIdempotencyOperationInput,
) {
  const prisma = getPrisma();
  const existing = await findRecordByKey(input.key);

  if (!existing) {
    return null;
  }

  assertSameWorkspace(existing, input.key);

  if (!hasIdempotencyRecordDelegate(prisma)) {
    const rows = await prisma.$queryRaw<IdempotencyRecord[]>`
      UPDATE "IdempotencyRecord"
      SET
        "status" = ${IdempotencyRecordStatus.FAILED}::"IdempotencyRecordStatus",
        "failedAt" = ${input.failedAt ?? new Date()},
        "lastErrorJson" = COALESCE(
          ${input.error === undefined ? null : toJsonString(toPrismaJsonValue(toSafeErrorJson(input.error)))}::jsonb,
          "lastErrorJson"
        ),
        "resultSummaryJson" = COALESCE(
          ${input.resultSummaryJson === undefined ? null : toJsonString(toPrismaJsonValue(input.resultSummaryJson))}::jsonb,
          "resultSummaryJson"
        )
      WHERE "id" = ${existing.id}
      RETURNING *
    `;

    return rows[0] ? toRecordSummary(rows[0]) : null;
  }

  const updated = await prisma.idempotencyRecord.update({
    where: {
      id: existing.id,
    },
    data: {
      status: IdempotencyRecordStatus.FAILED,
      failedAt: input.failedAt ?? new Date(),
      lastErrorJson:
        input.error === undefined
          ? undefined
          : toPrismaJsonValue(toSafeErrorJson(input.error)),
      resultSummaryJson:
        input.resultSummaryJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultSummaryJson),
    },
  });

  return toRecordSummary(updated);
}

export async function markDuplicateIdempotencyOperation(
  input: MarkDuplicateIdempotencyOperationInput,
) {
  const prisma = getPrisma();
  const existing = await findRecordByKey(input.key);

  if (!existing) {
    return null;
  }

  assertSameWorkspace(existing, input.key);

  if (!hasIdempotencyRecordDelegate(prisma)) {
    const rows = await prisma.$queryRaw<IdempotencyRecord[]>`
      UPDATE "IdempotencyRecord"
      SET
        "status" = ${IdempotencyRecordStatus.DUPLICATE}::"IdempotencyRecordStatus",
        "completedAt" = ${input.completedAt ?? existing.completedAt ?? new Date()},
        "resultSummaryJson" = COALESCE(
          ${input.resultSummaryJson === undefined ? null : toJsonString(toPrismaJsonValue(input.resultSummaryJson))}::jsonb,
          "resultSummaryJson"
        )
      WHERE "id" = ${existing.id}
      RETURNING *
    `;

    return rows[0] ? toRecordSummary(rows[0]) : null;
  }

  const updated = await prisma.idempotencyRecord.update({
    where: {
      id: existing.id,
    },
    data: {
      status: IdempotencyRecordStatus.DUPLICATE,
      completedAt: input.completedAt ?? existing.completedAt ?? new Date(),
      resultSummaryJson:
        input.resultSummaryJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultSummaryJson),
    },
  });

  return toRecordSummary(updated);
}

export function createPrismaIdempotencyService(
  options: CreatePrismaIdempotencyServiceOptions = {},
) {
  return {
    async check(key: PrismaIdempotencyKey): Promise<PrismaIdempotencyDecision> {
      const existing = await findRecordByKey(key);

      if (!existing) {
        return {
          decision: "new_operation",
          retrySafe: true,
          key,
        };
      }

      return decisionForRecord(key, existing, options);
    },

    async begin(input: {
      key: PrismaIdempotencyKey;
      expiresAt?: Date | null;
    }) {
      return beginIdempotencyOperation({
        ...input,
        lockOwner: options.lockOwner ?? null,
      });
    },

    async complete(input: {
      key: PrismaIdempotencyKey;
      resultSummaryJson?: JsonValue | null;
      completedAt?: Date;
    }) {
      return completeIdempotencyOperation(input);
    },

    async fail(input: {
      key: PrismaIdempotencyKey;
      resultSummaryJson?: JsonValue | null;
      completedAt?: Date;
    }) {
      return failIdempotencyOperation({
        key: input.key,
        resultSummaryJson: input.resultSummaryJson,
        failedAt: input.completedAt,
      });
    },

    async markDuplicate(input: {
      key: PrismaIdempotencyKey;
      resultSummaryJson?: JsonValue | null;
      completedAt?: Date;
    }) {
      return markDuplicateIdempotencyOperation(input);
    },

    async getSummary(key: PrismaIdempotencyKey) {
      return getIdempotencyRecord(key);
    },
  };
}
