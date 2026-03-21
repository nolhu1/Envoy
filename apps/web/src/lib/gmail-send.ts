import "server-only";

import {
  buildGmailReplyPayload,
  canIntegrationSend,
  createCanonicalOutboundPersistenceHandlers,
  GmailConnector,
  InMemoryIdempotencyService,
  runOutboundOrchestration,
  type ConnectorContext,
  type OutboundDiagnostic,
  type OutboundSendEnvelope,
  type OutboundSendInput,
  type OAuthAuthMaterial,
  type ProviderSendExecutionResult,
} from "@envoy/connectors";
import {
  createPrismaCanonicalOutboundWriter,
  getPrisma,
  rotateSecret,
  resolveConnectorContextForWorkspaceIntegration,
} from "@envoy/db";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";

type JsonObject = Record<string, unknown>;

type SendWorkspaceGmailReplyResult = {
  integrationId: string;
  conversationId: string;
  messageId: string;
  externalMessageId: string | null;
  sendStatus: string;
};

type SendableMessageRecord = {
  id: string;
  workspaceId: string;
  conversationId: string;
  platform: "EMAIL" | "SLACK";
  externalMessageId: string | null;
  senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  bodyText: string | null;
  bodyHtml: string | null;
  status:
    | "RECEIVED"
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "QUEUED"
    | "SENT"
    | "DELIVERED"
    | "FAILED";
  platformMetadataJson: unknown;
  conversation: {
    id: string;
    workspaceId: string;
    integrationId: string;
    platform: "EMAIL" | "SLACK";
    externalConversationId: string;
    subject: string | null;
    platformMetadataJson: unknown;
    integration: {
      id: string;
      workspaceId: string;
      platform: "EMAIL" | "SLACK";
      status: "PENDING" | "CONNECTED" | "SYNC_IN_PROGRESS" | "ERROR" | "DISCONNECTED";
      platformMetadataJson: unknown;
    };
    participants: Array<{
      id: string;
      externalParticipantId: string | null;
      displayName: string | null;
      email: string | null;
      handle: string | null;
      isInternal: boolean;
      platformMetadataJson: unknown;
    }>;
  };
  approvalRequests: Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    reviewedAt: Date | null;
  }>;
};

const SENDABLE_OUTBOUND_STATUSES = new Set(["DRAFT", "APPROVED", "QUEUED"]);
const gmailSendIdempotencyService = new InMemoryIdempotencyService();
const gmailConnector = new GmailConnector();

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOauthAuthMaterial(
  authMaterial: ConnectorContext["authMaterial"],
): authMaterial is OAuthAuthMaterial {
  return authMaterial?.type === "oauth";
}

function shouldRefreshOAuthMaterial(authMaterial: OAuthAuthMaterial) {
  if (!authMaterial.expiresAt) {
    return false;
  }

  const expiresAt =
    authMaterial.expiresAt instanceof Date
      ? authMaterial.expiresAt
      : new Date(authMaterial.expiresAt);

  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now() + 60_000;
}

function isGmailUnauthorizedSendResult(result: ProviderSendExecutionResult) {
  const diagnostics = result.sendResult.diagnosticsJson;

  return (
    result.sendResult.status === "FAILED" &&
    isJsonObject(diagnostics) &&
    typeof diagnostics.error === "string" &&
    diagnostics.error.includes("status 401")
  );
}

async function refreshGmailConnectorContext(
  connectorContext: NonNullable<
    Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
  >,
) {
  if (!connectorContext.secretRef?.id) {
    throw new Error("Gmail integration secret reference could not be resolved.");
  }

  const refreshed = await gmailConnector.refreshAuth({
    context: connectorContext,
  });

  if (!refreshed.authMaterial || !isOauthAuthMaterial(refreshed.authMaterial)) {
    throw new Error("Gmail OAuth refresh did not return valid auth material.");
  }

  await rotateSecret({
    secretRef: connectorContext.secretRef.id,
    workspaceId: connectorContext.workspaceId,
    integrationId: connectorContext.integrationId ?? null,
    secretType: "gmail_oauth",
    payload: refreshed.authMaterial,
  });

  return {
    ...connectorContext,
    authMaterial: refreshed.authMaterial,
    secretRef: connectorContext.secretRef,
  };
}

