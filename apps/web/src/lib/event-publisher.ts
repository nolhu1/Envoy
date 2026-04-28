import "server-only";

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
} from "@envoy/events";

import { appendActionLogForEnvoyEvent } from "@/lib/action-log";
import { executeAutomaticAgentTriggerForEvent } from "@/lib/agent-trigger-runtime";
import { sanitizeErrorMessage } from "@/lib/security";

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
  const result = await getEventPublisher().publish(event);
  await runPostPublishEventHooks([event]);
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

  const result = await getEventPublisher().publishMany(events);
  await runPostPublishEventHooks(events);
  return result;
}

async function runPostPublishEventHooks(events: EnvoyEvent[]) {
  for (const event of events) {
    try {
      await appendActionLogForEnvoyEvent(event);
    } catch (error) {
      console.error(
        "[event-publisher] action-log hook failed",
        JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          workspaceId: event.workspaceId,
          error: sanitizeErrorMessage(error, "Unknown action-log hook error."),
        }),
      );
    }

    try {
      await executeAutomaticAgentTriggerForEvent(event);
    } catch (error) {
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
    }
  }
}

export {
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
};
