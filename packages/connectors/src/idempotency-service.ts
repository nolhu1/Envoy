import {
  IDEMPOTENCY_DECISION_TYPES,
  IDEMPOTENCY_STATUSES,
  type IdempotencyDecision,
  type IdempotencyKey,
  type IdempotencyRecordSummary,
} from "./idempotency";
import type { JsonValue } from "./types";

export type IdempotencyBeginInput = {
  key: IdempotencyKey;
  expiresAt?: Date | null;
};

export type IdempotencyCompleteInput = {
  key: IdempotencyKey;
  resultSummaryJson?: JsonValue | null;
  completedAt?: Date;
};

export type IdempotencyFailInput = {
  key: IdempotencyKey;
  resultSummaryJson?: JsonValue | null;
  completedAt?: Date;
};

export type IdempotencyMarkDuplicateInput = {
  key: IdempotencyKey;
  resultSummaryJson?: JsonValue | null;
  completedAt?: Date;
};

export interface IdempotencyService {
  check(key: IdempotencyKey): Promise<IdempotencyDecision>;
  begin(input: IdempotencyBeginInput): Promise<IdempotencyRecordSummary>;
  complete(input: IdempotencyCompleteInput): Promise<IdempotencyRecordSummary | null>;
  fail(input: IdempotencyFailInput): Promise<IdempotencyRecordSummary | null>;
  markDuplicate(
    input: IdempotencyMarkDuplicateInput,
  ): Promise<IdempotencyRecordSummary | null>;
  getSummary(key: IdempotencyKey): Promise<IdempotencyRecordSummary | null>;
}

function createRecordId(key: IdempotencyKey) {
  return `${key.scope}:${key.key}`;
}

function toRecordSummary(
  key: IdempotencyKey,
  input?: Partial<IdempotencyRecordSummary>,
): IdempotencyRecordSummary {
  return {
    id: input?.id ?? createRecordId(key),
    scope: key.scope,
    key: key.key,
    status: input?.status ?? IDEMPOTENCY_STATUSES.IN_PROGRESS,
    workspaceId: key.workspaceId,
    integrationId: key.integrationId ?? null,
    operationType: key.operationType,
    resourceType: key.resourceType ?? null,
    resourceId: key.resourceId ?? null,
    externalEventId: key.externalEventId ?? null,
    requestHash: key.requestHash ?? null,
    resultSummaryJson: input?.resultSummaryJson ?? null,
    startedAt: input?.startedAt ?? new Date(),
    completedAt: input?.completedAt ?? null,
    expiresAt: input?.expiresAt ?? null,
  };
}

export class InMemoryIdempotencyService implements IdempotencyService {
  private readonly records = new Map<string, IdempotencyRecordSummary>();

  async check(key: IdempotencyKey): Promise<IdempotencyDecision> {
    const existingRecord = this.records.get(createRecordId(key)) ?? null;

    if (!existingRecord) {
      return {
        decision: IDEMPOTENCY_DECISION_TYPES.NEW_OPERATION,
        retrySafe: true,
        key,
      };
    }

    if (existingRecord.status === IDEMPOTENCY_STATUSES.COMPLETED) {
      return {
        decision: IDEMPOTENCY_DECISION_TYPES.ALREADY_PROCESSED,
        retrySafe: true,
        key,
        existingRecord,
        resultSummaryJson: existingRecord.resultSummaryJson,
      };
    }

    if (existingRecord.status === IDEMPOTENCY_STATUSES.IN_PROGRESS) {
      return {
        decision: IDEMPOTENCY_DECISION_TYPES.IN_PROGRESS,
        retrySafe: true,
        key,
        existingRecord,
        resultSummaryJson: existingRecord.resultSummaryJson,
      };
    }

    if (existingRecord.status === IDEMPOTENCY_STATUSES.FAILED) {
      return {
        decision: IDEMPOTENCY_DECISION_TYPES.FAILED_PRIOR_ATTEMPT,
        retrySafe: true,
        key,
        existingRecord,
        resultSummaryJson: existingRecord.resultSummaryJson,
      };
    }

    return {
      decision: IDEMPOTENCY_DECISION_TYPES.AMBIGUOUS_RETRY_SAFE,
      retrySafe: true,
      key,
      existingRecord,
      resultSummaryJson: existingRecord.resultSummaryJson,
    };
  }

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyRecordSummary> {
    const existingRecord = this.records.get(createRecordId(input.key));

    if (existingRecord) {
      return existingRecord;
    }

    const record = toRecordSummary(input.key, {
      status: IDEMPOTENCY_STATUSES.IN_PROGRESS,
      expiresAt: input.expiresAt ?? null,
    });

    this.records.set(createRecordId(input.key), record);
    return record;
  }

