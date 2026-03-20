import {
  IDEMPOTENCY_DECISION_TYPES,
  IDEMPOTENCY_SCOPES,
  type IdempotencyKey,
} from "./idempotency";
import {
  NoOpIdempotencyService,
  type IdempotencyService,
} from "./idempotency-service";
import {
  OUTBOUND_DELIVERY_STATES,
  OUTBOUND_SEND_STATUSES,
  type OutboundDiagnostic,
  type OutboundRetryability,
  type OutboundSendEnvelope,
  type OutboundSendPipelineResult,
  type OutboundSendStatus,
} from "./outbound";
import type {
  CanonicalOutboundStatusUpdateHandler,
  CanonicalOutboundStatusUpdateResult,
} from "./outbound-persistence";
import type { JsonValue, SendResult } from "./types";

export type ValidatedOutboundSend<TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope> =
  TEnvelope;

export type ProviderPayloadBuildResult<TProviderPayload = JsonValue> = {
  providerPayload: TProviderPayload;
  diagnostics?: OutboundDiagnostic[];
};

export type ProviderSendExecutionResult = {
  sendResult: SendResult;
  sendStatus?: OutboundSendStatus;
  providerAcceptedAt?: Date | null;
  deliveryState?: OutboundSendPipelineResult["deliveryState"];
  retryability?: OutboundRetryability;
  diagnostics?: OutboundDiagnostic[];
};

export type AuditDownstreamResult = {
  auditEvents: OutboundSendPipelineResult["auditEvents"];
  diagnostics?: OutboundDiagnostic[];
};

export type SendEligibilityValidationHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
> = (envelope: TEnvelope) => Promise<ValidatedOutboundSend<TEnvelope>>;

export type ProviderPayloadBuilder<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = (input: {
  envelope: TEnvelope;
}) => Promise<ProviderPayloadBuildResult<TProviderPayload>>;

export type ProviderSendExecutor<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
}) => Promise<ProviderSendExecutionResult>;

export type AuditDownstreamHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
  sendExecutionResult: ProviderSendExecutionResult;
  canonicalStatusResult: CanonicalOutboundStatusUpdateResult;
}) => Promise<AuditDownstreamResult>;

export type OutboundOrchestrationHandlers<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = {
  validateSendEligibility?: SendEligibilityValidationHandler<TEnvelope>;
  buildProviderPayload?: ProviderPayloadBuilder<TEnvelope, TProviderPayload>;
  executeProviderSend?: ProviderSendExecutor<TEnvelope, TProviderPayload>;
  updateCanonicalStatus?: CanonicalOutboundStatusUpdateHandler<
    TEnvelope,
    TProviderPayload,
    ProviderSendExecutionResult
  >;
  writeAuditDownstream?: AuditDownstreamHandler<TEnvelope, TProviderPayload>;
};

export type OutboundOrchestrationResult = OutboundSendPipelineResult;
export type OutboundIdempotencyKeyResolver<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
> = (envelope: TEnvelope) => IdempotencyKey;

export type OutboundOrchestrationDependencies<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
> = {
  idempotencyService?: IdempotencyService;
  resolveIdempotencyKey?: OutboundIdempotencyKeyResolver<TEnvelope>;
};
const DEFAULT_IDEMPOTENCY_SERVICE = new NoOpIdempotencyService();

async function defaultValidateSendEligibility<
  TEnvelope extends OutboundSendEnvelope,
>(envelope: TEnvelope) {
  return envelope;
}

async function defaultBuildProviderPayload<
  TEnvelope extends OutboundSendEnvelope,
>(input: {
  envelope: TEnvelope;
}): Promise<ProviderPayloadBuildResult<JsonValue>> {
  return {
    providerPayload: {
      conversation: input.envelope.conversation,
      message: input.envelope.message,
      participants: input.envelope.participants ?? [],
      replyToExternalMessageId: input.envelope.replyToExternalMessageId ?? null,
    },
  };
}

