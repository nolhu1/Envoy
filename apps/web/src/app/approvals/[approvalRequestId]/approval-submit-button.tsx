"use client";

import { useFormStatus } from "react-dom";

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

  const toneClassName =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-500"
      : tone === "secondary"
        ? "bg-slate-700 hover:bg-slate-600"
        : "bg-slate-950 hover:bg-slate-800";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex rounded-full px-5 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClassName}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
