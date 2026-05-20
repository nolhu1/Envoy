import Link from "next/link";

import { confirmPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

type PasswordResetConfirmPageProps = {
  searchParams?: Promise<{
    email?: string;
    token?: string;
    error?: string;
  }>;
};

export default async function PasswordResetConfirmPage({
  searchParams,
}: PasswordResetConfirmPageProps) {
  const params = searchParams ? await searchParams : {};
  const email = params.email ?? "";
  const token = params.token ?? "";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">
          Envoy
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Reset tokens are one-time use and expire automatically.
        </p>

        {params.error ? (
          <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {params.error}
          </p>
        ) : null}

        <form action={confirmPasswordReset} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              required
              type="email"
              name="email"
              defaultValue={email}
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Reset token</span>
            <input
              required
              type="text"
              name="token"
              defaultValue={token}
              autoComplete="off"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">
              New password
            </span>
            <input
              required
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Reset password
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          Need a new token?{" "}
          <Link
            href="/password-reset/request"
            className="font-medium text-slate-950"
          >
            Request another reset
          </Link>
        </p>
      </section>
    </main>
  );
}
