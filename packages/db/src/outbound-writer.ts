import type {
  CanonicalOutboundWriter,
  OutboundAuditEvent,
  OutboundSendEnvelope,
  ProviderSendExecutionResult,
} from "../../connectors/src";

import { getPrisma } from "./client";

type WriterOptions = {
  workspaceId: string;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeJson(
  current: unknown,
  next: Record<string, unknown>,
) {
  if (isJsonObject(current)) {
    return {
      ...current,
      ...next,
    };
  }

  return next;
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

function toCanonicalMessageStatus(
  input: ProviderSendExecutionResult,
) {
  return input.sendResult.status === "FAILED" ? "FAILED" : "SENT";
}

function toDeliveryState(
  input: ProviderSendExecutionResult,
) {
  return input.deliveryState ?? (input.sendResult.status === "FAILED" ? "FAILED" : "SENT");
}

function toAuditEvents(input: {
  sendStatus: "ACCEPTED" | "QUEUED" | "FAILED" | "REJECTED";
  messageId: string;
  conversationId: string;
  approvalRequestId?: string | null;
  externalMessageId?: string | null;
}): OutboundAuditEvent[] {
  return [
    {
      eventName:
        input.sendStatus === "FAILED"
          ? "gmail.send.failed"
          : "gmail.send.succeeded",
      occurredAt: new Date(),
      payload: {
        provider: "gmail",
        messageId: input.messageId,
        conversationId: input.conversationId,
        approvalRequestId: input.approvalRequestId ?? null,
        externalMessageId: input.externalMessageId ?? null,
        sendStatus: input.sendStatus,
      },
    },
  ];
}

export function createPrismaCanonicalOutboundWriter(
  options: WriterOptions,
): CanonicalOutboundWriter<
  OutboundSendEnvelope,
  unknown,
  ProviderSendExecutionResult
> {
  return {
    async updateCanonicalStatus(input) {
      const prisma = getPrisma();
      const currentMessage = await prisma.message.findFirst({
        where: {
          id: input.envelope.messageId,
          workspaceId: options.workspaceId,
          conversationId: input.envelope.conversationId,
          deletedAt: null,
        },
        select: {
          id: true,
          platformMetadataJson: true,
        },
      });

      if (!currentMessage) {
        throw new Error("Outbound message could not be loaded for update.");
      }

      const updatedMessageStatus = toCanonicalMessageStatus(input.sendExecutionResult);
      const sentAt =
        input.sendExecutionResult.sendResult.sentAt ??
        input.sendExecutionResult.providerAcceptedAt ??
        null;
      const externalMessageId =
        input.sendExecutionResult.sendResult.externalMessageId ?? null;

      await prisma.message.update({
        where: {
          id: currentMessage.id,
        },
        data: {
          status: updatedMessageStatus,
          externalMessageId,
          sentAt,
          platformMetadataJson: toPrismaJsonValue(mergeJson(
            currentMessage.platformMetadataJson,
            {
              lastSendProvider: "gmail",
              lastSendStatus: input.sendExecutionResult.sendResult.status,
              lastSendAttemptedAt: new Date().toISOString(),
              lastSendExternalMessageId: externalMessageId,
              lastSendProviderResponse:
                input.sendExecutionResult.sendResult.providerResponseJson ?? null,
              lastSendDiagnostics:
                input.sendExecutionResult.sendResult.diagnosticsJson ?? null,
            },
          )),
        },
      });

      return {
        workspaceId: input.envelope.workspaceId,
        integrationId: input.envelope.integrationId,
        conversationId: input.envelope.conversationId,
        messageId: input.envelope.messageId,
        externalMessageId,
        updatedMessageStatus,
        sendStatus:
          input.sendExecutionResult.sendStatus ??
          input.sendExecutionResult.sendResult.status,
        sentAt,
        providerAcceptedAt:
          input.sendExecutionResult.providerAcceptedAt ??
          input.sendExecutionResult.sendResult.sentAt ??
          null,
        deliveryState: toDeliveryState(input.sendExecutionResult),
        approvalRequestId: input.envelope.approvalContext?.approvalRequestId ?? null,
        retryable: input.sendExecutionResult.retryability?.retryable ?? false,
        retryability: input.sendExecutionResult.retryability,
        diagnostics: input.sendExecutionResult.diagnostics,
      };
    },
    async writeAuditHandoff(input) {
      const prisma = getPrisma();
      const auditEvents = toAuditEvents({
        sendStatus: input.canonicalStatus.sendStatus,
        messageId: input.envelope.messageId,
        conversationId: input.envelope.conversationId,
        approvalRequestId: input.canonicalStatus.approvalRequestId ?? null,
        externalMessageId: input.canonicalStatus.externalMessageId ?? null,
      });

      for (const event of auditEvents) {
        await prisma.actionLog.create({
          data: {
            workspaceId: input.envelope.workspaceId,
            conversationId: input.envelope.conversationId,
            messageId: input.envelope.messageId,
            approvalRequestId: input.canonicalStatus.approvalRequestId ?? null,
            actorType:
              input.envelope.actorContext?.actorType === "AGENT"
                ? "AGENT"
                : input.envelope.actorContext?.actorType === "SYSTEM"
                  ? "SYSTEM"
                  : "USER",
            actorUserId:
              input.envelope.actorContext?.actorType === "USER"
                ? input.envelope.actorContext.actorId ?? null
                : null,
            actionType: event.eventName,
            metadataJson: toPrismaJsonValue(event.payload),
          },
        });
      }

      return {
        messageId: input.envelope.messageId,
        conversationId: input.envelope.conversationId,
        approvalRequestId: input.canonicalStatus.approvalRequestId ?? null,
        auditEvents,
      };
    },
  };
}
