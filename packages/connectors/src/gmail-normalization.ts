import { GMAIL_PROVIDER, type GmailProviderPayloadPlaceholder } from "./gmail";
import type {
  GmailMessage,
  GmailMessageHeader,
  GmailMessagePayload,
  GmailThread,
} from "./gmail-sync";
import type {
  ConnectorContext,
  NormalizedAttachmentCandidate,
  NormalizedConversationCandidate,
  NormalizedMessageCandidate,
  NormalizedParticipantCandidate,
} from "./types";

type GmailParticipantAddress = {
  displayName?: string | null;
  email?: string | null;
  rawValue: string;
};

export type GmailThreadNormalizationResult = {
  conversation: NormalizedConversationCandidate;
  participants: NormalizedParticipantCandidate[];
  messages: NormalizedMessageCandidate[];
  attachments: NormalizedAttachmentCandidate[];
};

function getHeaders(payload?: GmailMessagePayload) {
  return payload?.headers ?? [];
}

function getHeaderValue(headers: GmailMessageHeader[], name: string) {
  const header = headers.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );

  return header?.value ?? null;
}

function parseEpochMillis(value?: string | null) {
  if (!value) {
    return null;
  }

  const epochMillis = Number(value);

  if (!Number.isFinite(epochMillis)) {
    return null;
  }

  return new Date(epochMillis);
}

function decodeBodyData(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function flattenPayloadParts(payload?: GmailMessagePayload): GmailMessagePayload[] {
  if (!payload) {
    return [];
  }

  const nestedParts = (payload.parts ?? []).flatMap((part) => flattenPayloadParts(part));

  return [payload, ...nestedParts];
}

function extractBodyContent(message: GmailMessage) {
  const payloads = flattenPayloadParts(message.payload);
  const plainText =
    payloads
      .filter((part) => part.mimeType === "text/plain")
      .map((part) => decodeBodyData(part.body?.data))
      .find(Boolean) ?? message.snippet ?? null;
  const htmlBody =
    payloads
      .filter((part) => part.mimeType === "text/html")
      .map((part) => decodeBodyData(part.body?.data))
      .find(Boolean) ?? null;

  return {
    plainText,
    htmlBody,
  };
}

function parseAddressList(value?: string | null): GmailParticipantAddress[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(?:(?<name>.*)\s)?<(?<email>[^>]+)>$/);
      const email = match?.groups?.email?.trim() ?? entry;
      const displayName = match?.groups?.name?.trim().replace(/^"|"$/g, "") ?? null;

      return {
        displayName: displayName || null,
        email: email || null,
        rawValue: entry,
      };
    });
}

function isInternalParticipant(
  context: ConnectorContext,
  participant: GmailParticipantAddress,
) {
  return (
    Boolean(context.externalAccountId) &&
    participant.email?.toLowerCase() === context.externalAccountId?.toLowerCase()
  );
}

function buildParticipantKey(participant: GmailParticipantAddress) {
  return participant.email?.toLowerCase() ?? participant.rawValue.toLowerCase();
}

function createParticipantCandidate(
  context: ConnectorContext,
  participant: GmailParticipantAddress,
): NormalizedParticipantCandidate {
  return {
    externalParticipantId: participant.email ?? participant.rawValue,
    platform: context.platform,
    displayName: participant.displayName ?? participant.email ?? participant.rawValue,
    email: participant.email ?? null,
    handle: participant.email ?? participant.rawValue,
    isInternal: isInternalParticipant(context, participant),
    platformMetadataJson: {
      provider: GMAIL_PROVIDER,
      rawAddress: participant.rawValue,
    },
  };
}

function extractSubject(thread: GmailThread) {
  const subjectFromHeaders = thread.messages
    ?.map((message) => getHeaderValue(getHeaders(message.payload), "Subject"))
    .find(Boolean);

  return subjectFromHeaders ?? thread.snippet ?? null;
}

function extractLastMessageAt(thread: GmailThread) {
  const dates = (thread.messages ?? [])
    .map((message) => parseEpochMillis(message.internalDate))
    .filter((value): value is Date => value instanceof Date);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((value) => value.getTime())));
}

function normalizeMessageDirection(message: GmailMessage) {
  const labelIds = message.labelIds ?? [];
  const isSent = labelIds.includes("SENT");

  return {
    direction: isSent ? "OUTBOUND" : "INBOUND",
    senderType: isSent ? "USER" : "EXTERNAL",
    status: isSent ? "SENT" : "RECEIVED",
  } as const;
}

