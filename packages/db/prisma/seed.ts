import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Platform, IntegrationStatus, WorkspaceUserRole, ConversationState, SenderType, MessageDirection, MessageStatus, ApprovalStatus, ActorType } from "@prisma/client"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

async function main() {
  await prisma.actionLog.deleteMany()
  await prisma.approvalRequest.deleteMany()
  await prisma.conversationFact.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.message.deleteMany()
  await prisma.participant.deleteMany()
  await prisma.agentAssignment.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.integration.deleteMany()
  await prisma.user.deleteMany()
  await prisma.workspace.deleteMany()

  const workspace = await prisma.workspace.create({
    data: {
      name: "Envoy Demo Workspace",
      settingsJson: {
        timezone: "America/New_York",
        draftApprovalRequired: true
      }
    }
  })

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "owner@envoydemo.com",
      name: "Demo Owner",
      role: WorkspaceUserRole.ADMIN
    }
  })

  const emailIntegration = await prisma.integration.create({
    data: {
      workspaceId: workspace.id,
      platform: Platform.EMAIL,
      displayName: "Demo Gmail",
      externalAccountId: "gmail-demo-account-1",
      authType: "oauth",
      status: IntegrationStatus.CONNECTED,
      platformMetadataJson: {
        provider: "gmail",
        connectedAddress: "owner@envoydemo.com"
      }
    }
  })

  const slackIntegration = await prisma.integration.create({
    data: {
      workspaceId: workspace.id,
      platform: Platform.SLACK,
      displayName: "Demo Slack",
      externalAccountId: "slack-demo-workspace-1",
      authType: "oauth",
      status: IntegrationStatus.CONNECTED,
      platformMetadataJson: {
        provider: "slack",
        teamName: "Envoy Demo Team"
      }
    }
  })

  const emailConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      integrationId: emailIntegration.id,
      platform: Platform.EMAIL,
      externalConversationId: "gmail-thread-1001",
      subject: "Pricing and onboarding questions",
      state: ConversationState.AWAITING_APPROVAL,
      lastMessageAt: new Date("2026-03-16T17:30:00.000Z"),
      openedAt: new Date("2026-03-16T16:55:00.000Z")
    }
  })

  const slackConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      integrationId: slackIntegration.id,
      platform: Platform.SLACK,
      externalConversationId: "D12345:1742145300.000100",
      subject: null,
      state: ConversationState.ACTIVE,
      lastMessageAt: new Date("2026-03-16T18:05:00.000Z"),
      openedAt: new Date("2026-03-16T17:40:00.000Z")
    }
  })

  const emailExternalParticipant = await prisma.participant.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      platform: Platform.EMAIL,
      externalParticipantId: "lead-jane@example.com",
      displayName: "Jane Carter",
      email: "jane@acmeexample.com",
      isInternal: false,
      rawPayloadJson: {
        from: "Jane Carter <jane@acmeexample.com>"
      }
    }
  })

  const emailInternalParticipant = await prisma.participant.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      platform: Platform.EMAIL,
      externalParticipantId: "owner@envoydemo.com",
      displayName: "Demo Owner",
      email: "owner@envoydemo.com",
      isInternal: true
    }
  })

  const slackExternalParticipant = await prisma.participant.create({
    data: {
      workspaceId: workspace.id,
      conversationId: slackConversation.id,
      platform: Platform.SLACK,
      externalParticipantId: "U_EXTERNAL_1",
      displayName: "Chris Lee",
      handle: "chris",
      isInternal: false,
      rawPayloadJson: {
        slackUserId: "U_EXTERNAL_1"
      }
    }
  })

  const slackInternalParticipant = await prisma.participant.create({
    data: {
      workspaceId: workspace.id,
      conversationId: slackConversation.id,
      platform: Platform.SLACK,
      externalParticipantId: "U_INTERNAL_1",
      displayName: "Demo Owner",
      handle: "demo-owner",
      isInternal: true
    }
  })

  const inboundEmail = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      platform: Platform.EMAIL,
      externalMessageId: "gmail-msg-2001",
      senderParticipantId: emailExternalParticipant.id,
      senderType: SenderType.EXTERNAL,
      direction: MessageDirection.INBOUND,
      bodyText: "Hi, I would like to understand pricing and whether setup support is included.",
      bodyHtml: "<p>Hi, I would like to understand pricing and whether setup support is included.</p>",
      status: MessageStatus.RECEIVED,
      receivedAt: new Date("2026-03-16T16:55:00.000Z"),
      rawPayloadJson: {
        provider: "gmail"
      }
    }
  })

  const draftEmailReply = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      platform: Platform.EMAIL,
      externalMessageId: "draft-email-1",
      senderParticipantId: emailInternalParticipant.id,
      senderType: SenderType.AGENT,
      direction: MessageDirection.OUTBOUND,
      bodyText: "Thanks for reaching out. I can walk you through pricing and onboarding support. Could you share your team size and timeline?",
      bodyHtml: "<p>Thanks for reaching out. I can walk you through pricing and onboarding support. Could you share your team size and timeline?</p>",
      status: MessageStatus.PENDING_APPROVAL
    }
  })

  const slackInbound = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: slackConversation.id,
      platform: Platform.SLACK,
      externalMessageId: "1742145300.000100",
      senderParticipantId: slackExternalParticipant.id,
      senderType: SenderType.EXTERNAL,
      direction: MessageDirection.INBOUND,
      bodyText: "Can you send me the setup steps again?",
      status: MessageStatus.RECEIVED,
      receivedAt: new Date("2026-03-16T17:40:00.000Z"),
      rawPayloadJson: {
        provider: "slack"
      }
    }
  })

  const slackReply = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: slackConversation.id,
      platform: Platform.SLACK,
      externalMessageId: "1742145600.000200",
      senderParticipantId: slackInternalParticipant.id,
      senderType: SenderType.USER,
      direction: MessageDirection.OUTBOUND,
      bodyText: "Yes. I’ll resend the setup steps here in a moment.",
      status: MessageStatus.SENT,
      sentAt: new Date("2026-03-16T18:05:00.000Z")
    }
  })

  const agentAssignment = await prisma.agentAssignment.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      goal: "Qualify inbound lead and gather onboarding requirements",
      instructions: "Keep replies short, helpful, and focused on qualification.",
      tone: "Professional and concise",
      allowedActionsJson: ["reply_draft", "ask_question", "escalate", "wait"],
      escalationRulesJson: {
        escalateIfPricingNegotiation: true,
        escalateIfLegalReviewRequested: true
      },
      assignedByUserId: user.id,
      isActive: true
    }
  })

  await prisma.conversation.update({
    where: { id: emailConversation.id },
    data: { assignedAgentId: agentAssignment.id }
  })

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      workspaceId: workspace.id,
      conversationId: emailConversation.id,
      draftMessageId: draftEmailReply.id,
      proposedByAgentAssignmentId: agentAssignment.id,
      status: ApprovalStatus.PENDING
    }
  })

  await prisma.conversationFact.createMany({
    data: [
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        sourceMessageId: inboundEmail.id,
        key: "lead_company",
        valueText: "Acme Example",
        confidence: 0.66
      },
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        sourceMessageId: inboundEmail.id,
        key: "interest_topic",
        valueText: "pricing and onboarding support",
        confidence: 0.95
      }
    ]
  })

  await prisma.actionLog.createMany({
    data: [
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        actorType: ActorType.INTEGRATION,
        messageId: inboundEmail.id,
        actionType: "MESSAGE_INGESTED",
        metadataJson: { platform: "EMAIL" }
      },
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        actorType: ActorType.USER,
        actorUserId: user.id,
        actionType: "AGENT_ASSIGNED",
        metadataJson: { agentAssignmentId: agentAssignment.id }
      },
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        actorType: ActorType.AGENT,
        actorAgentAssignmentId: agentAssignment.id,
        messageId: draftEmailReply.id,
        actionType: "MESSAGE_DRAFTED",
        metadataJson: { status: "PENDING_APPROVAL" }
      },
      {
        workspaceId: workspace.id,
        conversationId: emailConversation.id,
        actorType: ActorType.SYSTEM,
        approvalRequestId: approvalRequest.id,
        actionType: "APPROVAL_REQUESTED",
        metadataJson: { draftMessageId: draftEmailReply.id }
      },
      {
        workspaceId: workspace.id,
        conversationId: slackConversation.id,
        actorType: ActorType.USER,
        actorUserId: user.id,
        messageId: slackReply.id,
        actionType: "MESSAGE_SENT",
        metadataJson: { platform: "SLACK" }
      }
    ]
  })

  console.log("Seed complete")
  console.log({
    workspaceId: workspace.id,
    userId: user.id,
    emailConversationId: emailConversation.id,
    slackConversationId: slackConversation.id,
    agentAssignmentId: agentAssignment.id,
    approvalRequestId: approvalRequest.id
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
