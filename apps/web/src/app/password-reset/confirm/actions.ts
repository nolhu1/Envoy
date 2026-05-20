"use server";

import { redirect } from "next/navigation";

import { resetPasswordWithToken } from "@/lib/account-lifecycle";
import { sanitizeUiErrorMessage } from "@/lib/security";

export async function confirmPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    await resetPasswordWithToken({
      email,
      token,
      password,
    });
  } catch (error) {
    const params = new URLSearchParams({
      email,
      token,
      error: sanitizeUiErrorMessage(error) || "Password reset failed.",
    });

    redirect(`/password-reset/confirm?${params.toString()}`);
  }

  redirect("/sign-in?reset=1");
}
