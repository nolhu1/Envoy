"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";

import { getPrisma } from "@envoy/db";
import { createWorkspaceForSignedUpUser } from "@/lib/workspace";

export type SignUpState = {
  error?: string;
};

export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const nameValue = formData.get("name");
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");

  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const prisma = getPrisma();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hash(password, 12);

  await createWorkspaceForSignedUpUser({
    email,
    name: name || null,
    passwordHash,
  });

  redirect("/sign-in?registered=1");
}