async function defaultExecuteProviderSend(): Promise<ProviderSendExecutionResult> {
  return {
    sendResult: {
      status: "FAILED",
      externalMessageId: null,
      sentAt: null,
    },
    sendStatus: OUTBOUND_SEND_STATUSES.FAILED,
    deliveryState: OUTBOUND_DELIVERY_STATES.FAILED,
    retryability: {
      retryable: false,
      reason: "Provider send execution is not implemented",
    },
    diagnostics: [
      {
        code: "OUTBOUND_SEND_NOT_IMPLEMENTED",
        message: "Provider send execution is not implemented",
      },
    ],
  };
}

async function defaultUpdateCanonicalStatus(input: {
  sendExecutionResult: ProviderSendExecutionResult;
  envelope: OutboundSendEnvelope;
}): Promise<CanonicalOutboundStatusUpdateResult> {
  return {
    workspaceId: input.envelope.workspaceId,
    integrationId: input.envelope.integrationId,
    conversationId: input.envelope.conversationId,
    messageId: input.envelope.messageId,
    sendStatus:
      input.sendExecutionResult.sendStatus ??
      input.sendExecutionResult.sendResult.status,
    updatedMessageStatus:
      input.sendExecutionResult.sendResult.status === "FAILED" ? "FAILED" : "SENT",
    sentAt: input.sendExecutionResult.sendResult.sentAt ?? null,
    providerAcceptedAt:
      input.sendExecutionResult.providerAcceptedAt ??
      input.sendExecutionResult.sendResult.sentAt ??
      null,
    deliveryState:
      input.sendExecutionResult.deliveryState ??
      (input.sendExecutionResult.sendResult.status === "FAILED"
        ? OUTBOUND_DELIVERY_STATES.FAILED
        : OUTBOUND_DELIVERY_STATES.SENT),
    externalMessageId: input.sendExecutionResult.sendResult.externalMessageId ?? null,
    approvalRequestId: input.envelope.approvalContext?.approvalRequestId ?? null,
    retryable: input.sendExecutionResult.retryability?.retryable ?? false,
    retryability: input.sendExecutionResult.retryability,
    diagnostics: input.sendExecutionResult.diagnostics,
  };
}

async function defaultWriteAuditDownstream(): Promise<AuditDownstreamResult> {
  return {
    auditEvents: [],
  };
}

function defaultResolveOutboundIdempotencyKey<
  TEnvelope extends OutboundSendEnvelope,
>(envelope: TEnvelope): IdempotencyKey {
  const logicalKey =
    envelope.idempotencyKey ??
    [
      envelope.workspaceId,
      envelope.integrationId,
      envelope.conversationId,
      envelope.messageId,
      envelope.approvalContext?.approvalRequestId ?? "none",
      "send",
    ].join(":");

  return {
    key: logicalKey,
    scope: IDEMPOTENCY_SCOPES.OUTBOUND,
    workspaceId: envelope.workspaceId,
    integrationId: envelope.integrationId,
    operationType: "send",
    resourceType: "message",
    resourceId: envelope.messageId,
  };
}

function buildDuplicateOutboundResult(
  envelope: OutboundSendEnvelope,
): OutboundOrchestrationResult {
  return {
    workspaceId: envelope.workspaceId,
    integrationId: envelope.integrationId,
    conversationId: envelope.conversationId,
    messageId: envelope.messageId,
    externalMessageId: null,
    sendStatus: OUTBOUND_SEND_STATUSES.REJECTED,
    providerAcceptedAt: null,
    deliveryState: null,
    auditEvents: [],
    diagnostics: [
      {
        code: "OUTBOUND_IDEMPOTENT_DUPLICATE",
        message: "Outbound operation already exists or is in progress",
      },
    ],
    retryable: true,
    retryability: {
      retryable: true,
      reason: "Existing idempotent outbound operation found",
    },
    sendResult: null,
  };
}

