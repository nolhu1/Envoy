import {
  buildSlackReplyPayload,
  canIntegrationSend,
  createCanonicalOutboundPersistenceHandlers,
  runOutboundOrchestration,
  SlackConnector,
  type ConnectorContext,
  type OutboundDiagnostic,
  type OutboundSendEnvelope,
  type OutboundSendInput,
  type ProviderSendExecutionResult,
} from "../../../../packages/connectors/src/index";
import {
  createPrismaCanonicalOutboundWriter,
  createPrismaIdempotencyService,
  getPrisma,
  resolveConnectorContextForWorkspaceIntegration,
} from "../../../../packages/db/src/index";

import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "./event-publisher";
import { sanitizeDiagnostics } from "./security";

type JsonObject = Record<string, unknown>;

type SendWorkspaceSlackReplyResult = {
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
const slackSendIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "web:slack-send",
});
const slackConnector = new SlackConnector();

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRetryabilityFromDiagnostics(diagnostics: unknown) {
  if (!isJsonObject(diagnostics)) {
    return {
      retryable: false,
    };
  }

  const retryable =
    diagnostics.retryable === true ||
    diagnostics.errorCode === "rate_limited" ||
    (typeof diagnostics.error === "string" && diagnostics.error.includes("429"));
  const retryAfterSeconds =
    typeof diagnostics.retryAfterSeconds === "number" &&
    Number.isFinite(diagnostics.retryAfterSeconds)
      ? diagnostics.retryAfterSeconds
      : null;

  return {
    retryable,
    retryAfterSeconds,
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
  if (message.platform !== "SLACK" || message.conversation.platform !== "SLACK") {
    throw new Error("Only Slack outbound messages can be sent through Slack.");
  }

  if (message.direction !== "OUTBOUND") {
    throw new Error("Only outbound messages can be sent through Slack.");
  }

  if (!SENDABLE_OUTBOUND_STATUSES.has(message.status)) {
    throw new Error("This message is not in a sendable outbound status.");
  }

  if (!message.conversation.externalConversationId) {
    throw new Error("The conversation does not map to a Slack DM.");
  }

  if (!canIntegrationSend(message.conversation.integration.status)) {
    throw new Error("The Slack integration is not currently send-capable.");
  }

  const integrationMetadata = isJsonObject(message.conversation.integration.platformMetadataJson)
    ? message.conversation.integration.platformMetadataJson
    : null;

  if (integrationMetadata?.provider !== "slack") {
    throw new Error("This conversation is not connected to a Slack integration.");
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

function toReplyToExternalMessageId(message: SendableMessageRecord) {
  const metadata = isJsonObject(message.platformMetadataJson)
    ? message.platformMetadataJson
    : null;

  return typeof metadata?.replyToExternalMessageId === "string"
    ? metadata.replyToExternalMessageId
    : null;
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
      actionType: "slack.send.requested",
      metadataJson: {
        provider: "slack",
        messageId: input.messageId,
        conversationId: input.conversationId,
      } as never,
    },
  });
}

