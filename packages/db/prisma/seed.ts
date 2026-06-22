import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ActorType,
  ApprovalStatus,
  ConversationState,
  EventJournalStatus,
  EventProcessingStatus,
  IdempotencyRecordStatus,
  IntegrationStatus,
  MessageDirection,
  MessageStatus,
  Platform,
  PrismaClient,
  RuntimeJobAttemptStatus,
  RuntimeJobStatus,
  SenderType,
  WorkspaceUserRole,
} from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function resetSeedData() {
  await prisma.deadLetterRecord.deleteMany();
  await prisma.runtimeJobAttempt.deleteMany();
  await prisma.runtimeJob.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.eventProcessingAttempt.deleteMany();
  await prisma.eventJournal.deleteMany();
  await prisma.actionLog.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.conversationFact.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.agentAssignment.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.connectorSecret.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
}

async function main() {
  await resetSeedData();

  const workspace = await prisma.workspace.create({
    data: {
      name: "Envoy Release Demo",
      settingsJson: {
        timezone: "America/New_York",
        draftApprovalRequired: true,
        releaseSeed: true,
      },
    },
  });

  const [admin, member, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: "admin@envoydemo.test",
        name: "Admin Operator",
        role: WorkspaceUserRole.ADMIN,
        emailVerified: new Date("2026-03-01T12:00:00.000Z"),
      },
    }),
    prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: "member@envoydemo.test",
        name: "Member Reviewer",
        role: WorkspaceUserRole.MEMBER,
        emailVerified: new Date("2026-03-01T12:00:00.000Z"),
      },
    }),
    prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: "viewer@envoydemo.test",
        name: "Viewer Auditor",
        role: WorkspaceUserRole.VIEWER,
        emailVerified: new Date("2026-03-01T12:00:00.000Z"),
      },
    }),
  ]);

  await prisma.workspaceInvitation.create({
    data: {
      workspaceId: workspace.id,
      email: "new.member@envoydemo.test",
      role: WorkspaceUserRole.MEMBER,
      token: "seed-invite-token",
      invitedByUserId: admin.id,
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
    },
  });

  const gmailIntegration = await prisma.integration.create({
    data: {
      workspaceId: workspace.id,
      platform: Platform.EMAIL,
      displayName: "Release Demo Gmail",
      externalAccountId: "support@envoydemo.test",
      authType: "oauth",
      status: IntegrationStatus.CONNECTED,
      lastSyncedAt: new Date("2026-06-20T17:00:00.000Z"),
      platformMetadataJson: {
        provider: "gmail",
        connectedAddress: "support@envoydemo.test",
        syncCheckpoint: {
          lastSuccessfulSyncAt: "2026-06-20T17:00:00.000Z",
          lastAttemptedSyncAt: "2026-06-20T17:00:00.000Z",
          hasMore: false,
          totalPagesProcessed: 2,
          totalThreadsProcessed: 4,
          totalMessagesInserted: 6,
        },
        gmailWatch: {
          status: "active",
          topicName: "projects/envoy-demo/topics/gmail-push",
          historyId: "123456",
          expiration: "2026-06-27T17:00:00.000Z",
          lastRenewedAt: "2026-06-20T17:00:00.000Z",
        },
      },
    },
  });

  const gmailConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      integrationId: gmailIntegration.id,
      platform: Platform.EMAIL,
      externalConversationId: "gmail-thread-release-1",
      subject: "Pricing and onboarding questions",
      state: ConversationState.AWAITING_APPROVAL,
      lastMessageAt: new Date("2026-06-20T16:45:00.000Z"),
      openedAt: new Date("2026-06-20T16:00:00.000Z"),
    },
  });

  const [gmailExternal, gmailInternal] = await Promise.all([
    prisma.participant.create({
      data: {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        platform: Platform.EMAIL,
        externalParticipantId: "jane@acmeexample.test",
        displayName: "Jane Carter",
        email: "jane@acmeexample.test",
        isInternal: false,
      },
    }),
    prisma.participant.create({
      data: {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        platform: Platform.EMAIL,
        externalParticipantId: "support@envoydemo.test",
        displayName: "Envoy Support",
        email: "support@envoydemo.test",
        isInternal: true,
      },
    }),
  ]);

  const gmailInbound = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: gmailConversation.id,
      platform: Platform.EMAIL,
      externalMessageId: "gmail-msg-release-1",
      senderParticipantId: gmailExternal.id,
      senderType: SenderType.EXTERNAL,
      direction: MessageDirection.INBOUND,
      bodyText: "Can you share pricing and whether onboarding support is included?",
      bodyHtml: "<p>Can you share pricing and whether onboarding support is included?</p>",
      status: MessageStatus.RECEIVED,
      receivedAt: new Date("2026-06-20T16:00:00.000Z"),
      platformMetadataJson: {
        provider: "gmail",
        threadId: "gmail-thread-release-1",
        messageId: "gmail-msg-release-1",
      },
    },
  });

  await prisma.attachment.create({
    data: {
      workspaceId: workspace.id,
      messageId: gmailInbound.id,
      platform: Platform.EMAIL,
      externalAttachmentId: "gmail-attachment-release-1",
      fileName: "pricing-notes.txt",
      mimeType: "text/plain",
      sizeBytes: 512,
      platformMetadataJson: {
        provider: "gmail",
        attachmentId: "gmail-attachment-release-1",
        messageExternalId: "gmail-msg-release-1",
      },
    },
  });

  const agentDraft = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: gmailConversation.id,
      platform: Platform.EMAIL,
      externalMessageId: "agent-draft-release-1",
      senderParticipantId: gmailInternal.id,
      senderType: SenderType.AGENT,
      direction: MessageDirection.OUTBOUND,
      bodyText:
        "Thanks for reaching out. I can help with pricing and onboarding support. Could you share your team size and target start date?",
      status: MessageStatus.PENDING_APPROVAL,
      platformMetadataJson: {
        generationMetadata: {
          provider: "openai",
          model: "gpt-4.1-mini",
          promptVersion: "agent-draft-v1",
        },
      },
    },
  });

  const gmailQueuedReply = await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: gmailConversation.id,
      platform: Platform.EMAIL,
      externalMessageId: null,
      senderParticipantId: gmailInternal.id,
      senderType: SenderType.USER,
      direction: MessageDirection.OUTBOUND,
      bodyText: "Absolutely, I queued the pricing overview for sending.",
      status: MessageStatus.QUEUED,
      platformMetadataJson: {
        provider: "gmail",
        sendSource: "manual",
      },
    },
  });

  const agentAssignment = await prisma.agentAssignment.create({
    data: {
      workspaceId: workspace.id,
      conversationId: gmailConversation.id,
      goal: "Qualify inbound lead and gather onboarding requirements",
      instructions: "Keep replies short, helpful, and focused on qualification.",
      tone: "Professional and concise",
      allowedActionsJson: ["draft_reply", "ask_for_missing_information", "wait"],
      escalationRulesJson: {
        enabledTriggerTypes: [
          "inbound_message",
          "approval_rejected",
          "follow_up_due",
          "manual_regenerate",
        ],
        generationLowConfidenceThreshold: 0.7,
      },
      assignedByUserId: admin.id,
      isActive: true,
    },
  });

  await prisma.conversation.update({
    where: { id: gmailConversation.id },
    data: { assignedAgentId: agentAssignment.id },
  });

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      workspaceId: workspace.id,
      conversationId: gmailConversation.id,
      draftMessageId: agentDraft.id,
      proposedByAgentAssignmentId: agentAssignment.id,
      status: ApprovalStatus.PENDING,
    },
  });

  await prisma.conversationFact.createMany({
    data: [
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        sourceMessageId: gmailInbound.id,
        key: "company",
        valueText: "Acme Example",
        confidence: 0.9,
      },
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        sourceMessageId: gmailInbound.id,
        key: "need",
        valueText: "pricing and onboarding support",
        confidence: 0.95,
      },
    ],
  });

  const eventJournal = await prisma.eventJournal.create({
    data: {
      eventId: "seed-event-message-received",
      workspaceId: workspace.id,
      eventType: "message_received",
      entityType: "message",
      entityId: gmailInbound.id,
      source: "seed",
      version: 1,
      occurredAt: new Date("2026-06-20T16:00:00.000Z"),
      payloadJson: {
        conversationId: gmailConversation.id,
        messageId: gmailInbound.id,
        direction: "INBOUND",
      },
      status: EventJournalStatus.PROCESSED,
      processedAt: new Date("2026-06-20T16:00:02.000Z"),
      metadataJson: {
        seed: true,
      },
    },
  });

  await prisma.eventProcessingAttempt.createMany({
    data: [
      {
        workspaceId: workspace.id,
        eventJournalId: eventJournal.id,
        eventId: eventJournal.eventId,
        consumer: "action_log_projector",
        status: EventProcessingStatus.SUCCEEDED,
        attempt: 1,
        finishedAt: new Date("2026-06-20T16:00:01.000Z"),
      },
      {
        workspaceId: workspace.id,
        eventJournalId: eventJournal.id,
        eventId: eventJournal.eventId,
        consumer: "agent_trigger_dispatcher",
        status: EventProcessingStatus.SUCCEEDED,
        attempt: 1,
        finishedAt: new Date("2026-06-20T16:00:02.000Z"),
      },
    ],
  });

  await prisma.idempotencyRecord.createMany({
    data: [
      {
        workspaceId: workspace.id,
        scope: "gmail",
        key: `gmail:thread:${workspace.id}:${gmailIntegration.id}:gmail-thread-release-1:gmail-msg-release-1`,
        status: IdempotencyRecordStatus.COMPLETED,
        integrationId: gmailIntegration.id,
        operationType: "ingest_thread",
        resourceType: "conversation",
        resourceId: gmailConversation.id,
        externalEventId: "gmail-msg-release-1",
        completedAt: new Date("2026-06-20T16:00:03.000Z"),
      },
    ],
  });

  const outboundJob = await prisma.runtimeJob.create({
    data: {
      workspaceId: workspace.id,
      queueName: "outbound-send",
      jobType: "outbound.send_message",
      dedupeKey: `outbound-send:${workspace.id}:${gmailQueuedReply.id}:manual`,
      bullJobId: "seed-bull-outbound-1",
      status: RuntimeJobStatus.QUEUED,
      payloadJson: {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        messageId: gmailQueuedReply.id,
        integrationId: gmailIntegration.id,
        platform: "EMAIL",
        sendSource: "manual",
        requestedByUserId: member.id,
        requestedAt: "2026-06-20T16:55:00.000Z",
      },
      maxAttempts: 3,
      queuedAt: new Date("2026-06-20T16:55:00.000Z"),
    },
  });

  const agentJob = await prisma.runtimeJob.create({
    data: {
      workspaceId: workspace.id,
      queueName: "agent",
      jobType: "agent.run_from_trigger",
      dedupeKey: `agent:inbound_message:${workspace.id}:${gmailConversation.id}:${gmailInbound.id}`,
      bullJobId: "seed-bull-agent-1",
      status: RuntimeJobStatus.COMPLETED,
      payloadJson: {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        triggerType: "inbound_message",
        sourceEventId: eventJournal.eventId,
        sourceMessageId: gmailInbound.id,
        requestedAt: "2026-06-20T16:00:04.000Z",
      },
      resultJson: {
        output: {
          status: "executed",
          flowStatus: "draft_created",
          draftMessageId: agentDraft.id,
          approvalRequestId: approvalRequest.id,
          provider: "openai",
          model: "gpt-4.1-mini",
          promptVersion: "agent-draft-v1",
        },
      },
      attemptsMade: 1,
      maxAttempts: 1,
      queuedAt: new Date("2026-06-20T16:00:04.000Z"),
      startedAt: new Date("2026-06-20T16:00:05.000Z"),
      completedAt: new Date("2026-06-20T16:00:10.000Z"),
      sourceEventId: eventJournal.eventId,
    },
  });

  const failedSyncJob = await prisma.runtimeJob.create({
    data: {
      workspaceId: workspace.id,
      queueName: "sync",
      jobType: "sync.gmail_integration",
      dedupeKey: `sync:${workspace.id}:${gmailIntegration.id}:manual:seed-failed`,
      bullJobId: "seed-bull-sync-failed",
      status: RuntimeJobStatus.DEAD_LETTERED,
      payloadJson: {
        workspaceId: workspace.id,
        integrationId: gmailIntegration.id,
        reason: "manual",
        requestedByUserId: admin.id,
        requestedAt: "2026-06-20T15:00:00.000Z",
      },
      attemptsMade: 3,
      maxAttempts: 3,
      queuedAt: new Date("2026-06-20T15:00:00.000Z"),
      startedAt: new Date("2026-06-20T15:00:01.000Z"),
      failedAt: new Date("2026-06-20T15:02:00.000Z"),
      deadLetteredAt: new Date("2026-06-20T15:02:00.000Z"),
      lastErrorJson: {
        message: "Seeded recoverable Gmail sync failure.",
        retryable: true,
      },
    },
  });

  await prisma.runtimeJobAttempt.createMany({
    data: [
      {
        workspaceId: workspace.id,
        runtimeJobId: agentJob.id,
        queueName: "agent",
        jobType: "agent.run_from_trigger",
        attempt: 1,
        workerId: "seed-worker",
        status: RuntimeJobAttemptStatus.SUCCEEDED,
        startedAt: new Date("2026-06-20T16:00:05.000Z"),
        finishedAt: new Date("2026-06-20T16:00:10.000Z"),
        resultJson: {
          status: "draft_created",
        },
      },
      {
        workspaceId: workspace.id,
        runtimeJobId: failedSyncJob.id,
        queueName: "sync",
        jobType: "sync.gmail_integration",
        attempt: 3,
        workerId: "seed-worker",
        status: RuntimeJobAttemptStatus.FAILED,
        startedAt: new Date("2026-06-20T15:01:30.000Z"),
        finishedAt: new Date("2026-06-20T15:02:00.000Z"),
        errorJson: {
          message: "Seeded recoverable Gmail sync failure.",
          retryable: true,
        },
      },
    ],
  });

  await prisma.deadLetterRecord.create({
    data: {
      workspaceId: workspace.id,
      kind: "runtime_job",
      runtimeJobId: failedSyncJob.id,
      queueName: "sync",
      reason: "exhausted_retry_policy",
      payloadJson: {
        jobType: failedSyncJob.jobType,
        integrationId: gmailIntegration.id,
      },
      errorJson: {
        message: "Seeded recoverable Gmail sync failure.",
        retryable: true,
      },
    },
  });

  await prisma.actionLog.createMany({
    data: [
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        actorType: ActorType.INTEGRATION,
        messageId: gmailInbound.id,
        actionType: "MESSAGE_INGESTED",
        metadataJson: { platform: "EMAIL", eventId: eventJournal.eventId },
      },
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        actorType: ActorType.USER,
        actorUserId: admin.id,
        actionType: "AGENT_ASSIGNED",
        metadataJson: { agentAssignmentId: agentAssignment.id },
      },
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        actorType: ActorType.AGENT,
        actorAgentAssignmentId: agentAssignment.id,
        messageId: agentDraft.id,
        approvalRequestId: approvalRequest.id,
        actionType: "AGENT_DRAFT_CREATED",
        metadataJson: {
          provider: "openai",
          model: "gpt-4.1-mini",
          promptVersion: "agent-draft-v1",
          classification: "normal_draft",
        },
      },
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        actorType: ActorType.SYSTEM,
        approvalRequestId: approvalRequest.id,
        actionType: "APPROVAL_REQUESTED",
        metadataJson: { draftMessageId: agentDraft.id },
      },
      {
        workspaceId: workspace.id,
        conversationId: gmailConversation.id,
        actorType: ActorType.USER,
        actorUserId: member.id,
        messageId: gmailQueuedReply.id,
        actionType: "MESSAGE_SEND_QUEUED",
        metadataJson: { platform: "EMAIL", runtimeJobId: outboundJob.id },
      },
    ],
  });

  console.log("Seed complete");
  console.log({
    workspaceId: workspace.id,
    adminUserId: admin.id,
    memberUserId: member.id,
    viewerUserId: viewer.id,
    gmailIntegrationId: gmailIntegration.id,
    gmailConversationId: gmailConversation.id,
    approvalRequestId: approvalRequest.id,
    queuedOutboundJobId: outboundJob.id,
    completedAgentJobId: agentJob.id,
    deadLetteredSyncJobId: failedSyncJob.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
