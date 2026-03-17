import type { DefaultSession } from "next-auth";
import type { AppUserRole } from "@/lib/auth-types";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AppUserRole;
      workspaceId: string;
    };
  }
}
