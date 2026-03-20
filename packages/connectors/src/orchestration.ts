import {
  DEDUPE_STATUSES,
  type DedupeDecision,
  type InboundDiagnostic,
  type InboundEmittedEvent,
  type InboundEnvelope,
  type InboundIngestionResult,
  type InboundInsertedCounts,
} from "./inbound";
import {
  IDEMPOTENCY_DECISION_TYPES,
  IDEMPOTENCY_SCOPES,
  type IdempotencyKey,
} from "./idempotency";
import {
  NoOpIdempotencyService,
  type IdempotencyService,
} from "./idempotency-service";
import type {
  CanonicalWriteHandler,
  CanonicalWriteResult,
} from "./persistence";
import type { IngestionBatch, JsonValue } from "./types";

export type ParsedInboundPayload<TParsedPayload = unknown> = {
  parsedPayload: TParsedPayload;
  externalEventId?: string | null;
  diagnostics?: InboundDiagnostic[];
};

export type NormalizedInboundPayload = {
  batch: IngestionBatch;
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
export type InboundIdempotencyKeyResolver<
  TRawInput extends string | JsonValue = string | JsonValue,
> = (envelope: InboundEnvelope<TRawInput>) => IdempotencyKey;

export type InboundOrchestrationDependencies<
  TRawInput extends string | JsonValue = string | JsonValue,
> = {
  idempotencyService?: IdempotencyService;
  resolveIdempotencyKey?: InboundIdempotencyKeyResolver<TRawInput>;
};

const EMPTY_INSERTED_COUNTS: InboundInsertedCounts = {
  conversations: 0,
  participants: 0,
  messages: 0,
  attachments: 0,
};
const DEFAULT_IDEMPOTENCY_SERVICE = new NoOpIdempotencyService();

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
    participantResolutionMap: {},
    messageIds: [],
    attachmentIds: [],
    insertedCounts: EMPTY_INSERTED_COUNTS,
  };
}

async function defaultEmitDownstreamEvents(): Promise<InboundEmittedEvent[]> {
  return [];
}

function defaultResolveInboundIdempotencyKey<
  TRawInput extends string | JsonValue,
>(envelope: InboundEnvelope<TRawInput>): IdempotencyKey {
  const rawIdentity =
    envelope.idempotencyKey ??
    envelope.externalEventId ??
    JSON.stringify(envelope.rawInput);

  return {
    key: `${envelope.sourceType}:${envelope.integrationId}:${rawIdentity}`,
    scope: IDEMPOTENCY_SCOPES.INBOUND,
    workspaceId: envelope.workspaceId,
    integrationId: envelope.integrationId,
    operationType: envelope.sourceType,
    externalEventId: envelope.externalEventId ?? null,
    resourceType: "integration",
    resourceId: envelope.integrationId,
  };
}

function buildInboundDuplicateResult(
  envelope: InboundEnvelope,
  messageIds: string[],
  diagnostics: InboundDiagnostic[],
): InboundOrchestrationResult {
  return {
    integrationId: envelope.integrationId,
    workspaceId: envelope.workspaceId,
    conversationId: null,
    messageIds,
    insertedCounts: EMPTY_INSERTED_COUNTS,
    dedupeDecision: {
      status: DEDUPE_STATUSES.ALREADY_PROCESSED,
      existingMessageIds: messageIds,
      retrySafe: true,
    },
    emittedEvents: [],
    diagnostics,
    batch: null,
  };
}

export async function runInboundOrchestration<
  TRawInput extends string | import("./types").JsonValue = string | import("./types").JsonValue,
  TParsedPayload = unknown,
>(
  envelope: InboundEnvelope<TRawInput>,
  handlers: InboundOrchestrationHandlers<TRawInput, TParsedPayload> = {},
  dependencies: InboundOrchestrationDependencies<TRawInput> = {},
): Promise<InboundOrchestrationResult> {
  const diagnostics: InboundDiagnostic[] = [];
  const idempotencyService =
    dependencies.idempotencyService ?? DEFAULT_IDEMPOTENCY_SERVICE;
  const idempotencyKey = (
    dependencies.resolveIdempotencyKey ?? defaultResolveInboundIdempotencyKey
  )(envelope);

  const idempotencyDecision = await idempotencyService.check(idempotencyKey);

  if (
    idempotencyDecision.decision === IDEMPOTENCY_DECISION_TYPES.ALREADY_PROCESSED ||
    idempotencyDecision.decision === IDEMPOTENCY_DECISION_TYPES.IN_PROGRESS
  ) {
    return buildInboundDuplicateResult(
      envelope,
      [],
      diagnostics,
    );
  }

  await idempotencyService.begin({
    key: idempotencyKey,
  });

  try {
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
      const duplicateResult = {
        integrationId: effectiveEnvelope.integrationId,
        workspaceId: effectiveEnvelope.workspaceId,
        conversationId: null,
        messageIds: dedupeDecision.existingMessageIds ?? [],
        insertedCounts: EMPTY_INSERTED_COUNTS,
        dedupeDecision,
        emittedEvents: [],
        diagnostics,
        batch: null,
      } satisfies InboundOrchestrationResult;

      await idempotencyService.markDuplicate({
        key: idempotencyKey,
        resultSummaryJson: {
          integrationId: duplicateResult.integrationId,
          workspaceId: duplicateResult.workspaceId,
          messageIds: duplicateResult.messageIds,
        },
      });

      return duplicateResult;
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

    const result = {
      integrationId: effectiveEnvelope.integrationId,
      workspaceId: effectiveEnvelope.workspaceId,
      conversationId: writeResult.conversationId ?? null,
      messageIds: writeResult.messageIds,
      insertedCounts: writeResult.insertedCounts,
      dedupeDecision,
      emittedEvents,
      diagnostics,
      batch: normalized.batch,
    } satisfies InboundOrchestrationResult;

    await idempotencyService.complete({
      key: idempotencyKey,
      resultSummaryJson: {
        integrationId: result.integrationId,
        workspaceId: result.workspaceId,
        conversationId: result.conversationId,
        messageIds: result.messageIds,
      },
    });

    return result;
  } catch (error) {
    await idempotencyService.fail({
      key: idempotencyKey,
      resultSummaryJson: {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: "Unknown inbound orchestration error" },
      },
    });

    throw error;
  }
}
