import "server-only";

import { getPrisma } from "@envoy/db";

import { sanitizeDiagnostics } from "@/lib/security";

export type WorkspaceAuditLogRow = {
  id: string;
  createdAt: Date;
  actionType: string;
  actorType: "USER" | "AGENT" | "SYSTEM" | "INTEGRATION";
  actorUserId: string | null;
  actorAgentAssignmentId: string | null;
  conversationId: string;
  messageId: string | null;
  approvalRequestId: string | null;
  metadataJson: Record<string, unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listWorkspaceAuditLogs(input: {
  workspaceId: string;
  limit?: number;
  actionType?: string | null;
}) {
  const prisma = getPrisma();
  const limit =
    typeof input.limit === "number" && input.limit > 0
      ? Math.min(Math.floor(input.limit), 500)
      : 200;

  const rows = await prisma.actionLog.findMany({
    where: {
      workspaceId: input.workspaceId,
      actionType: input.actionType?.trim() || undefined,
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      createdAt: true,
      actionType: true,
      actorType: true,
      actorUserId: true,
      actorAgentAssignmentId: true,
      conversationId: true,
      messageId: true,
      approvalRequestId: true,
      metadataJson: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    metadataJson: sanitizeDiagnostics(
      isObject(row.metadataJson) ? row.metadataJson : { value: row.metadataJson },
    ),
  })) satisfies WorkspaceAuditLogRow[];
}
