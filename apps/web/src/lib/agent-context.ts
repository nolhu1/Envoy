import "server-only";

import { buildAgentConversationContext } from "@envoy/db";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export async function getAgentConversationContextForWorkspace(input: {
  conversationId: string;
  messageLimit?: number;
  factLimit?: number;
}) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  return buildAgentConversationContext({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    messageLimit: input.messageLimit,
    factLimit: input.factLimit,
  });
}