async function getSendableMessage(input: {
  workspaceId: string;
  messageId: string;
}) {
  const prisma = getPrisma();

  return prisma.message.findFirst({
    where: {
      id: input.messageId,
      workspaceId: input.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      platform: true,
      externalMessageId: true,
      senderType: true,
      direction: true,
      bodyText: true,
      bodyHtml: true,
      status: true,
      platformMetadataJson: true,
      conversation: {
        select: {
          id: true,
          workspaceId: true,
          integrationId: true,
          platform: true,
          externalConversationId: true,
          subject: true,
          platformMetadataJson: true,
          integration: {
            select: {
              id: true,
              workspaceId: true,
              platform: true,
              status: true,
              platformMetadataJson: true,
            },
          },
          participants: {
            select: {
              id: true,
              externalParticipantId: true,
              displayName: true,
              email: true,
              handle: true,
              isInternal: true,
              platformMetadataJson: true,
            },
          },
        },
      },
      approvalRequests: {
        select: {
          id: true,
          status: true,
          reviewedAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      },
    },
  }) as Promise<SendableMessageRecord | null>;
}

function assertSendableMessage(message: SendableMessageRecord) {
  if (message.direction !== "OUTBOUND") {
    throw new Error("Only outbound messages can be sent through Gmail.");
  }

  if (!SENDABLE_OUTBOUND_STATUSES.has(message.status)) {
    throw new Error("This message is not in a sendable outbound status.");
  }

  if (!message.conversation.externalConversationId) {
    throw new Error("The conversation does not map to a Gmail thread.");
  }

  if (!canIntegrationSend(message.conversation.integration.status)) {
    throw new Error("The Gmail integration is not currently send-capable.");
  }

  const integrationMetadata = isJsonObject(message.conversation.integration.platformMetadataJson)
    ? message.conversation.integration.platformMetadataJson
    : null;

  if (integrationMetadata?.provider !== "gmail") {
    throw new Error("This conversation is not connected to a Gmail integration.");
  }

  const latestApproval = message.approvalRequests[0] ?? null;

  if (latestApproval && latestApproval.status !== "APPROVED") {
    throw new Error("This draft requires approval before it can be sent.");
  }
}

function toOutboundSendInput(input: {
  connectorContext: ConnectorContext;
  message: SendableMessageRecord;
}): OutboundSendInput {
  return {
    context: input.connectorContext,
    conversation: {
      externalConversationId: input.message.conversation.externalConversationId,
      platform: input.message.conversation.platform,
      subject: input.message.conversation.subject,
      platformMetadataJson: input.message.conversation.platformMetadataJson as never,
    },
    message: {
      bodyText: input.message.bodyText,
      bodyHtml: input.message.bodyHtml,
      direction: input.message.direction,
      senderType: input.message.senderType,
      platformMetadataJson: input.message.platformMetadataJson as never,
    },
    participants: input.message.conversation.participants.map((participant) => ({
      externalParticipantId: participant.externalParticipantId,
      platform: input.message.conversation.platform,
      displayName: participant.displayName,
      email: participant.email,
      handle: participant.handle,
      isInternal: participant.isInternal,
      platformMetadataJson: participant.platformMetadataJson as never,
    })),
  };
}

function toApprovalContext(message: SendableMessageRecord) {
  const latestApproval = message.approvalRequests[0] ?? null;

  if (!latestApproval) {
    return null;
  }

  return {
    approvalRequestId: latestApproval.id,
    approvalStatus: latestApproval.status,
    approvedAt: latestApproval.reviewedAt,
  };
}

async function createSendRequestedAuditLog(input: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  approvalRequestId?: string | null;
  actorUserId: string;
}) {
  const prisma = getPrisma();

  await prisma.actionLog.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      approvalRequestId: input.approvalRequestId ?? null,
      actorType: "USER",
      actorUserId: input.actorUserId,
      actionType: "gmail.send.requested",
      metadataJson: {
        provider: "gmail",
        messageId: input.messageId,
        conversationId: input.conversationId,
      } as never,
    },
  });
}

