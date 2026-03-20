import {
  DEDUPE_STATUSES,
  type DedupeDecision,
  type InboundDiagnostic,
  type InboundEmittedEvent,
  type InboundEnvelope,
  type InboundIngestionResult,
  type InboundInsertedCounts,
} from "./inbound";
import type { IngestionBatch } from "./types";

export type ParsedInboundPayload<TParsedPayload = unknown> = {
  parsedPayload: TParsedPayload;
  externalEventId?: string | null;
  diagnostics?: InboundDiagnostic[];
};

export type NormalizedInboundPayload = {
  batch: IngestionBatch;
  diagnostics?: InboundDiagnostic[];
};

export type CanonicalWriteResult = {
  conversationId?: string | null;
  messageIds: string[];
  insertedCounts: InboundInsertedCounts;
  diagnostics?: InboundDiagnostic[];
};

export type SourceValidationHandler<
  TRawInput extends string | import("./types").JsonValue = string | import("./types").JsonValue,
> = (envelope: InboundEnvelope<TRawInput>) => Promise<InboundEnvelope<TRawInput>>;

export type ParsingHandler<
  TRawInput extends string | import("./types").JsonValue = string | import("./types").JsonValue,
  TParsedPayload = unknown,
> = (
  envelope: InboundEnvelope<TRawInput>,
) => Promise<ParsedInboundPayload<TParsedPayload>>;

export type DedupeHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
}) => Promise<DedupeDecision>;

export type NormalizationHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
}) => Promise<NormalizedInboundPayload>;

export type CanonicalWriteHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
  batch: IngestionBatch;
  dedupeDecision: DedupeDecision;
}) => Promise<CanonicalWriteResult>;

export type DownstreamEventHandler<TParsedPayload = unknown> = (input: {
  envelope: InboundEnvelope;
  parsedPayload: TParsedPayload;
  batch: IngestionBatch;
  writeResult: CanonicalWriteResult;
}) => Promise<InboundEmittedEvent[]>;

export type InboundOrchestrationHandlers<
  TRawInput extends string | import("./types").JsonValue = string | import("./types").JsonValue,
  TParsedPayload = unknown,
> = {
  validateSource?: SourceValidationHandler<TRawInput>;
  parsePayload?: ParsingHandler<TRawInput, TParsedPayload>;
  dedupe?: DedupeHandler<TParsedPayload>;
  normalize?: NormalizationHandler<TParsedPayload>;
  writeCanonicalData?: CanonicalWriteHandler<TParsedPayload>;
  emitDownstreamEvents?: DownstreamEventHandler<TParsedPayload>;
};

export type InboundOrchestrationResult = InboundIngestionResult;

const EMPTY_INSERTED_COUNTS: InboundInsertedCounts = {
  conversations: 0,
  participants: 0,
  messages: 0,
  attachments: 0,
};

function createEmptyIngestionBatch(): IngestionBatch {
  return {
    conversations: [],
    participants: [],
    messages: [],
    attachments: [],
  };
}

async function defaultValidateSource<TRawInput extends string | import("./types").JsonValue>(
  envelope: InboundEnvelope<TRawInput>,
) {
  return envelope;
}

async function defaultParsePayload<
  TRawInput extends string | import("./types").JsonValue,
>(envelope: InboundEnvelope<TRawInput>): Promise<ParsedInboundPayload<TRawInput>> {
  return {
    parsedPayload: envelope.rawInput,
    externalEventId: envelope.externalEventId ?? null,
  };
}

async function defaultDedupe(): Promise<DedupeDecision> {
  return {
    status: DEDUPE_STATUSES.NEW,
    retrySafe: true,
  };
}

async function defaultNormalize(): Promise<NormalizedInboundPayload> {
  return {
    batch: createEmptyIngestionBatch(),
  };
}

async function defaultWriteCanonicalData(): Promise<CanonicalWriteResult> {
  return {
    conversationId: null,
    messageIds: [],
    insertedCounts: EMPTY_INSERTED_COUNTS,
  };
}

async function defaultEmitDownstreamEvents(): Promise<InboundEmittedEvent[]> {
  return [];
}

export async function runInboundOrchestration<
  TRawInput extends string | import("./types").JsonValue = string | import("./types").JsonValue,
  TParsedPayload = unknown,
>(
  envelope: InboundEnvelope<TRawInput>,
  handlers: InboundOrchestrationHandlers<TRawInput, TParsedPayload> = {},
): Promise<InboundOrchestrationResult> {
  const diagnostics: InboundDiagnostic[] = [];

  const validatedEnvelope = await (handlers.validateSource ?? defaultValidateSource)(
    envelope,
  );

  const parsed = await (handlers.parsePayload ?? defaultParsePayload)(
    validatedEnvelope,
  );

  if (parsed.diagnostics?.length) {
    diagnostics.push(...parsed.diagnostics);
  }

  const effectiveEnvelope =
    parsed.externalEventId === undefined ||
    parsed.externalEventId === validatedEnvelope.externalEventId
      ? validatedEnvelope
      : {
          ...validatedEnvelope,
          externalEventId: parsed.externalEventId,
        };

  const dedupeDecision = await (handlers.dedupe ?? defaultDedupe)({
    envelope: effectiveEnvelope,
    parsedPayload: parsed.parsedPayload as TParsedPayload,
  });

  if (dedupeDecision.status === DEDUPE_STATUSES.ALREADY_PROCESSED) {
    return {
      integrationId: effectiveEnvelope.integrationId,
      workspaceId: effectiveEnvelope.workspaceId,
      conversationId: null,
      messageIds: dedupeDecision.existingMessageIds ?? [],
      insertedCounts: EMPTY_INSERTED_COUNTS,
      dedupeDecision,
      emittedEvents: [],
      diagnostics,
      batch: null,
    };
  }

  const normalized = await (handlers.normalize ?? defaultNormalize)({
    envelope: effectiveEnvelope,
    parsedPayload: parsed.parsedPayload as TParsedPayload,
  });

  if (normalized.diagnostics?.length) {
    diagnostics.push(...normalized.diagnostics);
  }

  const writeResult = await (
    handlers.writeCanonicalData ?? defaultWriteCanonicalData
  )({
    envelope: effectiveEnvelope,
    parsedPayload: parsed.parsedPayload as TParsedPayload,
    batch: normalized.batch,
    dedupeDecision,
  });

  if (writeResult.diagnostics?.length) {
    diagnostics.push(...writeResult.diagnostics);
  }

  const emittedEvents = await (
    handlers.emitDownstreamEvents ?? defaultEmitDownstreamEvents
  )({
    envelope: effectiveEnvelope,
    parsedPayload: parsed.parsedPayload as TParsedPayload,
    batch: normalized.batch,
    writeResult,
  });

  return {
    integrationId: effectiveEnvelope.integrationId,
    workspaceId: effectiveEnvelope.workspaceId,
    conversationId: writeResult.conversationId ?? null,
    messageIds: writeResult.messageIds,
    insertedCounts: writeResult.insertedCounts,
    dedupeDecision,
    emittedEvents,
    diagnostics,
    batch: normalized.batch,
  };
}
