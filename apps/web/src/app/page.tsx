import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { requireAppAuthContext } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authContext = await requireAppAuthContext();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
              Envoy
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Signed in
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              This page is server-guarded through the shared auth helper and
              shows the current authenticated app user coming from the server
              session.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/members"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Members
            </Link>
            <Link
              href="/settings/workspace"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Workspace settings
            </Link>
            <SignOutButton />
          </div>
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Email
            </p>
            <p className="mt-3 text-lg font-medium text-slate-950">
              {authContext.email}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              User ID
            </p>
            <p className="mt-3 break-all text-sm font-medium text-slate-950">
              {authContext.userId}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Workspace ID
            </p>
            <p className="mt-3 break-all text-sm font-medium text-slate-950">
              {authContext.workspaceId}
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Role
            </p>
            <p className="mt-3 text-lg font-medium text-slate-950">
              {authContext.role}
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
