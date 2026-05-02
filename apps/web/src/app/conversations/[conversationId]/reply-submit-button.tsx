"use client";

import { useFormStatus } from "react-dom";

import { SubmitButton } from "@envoy/ui";

export function ReplySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <SubmitButton loading={pending} loadingLabel="Sending...">
      Send reply
    </SubmitButton>
  );
}
