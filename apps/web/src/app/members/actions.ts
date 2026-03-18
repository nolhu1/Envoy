"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { createInviteInCurrentWorkspace } from "@/lib/invite";
import type { AppUserRole } from "@/lib/auth-types";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

function toInviteErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to create invite.";
}

export async function createInviteAction(formData: FormData) {
  const emailValue = formData.get("email");
  const roleValue = formData.get("role");

  const email = typeof emailValue === "string" ? emailValue : "";
  const role =
    roleValue === "ADMIN" || roleValue === "MEMBER" || roleValue === "VIEWER"
      ? (roleValue as AppUserRole)
      : "MEMBER";

  try {
    await requirePermission(PERMISSIONS.CREATE_INVITES);
    await createInviteInCurrentWorkspace({ email, role });
    redirect("/members?invite=created");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = toInviteErrorMessage(error);
    redirect(`/members?error=${encodeURIComponent(message)}`);
  }
}
