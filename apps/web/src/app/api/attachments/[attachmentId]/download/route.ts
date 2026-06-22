import {
  fetchGmailAttachmentBody,
} from "@envoy/connectors";
import {
  getPrisma,
  resolveConnectorContextForWorkspaceIntegration,
} from "@envoy/db";
import { NextResponse } from "next/server";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import { sanitizeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

type AttachmentDownloadRouteProps = {
  params: Promise<{
    attachmentId: string;
  }>;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataObject(value: unknown) {
  return isObject(value) ? value : {};
}

function readGmailAttachmentId(metadata: JsonObject) {
  return readString(metadata.attachmentId);
}

function readGmailMessageId(input: {
  metadata: JsonObject;
  externalMessageId: string | null;
}) {
  return readString(input.metadata.messageId) ?? input.externalMessageId;
}

function sanitizeDownloadFileName(fileName: string) {
  const cleaned = fileName
    .replaceAll(/[\r\n\\/:*?"<>|]/g, "_")
    .replaceAll(/\s+/g, " ")
    .trim();

  return cleaned || "attachment";
}

function buildContentDisposition(fileName: string) {
  const safeFileName = sanitizeDownloadFileName(fileName);
  const asciiFallback = safeFileName.replaceAll(/[^\x20-\x7E]/g, "_");

  return [
    `attachment; filename="${asciiFallback.replaceAll('"', "_")}"`,
    `filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
  ].join("; ");
}

function createFileResponse(input: {
  data: Uint8Array;
  fileName: string;
  mimeType: string | null;
  contentLength?: number | null;
}) {
  const body = new ArrayBuffer(input.data.byteLength);
  new Uint8Array(body).set(input.data);
  const headers = new Headers({
    "content-disposition": buildContentDisposition(input.fileName),
    "content-type": input.mimeType ?? "application/octet-stream",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });

  if (input.contentLength && input.contentLength > 0) {
    headers.set("content-length", String(input.contentLength));
  }

  return new NextResponse(body, {
    status: 200,
    headers,
  });
}

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export async function GET(
  _request: Request,
  { params }: AttachmentDownloadRouteProps,
) {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await params;
  const prisma = getPrisma();
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      workspaceId: authContext.workspaceId,
      deletedAt: null,
      message: {
        workspaceId: authContext.workspaceId,
        deletedAt: null,
        conversation: {
          workspaceId: authContext.workspaceId,
          deletedAt: null,
          integration: {
            workspaceId: authContext.workspaceId,
            platform: "EMAIL",
            deletedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
      platform: true,
      externalAttachmentId: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      externalUrl: true,
      platformMetadataJson: true,
      message: {
        select: {
          externalMessageId: true,
          conversation: {
            select: {
              integrationId: true,
              integration: {
                select: {
                  platform: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attachment) {
    return jsonResponse({ ok: false, error: "not_found" }, { status: 404 });
  }

  const connectorContext = await resolveConnectorContextForWorkspaceIntegration({
    workspaceId: authContext.workspaceId,
    integrationId: attachment.message.conversation.integrationId,
  });

  if (!connectorContext) {
    return jsonResponse(
      { ok: false, error: "integration_unavailable" },
      { status: 404 },
    );
  }

  const metadata = readMetadataObject(attachment.platformMetadataJson);

  try {
    if (attachment.platform === "EMAIL") {
      const gmailAttachmentId =
        readGmailAttachmentId(metadata) ?? attachment.externalAttachmentId;
      const gmailMessageId = readGmailMessageId({
        metadata,
        externalMessageId: attachment.message.externalMessageId,
      });

      if (!gmailAttachmentId || !gmailMessageId) {
        return jsonResponse(
          { ok: false, error: "attachment_download_unavailable" },
          { status: 404 },
        );
      }

      const downloaded = await fetchGmailAttachmentBody({
        context: connectorContext,
        messageId: gmailMessageId,
        attachmentId: gmailAttachmentId,
      });

      return createFileResponse({
        data: downloaded.data,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        contentLength: downloaded.size ?? attachment.sizeBytes,
      });
    }
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: sanitizeErrorMessage(error, "attachment_download_failed"),
      },
      {
        status: 502,
      },
    );
  }

  return jsonResponse(
    { ok: false, error: "unsupported_attachment_provider" },
    { status: 501 },
  );
}
