import "server-only";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext } from "@/lib/app-auth";

export async function getCurrentSignedInUser() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return null;
  }

  const prisma = getPrisma();

  return prisma.user.findUnique({
    where: {
      id: authContext.userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      workspaceId: true,
      role: true,
      createdAt: true,
    },
  });
}
