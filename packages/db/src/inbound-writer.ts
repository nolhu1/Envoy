import type {
  CanonicalPersistenceWriter,
  ConversationParticipantsWriteResult,
  InboundEnvelope,
  MessageAttachmentWriteResult,
  NormalizedAttachmentCandidate,
  NormalizedParticipantCandidate,
} from "../../connectors/src";

import { getPrisma } from "./client";

type PrismaPlatform = "EMAIL" | "SLACK";

type WriterOptions = {
  workspaceId: string;
  integrationId: string;
  platform: PrismaPlatform;
};

function toParticipantResolutionKey(
  candidate: NormalizedParticipantCandidate,
  fallbackIndex: number,
) {
  return (
    candidate.externalParticipantId ??
    candidate.email ??
    candidate.handle ??
    `participant:${fallbackIndex}`
  );
}

function mergeJson(
  primary?: unknown,
  secondary?: unknown,
) {
  if (
    primary &&
    typeof primary === "object" &&
    !Array.isArray(primary) &&
    secondary &&
    typeof secondary === "object" &&
    !Array.isArray(secondary)
  ) {
    return {
      ...(primary as Record<string, unknown>),
      ...(secondary as Record<string, unknown>),
    };
  }

  return primary ?? secondary ?? null;
}

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

async function resolveExistingParticipantId(input: {
  workspaceId: string;
  conversationId: string;
  candidate: NormalizedParticipantCandidate;
}) {
  const prisma = getPrisma();
  const orConditions: Array<{
    externalParticipantId?: string;
    email?: string;
    handle?: string;
  }> = [];

  if (input.candidate.externalParticipantId) {
    orConditions.push({
      externalParticipantId: input.candidate.externalParticipantId,
    });
  }

  if (input.candidate.email) {
    orConditions.push({ email: input.candidate.email });
  }

  if (input.candidate.handle) {
    orConditions.push({ handle: input.candidate.handle });
  }

  if (orConditions.length === 0) {
    return null;
  }

  return prisma.participant.findFirst({
    where: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      OR: orConditions,
    },
    select: {
      id: true,
    },
  });
}

async function upsertConversationAndParticipants(
  options: WriterOptions,
  input: Parameters<
    CanonicalPersistenceWriter["upsertConversationAndParticipants"]
  >[0],
): Promise<ConversationParticipantsWriteResult> {
  const prisma = getPrisma();
  const conversationCandidate = input.batch.conversations[0];

  if (!conversationCandidate) {
    throw new Error("Inbound batch did not include a conversation candidate.");
  }

  const existingConversation = await prisma.conversation.findUnique({
    where: {
      integrationId_externalConversationId: {
        integrationId: options.integrationId,
        externalConversationId: conversationCandidate.externalConversationId,
      },
    },
    select: {
      id: true,
    },
  });
  const conversation = existingConversation
    ? await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: {
          subject: conversationCandidate.subject ?? null,
          lastMessageAt: conversationCandidate.lastMessageAt ?? null,
          openedAt: conversationCandidate.openedAt ?? null,
          closedAt: conversationCandidate.closedAt ?? null,
          platformMetadataJson: toPrismaJsonValue(mergeJson(
            conversationCandidate.platformMetadataJson,
            conversationCandidate.rawPayloadJson
              ? { rawPayloadJson: conversationCandidate.rawPayloadJson }
              : null,
          )),
        },
      })
    : await prisma.conversation.create({
        data: {
          workspaceId: options.workspaceId,
          integrationId: options.integrationId,
          platform: options.platform,
          externalConversationId: conversationCandidate.externalConversationId,
          subject: conversationCandidate.subject ?? null,
          state: conversationCandidate.state ?? "UNASSIGNED",
          lastMessageAt: conversationCandidate.lastMessageAt ?? null,
          openedAt: conversationCandidate.openedAt ?? null,
          closedAt: conversationCandidate.closedAt ?? null,
          platformMetadataJson: toPrismaJsonValue(mergeJson(
            conversationCandidate.platformMetadataJson,
            conversationCandidate.rawPayloadJson
              ? { rawPayloadJson: conversationCandidate.rawPayloadJson }
              : null,
          )),
        },
      });

  const participantResolutionMap: ConversationParticipantsWriteResult["participantResolutionMap"] =
    {};
  let insertedParticipants = 0;
  let matchedParticipants = 0;

  for (const [index, candidate] of input.batch.participants.entries()) {
    const resolutionKey = toParticipantResolutionKey(candidate, index);
    const existingParticipant = await resolveExistingParticipantId({
      workspaceId: options.workspaceId,
      conversationId: conversation.id,
      candidate,
    });
    const participant = existingParticipant
      ? await prisma.participant.update({
          where: { id: existingParticipant.id },
          data: {
            externalParticipantId: candidate.externalParticipantId ?? null,
            displayName: candidate.displayName ?? null,
            email: candidate.email ?? null,
            handle: candidate.handle ?? null,
            isInternal: candidate.isInternal ?? false,
            rawPayloadJson: toPrismaJsonValue(candidate.rawPayloadJson),
            platformMetadataJson: toPrismaJsonValue(candidate.platformMetadataJson),
          },
        })
      : await prisma.participant.create({
          data: {
            workspaceId: options.workspaceId,
            conversationId: conversation.id,
            platform: options.platform,
            externalParticipantId: candidate.externalParticipantId ?? null,
            displayName: candidate.displayName ?? null,
            email: candidate.email ?? null,
            handle: candidate.handle ?? null,
            isInternal: candidate.isInternal ?? false,
            rawPayloadJson: toPrismaJsonValue(candidate.rawPayloadJson),
            platformMetadataJson: toPrismaJsonValue(candidate.platformMetadataJson),
          },
        });

    if (existingParticipant) {
      matchedParticipants += 1;
    } else {
      insertedParticipants += 1;
    }

    participantResolutionMap[resolutionKey] = {
      participantId: participant.id,
      externalParticipantId: participant.externalParticipantId,
      matched: Boolean(existingParticipant),
      candidate: {
        email: candidate.email ?? null,
        handle: candidate.handle ?? null,
        displayName: candidate.displayName ?? null,
        platform: candidate.platform,
      },
    };
  }

  return {
    conversationId: conversation.id,
    participantResolutionMap,
    insertedCounts: {
      conversations: existingConversation ? 0 : 1,
      participants: insertedParticipants,
    },
    matchedCounts: {
      conversations: existingConversation ? 1 : 0,
      participants: matchedParticipants,
    },
  };
}

