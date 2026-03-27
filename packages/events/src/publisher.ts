import type { EnvoyEvent } from "./schema";

export type PublishResult<TEvent extends EnvoyEvent = EnvoyEvent> = {
  accepted: boolean;
  publishedCount: number;
  eventIds: string[];
  events?: TEvent[];
};

export type PublishManyResult<TEvent extends EnvoyEvent = EnvoyEvent> = {
  accepted: boolean;
  publishedCount: number;
  eventIds: string[];
  events?: TEvent[];
};

export type EventPublisherOptions = {
  capturePublishedEvents?: boolean;
};

export interface EventPublisher {
  publish<TEvent extends EnvoyEvent>(event: TEvent): Promise<PublishResult<TEvent>>;
  publishMany<TEvent extends EnvoyEvent>(
    events: TEvent[],
  ): Promise<PublishManyResult<TEvent>>;
}

export class NoOpEventPublisher implements EventPublisher {
  async publish<TEvent extends EnvoyEvent>(
    event: TEvent,
  ): Promise<PublishResult<TEvent>> {
    return {
      accepted: true,
      publishedCount: 1,
      eventIds: [event.eventId],
    };
  }

  async publishMany<TEvent extends EnvoyEvent>(
    events: TEvent[],
  ): Promise<PublishManyResult<TEvent>> {
    return {
      accepted: true,
      publishedCount: events.length,
      eventIds: events.map((event) => event.eventId),
    };
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly options: EventPublisherOptions;
  private readonly publishedEventsInternal: EnvoyEvent[] = [];

  constructor(options: EventPublisherOptions = {}) {
    this.options = options;
  }

  get publishedEvents() {
    return [...this.publishedEventsInternal];
  }

  reset() {
    this.publishedEventsInternal.length = 0;
  }

  async publish<TEvent extends EnvoyEvent>(
    event: TEvent,
  ): Promise<PublishResult<TEvent>> {
    if (this.options.capturePublishedEvents !== false) {
      this.publishedEventsInternal.push(event);
    }

    return {
      accepted: true,
      publishedCount: 1,
      eventIds: [event.eventId],
      events: [event],
    };
  }

  async publishMany<TEvent extends EnvoyEvent>(
    events: TEvent[],
  ): Promise<PublishManyResult<TEvent>> {
    if (this.options.capturePublishedEvents !== false) {
      this.publishedEventsInternal.push(...events);
    }

    return {
      accepted: true,
      publishedCount: events.length,
      eventIds: events.map((event) => event.eventId),
      events: [...events],
    };
  }
}
