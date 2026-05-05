import {
  EventJournalStatus as PrismaEventJournalStatus,
  EventProcessingStatus as PrismaEventProcessingStatus,
  Prisma,
  type EventJournal,
  type EventProcessingAttempt,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { getPrisma } from "./client";

type JsonPrimitive = boolean | number | string | null;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const EVENT_JOURNAL_STATUS_FALLBACK = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  DEAD_LETTERED: "DEAD_LETTERED",
  REPLAY_REQUESTED: "REPLAY_REQUESTED",
} as const;

const EVENT_PROCESSING_STATUS_FALLBACK = {
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export const EventJournalStatus = (PrismaEventJournalStatus ??
  EVENT_JOURNAL_STATUS_FALLBACK) as typeof EVENT_JOURNAL_STATUS_FALLBACK;

export const EventProcessingStatus = (PrismaEventProcessingStatus ??
  EVENT_PROCESSING_STATUS_FALLBACK) as typeof EVENT_PROCESSING_STATUS_FALLBACK;

type EventJournalStatusValue =
  (typeof EventJournalStatus)[keyof typeof EventJournalStatus];
type EventProcessingStatusValue =
  (typeof EventProcessingStatus)[keyof typeof EventProcessingStatus];

type EventJournalEnvelope = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  source: string;
  version: number;
};

type EventJournalMetadata = Record<string, unknown>;

export type CreateEventJournalRecordOptions = {
  availableAt?: Date | null;
  replayOfEventId?: string | null;
  metadataJson?: EventJournalMetadata | null;
};

export type CreateEventProcessingAttemptInput = {
  eventId: string;
  consumer: string;
  status?: EventProcessingStatusValue;
  attempt?: number;
  startedAt?: Date;
  nextRetryAt?: Date | null;
  workerJobId?: string | null;
  bullJobId?: string | null;
  resultJson?: unknown;
  errorJson?: unknown;
};

export type FinishEventProcessingAttemptInput = {
  id: string;
  status: EventProcessingStatusValue;
  finishedAt?: Date;
  nextRetryAt?: Date | null;
  resultJson?: unknown;
  error?: unknown;
};

function toPrismaJsonValue(value: unknown) {
  if (value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toJsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function hasEventJournalDelegate(prisma: ReturnType<typeof getPrisma>) {
  const eventJournal = prisma.eventJournal as
    | {
        upsert?: unknown;
        findUnique?: unknown;
        update?: unknown;
      }
    | undefined;

  return (
    typeof eventJournal?.upsert === "function" &&
    typeof eventJournal.findUnique === "function" &&
    typeof eventJournal.update === "function"
  );
}

function hasEventProcessingAttemptDelegate(prisma: ReturnType<typeof getPrisma>) {
  const eventProcessingAttempt = prisma.eventProcessingAttempt as
    | {
        count?: unknown;
        create?: unknown;
        update?: unknown;
      }
    | undefined;

  return (
    typeof eventProcessingAttempt?.count === "function" &&
    typeof eventProcessingAttempt.create === "function" &&
    typeof eventProcessingAttempt.update === "function"
  );
}

function parseOccurredAt(value: string) {
  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Event occurredAt must be a valid ISO timestamp.");
  }

  return parsed;
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

export async function createEventJournalRecord(
  event: EventJournalEnvelope,
  options: CreateEventJournalRecordOptions = {},
): Promise<EventJournal> {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const existing = await getEventJournalRecordByEventId(event.eventId);

    if (existing) {
      return existing;
    }

    const created = await prisma.$queryRaw<EventJournal[]>`
      INSERT INTO "EventJournal" (
        "id",
        "eventId",
        "workspaceId",
        "eventType",
        "entityType",
        "entityId",
        "source",
        "version",
        "occurredAt",
        "payloadJson",
        "status",
        "availableAt",
        "replayOfEventId",
        "metadataJson"
      )
      VALUES (
        ${randomUUID()},
        ${event.eventId},
        ${event.workspaceId},
        ${event.eventType},
        ${event.entityType},
        ${event.entityId},
        ${event.source},
        ${event.version},
        ${parseOccurredAt(event.occurredAt)},
        ${toJsonString(toPrismaJsonValue(event.payload))}::jsonb,
        ${EventJournalStatus.PENDING}::"EventJournalStatus",
        ${options.availableAt ?? null},
        ${options.replayOfEventId ?? null},
        ${options.metadataJson ? toJsonString(toPrismaJsonValue(options.metadataJson)) : null}::jsonb
      )
      ON CONFLICT ("eventId") DO NOTHING
      RETURNING *
    `;

    if (created[0]) {
      return created[0];
    }

    const duplicate = await getEventJournalRecordByEventId(event.eventId);

    if (!duplicate) {
      throw new Error("Event journal record could not be created.");
    }

    return duplicate;
  }

  return prisma.eventJournal.upsert({
    where: {
      eventId: event.eventId,
    },
    create: {
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      source: event.source,
      version: event.version,
      occurredAt: parseOccurredAt(event.occurredAt),
      payloadJson: toPrismaJsonValue(event.payload),
      status: EventJournalStatus.PENDING,
      availableAt: options.availableAt ?? null,
      replayOfEventId: options.replayOfEventId ?? null,
      metadataJson: options.metadataJson
        ? toPrismaJsonValue(options.metadataJson)
        : undefined,
    },
    update: {},
  });
}

export async function getEventJournalRecordByEventId(eventId: string) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      SELECT *
      FROM "EventJournal"
      WHERE "eventId" = ${eventId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  return prisma.eventJournal.findUnique({
    where: {
      eventId,
    },
  });
}

export async function markEventJournalProcessing(eventId: string) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      UPDATE "EventJournal"
      SET
        "status" = ${EventJournalStatus.PROCESSING}::"EventJournalStatus",
        "processedAt" = NULL,
        "failedAt" = NULL,
        "deadLetteredAt" = NULL,
        "lastErrorJson" = NULL
      WHERE "eventId" = ${eventId}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event journal record could not be marked processing.");
    }

    return rows[0];
  }

  return prisma.eventJournal.update({
    where: {
      eventId,
    },
    data: {
      status: EventJournalStatus.PROCESSING,
      processedAt: null,
      failedAt: null,
      deadLetteredAt: null,
      lastErrorJson: Prisma.JsonNull,
    },
  });
}

