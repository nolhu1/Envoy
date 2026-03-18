import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { getPrisma } from "@envoy/db";
import type { AppJwt, AppUserRole } from "@/lib/auth-types";

export function getAuthOptions(): NextAuthOptions {
  const prisma = getPrisma();

  return {
    adapter: PrismaAdapter(prisma),
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/sign-in",
    },
    providers: [
      CredentialsProvider({
        name: "Email and password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = credentials?.email?.trim().toLowerCase();
          const password = credentials?.password;

          if (!email || !password) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              role: true,
              workspaceId: true,
            },
          });

          if (!user?.passwordHash) {
            return null;
          }

          const isValidPassword = await compare(password, user.passwordHash);

          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            workspaceId: user.workspaceId,
          };
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        const nextToken = token as typeof token & AppJwt;

        if (user) {
          const appUser = user as typeof user & {
            role: AppUserRole;
            workspaceId: string;
          };

          nextToken.role = appUser.role;
          nextToken.workspaceId = appUser.workspaceId;
        }

        return nextToken;
      },
      session({ session, token }) {
        const appToken = token as typeof token & AppJwt;
        const sessionUser = session.user;

        if (!sessionUser?.email) {
          return session;
        }

        if (typeof appToken.sub !== "string") {
          return session;
        }

        sessionUser.id = appToken.sub;
        sessionUser.workspaceId = appToken.workspaceId ?? "";
        sessionUser.role = appToken.role ?? "MEMBER";

        return session;
      },
      async signIn({ user }) {
        const appUser = user as typeof user & {
          role: AppUserRole;
          workspaceId: string;
        };

        if (!appUser.workspaceId || !appUser.role) {
          return false;
        }

        return true;
      },
    },
  };
}

export function getServerAuthSession() {
  return getServerSession(getAuthOptions());
}
