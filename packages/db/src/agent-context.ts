import { getPrisma } from "./client";

export type AgentContextParticipant = {
  id: string;
  externalParticipantId: string | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  isInternal: boolean;
};

export type AgentContextMessage = {
  id: string;
  externalMessageId: string | null;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  senderType: "EXTERNAL" | "USER" | "AGENT" | "SYSTEM";
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
  senderParticipant: AgentContextParticipant | null;
  platformMetadataJson: unknown;
};

export type AgentContextFact = {
  id: string;
  key: string;
  valueText: string;
  confidence: number | null;
  sourceMessageId: string | null;
  createdAt: Date;
};

export type AgentContextApprovalSummary = {
  approvalRequestId: string;
  status: "APPROVED" | "REJECTED";
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  editedContent: string | null;
  draftMessageId: string;
};

export type AgentContextAssignment = {
  id: string;
  goal: string;
  instructions: string | null;
  tone: string | null;
  allowedActionsJson: unknown;
  escalationRulesJson: unknown;
  assignedByUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
};

export type AgentConversationContext = {
  workspaceId: string;
  conversationId: string;
  platform: "EMAIL" | "SLACK";
  state: string;
  subject: string | null;
  assignedAgentId: string | null;
  assignment: AgentContextAssignment | null;
  participants: AgentContextParticipant[];
  recentMessages: AgentContextMessage[];
  facts: AgentContextFact[];
  recentApprovalOutcome: AgentContextApprovalSummary | null;
};

export type BuildAgentConversationContextInput = {
  workspaceId: string;
  conversationId: string;
  messageLimit?: number;
  factLimit?: number;
};

function toParticipant(input: AgentContextParticipant): AgentContextParticipant {
  return input;
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

export async function buildAgentConversationContext(
  input: BuildAgentConversationContextInput,
): Promise<AgentConversationContext> {
  const prisma = getPrisma();
  const messageLimit = Math.max(1, Math.min(input.messageLimit ?? 20, 50));
  const factLimit = Math.max(1, Math.min(input.factLimit ?? 50, 200));

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      workspaceId: input.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      state: true,
      subject: true,
      assignedAgentId: true,
      participants: {
        select: {
          id: true,
          externalParticipantId: true,
          displayName: true,
          email: true,
          handle: true,
          isInternal: true,
        },
        orderBy: [{ isInternal: "asc" }, { createdAt: "asc" }],
      },
      assignedAgent: {
        select: {
          id: true,
          goal: true,
          instructions: true,
          tone: true,
          allowedActionsJson: true,
          escalationRulesJson: true,
          assignedByUserId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          endedAt: true,
        },
      },
      messages: {
        where: {
          deletedAt: null,
        },
        orderBy: [{ createdAt: "desc" }],
        take: messageLimit,
        select: {
          id: true,
          externalMessageId: true,
          direction: true,
          senderType: true,
          bodyText: true,
          bodyHtml: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
          platformMetadataJson: true,
          senderParticipant: {
            select: {
              id: true,
              externalParticipantId: true,
              displayName: true,
              email: true,
              handle: true,
              isInternal: true,
            },
          },
        },
      },
      conversationFacts: {
        orderBy: [{ createdAt: "desc" }],
        take: factLimit,
        select: {
          id: true,
          key: true,
          valueText: true,
          confidence: true,
          sourceMessageId: true,
          createdAt: true,
        },
      },
      approvalRequests: {
        where: {
          status: {
            in: ["APPROVED", "REJECTED"],
          },
        },
        orderBy: [{ reviewedAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          reviewedByUserId: true,
          rejectionReason: true,
          editedContent: true,
          draftMessageId: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found for agent context.");
  }

  return {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    platform: conversation.platform,
    state: conversation.state,
    subject: conversation.subject,
    assignedAgentId: conversation.assignedAgentId,
    assignment: conversation.assignedAgent
      ? {
          ...conversation.assignedAgent,
          allowedActionsJson: toPrismaJsonValue(
            conversation.assignedAgent.allowedActionsJson,
          ),
          escalationRulesJson: toPrismaJsonValue(
            conversation.assignedAgent.escalationRulesJson,
          ),
        }
      : null,
    participants: conversation.participants.map(toParticipant),
    recentMessages: conversation.messages
      .slice()
      .reverse()
      .map((message) => ({
        id: message.id,
        externalMessageId: message.externalMessageId,
        direction: message.direction,
        senderType: message.senderType,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        sentAt: message.sentAt,
        receivedAt: message.receivedAt,
        createdAt: message.createdAt,
        senderParticipant: message.senderParticipant
          ? toParticipant(message.senderParticipant)
          : null,
        platformMetadataJson: toPrismaJsonValue(message.platformMetadataJson),
      })),
    facts: conversation.conversationFacts
      .slice()
      .reverse()
      .map((fact) => ({
        id: fact.id,
        key: fact.key,
        valueText: fact.valueText,
        confidence: fact.confidence,
        sourceMessageId: fact.sourceMessageId,
        createdAt: fact.createdAt,
      })),
    recentApprovalOutcome: conversation.approvalRequests[0]
      ? {
          approvalRequestId: conversation.approvalRequests[0].id,
          status: conversation.approvalRequests[0].status as "APPROVED" | "REJECTED",
          reviewedAt: conversation.approvalRequests[0].reviewedAt,
          reviewedByUserId: conversation.approvalRequests[0].reviewedByUserId,
          rejectionReason: conversation.approvalRequests[0].rejectionReason,
          editedContent: conversation.approvalRequests[0].editedContent,
          draftMessageId: conversation.approvalRequests[0].draftMessageId,
        }
      : null,
  };
}
