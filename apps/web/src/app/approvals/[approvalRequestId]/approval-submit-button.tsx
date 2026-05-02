"use client";

import { useFormStatus } from "react-dom";

import { SubmitButton } from "@envoy/ui";

type ApprovalSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  tone?: "primary" | "danger" | "secondary";
};

export function ApprovalSubmitButton({
  idleLabel,
  pendingLabel,
  tone = "primary",
}: ApprovalSubmitButtonProps) {
  const { pending } = useFormStatus();
  const variant =
    tone === "danger" ? "danger" : tone === "secondary" ? "secondary" : "primary";

  return (
    <SubmitButton
      loading={pending}
      loadingLabel={pendingLabel}
      variant={variant}
    >
      {idleLabel}
    </SubmitButton>
  );
}