export async function sendWorkspaceSlackReply(input: {
  workspaceId: string;
  actorUserId: string;
  messageId: string;
}): Promise<SendWorkspaceSlackReplyResult> {
  const message = await getSendableMessage({
    workspaceId: input.workspaceId,
    messageId: input.messageId,
  });

  if (!message) {
    throw new Error("The requested outbound message could not be loaded.");
  }

  assertSendableMessage(message);

  const connectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: input.workspaceId,
    integrationId: message.conversation.integration.id,
  });

  if (!connectorContext) {
    throw new Error("The Slack connector context could not be resolved.");
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
    replyToExternalMessageId: toReplyToExternalMessageId(message),
    actorContext: {
      actorType: "USER",
      actorId: input.actorUserId,
    },
    approvalContext,
    requestedAt: new Date(),
    idempotencyKey: [
      "slack",
      "send",
      input.workspaceId,
      message.conversation.integration.id,
      message.conversation.id,
      message.id,
      approvalContext?.approvalRequestId ?? "manual",
    ].join(":"),
  };

  const writer = createPrismaCanonicalOutboundWriter({
    workspaceId: input.workspaceId,
  });
  const persistenceHandlers = createCanonicalOutboundPersistenceHandlers(writer);
  let requestedAuditLogged = false;

  const result = await runOutboundOrchestration(
    envelope,
    {
      async validateSendEligibility(validatedEnvelope: OutboundSendEnvelope) {
        assertSendableMessage(message);
        return validatedEnvelope;
      },
      async buildProviderPayload() {
        return {
          providerPayload: buildSlackReplyPayload(outboundInput),
        };
      },
      async executeProviderSend(): Promise<ProviderSendExecutionResult> {
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

        const sendResult = await slackConnector.sendMessage({
          ...outboundInput,
          context: connectorContext,
          replyToExternalMessageId: envelope.replyToExternalMessageId ?? null,
        });

        return {
          sendResult,
          sendStatus: sendResult.status,
          providerAcceptedAt: sendResult.sentAt ?? null,
          deliveryState: sendResult.status === "FAILED" ? "FAILED" : "SENT",
          retryability: toRetryabilityFromDiagnostics(sendResult.diagnosticsJson),
          diagnostics: sendResult.diagnosticsJson
            ? [
                {
                  message:
                    sendResult.status === "FAILED"
                      ? "Slack send failed."
                      : "Slack send completed.",
                  details: sanitizeDiagnostics(sendResult.diagnosticsJson) as never,
                } satisfies OutboundDiagnostic,
              ]
            : undefined,
        } satisfies ProviderSendExecutionResult;
      },
      updateCanonicalStatus: persistenceHandlers.updateCanonicalStatus,
      writeAuditDownstream: persistenceHandlers.writeAuditDownstream,
    },
    {
      idempotencyService: slackSendIdempotencyService,
    },
  );

  const isIdempotentDuplicate = result.diagnostics?.some(
    (diagnostic) => diagnostic.code === "OUTBOUND_IDEMPOTENT_DUPLICATE",
  ) === true;

  if (result.sendStatus !== "REJECTED" && !isIdempotentDuplicate) {
    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType:
          result.sendStatus === "FAILED"
            ? ENVOY_EVENT_TYPES.MESSAGE_SEND_FAILED
            : ENVOY_EVENT_TYPES.MESSAGE_SENT,
        workspaceId: input.workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.MESSAGE,
        entityId: result.messageId,
        source: ENVOY_EVENT_SOURCES.API,
        payload: {
          conversationId: result.conversationId,
          messageId: result.messageId,
          integrationId: result.integrationId,
          platform: "SLACK",
          externalMessageId: result.externalMessageId ?? null,
          senderType: message.senderType,
          direction: message.direction,
          status: result.sendStatus === "FAILED" ? "FAILED" : "SENT",
          metadata: {
            provider: "slack",
          },
        },
      }),
    );
  }

  return {
    integrationId: result.integrationId,
    conversationId: result.conversationId,
    messageId: result.messageId,
    externalMessageId: result.externalMessageId ?? null,
    sendStatus: result.sendStatus,
  };
}

export async function sendCurrentWorkspaceSlackReply(input: {
  messageId: string;
}) {
  const permissionsPath = "./permissions";
  const importPermissions = (specifier: string) => import(specifier) as Promise<{
    PERMISSIONS: {
      SEND_MESSAGES: "send_messages";
    };
    requirePermission: (permission: "send_messages") => Promise<{
      workspaceId: string;
      userId: string;
    }>;
  }>;
  const { PERMISSIONS, requirePermission } = await importPermissions(
    permissionsPath,
  );
  const authContext = await requirePermission(PERMISSIONS.SEND_MESSAGES);

  return sendWorkspaceSlackReply({
    workspaceId: authContext.workspaceId,
    actorUserId: authContext.userId,
    messageId: input.messageId,
  });
}
