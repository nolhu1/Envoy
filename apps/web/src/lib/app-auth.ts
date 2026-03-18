import "server-only";

import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";
import type { AppAuthContext } from "@/lib/auth-types";

function toAppAuthContext(
  session: Awaited<ReturnType<typeof getServerAuthSession>>,
): AppAuthContext | null {
  const user = session?.user;

  if (!user?.email) {
    return null;
  }

  return {
    email: user.email,
    role: user.role,
    userId: user.id,
    workspaceId: user.workspaceId,
  };
}

export async function getCurrentAppAuthContext(): Promise<AppAuthContext | null> {
  const session = await getServerAuthSession();
  return toAppAuthContext(session);
}

export async function requireAppAuthContext(): Promise<AppAuthContext> {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    redirect("/sign-in");
  }

  return authContext;
}

export async function isCurrentWorkspace(
  workspaceId: string,
): Promise<boolean> {
  const authContext = await getCurrentAppAuthContext();
  return authContext?.workspaceId === workspaceId;
}