export function normalizeGmailConversationCandidate(
  context: ConnectorContext,
  thread: GmailThread,
): NormalizedConversationCandidate {
  return {
    externalConversationId: thread.id,
    platform: context.platform,
    subject: extractSubject(thread),
    lastMessageAt: extractLastMessageAt(thread),
    rawPayloadJson: thread,
    platformMetadataJson: {
      provider: GMAIL_PROVIDER,
      threadId: thread.id,
      historyId: thread.historyId ?? null,
      messageCount: thread.messages?.length ?? 0,
    },
  };
}

export function normalizeGmailParticipantCandidates(
  context: ConnectorContext,
  thread: GmailThread,
): NormalizedParticipantCandidate[] {
  const participants = new Map<string, NormalizedParticipantCandidate>();

  for (const message of thread.messages ?? []) {
    const headers = getHeaders(message.payload);
    const addresses = [
      ...parseAddressList(getHeaderValue(headers, "From")),
      ...parseAddressList(getHeaderValue(headers, "To")),
      ...parseAddressList(getHeaderValue(headers, "Cc")),
      ...parseAddressList(getHeaderValue(headers, "Bcc")),
    ];

    for (const participant of addresses) {
      const key = buildParticipantKey(participant);

      if (!participants.has(key)) {
        participants.set(key, createParticipantCandidate(context, participant));
      }
    }
  }

  return [...participants.values()];
}

export function normalizeGmailAttachmentCandidates(
  context: ConnectorContext,
  message: GmailMessage,
): NormalizedAttachmentCandidate[] {
  const attachmentParts = flattenPayloadParts(message.payload).filter(
    (part) => Boolean(part.filename) || Boolean(part.body?.attachmentId),
  );

  return attachmentParts.map((part, index) => ({
    externalAttachmentId:
      part.body?.attachmentId ??
      `${message.id}:${part.filename ?? "attachment"}:${index}`,
    externalMessageId: message.id,
    fileName: part.filename || `attachment-${index + 1}`,
    mimeType: part.mimeType ?? null,
    sizeBytes: part.body?.size ?? null,
    rawPayloadJson: part,
    platformMetadataJson: {
      provider: GMAIL_PROVIDER,
      attachmentId: part.body?.attachmentId ?? null,
      threadId: message.threadId,
    },
  }));
}

export function normalizeGmailMessageCandidate(
  context: ConnectorContext,
  message: GmailMessage,
): NormalizedMessageCandidate {
  const normalizedDirection = normalizeMessageDirection(message);
  const bodyContent = extractBodyContent(message);
  const headers = getHeaders(message.payload);
  const fromAddress = parseAddressList(getHeaderValue(headers, "From"))[0];

  return {
    externalMessageId: message.id,
    externalConversationId: message.threadId,
    platform: context.platform,
    senderType: normalizedDirection.senderType,
    direction: normalizedDirection.direction,
    senderExternalParticipantId:
      fromAddress?.email ?? fromAddress?.rawValue ?? null,
    bodyText: bodyContent.plainText,
    bodyHtml: bodyContent.htmlBody,
    status: normalizedDirection.status,
    sentAt: parseEpochMillis(message.internalDate),
    receivedAt: parseEpochMillis(message.internalDate),
    rawPayloadJson: message,
    platformMetadataJson: {
      provider: GMAIL_PROVIDER,
      threadId: message.threadId,
      historyId: message.historyId ?? null,
      labelIds: message.labelIds ?? [],
      snippet: message.snippet ?? null,
      payloadPlaceholder: {
        threadId: message.threadId,
        messageId: message.id,
      } satisfies GmailProviderPayloadPlaceholder,
    },
    attachments: normalizeGmailAttachmentCandidates(context, message),
  };
}

export function normalizeGmailThread(
  context: ConnectorContext,
  thread: GmailThread,
): GmailThreadNormalizationResult {
  const messages = (thread.messages ?? []).map((message) =>
    normalizeGmailMessageCandidate(context, message),
  );
  const attachments = messages.flatMap((message) => message.attachments ?? []);

  return {
    conversation: normalizeGmailConversationCandidate(context, thread),
    participants: normalizeGmailParticipantCandidates(context, thread),
    messages,
    attachments,
  };
}