export async function markEventJournalProcessed(eventId: string) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      UPDATE "EventJournal"
      SET
        "status" = ${EventJournalStatus.PROCESSED}::"EventJournalStatus",
        "processedAt" = ${new Date()},
        "failedAt" = NULL,
        "deadLetteredAt" = NULL,
        "lastErrorJson" = NULL
      WHERE "eventId" = ${eventId}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event journal record could not be marked processed.");
    }

    return rows[0];
  }

  return prisma.eventJournal.update({
    where: {
      eventId,
    },
    data: {
      status: EventJournalStatus.PROCESSED,
      processedAt: new Date(),
      failedAt: null,
      deadLetteredAt: null,
      lastErrorJson: Prisma.JsonNull,
    },
  });
}

export async function markEventJournalFailed(eventId: string, error: unknown) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      UPDATE "EventJournal"
      SET
        "status" = ${EventJournalStatus.FAILED}::"EventJournalStatus",
        "failedAt" = ${new Date()},
        "lastErrorJson" = ${toJsonString(toPrismaJsonValue(toSafeErrorJson(error)))}::jsonb
      WHERE "eventId" = ${eventId}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event journal record could not be marked failed.");
    }

    return rows[0];
  }

  return prisma.eventJournal.update({
    where: {
      eventId,
    },
    data: {
      status: EventJournalStatus.FAILED,
      failedAt: new Date(),
      lastErrorJson: toPrismaJsonValue(toSafeErrorJson(error)),
    },
  });
}

export async function markEventJournalDeadLettered(
  eventId: string,
  error: unknown,
) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      UPDATE "EventJournal"
      SET
        "status" = ${EventJournalStatus.DEAD_LETTERED}::"EventJournalStatus",
        "deadLetteredAt" = ${new Date()},
        "lastErrorJson" = ${toJsonString(toPrismaJsonValue(toSafeErrorJson(error)))}::jsonb
      WHERE "eventId" = ${eventId}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event journal record could not be marked dead-lettered.");
    }

    return rows[0];
  }

  return prisma.eventJournal.update({
    where: {
      eventId,
    },
    data: {
      status: EventJournalStatus.DEAD_LETTERED,
      deadLetteredAt: new Date(),
      lastErrorJson: toPrismaJsonValue(toSafeErrorJson(error)),
    },
  });
}