export async function sendWorkspaceGmailReply(input: {
  workspaceId: string;
  actorUserId: string;
  messageId: string;
}): Promise<SendWorkspaceGmailReplyResult> {
  const message = await getSendableMessage({
    workspaceId: input.workspaceId,
    messageId: input.messageId,
  });

  if (!message) {
    throw new Error("The requested outbound message could not be loaded.");
  }

  assertSendableMessage(message);

  const resolvedConnectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: message.conversation.integration.id,
  });

  if (!resolvedConnectorContext) {
    throw new Error("The Gmail connector context could not be resolved.");
  }

  let connectorContext = resolvedConnectorContext;

  if (
    isOauthAuthMaterial(connectorContext.authMaterial) &&
    shouldRefreshOAuthMaterial(connectorContext.authMaterial)
  ) {
    connectorContext = await refreshGmailConnectorContext(connectorContext);
  }

  const outboundInput = toOutboundSendInput({
    connectorContext,
    message,
  });
  const approvalContext = toApprovalContext(message);
  const envelope: OutboundSendEnvelope = {
    workspaceId: input.workspaceId,
    integrationId: message.conversation.integration.id,
    conversationId: message.conversation.id,
    messageId: message.id,
    connectorContext,
    conversation: outboundInput.conversation,
    message: outboundInput.message,
    participants: outboundInput.participants,
    replyToExternalMessageId: null,
    actorContext: {
      actorType: "USER",
      actorId: input.actorUserId,
    },
    approvalContext,
    requestedAt: new Date(),
  };

  const writer = createPrismaCanonicalOutboundWriter({
    workspaceId: input.workspaceId,
  });
  const persistenceHandlers = createCanonicalOutboundPersistenceHandlers(writer);
  let requestedAuditLogged = false;

  const executeProviderSend = async (
    sendEnvelope: OutboundSendEnvelope,
  ): Promise<ProviderSendExecutionResult> => {
    const attemptSend = async (context: ConnectorContext) => {
      if (!requestedAuditLogged) {
        await createSendRequestedAuditLog({
          workspaceId: input.workspaceId,
          conversationId: message.conversation.id,
          messageId: message.id,
          approvalRequestId: approvalContext?.approvalRequestId ?? null,
          actorUserId: input.actorUserId,
        });
        requestedAuditLogged = true;
      }

      const sendResult = await gmailConnector.sendMessage({
        ...outboundInput,
        context,
      });

      return {
        sendResult,
        sendStatus: sendResult.status,
        providerAcceptedAt: sendResult.sentAt ?? null,
        deliveryState: sendResult.status === "FAILED" ? "FAILED" : "SENT",
        retryability: {
          retryable: false,
        },
        diagnostics: sendResult.diagnosticsJson
          ? [
              {
                message:
                  sendResult.status === "FAILED"
                    ? "Gmail send failed."
                    : "Gmail send completed.",
                details: sendResult.diagnosticsJson,
              } satisfies OutboundDiagnostic,
            ]
          : undefined,
      } satisfies ProviderSendExecutionResult;
    };

    let firstAttempt = await attemptSend(sendEnvelope.connectorContext);

    if (
      !isGmailUnauthorizedSendResult(firstAttempt) ||
      !isOauthAuthMaterial(sendEnvelope.connectorContext.authMaterial) ||
      !sendEnvelope.connectorContext.authMaterial.refreshToken
    ) {
      return firstAttempt;
    }

    connectorContext = await refreshGmailConnectorContext(
      sendEnvelope.connectorContext as NonNullable<
        Awaited<ReturnType<typeof resolveConnectorContextForWorkspaceIntegration>>
      >,
    );

    sendEnvelope.connectorContext = connectorContext;
    firstAttempt = await attemptSend(connectorContext);

    return firstAttempt;
  };

  const result = await runOutboundOrchestration(
    envelope,
    {
      async validateSendEligibility(validatedEnvelope: OutboundSendEnvelope) {
        assertSendableMessage(message);
        return validatedEnvelope;
      },
      async buildProviderPayload() {
        return {
          providerPayload: buildGmailReplyPayload(outboundInput),
        };
      },
      async executeProviderSend({
        envelope: sendEnvelope,
      }: {
        envelope: OutboundSendEnvelope;
      }) {
        return executeProviderSend(sendEnvelope);
      },
      updateCanonicalStatus: persistenceHandlers.updateCanonicalStatus,
      writeAuditDownstream: persistenceHandlers.writeAuditDownstream,
    },
    {
      idempotencyService: gmailSendIdempotencyService,
    },
  );

  return {
    integrationId: result.integrationId,
    conversationId: result.conversationId,
    messageId: result.messageId,
    externalMessageId: result.externalMessageId ?? null,
    sendStatus: result.sendStatus,
  };
}

export async function sendCurrentWorkspaceGmailReply(input: {
  messageId: string;
}) {
  const authContext = await requirePermission(PERMISSIONS.SEND_MESSAGES);

  return sendWorkspaceGmailReply({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    messageId: input.messageId,
  });
}
