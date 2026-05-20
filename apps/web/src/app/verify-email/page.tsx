import Link from "next/link";

import { verifyEmailWithToken } from "@/lib/account-lifecycle";
import { sanitizeUiErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

type VerifyEmailPageProps = {
  searchParams?: Promise<{
    email?: string;
    token?: string;
  }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = searchParams ? await searchParams : {};
  const email = params.email ?? "";
  const token = params.token ?? "";
  let status: "missing" | "verified" | "failed" = "missing";
  let message = "Verification link is missing an email or token.";

  if (email && token) {
    try {
      await verifyEmailWithToken({ email, token });
      status = "verified";
      message = "Email verified. You can sign in now.";
    } catch (error) {
      status = "failed";
      message = sanitizeUiErrorMessage(error) || "Email verification failed.";
    }
  }

  const tone =
    status === "verified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">
          Envoy
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">
          Email verification
        </h1>
        <p className={`mt-6 rounded-xl border px-4 py-3 text-sm ${tone}`}>
          {message}
        </p>
        <p className="mt-6 text-sm text-slate-600">
          <Link href="/sign-in" className="font-medium text-slate-950">
            Return to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
