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
  return getEventPublisher().publish(event);
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

  return getEventPublisher().publishMany(events);
}

export {
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
};
