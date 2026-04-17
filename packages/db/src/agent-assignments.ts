import { getPrisma } from "./client";

export const AGENT_ASSIGNMENT_ACTION_TYPES = {
  AGENT_ASSIGNED: "AGENT_ASSIGNED",
  AGENT_UNASSIGNED: "AGENT_UNASSIGNED",
} as const;

export type AgentAssignmentActionType =
  (typeof AGENT_ASSIGNMENT_ACTION_TYPES)[keyof typeof AGENT_ASSIGNMENT_ACTION_TYPES];

export type AssignAgentToConversationInput = {
  workspaceId: string;
  conversationId: string;
  goal: string;
  instructions?: string | null;
  tone?: string | null;
  allowedActionsJson?: unknown;
  escalationRulesJson?: unknown;
  assignedByUserId: string;
};

export type AssignAgentToConversationResult = {
  workspaceId: string;
  conversationId: string;
  assignmentId: string;
  previousAssignmentId: string | null;
  endedAssignmentIds: string[];
};

export type UnassignAgentFromConversationInput = {
  workspaceId: string;
  conversationId: string;
  unassignedByUserId: string;
  reason?: string | null;
};

export type UnassignAgentFromConversationResult = {
  workspaceId: string;
  conversationId: string;
  previousAssignmentId: string | null;
  endedAssignmentIds: string[];
};

function toPrismaJsonValue(value: unknown) {
  return (value ?? null) as never;
}

export async function assignAgentToConversation(
  input: AssignAgentToConversationInput,
): Promise<AssignAgentToConversationResult> {
  const prisma = getPrisma();
  const goal = input.goal.trim();

  if (!goal) {
    throw new Error("Agent assignment goal is required.");
  }

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        assignedAgentId: true,
      },
    });

    if (!conversation) {
      throw new Error("The conversation could not be loaded for assignment.");
    }

    const existingAssignments = await tx.agentAssignment.findMany({
      where: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const endedAt = new Date();
    const endedAssignmentIds = existingAssignments.map((assignment) => assignment.id);

    if (endedAssignmentIds.length > 0) {
      await tx.agentAssignment.updateMany({
        where: {
          id: {
            in: endedAssignmentIds,
          },
        },
        data: {
          isActive: false,
          endedAt,
        },
      });
    }

    const assignment = await tx.agentAssignment.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        goal,
        instructions: input.instructions?.trim() || null,
        tone: input.tone?.trim() || null,
        allowedActionsJson: toPrismaJsonValue(input.allowedActionsJson),
        escalationRulesJson: toPrismaJsonValue(input.escalationRulesJson),
        assignedByUserId: input.assignedByUserId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await tx.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        assignedAgentId: assignment.id,
      },
    });

    const actionLogs = await Promise.all([
      tx.actionLog.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          actorType: "USER",
          actorUserId: input.assignedByUserId,
          actorAgentAssignmentId: assignment.id,
          actionType: AGENT_ASSIGNMENT_ACTION_TYPES.AGENT_ASSIGNED,
          metadataJson: toPrismaJsonValue({
            goal,
            instructions: input.instructions?.trim() || null,
            tone: input.tone?.trim() || null,
            previousAssignmentId: conversation.assignedAgentId ?? null,
            endedAssignmentIds,
          }),
        },
        select: {
          id: true,
        },
      }),
      ...(endedAssignmentIds.length > 0
        ? [
            tx.actionLog.create({
              data: {
                workspaceId: input.workspaceId,
                conversationId: conversation.id,
                actorType: "USER",
                actorUserId: input.assignedByUserId,
                actionType: AGENT_ASSIGNMENT_ACTION_TYPES.AGENT_UNASSIGNED,
                metadataJson: toPrismaJsonValue({
                  endedAssignmentIds,
                  endedAt: endedAt.toISOString(),
                  reason: "Replaced by new active agent assignment.",
                }),
              },
              select: {
                id: true,
              },
            }),
          ]
        : []),
    ]);

    void actionLogs;

    return {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      assignmentId: assignment.id,
      previousAssignmentId: conversation.assignedAgentId ?? null,
      endedAssignmentIds,
    };
  });
}

export async function unassignAgentFromConversation(
  input: UnassignAgentFromConversationInput,
): Promise<UnassignAgentFromConversationResult> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        assignedAgentId: true,
      },
    });

    if (!conversation) {
      throw new Error("The conversation could not be loaded for unassignment.");
    }

    const existingAssignments = await tx.agentAssignment.findMany({
      where: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const endedAt = new Date();
    const endedAssignmentIds = existingAssignments.map((assignment) => assignment.id);

    if (endedAssignmentIds.length > 0) {
      await tx.agentAssignment.updateMany({
        where: {
          id: {
            in: endedAssignmentIds,
          },
        },
        data: {
          isActive: false,
          endedAt,
        },
      });
    }

    await tx.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        assignedAgentId: null,
      },
    });

    await tx.actionLog.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        actorType: "USER",
        actorUserId: input.unassignedByUserId,
        actionType: AGENT_ASSIGNMENT_ACTION_TYPES.AGENT_UNASSIGNED,
        metadataJson: toPrismaJsonValue({
          previousAssignmentId: conversation.assignedAgentId ?? null,
          endedAssignmentIds,
          endedAt: endedAt.toISOString(),
          reason: input.reason?.trim() || "Manual unassignment from conversation UI.",
        }),
      },
      select: {
        id: true,
      },
    });

    return {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      previousAssignmentId: conversation.assignedAgentId ?? null,
      endedAssignmentIds,
    };
  });
}
