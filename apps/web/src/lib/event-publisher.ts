import { randomUUID } from "node:crypto";

import {
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SCHEMA_VERSION,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  InMemoryEventPublisher,
  NoOpEventPublisher,
  type EnvoyEntityType,
  type EnvoyEvent,
  type EnvoyEventEnvelope,
  type EnvoyEventPayloadByType,
  type EnvoyEventSource,
  type EnvoyEventType,
} from "../../../../packages/events/src/index";
import {
  createEventJournalRecord,
  createEventProcessingAttempt,
  EventJournalStatus,
  EventProcessingStatus,
  finishEventProcessingAttempt,
  getEventJournalRecordByEventId,
  markEventJournalFailed,
  markEventJournalProcessed,
  markEventJournalProcessing,
} from "../../../../packages/db/src/index";

import { appendActionLogForEnvoyEvent } from "./action-log";
import { sanitizeErrorMessage } from "./security";

const globalForEnvoyEvents = globalThis as typeof globalThis & {
  envoyEventPublisher?: InMemoryEventPublisher | NoOpEventPublisher;
};

export function getEventPublisher() {
  if (!globalForEnvoyEvents.envoyEventPublisher) {
    globalForEnvoyEvents.envoyEventPublisher =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? new InMemoryEventPublisher()
        : new NoOpEventPublisher();
  }

  return globalForEnvoyEvents.envoyEventPublisher;
}

export function buildEnvoyEvent<TType extends EnvoyEventType>(input: {
  eventType: TType;
  workspaceId: string;
  entityType: EnvoyEntityType;
  entityId: string;
  source: EnvoyEventSource;
  payload: EnvoyEventPayloadByType[TType];
  occurredAt?: Date;
}): EnvoyEventEnvelope<TType> {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    workspaceId: input.workspaceId,
    entityType: input.entityType as never,
    entityId: input.entityId,
    payload: input.payload,
    source: input.source,
    version: ENVOY_EVENT_SCHEMA_VERSION,
  };
}

export async function publishEnvoyEvent(event: EnvoyEvent) {
  const existingRecord = await getEventJournalRecordByEventId(event.eventId);
  await createEventJournalRecord(event, {
    metadataJson: {
      publisher: "web_inline",
      inlineHooksEnabled: true,
    },
  });

  const result = await getEventPublisher().publish(event);
  if (!shouldSkipPostPublishHooks(existingRecord?.status ?? null)) {
    await runPostPublishEventHooks([event]);
  }

  return result;
}

export async function publishEnvoyEvents(events: EnvoyEvent[]) {
  if (events.length === 0) {
    return {
      accepted: true,
      publishedCount: 0,
      eventIds: [],
      events: [],
    };
  }

  const uniqueEvents = uniqueEventsByEventId(events);
  const existingRecords = new Map(
    (
      await Promise.all(
        uniqueEvents.map((event) => getEventJournalRecordByEventId(event.eventId)),
      )
    )
      .filter((record): record is NonNullable<typeof record> =>
        Boolean(record),
      )
      .map((record) => [record.eventId, record.status]),
  );

  await Promise.all(
    uniqueEvents.map((event) =>
      createEventJournalRecord(event, {
        metadataJson: {
          publisher: "web_inline",
          inlineHooksEnabled: true,
          bulkPublish: true,
        },
      }),
    ),
  );

  const result = await getEventPublisher().publishMany(events);
  await runPostPublishEventHooks(
    uniqueEvents.filter(
      (event) =>
        !shouldSkipPostPublishHooks(existingRecords.get(event.eventId) ?? null),
    ),
  );

  return result;
}

function uniqueEventsByEventId(events: EnvoyEvent[]) {
  const seenEventIds = new Set<string>();
  const uniqueEvents: EnvoyEvent[] = [];

  for (const event of events) {
    if (seenEventIds.has(event.eventId)) {
      continue;
    }

    seenEventIds.add(event.eventId);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function shouldSkipPostPublishHooks(status: string | null) {
  return (
    status === EventJournalStatus.PROCESSING ||
    status === EventJournalStatus.PROCESSED
  );
}

async function runPostPublishEventHooks(events: EnvoyEvent[]) {
  for (const event of events) {
    await markEventJournalProcessing(event.eventId);

    const actionLogStatus = await runActionLogProjector(event);
    const agentTriggerStatus = await runAgentTriggerDispatcher(event);

    if (
      actionLogStatus === EventProcessingStatus.FAILED ||
      agentTriggerStatus === EventProcessingStatus.FAILED
    ) {
      await markEventJournalFailed(event.eventId, {
        message: "One or more inline event consumers failed.",
        consumers: {
          actionLogProjector: actionLogStatus,
          agentTriggerDispatcher: agentTriggerStatus,
        },
      });
      continue;
    }

    await markEventJournalProcessed(event.eventId);
  }
}

async function runActionLogProjector(event: EnvoyEvent) {
  const attempt = await createEventProcessingAttempt({
    eventId: event.eventId,
    consumer: "action_log_projector",
  });

  try {
    await appendActionLogForEnvoyEvent(event);
    await finishEventProcessingAttempt({
      id: attempt.id,
      status: EventProcessingStatus.SUCCEEDED,
      resultJson: {
        projected: true,
      },
    });

    return EventProcessingStatus.SUCCEEDED;
  } catch (error) {
    await finishEventProcessingAttempt({
      id: attempt.id,
      status: EventProcessingStatus.FAILED,
      error,
    });
    console.error(
      "[event-publisher] action-log hook failed",
      JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        workspaceId: event.workspaceId,
        error: sanitizeErrorMessage(error, "Unknown action-log hook error."),
      }),
    );

    return EventProcessingStatus.FAILED;
  }
}

async function runAgentTriggerDispatcher(event: EnvoyEvent) {
  const attempt = await createEventProcessingAttempt({
    eventId: event.eventId,
    consumer: "agent_trigger_dispatcher",
  });

  try {
    const agentTriggerJobsPath = "./agent-trigger-jobs";
    const importJobs = (specifier: string) => import(specifier) as Promise<{
      enqueueAutomaticAgentTriggerForEvent: (event: EnvoyEvent) => Promise<{
        status: string;
        reason?: string;
        runtimeJobId?: string;
        bullJobId?: string | null;
        created?: boolean;
        queued?: boolean;
      }>;
    }>;
    const { enqueueAutomaticAgentTriggerForEvent } = await importJobs(
      agentTriggerJobsPath,
    );
    const result = await enqueueAutomaticAgentTriggerForEvent(event);

    if (result.status === "ignored") {
      await finishEventProcessingAttempt({
        id: attempt.id,
        status: EventProcessingStatus.SKIPPED,
        resultJson: {
          status: result.status,
          reason: result.reason,
        },
      });
      return EventProcessingStatus.SKIPPED;
    }

    await finishEventProcessingAttempt({
      id: attempt.id,
      status: EventProcessingStatus.SUCCEEDED,
      resultJson: result,
    });

    return EventProcessingStatus.SUCCEEDED;
  } catch (error) {
    await finishEventProcessingAttempt({
      id: attempt.id,
      status: EventProcessingStatus.FAILED,
      error,
    });
    console.error(
      "[event-publisher] automatic trigger hook failed",
      JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        workspaceId: event.workspaceId,
        error: sanitizeErrorMessage(
          error,
          "Unknown automatic trigger hook error.",
        ),
      }),
    );

    return EventProcessingStatus.FAILED;
  }
}

export {
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
};
