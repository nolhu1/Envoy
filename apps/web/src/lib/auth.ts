import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { getPrisma } from "@envoy/db";
import type { AppJwt, AppUserRole } from "@/lib/auth-types";
import { validateProductionSecurityConfig } from "@/lib/deployment-security";
import { assertRateLimit } from "@/lib/rate-limit";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REQUIRE_EMAIL_VERIFICATION_ENV = "AUTH_REQUIRE_EMAIL_VERIFICATION";

function shouldRequireEmailVerification() {
  return process.env[REQUIRE_EMAIL_VERIFICATION_ENV] === "true";
}

export function getAuthOptions(): NextAuthOptions {
  validateProductionSecurityConfig();

  const prisma = getPrisma();

  return {
    adapter: PrismaAdapter(prisma),
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,
      updateAge: 15 * 60,
    },
    cookies: {
      sessionToken: {
        name:
          process.env.NODE_ENV === "production"
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
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

          assertRateLimit({
            key: `login:${email}`,
            limit: 8,
            windowMs: 15 * 60_000,
          });

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
              disabledAt: true,
            },
          });

          if (!user?.passwordHash || user.disabledAt) {
            return null;
          }

          const isValidPassword = await compare(password, user.passwordHash);

          if (!isValidPassword) {
            return null;
          }

          if (shouldRequireEmailVerification() && !user.emailVerified) {
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
