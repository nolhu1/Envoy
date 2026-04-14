import "server-only";

import { assignAgentToConversation } from "@envoy/db";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export type AssignAgentInput = {
  conversationId: string;
  goal: string;
  instructions?: string | null;
  tone?: string | null;
  allowedActionsJson?: unknown;
  escalationRulesJson?: unknown;
};

export async function assignAgentToConversationForWorkspace(
  input: AssignAgentInput,
) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  return assignAgentToConversation({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    goal: input.goal,
    instructions: input.instructions ?? null,
    tone: input.tone ?? null,
    allowedActionsJson: input.allowedActionsJson,
    escalationRulesJson: input.escalationRulesJson,
    assignedByUserId: authContext.userId,
  });
}
