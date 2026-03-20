import type {
  OutboundAuditEvent,
  OutboundDiagnostic,
  OutboundRetryability,
  OutboundSendEnvelope,
  OutboundSendPipelineResult,
  OutboundSendStatus,
} from "./outbound";
import type { JsonValue, MessageStatus } from "./types";

export type CanonicalOutboundMessageStatus = MessageStatus;

export type CanonicalOutboundStatusUpdateResult = {
  workspaceId: string;
  integrationId: string;
  conversationId: string;
  messageId: string;
  externalMessageId?: string | null;
  updatedMessageStatus: CanonicalOutboundMessageStatus;
  sendStatus: OutboundSendStatus;
  sentAt?: Date | null;
  providerAcceptedAt?: Date | null;
  deliveryState?: OutboundSendPipelineResult["deliveryState"];
  approvalRequestId?: string | null;
  retryable: boolean;
  retryability?: OutboundRetryability;
  diagnostics?: OutboundDiagnostic[];
};

export type OutboundAuditHandoffResult = {
  messageId: string;
  conversationId: string;
  approvalRequestId?: string | null;
  auditEvents: OutboundAuditEvent[];
  downstreamEvents?: OutboundAuditEvent[];
  diagnostics?: OutboundDiagnostic[];
};

export type OutboundPersistenceResult = {
  canonicalStatus: CanonicalOutboundStatusUpdateResult;
  auditHandoff: OutboundAuditHandoffResult;
};

export type CanonicalOutboundStatusUpdateHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
  TSendExecutionResult = unknown,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
  sendExecutionResult: TSendExecutionResult;
}) => Promise<CanonicalOutboundStatusUpdateResult>;

export type OutboundAuditHandoffHandler<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
  TSendExecutionResult = unknown,
> = (input: {
  envelope: TEnvelope;
  providerPayload: TProviderPayload;
  sendExecutionResult: TSendExecutionResult;
  canonicalStatus: CanonicalOutboundStatusUpdateResult;
}) => Promise<OutboundAuditHandoffResult>;

export interface CanonicalOutboundWriter<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
  TSendExecutionResult = unknown,
> {
  updateCanonicalStatus: CanonicalOutboundStatusUpdateHandler<
    TEnvelope,
    TProviderPayload,
    TSendExecutionResult
  >;
  writeAuditHandoff: OutboundAuditHandoffHandler<
    TEnvelope,
    TProviderPayload,
    TSendExecutionResult
  >;
}

export function buildOutboundPersistenceResult(input: {
  canonicalStatus: CanonicalOutboundStatusUpdateResult;
  auditHandoff: OutboundAuditHandoffResult;
}) {
  return {
    canonicalStatus: input.canonicalStatus,
    auditHandoff: input.auditHandoff,
  } satisfies OutboundPersistenceResult;
}

export function createNoOpCanonicalOutboundWriter<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
  TSendExecutionResult = unknown,
>(): CanonicalOutboundWriter<TEnvelope, TProviderPayload, TSendExecutionResult> {
  return {
    async updateCanonicalStatus(input) {
      return {
        workspaceId: input.envelope.workspaceId,
        integrationId: input.envelope.integrationId,
        conversationId: input.envelope.conversationId,
        messageId: input.envelope.messageId,
        externalMessageId: null,
        updatedMessageStatus: "FAILED",
        sendStatus: "FAILED",
        sentAt: null,
        providerAcceptedAt: null,
        deliveryState: "FAILED",
        approvalRequestId: input.envelope.approvalContext?.approvalRequestId ?? null,
        retryable: false,
      };
    },
    async writeAuditHandoff(input) {
      return {
        messageId: input.envelope.messageId,
        conversationId: input.envelope.conversationId,
        approvalRequestId: input.canonicalStatus.approvalRequestId ?? null,
        auditEvents: [],
      };
    },
  };
}

export function createCanonicalOutboundPersistenceHandlers<
  TEnvelope extends OutboundSendEnvelope = OutboundSendEnvelope,
  TProviderPayload = JsonValue,
  TSendExecutionResult = unknown,
>(
  writer: CanonicalOutboundWriter<TEnvelope, TProviderPayload, TSendExecutionResult>,
) {
  return {
    updateCanonicalStatus: writer.updateCanonicalStatus,
    writeAuditDownstream: async (input: {
      envelope: TEnvelope;
      providerPayload: TProviderPayload;
      sendExecutionResult: TSendExecutionResult;
      canonicalStatusResult: CanonicalOutboundStatusUpdateResult;
    }) => {
      const auditHandoff = await writer.writeAuditHandoff({
        envelope: input.envelope,
        providerPayload: input.providerPayload,
        sendExecutionResult: input.sendExecutionResult,
        canonicalStatus: input.canonicalStatusResult,
      });

      return {
        auditEvents: auditHandoff.auditEvents,
        diagnostics: auditHandoff.diagnostics,
      };
    },
  };
}
