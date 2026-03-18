"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { acceptInvite } from "@/lib/invite";

function toInviteErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to accept invite.";
}

export async function acceptInviteAction(token: string, formData: FormData) {
  const nameValue = formData.get("name");
  const passwordValue = formData.get("password");

  const name = typeof nameValue === "string" ? nameValue : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  try {
    const user = await acceptInvite({
      token,
      name,
      password,
    });

    redirect(
      `/sign-in?accepted=1&email=${encodeURIComponent(user.email)}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = toInviteErrorMessage(error);
    redirect(`/invite/${token}?error=${encodeURIComponent(message)}`);
  }
}
