import { Buffer } from "node:buffer";

import { AUTH_MATERIAL_TYPES } from "./credentials";
import { GMAIL_PROVIDER } from "./gmail";
import { OUTBOUND_SEND_STATUSES } from "./outbound";
import type {
  ConnectorContext,
  JsonValue,
  NormalizedParticipantCandidate,
  OutboundSendInput,
  SendResult,
} from "./types";

export const GMAIL_SEND_MESSAGE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type JsonObject = Record<string, JsonValue>;

export type GmailSendExecutionInput = {
  context: ConnectorContext;
  payload: GmailProviderSendPayload;
};

export type GmailSendApiResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
};

export type GmailProviderSendPayload = {
  raw: string;
  threadId: string;
  headers: {
    to: string[];
    subject: string;
    inReplyTo?: string | null;
    references?: string | null;
  };
  body: {
    text?: string | null;
    html?: string | null;
  };
};

function isJsonObject(value: JsonValue | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function formatHeaderMessageId(value: string) {
  return value.startsWith("<") && value.endsWith(">")
    ? value
    : `<${value}>`;
}

function escapeMimeHeaderValue(value: string) {
  return value.replace(/\r?\n/g, " ").trim();
}

function extractReplyMetadata(
  input: OutboundSendInput,
) {
  const metadata = isJsonObject(input.conversation.platformMetadataJson)
    ? input.conversation.platformMetadataJson
    : null;
  const inReplyTo =
    typeof metadata?.gmailInReplyTo === "string"
      ? metadata.gmailInReplyTo
      : input.replyToExternalMessageId ?? null;
  const references =
    typeof metadata?.gmailReferences === "string"
      ? metadata.gmailReferences
      : inReplyTo;

  return {
    inReplyTo,
    references,
  };
}

function resolveRecipients(participants?: NormalizedParticipantCandidate[]) {
  const recipients = (participants ?? [])
    .filter((participant) => participant.email && participant.isInternal !== true)
    .map((participant) => participant.email?.trim() ?? "")
    .filter(Boolean);

  return Array.from(new Set(recipients));
}

function buildMimeBody(input: {
  textBody?: string | null;
  htmlBody?: string | null;
}) {
  const textBody = input.textBody?.trim() || null;
  const htmlBody = input.htmlBody?.trim() || null;

  if (textBody && htmlBody) {
    const boundary = `envoy-gmail-${Math.random().toString(36).slice(2)}`;

    return [
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      textBody,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      htmlBody,
      `--${boundary}--`,
    ].join("\r\n");
  }

  if (htmlBody) {
    return [
      "Content-Type: text/html; charset=UTF-8",
      "",
      htmlBody,
    ].join("\r\n");
  }

  return [
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody ?? "",
  ].join("\r\n");
}

export function buildGmailReplyPayload(
  input: OutboundSendInput,
): GmailProviderSendPayload {
  const threadId = input.conversation.externalConversationId?.trim();

  if (!threadId) {
    throw new Error("Gmail send requires an existing thread id.");
  }

  const recipients = resolveRecipients(input.participants);

  if (recipients.length === 0) {
    throw new Error("Gmail send requires at least one external recipient email.");
  }

  const subject = escapeMimeHeaderValue(
    input.conversation.subject?.trim() || "Re:",
  );
  const replyMetadata = extractReplyMetadata(input);
  const headers = [
    `To: ${recipients.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];

  if (replyMetadata.inReplyTo) {
    headers.push(`In-Reply-To: ${formatHeaderMessageId(replyMetadata.inReplyTo)}`);
  }

  if (replyMetadata.references) {
    headers.push(`References: ${replyMetadata.references}`);
  }

  const mime = [
    ...headers,
    buildMimeBody({
      textBody: input.message.bodyText,
      htmlBody: input.message.bodyHtml,
    }),
  ].join("\r\n");

  return {
    raw: toBase64Url(mime),
    threadId,
    headers: {
      to: recipients,
      subject,
      inReplyTo: replyMetadata.inReplyTo,
      references: replyMetadata.references,
    },
    body: {
      text: input.message.bodyText ?? null,
      html: input.message.bodyHtml ?? null,
    },
  };
}

function getRequiredAccessToken(context: ConnectorContext) {
  const authMaterial = context.authMaterial;

  if (!authMaterial || authMaterial.type !== AUTH_MATERIAL_TYPES.OAUTH) {
    throw new Error("Gmail send requires resolved OAuth auth material.");
  }

  return authMaterial.accessToken;
}

export async function executeGmailSend(
  input: GmailSendExecutionInput,
): Promise<GmailSendApiResponse> {
  const accessToken = getRequiredAccessToken(input.context);
  const response = await fetch(GMAIL_SEND_MESSAGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw: input.payload.raw,
      threadId: input.payload.threadId,
    }),
    cache: "no-store",
  });
  const responseText = await response.text();
  const responseJson = responseText
    ? (JSON.parse(responseText) as GmailSendApiResponse & { error?: unknown })
    : null;

  if (!response.ok || !responseJson?.id) {
    throw new Error(`Gmail send failed with status ${response.status}.`);
  }

  return responseJson;
}

export async function sendGmailReply(
  input: OutboundSendInput,
): Promise<SendResult> {
  try {
    const payload = buildGmailReplyPayload(input);
    const response = await executeGmailSend({
      context: input.context,
      payload,
    });

    return {
      status: OUTBOUND_SEND_STATUSES.ACCEPTED,
      externalMessageId: response.id ?? null,
      sentAt: new Date(),
      providerResponseJson: {
        provider: GMAIL_PROVIDER,
        messageId: response.id ?? null,
        threadId: response.threadId ?? payload.threadId,
        labelIds: response.labelIds ?? [],
      },
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        threadId: response.threadId ?? payload.threadId,
        to: payload.headers.to,
        subject: payload.headers.subject,
        inReplyTo: payload.headers.inReplyTo ?? null,
        references: payload.headers.references ?? null,
      },
      diagnosticsJson: {
        provider: GMAIL_PROVIDER,
        stage: "send",
        accepted: true,
      },
    };
  } catch (error) {
    return {
      status: OUTBOUND_SEND_STATUSES.FAILED,
      externalMessageId: null,
      sentAt: null,
      providerResponseJson: {
        provider: GMAIL_PROVIDER,
        accepted: false,
      },
      platformMetadataJson: {
        provider: GMAIL_PROVIDER,
        threadId: input.conversation.externalConversationId,
        replyToExternalMessageId: input.replyToExternalMessageId ?? null,
      },
      diagnosticsJson: {
        provider: GMAIL_PROVIDER,
        stage: "send",
        error: error instanceof Error ? error.message : "Unknown Gmail send error.",
      },
    };
  }
}
