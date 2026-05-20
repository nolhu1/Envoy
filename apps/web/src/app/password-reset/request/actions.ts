"use server";

import { headers } from "next/headers";

import { getPrisma } from "@envoy/db";

import { createPasswordResetToken } from "@/lib/account-lifecycle";
import { assertRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeUiErrorMessage } from "@/lib/security";

export type PasswordResetRequestState = {
  message?: string;
  error?: string;
};

export async function requestPasswordReset(
  _prevState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestHeaders = await headers();

  try {
    assertRateLimit({
      key: `password-reset:${getClientIpFromHeaders(requestHeaders)}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });

    if (email) {
      const user = await getPrisma().user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (user) {
        await createPasswordResetToken(email);
      }
    }

    return {
      message: "If the account exists, a reset link has been prepared.",
    };
  } catch (error) {
    return {
      error: sanitizeUiErrorMessage(error),
    };
  }
}