export async function requestEventReplay(
  eventId: string,
  metadata?: EventJournalMetadata | null,
) {
  const prisma = getPrisma();

  if (!hasEventJournalDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventJournal[]>`
      UPDATE "EventJournal"
      SET
        "status" = ${EventJournalStatus.REPLAY_REQUESTED}::"EventJournalStatus",
        "replayRequestedAt" = ${new Date()},
        "metadataJson" = COALESCE(
          ${metadata ? toJsonString(toPrismaJsonValue(metadata)) : null}::jsonb,
          "metadataJson"
        )
      WHERE "eventId" = ${eventId}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event journal record could not be marked replay requested.");
    }

    return rows[0];
  }

  return prisma.eventJournal.update({
    where: {
      eventId,
    },
    data: {
      status: EventJournalStatus.REPLAY_REQUESTED,
      replayRequestedAt: new Date(),
      metadataJson: metadata ? toPrismaJsonValue(metadata) : undefined,
    },
  });
}

export async function createEventProcessingAttempt(
  input: CreateEventProcessingAttemptInput,
): Promise<EventProcessingAttempt> {
  const prisma = getPrisma();
  const eventJournal = hasEventJournalDelegate(prisma)
    ? await prisma.eventJournal.findUnique({
        where: {
          eventId: input.eventId,
        },
        select: {
          id: true,
          workspaceId: true,
          eventId: true,
        },
      })
    : await getEventJournalRecordByEventId(input.eventId);

  if (!eventJournal) {
    throw new Error("Event journal record could not be loaded for attempt.");
  }

  if (!hasEventProcessingAttemptDelegate(prisma)) {
    const attempt =
      input.attempt ??
      Number(
        (
          await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count
            FROM "EventProcessingAttempt"
            WHERE "eventId" = ${input.eventId}
              AND "consumer" = ${input.consumer}
          `
        )[0]?.count ?? 0,
      ) + 1;

    const rows = await prisma.$queryRaw<EventProcessingAttempt[]>`
      INSERT INTO "EventProcessingAttempt" (
        "id",
        "workspaceId",
        "eventJournalId",
        "eventId",
        "consumer",
        "status",
        "attempt",
        "startedAt",
        "nextRetryAt",
        "workerJobId",
        "bullJobId",
        "resultJson",
        "errorJson"
      )
      VALUES (
        ${randomUUID()},
        ${eventJournal.workspaceId},
        ${eventJournal.id},
        ${eventJournal.eventId},
        ${input.consumer},
        ${(input.status ?? EventProcessingStatus.PROCESSING)}::"EventProcessingStatus",
        ${attempt},
        ${input.startedAt ?? new Date()},
        ${input.nextRetryAt ?? null},
        ${input.workerJobId ?? null},
        ${input.bullJobId ?? null},
        ${input.resultJson === undefined ? null : toJsonString(toPrismaJsonValue(input.resultJson))}::jsonb,
        ${input.errorJson === undefined ? null : toJsonString(toPrismaJsonValue(input.errorJson))}::jsonb
      )
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event processing attempt could not be created.");
    }

    return rows[0];
  }

  const attempt =
    input.attempt ??
    (await prisma.eventProcessingAttempt.count({
      where: {
        eventId: input.eventId,
        consumer: input.consumer,
      },
    })) + 1;

  return prisma.eventProcessingAttempt.create({
    data: {
      workspaceId: eventJournal.workspaceId,
      eventJournalId: eventJournal.id,
      eventId: eventJournal.eventId,
      consumer: input.consumer,
      status: input.status ?? EventProcessingStatus.PROCESSING,
      attempt,
      startedAt: input.startedAt ?? new Date(),
      nextRetryAt: input.nextRetryAt ?? null,
      workerJobId: input.workerJobId ?? null,
      bullJobId: input.bullJobId ?? null,
      resultJson:
        input.resultJson === undefined
          ? undefined
          : toPrismaJsonValue(input.resultJson),
      errorJson:
        input.errorJson === undefined
          ? undefined
          : toPrismaJsonValue(input.errorJson),
    },
  });
}

export async function finishEventProcessingAttempt(
  input: FinishEventProcessingAttemptInput,
) {
  const prisma = getPrisma();

  if (!hasEventProcessingAttemptDelegate(prisma)) {
    const rows = await prisma.$queryRaw<EventProcessingAttempt[]>`
      UPDATE "EventProcessingAttempt"
      SET
        "status" = ${input.status}::"EventProcessingStatus",
        "finishedAt" = ${input.finishedAt ?? new Date()},
        "nextRetryAt" = ${input.nextRetryAt ?? null},
        "resultJson" = COALESCE(
          ${input.resultJson === undefined ? null : toJsonString(toPrismaJsonValue(input.resultJson))}::jsonb,
          "resultJson"
        ),
        "errorJson" = COALESCE(
          ${input.error === undefined ? null : toJsonString(toPrismaJsonValue(toSafeErrorJson(input.error)))}::jsonb,
          "errorJson"
        )
      WHERE "id" = ${input.id}
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error("Event processing attempt could not be finished.");
    }

    return rows[0];
  }

  return prisma.eventProcessingAttempt.update({
    where: {
      id: input.id,
    },
    data: {
      status: input.status,
      finishedAt: input.finishedAt ?? new Date(),
      nextRetryAt: input.nextRetryAt ?? null,
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
