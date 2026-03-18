import Link from "next/link";

import { validateInviteToken } from "@/lib/invite";

export const dynamic = "force-dynamic";

type InviteAcceptancePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InviteAcceptancePage({
  params,
}: InviteAcceptancePageProps) {
  const { token } = await params;
  const invite = await validateInviteToken(token);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Envoy Invite
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {invite ? "Join workspace" : "Invite unavailable"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {invite
              ? "This invite is valid. Account completion and acceptance will land in the next step."
              : "This invite token is invalid, expired, or has already been accepted."}
          </p>
        </header>

        {invite ? (
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

            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Invited By
              </p>
              <p className="mt-3 text-sm font-medium text-slate-950">
                {invite.invitedByUser.name || invite.invitedByUser.email}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Acceptance is not wired yet. This page is the first validation shell.
              </p>
            </article>
          </section>
        ) : (
          <section className="mt-8 rounded-[24px] border border-amber-200 bg-amber-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
              Invite Invalid
            </p>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              Ask a workspace admin for a new invitation link.
            </p>
          </section>
        )}

        <div className="mt-8">
          <Link
            href="/sign-in"
            className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
