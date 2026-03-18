import Link from "next/link";

import { acceptInviteAction } from "@/app/invite/[token]/actions";
import { validateInviteToken } from "@/lib/invite";

export const dynamic = "force-dynamic";

type InviteAcceptancePageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function InviteAcceptancePage({
  params,
  searchParams,
}: InviteAcceptancePageProps) {
  const { token } = await params;
  const invite = await validateInviteToken(token);
  const formAction = acceptInviteAction.bind(null, token);
  const query = searchParams ? await searchParams : undefined;
  const errorMessage = query?.error;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Envoy Invite
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {invite ? "Accept workspace invite" : "Invite unavailable"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {invite
              ? "Create your account inside the invited workspace using the role attached to this invite."
              : "This invite token is invalid, expired, or has already been accepted."}
          </p>
        </header>

        {errorMessage ? (
          <section className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-700">
              Invite Error
            </p>
            <p className="mt-3 text-sm leading-6 text-rose-900">{errorMessage}</p>
          </section>
        ) : null}

        {invite ? (
          <>
            <section className="mt-8 grid gap-6 md:grid-cols-2">
              <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Workspace
                </p>
                <p className="mt-3 text-xl font-medium text-slate-950">
                  {invite.workspace.name}
                </p>
                <p className="mt-2 break-all text-sm text-slate-600">
                  {invite.workspace.id}
                </p>
              </article>

              <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Invite Email
                </p>
                <p className="mt-3 break-all text-lg font-medium text-slate-950">
                  {invite.email}
                </p>
              </article>

              <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Role
                </p>
                <p className="mt-3 text-lg font-medium text-slate-950">
                  {invite.role}
                </p>
              </article>

              <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Expires At
                </p>
                <p className="mt-3 text-sm font-medium text-slate-950">
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(invite.expiresAt)}
                </p>
              </article>
            </section>

            <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Complete Account
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                Set your name and password
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                Accepting this invite creates your account in the existing
                workspace for the invited email above, then sends you to sign in.
              </p>

              <form action={formAction} className="mt-6 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <input
                    required
                    type="text"
                    name="name"
                    autoComplete="name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <input
                    required
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    minLength={8}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                  />
                </label>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Accept invite
                  </button>
                  <Link
                    href="/sign-in"
                    className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Already have an account?
                  </Link>
                </div>
              </form>
            </section>
          </>
        ) : (
          <section className="mt-8 rounded-[24px] border border-amber-200 bg-amber-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
              Invite Invalid
            </p>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              Ask a workspace admin for a new invitation link.
            </p>
            <div className="mt-6">
              <Link
                href="/sign-in"
                className="inline-flex rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-400"
              >
                Go to sign in
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
