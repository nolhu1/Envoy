import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";

type CreateWorkspaceForUserInput = {
  email: string;
  name?: string | null;
  passwordHash: string;
};

function getDefaultWorkspaceName(email: string, name?: string | null) {
  if (name) {
    return `${name}'s Workspace`;
  }

  return `${email}'s Workspace`;
}

export async function createWorkspaceForSignedUpUser({
  email,
  name,
  passwordHash,
}: CreateWorkspaceForUserInput) {
  const prisma = getPrisma();

  return prisma.workspace.create({
    data: {
      // Phase D2 cleanup: replace this temporary workspace bootstrap path.
      name: getDefaultWorkspaceName(email, name),
      users: {
        create: {
          email,
          name: name ?? null,
          role: "ADMIN",
          passwordHash,
        },
      },
    },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          workspaceId: true,
        },
      },
    },
  });
}

export async function getCurrentWorkspace() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return null;
  }

  return getWorkspaceByIdForCurrentUser(authContext.workspaceId);
}

export async function getWorkspaceByIdForCurrentUser(workspaceId: string) {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext || authContext.workspaceId !== workspaceId) {
    return null;
  }

  const prisma = getPrisma();

  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      settingsJson: true,
    },
  });
}

export async function getCurrentWorkspaceMembers() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();

  return prisma.user.findMany({
    where: {
      workspaceId: authContext.workspaceId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
  });
}
