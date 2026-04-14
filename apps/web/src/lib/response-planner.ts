import "server-only";

import {
  buildAgentConversationContext,
  planAgentResponse,
  type AgentTriggerContext,
} from "@envoy/db";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export async function planAgentResponseForWorkspace(input: {
  conversationId: string;
  trigger: AgentTriggerContext;
  messageLimit?: number;
  factLimit?: number;
}) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  const context = await buildAgentConversationContext({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    messageLimit: input.messageLimit,
    factLimit: input.factLimit,
  });

  const plan = planAgentResponse({
    context,
    trigger: input.trigger,
  });

  return {
    context,
    plan,
  };
}
