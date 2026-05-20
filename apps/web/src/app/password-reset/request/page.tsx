import Link from "next/link";

import { requestPasswordReset } from "./actions";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export const dynamic = "force-dynamic";

export default async function PasswordResetRequestPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">
          Envoy
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">
          Reset your password
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enter your account email. If an account exists, Envoy will prepare a
          one-time reset token for the configured delivery channel.
        </p>
        <div className="mt-6">
          <PasswordResetRequestForm action={requestPasswordReset} />
        </div>
        <p className="mt-6 text-sm text-slate-600">
          Remembered it?{" "}
          <Link href="/sign-in" className="font-medium text-slate-950">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
