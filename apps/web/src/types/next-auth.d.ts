import type { DefaultSession } from "next-auth";
import type { AppSessionUser, AppUserRole } from "@/lib/auth-types";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & AppSessionUser;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppUserRole;
    workspaceId?: string;
  }
}