export async function runOutboundOrchestration<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
>(
  envelope: TEnvelope,
  handlers: OutboundOrchestrationHandlers<TEnvelope, TProviderPayload> = {},
  dependencies: OutboundOrchestrationDependencies<TEnvelope> = {},
): Promise<OutboundOrchestrationResult> {
  const diagnostics: OutboundDiagnostic[] = [];
  const idempotencyService =
    dependencies.idempotencyService ?? DEFAULT_IDEMPOTENCY_SERVICE;
  const idempotencyKey = (
    dependencies.resolveIdempotencyKey ?? defaultResolveOutboundIdempotencyKey
  )(envelope);

  const idempotencyDecision = await idempotencyService.check(idempotencyKey);

  if (
    idempotencyDecision.decision === IDEMPOTENCY_DECISION_TYPES.ALREADY_PROCESSED ||
    idempotencyDecision.decision === IDEMPOTENCY_DECISION_TYPES.IN_PROGRESS
  ) {
    return buildDuplicateOutboundResult(envelope);
  }

  await idempotencyService.begin({
    key: idempotencyKey,
  });

  try {
    const validatedEnvelope = await (
      handlers.validateSendEligibility ?? defaultValidateSendEligibility
    )(envelope);

    const payloadBuildResult = await (
      handlers.buildProviderPayload ?? defaultBuildProviderPayload
    )({
      envelope: validatedEnvelope,
    });

    if (payloadBuildResult.diagnostics?.length) {
      diagnostics.push(...payloadBuildResult.diagnostics);
    }

    const sendExecutionResult = await (
      handlers.executeProviderSend ?? defaultExecuteProviderSend
    )({
      envelope: validatedEnvelope,
      providerPayload: payloadBuildResult.providerPayload as TProviderPayload,
    });

    if (sendExecutionResult.diagnostics?.length) {
      diagnostics.push(...sendExecutionResult.diagnostics);
    }

    const canonicalStatusResult = await (
      handlers.updateCanonicalStatus ?? defaultUpdateCanonicalStatus
    )({
      envelope: validatedEnvelope,
      providerPayload: payloadBuildResult.providerPayload as TProviderPayload,
      sendExecutionResult,
    });

    if (canonicalStatusResult.diagnostics?.length) {
      diagnostics.push(...canonicalStatusResult.diagnostics);
    }

    const auditDownstreamResult = await (
      handlers.writeAuditDownstream ?? defaultWriteAuditDownstream
    )({
      envelope: validatedEnvelope,
      providerPayload: payloadBuildResult.providerPayload as TProviderPayload,
      sendExecutionResult,
      canonicalStatusResult,
    });

    if (auditDownstreamResult.diagnostics?.length) {
      diagnostics.push(...auditDownstreamResult.diagnostics);
    }

    const result = {
      workspaceId: validatedEnvelope.workspaceId,
      integrationId: validatedEnvelope.integrationId,
      conversationId: validatedEnvelope.conversationId,
      messageId: validatedEnvelope.messageId,
      externalMessageId:
        canonicalStatusResult.externalMessageId ??
        sendExecutionResult.sendResult.externalMessageId ??
        null,
      sendStatus: canonicalStatusResult.sendStatus,
      providerAcceptedAt: canonicalStatusResult.providerAcceptedAt ?? null,
      deliveryState: canonicalStatusResult.deliveryState ?? null,
      auditEvents: auditDownstreamResult.auditEvents,
      diagnostics,
      retryable: canonicalStatusResult.retryable,
      retryability: canonicalStatusResult.retryability,
      sendResult: sendExecutionResult.sendResult,
    } satisfies OutboundOrchestrationResult;

    await idempotencyService.complete({
      key: idempotencyKey,
      resultSummaryJson: {
        workspaceId: result.workspaceId,
        integrationId: result.integrationId,
        conversationId: result.conversationId,
        messageId: result.messageId,
        externalMessageId: result.externalMessageId,
        sendStatus: result.sendStatus,
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
            : { message: "Unknown outbound orchestration error" },
      },
    });

    throw error;
  }
}