  async complete(
    input: IdempotencyCompleteInput,
  ): Promise<IdempotencyRecordSummary | null> {
    const existingRecord = this.records.get(createRecordId(input.key));

    if (!existingRecord) {
      return null;
    }

    const updatedRecord = {
      ...existingRecord,
      status: IDEMPOTENCY_STATUSES.COMPLETED,
      resultSummaryJson: input.resultSummaryJson ?? existingRecord.resultSummaryJson,
      completedAt: input.completedAt ?? new Date(),
    } satisfies IdempotencyRecordSummary;

    this.records.set(createRecordId(input.key), updatedRecord);
    return updatedRecord;
  }

  async fail(input: IdempotencyFailInput): Promise<IdempotencyRecordSummary | null> {
    const existingRecord = this.records.get(createRecordId(input.key));

    if (!existingRecord) {
      return null;
    }

    const updatedRecord = {
      ...existingRecord,
      status: IDEMPOTENCY_STATUSES.FAILED,
      resultSummaryJson: input.resultSummaryJson ?? existingRecord.resultSummaryJson,
      completedAt: input.completedAt ?? new Date(),
    } satisfies IdempotencyRecordSummary;

    this.records.set(createRecordId(input.key), updatedRecord);
    return updatedRecord;
  }

  async markDuplicate(
    input: IdempotencyMarkDuplicateInput,
  ): Promise<IdempotencyRecordSummary | null> {
    const existingRecord = this.records.get(createRecordId(input.key));

    if (!existingRecord) {
      return null;
    }

    const updatedRecord = {
      ...existingRecord,
      status: IDEMPOTENCY_STATUSES.DUPLICATE,
      resultSummaryJson: input.resultSummaryJson ?? existingRecord.resultSummaryJson,
      completedAt: input.completedAt ?? existingRecord.completedAt ?? new Date(),
    } satisfies IdempotencyRecordSummary;

    this.records.set(createRecordId(input.key), updatedRecord);
    return updatedRecord;
  }

  async getSummary(key: IdempotencyKey): Promise<IdempotencyRecordSummary | null> {
    return this.records.get(createRecordId(key)) ?? null;
  }
}

export class NoOpIdempotencyService implements IdempotencyService {
  async check(key: IdempotencyKey): Promise<IdempotencyDecision> {
    return {
      decision: IDEMPOTENCY_DECISION_TYPES.NEW_OPERATION,
      retrySafe: true,
      key,
    };
  }

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyRecordSummary> {
    return toRecordSummary(input.key, {
      status: IDEMPOTENCY_STATUSES.IN_PROGRESS,
      expiresAt: input.expiresAt ?? null,
    });
  }

  async complete(
    input: IdempotencyCompleteInput,
  ): Promise<IdempotencyRecordSummary | null> {
    return toRecordSummary(input.key, {
      status: IDEMPOTENCY_STATUSES.COMPLETED,
      resultSummaryJson: input.resultSummaryJson ?? null,
      completedAt: input.completedAt ?? new Date(),
    });
  }

  async fail(input: IdempotencyFailInput): Promise<IdempotencyRecordSummary | null> {
    return toRecordSummary(input.key, {
      status: IDEMPOTENCY_STATUSES.FAILED,
      resultSummaryJson: input.resultSummaryJson ?? null,
      completedAt: input.completedAt ?? new Date(),
    });
  }

  async markDuplicate(
    input: IdempotencyMarkDuplicateInput,
  ): Promise<IdempotencyRecordSummary | null> {
    return toRecordSummary(input.key, {
      status: IDEMPOTENCY_STATUSES.DUPLICATE,
      resultSummaryJson: input.resultSummaryJson ?? null,
      completedAt: input.completedAt ?? new Date(),
    });
  }

  async getSummary(): Promise<IdempotencyRecordSummary | null> {
    return null;
  }
}
