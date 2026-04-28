import "server-only";

import {
  assignAgentToConversation,
  unassignAgentFromConversation,
} from "@envoy/db";

import {
  buildEnvoyEvent,
  ENVOY_EVENT_ENTITY_TYPES,
  ENVOY_EVENT_SOURCES,
  ENVOY_EVENT_TYPES,
  publishEnvoyEvent,
} from "@/lib/event-publisher";
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

  const result = await assignAgentToConversation({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    goal: input.goal,
    instructions: input.instructions ?? null,
    tone: input.tone ?? null,
    allowedActionsJson: input.allowedActionsJson,
    escalationRulesJson: input.escalationRulesJson,
    assignedByUserId: authContext.userId,
  });

  await publishEnvoyEvent(
    buildEnvoyEvent({
      eventType: ENVOY_EVENT_TYPES.AGENT_ASSIGNED,
      workspaceId: authContext.workspaceId,
      entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
      entityId: result.assignmentId,
      source: ENVOY_EVENT_SOURCES.UI,
      payload: {
        agentAssignmentId: result.assignmentId,
        conversationId: result.conversationId,
        requestedByUserId: authContext.userId,
        goal: input.goal,
      },
    }),
  );

  return result;
}

export async function unassignAgentFromConversationForWorkspace(input: {
  conversationId: string;
  reason?: string | null;
}) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  const result = await unassignAgentFromConversation({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    unassignedByUserId: authContext.userId,
    reason: input.reason ?? null,
  });

  if (result.previousAssignmentId) {
    await publishEnvoyEvent(
      buildEnvoyEvent({
        eventType: ENVOY_EVENT_TYPES.AGENT_UNASSIGNED,
        workspaceId: authContext.workspaceId,
        entityType: ENVOY_EVENT_ENTITY_TYPES.AGENT_ASSIGNMENT,
        entityId: result.previousAssignmentId,
        source: ENVOY_EVENT_SOURCES.UI,
        payload: {
          agentAssignmentId: result.previousAssignmentId,
          conversationId: result.conversationId,
          requestedByUserId: authContext.userId,
          metadata: {
            reason: input.reason ?? null,
          },
        },
      }),
    );
  }

  return result;
}
