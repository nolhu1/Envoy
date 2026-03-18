import "server-only";

import { randomBytes } from "node:crypto";

import { getPrisma } from "@envoy/db";
import { hash } from "bcryptjs";

import { getCurrentAppAuthContext } from "@/lib/app-auth";
import type { AppUserRole } from "@/lib/auth-types";
import { PERMISSIONS } from "@/lib/permissions";
import { requireAuthenticatedEntryPoint } from "@/lib/workspace-guards";

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

function getInviteStateError(invite: {
  acceptedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.acceptedAt) {
    return "This invite has already been accepted.";
  }

  if (invite.expiresAt <= new Date()) {
    return "This invite has expired.";
  }

  return null;
}

export async function createInviteInCurrentWorkspace({
  email,
  role,
}: CreateWorkspaceInviteInput) {
  const authContext = await requireAuthenticatedEntryPoint({
    permission: PERMISSIONS.CREATE_INVITES,
  });

  const normalizedEmail = normalizeInviteEmail(email);

  if (!normalizedEmail) {
    throw new Error("Invite email is required.");
  }

  const prisma = getPrisma();

  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: { id: true, workspaceId: true },
  });

  if (existingUser) {
    if (existingUser.workspaceId === authContext.workspaceId) {
      throw new Error("That user is already a member of this workspace.");
    }

    throw new Error(
      "That email already belongs to an existing Envoy account and cannot be invited into another workspace in the current MVP model.",
    );
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

    if (getInviteStateError(invite)) {
      return null;
    }

    return invite;
  });
}

type AcceptInviteInput = {
  token: string;
  name?: string | null;
  password: string;
};

export async function acceptInvite({
  token,
  name,
  password,
}: AcceptInviteInput) {
  const normalizedToken = token.trim();
  const normalizedName = name?.trim() || null;

  if (!normalizedToken) {
    throw new Error("Invite token is required.");
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const prisma = getPrisma();
  const passwordHash = await hash(password, 12);

  return prisma.$transaction(async (tx) => {
    const invite = await tx.workspaceInvitation.findUnique({
      where: {
        token: normalizedToken,
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        acceptedAt: true,
        expiresAt: true,
      },
    });

    if (!invite) {
      throw new Error("This invite is invalid.");
    }

    const inviteStateError = getInviteStateError(invite);

    if (inviteStateError) {
      throw new Error(inviteStateError);
    }

    const existingUser = await tx.user.findUnique({
      where: {
        email: invite.email,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (existingUser) {
      if (existingUser.workspaceId === invite.workspaceId) {
        throw new Error(
          "An account for this invite email already exists. Sign in instead.",
        );
      }

      throw new Error("This email is already in use by another account.");
    }

    const user = await tx.user.create({
      data: {
        workspaceId: invite.workspaceId,
        email: invite.email,
        name: normalizedName,
        role: invite.role,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        role: true,
      },
    });

    await tx.workspaceInvitation.update({
      where: {
        id: invite.id,
      },
      data: {
        acceptedAt: new Date(),
      },
    });

    return user;
  });
}