function resolveSenderParticipantId(input: {
  senderExternalParticipantId?: string | null;
  participantResolutionMap: ConversationParticipantsWriteResult["participantResolutionMap"];
}) {
  if (!input.senderExternalParticipantId) {
    return null;
  }

  const directMatch = input.participantResolutionMap[input.senderExternalParticipantId];

  if (directMatch) {
    return directMatch.participantId;
  }

  const fallbackMatch = Object.values(input.participantResolutionMap).find(
    (participant) =>
      participant.externalParticipantId === input.senderExternalParticipantId,
  );

  return fallbackMatch?.participantId ?? null;
}

async function upsertAttachmentCandidate(input: {
  workspaceId: string;
  platform: PrismaPlatform;
  messageId: string;
  candidate: NormalizedAttachmentCandidate;
}) {
  const prisma = getPrisma();
  const existingAttachment = input.candidate.externalAttachmentId
    ? await prisma.attachment.findFirst({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          externalAttachmentId: input.candidate.externalAttachmentId,
          deletedAt: null,
        },
        select: { id: true },
      })
    : null;
  const attachment = existingAttachment
    ? await prisma.attachment.update({
        where: { id: existingAttachment.id },
        data: {
          fileName: input.candidate.fileName,
          mimeType: input.candidate.mimeType ?? null,
          sizeBytes: input.candidate.sizeBytes ?? null,
          storageKey: input.candidate.storageKey ?? null,
          externalUrl: input.candidate.externalUrl ?? null,
          platformMetadataJson: toPrismaJsonValue(mergeJson(
            input.candidate.platformMetadataJson,
            input.candidate.rawPayloadJson
              ? { rawPayloadJson: input.candidate.rawPayloadJson }
              : null,
          )),
        },
      })
    : await prisma.attachment.create({
        data: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          platform: input.platform,
          externalAttachmentId: input.candidate.externalAttachmentId ?? null,
          fileName: input.candidate.fileName,
          mimeType: input.candidate.mimeType ?? null,
          sizeBytes: input.candidate.sizeBytes ?? null,
          storageKey: input.candidate.storageKey ?? null,
          externalUrl: input.candidate.externalUrl ?? null,
          platformMetadataJson: toPrismaJsonValue(mergeJson(
            input.candidate.platformMetadataJson,
            input.candidate.rawPayloadJson
              ? { rawPayloadJson: input.candidate.rawPayloadJson }
              : null,
          )),
        },
      });

  return {
    attachmentId: attachment.id,
    matched: Boolean(existingAttachment),
  };
}

