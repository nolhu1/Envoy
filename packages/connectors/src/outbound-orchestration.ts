import {
  OUTBOUND_DELIVERY_STATES,
  OUTBOUND_SEND_STATUSES,
  type OutboundAuditEvent,
  type OutboundDiagnostic,
  type OutboundRetryability,
  type OutboundSendEnvelope,
  type OutboundSendPipelineResult,
  type OutboundSendStatus,
} from "./outbound";
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

export type CanonicalStatusUpdateResult = {
  sendStatus: OutboundSendStatus;
  providerAcceptedAt?: Date | null;
  deliveryState?: OutboundSendPipelineResult["deliveryState"];
  externalMessageId?: string | null;
  retryable: boolean;
  retryability?: OutboundRetryability;
  diagnostics?: OutboundDiagnostic[];
};

export type AuditDownstreamResult = {
  auditEvents: OutboundAuditEvent[];
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

export type CanonicalStatusUpdateHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
  sendExecutionResult: ProviderSendExecutionResult;
}) => Promise<CanonicalStatusUpdateResult>;

export type AuditDownstreamHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
  sendExecutionResult: ProviderSendExecutionResult;
  canonicalStatusResult: CanonicalStatusUpdateResult;
}) => Promise<AuditDownstreamResult>;

export type OutboundOrchestrationHandlers<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
> = {
  validateSendEligibility?: SendEligibilityValidationHandler<TEnvelope>;
  buildProviderPayload?: ProviderPayloadBuilder<TEnvelope, TProviderPayload>;
  executeProviderSend?: ProviderSendExecutor<TEnvelope, TProviderPayload>;
  updateCanonicalStatus?: CanonicalStatusUpdateHandler<TEnvelope, TProviderPayload>;
  writeAuditDownstream?: AuditDownstreamHandler<TEnvelope, TProviderPayload>;
};

export type OutboundOrchestrationResult = OutboundSendPipelineResult;

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
}): Promise<CanonicalStatusUpdateResult> {
  return {
    sendStatus:
      input.sendExecutionResult.sendStatus ??
      input.sendExecutionResult.sendResult.status,
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

export async function runOutboundOrchestration<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
>(
  envelope: TEnvelope,
  handlers: OutboundOrchestrationHandlers<TEnvelope, TProviderPayload> = {},
): Promise<OutboundOrchestrationResult> {
  const diagnostics: OutboundDiagnostic[] = [];

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

  return {
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
  };
}
