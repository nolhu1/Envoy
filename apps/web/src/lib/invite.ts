import "server-only";

import { randomBytes } from "node:crypto";

import { getPrisma } from "@envoy/db";

import { getCurrentAppAuthContext, requireAppAuthContext } from "@/lib/app-auth";
import type { AppUserRole } from "@/lib/auth-types";

const INVITE_TTL_DAYS = 7;

type CreateWorkspaceInviteInput = {
  email: string;
  role: AppUserRole;
};

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

function createInviteExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  return expiresAt;
}

function createInviteToken() {
  return randomBytes(24).toString("hex");
}

export async function createInviteInCurrentWorkspace({
  email,
  role,
}: CreateWorkspaceInviteInput) {
  const authContext = await requireAppAuthContext();

  if (authContext.role !== "ADMIN") {
    throw new Error("Only admins can create invites.");
  }

  const normalizedEmail = normalizeInviteEmail(email);

  if (!normalizedEmail) {
    throw new Error("Invite email is required.");
  }

  const prisma = getPrisma();

  const existingUser = await prisma.user.findFirst({
    where: {
      workspaceId: authContext.workspaceId,
      email: normalizedEmail,
    },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error("That user is already a member of this workspace.");
  }

  const existingPendingInvite = await prisma.workspaceInvitation.findFirst({
    where: {
      workspaceId: authContext.workspaceId,
      email: normalizedEmail,
      acceptedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingPendingInvite) {
    throw new Error("A pending invite already exists for that email.");
  }

  return prisma.workspaceInvitation.create({
    data: {
      workspaceId: authContext.workspaceId,
      email: normalizedEmail,
      role,
      token: createInviteToken(),
      invitedByUserId: authContext.userId,
      expiresAt: createInviteExpiryDate(),
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

export async function listInvitesForCurrentWorkspace() {
  const authContext = await getCurrentAppAuthContext();

  if (!authContext) {
    return [];
  }

  const prisma = getPrisma();

  return prisma.workspaceInvitation.findMany({
    where: {
      workspaceId: authContext.workspaceId,
      acceptedAt: null,
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      createdAt: true,
      invitedByUser: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { email: "asc" }],
  });
}

export async function validateInviteToken(token: string) {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  const prisma = getPrisma();

  return prisma.workspaceInvitation.findUnique({
    where: {
      token: normalizedToken,
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      acceptedAt: true,
      expiresAt: true,
      createdAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      invitedByUser: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  }).then((invite) => {
    if (!invite) {
      return null;
    }

    if (invite.acceptedAt) {
      return null;
    }

    if (invite.expiresAt <= new Date()) {
      return null;
    }

    return invite;
  });
}