async function upsertMessagesAndAttachments(
  options: WriterOptions,
  input: Parameters<
    CanonicalPersistenceWriter["upsertMessagesAndAttachments"]
  >[0],
): Promise<MessageAttachmentWriteResult> {
  const prisma = getPrisma();
  const messageIds: string[] = [];
  const attachmentIds: string[] = [];
  let insertedMessages = 0;
  let matchedMessages = 0;
  let insertedAttachments = 0;
  let matchedAttachments = 0;
  const persistedMessageIdsByExternalId = new Map<string, string>();

  for (const messageCandidate of input.batch.messages) {
    const senderParticipantId = resolveSenderParticipantId({
      senderExternalParticipantId: messageCandidate.senderExternalParticipantId,
      participantResolutionMap: input.conversationParticipantsResult.participantResolutionMap,
    });
    const existingMessage = messageCandidate.externalMessageId
      ? await prisma.message.findUnique({
          where: {
            conversationId_externalMessageId: {
              conversationId: input.conversationParticipantsResult.conversationId,
              externalMessageId: messageCandidate.externalMessageId,
            },
          },
          select: { id: true },
        })
      : null;
    const message = existingMessage
      ? await prisma.message.update({
          where: { id: existingMessage.id },
          data: {
            senderParticipantId,
            senderType: messageCandidate.senderType,
            direction: messageCandidate.direction,
            bodyText: messageCandidate.bodyText ?? null,
            bodyHtml: messageCandidate.bodyHtml ?? null,
            status: messageCandidate.status ?? "RECEIVED",
            sentAt: messageCandidate.sentAt ?? null,
            receivedAt: messageCandidate.receivedAt ?? null,
            rawPayloadJson: toPrismaJsonValue(messageCandidate.rawPayloadJson),
            platformMetadataJson: toPrismaJsonValue(messageCandidate.platformMetadataJson),
          },
        })
      : await prisma.message.create({
          data: {
            workspaceId: options.workspaceId,
            conversationId: input.conversationParticipantsResult.conversationId,
            platform: options.platform,
            externalMessageId: messageCandidate.externalMessageId ?? null,
            senderParticipantId,
            senderType: messageCandidate.senderType,
            direction: messageCandidate.direction,
            bodyText: messageCandidate.bodyText ?? null,
            bodyHtml: messageCandidate.bodyHtml ?? null,
            status: messageCandidate.status ?? "RECEIVED",
            sentAt: messageCandidate.sentAt ?? null,
            receivedAt: messageCandidate.receivedAt ?? null,
            rawPayloadJson: toPrismaJsonValue(messageCandidate.rawPayloadJson),
            platformMetadataJson: toPrismaJsonValue(messageCandidate.platformMetadataJson),
          },
        });

    if (existingMessage) {
      matchedMessages += 1;
    } else {
      insertedMessages += 1;
    }

    messageIds.push(message.id);

    if (messageCandidate.externalMessageId) {
      persistedMessageIdsByExternalId.set(messageCandidate.externalMessageId, message.id);
    }
  }

  for (const attachmentCandidate of input.batch.attachments) {
    const messageId =
      (attachmentCandidate.externalMessageId
        ? persistedMessageIdsByExternalId.get(attachmentCandidate.externalMessageId)
        : null) ?? null;

    if (!messageId) {
      continue;
    }

    const attachment = await upsertAttachmentCandidate({
      workspaceId: options.workspaceId,
      platform: options.platform,
      messageId,
      candidate: attachmentCandidate,
    });

    attachmentIds.push(attachment.attachmentId);

    if (attachment.matched) {
      matchedAttachments += 1;
    } else {
      insertedAttachments += 1;
    }
  }

  return {
    messageIds,
    attachmentIds,
    insertedCounts: {
      messages: insertedMessages,
      attachments: insertedAttachments,
    },
    matchedCounts: {
      messages: matchedMessages,
      attachments: matchedAttachments,
    },
  };
}

export function createPrismaCanonicalPersistenceWriter(
  options: WriterOptions,
): CanonicalPersistenceWriter {
  return {
    upsertConversationAndParticipants(input) {
      return upsertConversationAndParticipants(options, input);
    },
    upsertMessagesAndAttachments(input) {
      return upsertMessagesAndAttachments(options, input);
    },
  };
}
