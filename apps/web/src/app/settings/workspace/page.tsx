import Link from "next/link";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const authContext = await requirePermission(
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
  );
  const workspace = await getCurrentWorkspace();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Workspace Settings
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Workspace shell
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Server-rendered workspace context for future settings, invite flows,
            and tenancy-aware pages.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Home
            </Link>
            <Link
              href="/members"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Members
            </Link>
          </div>
        </header>

        {workspace ? (
          <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Workspace Name
              </p>
              <p className="mt-3 text-xl font-medium text-slate-950">
                {workspace.name}
              </p>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] xl:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Workspace ID
              </p>
              <p className="mt-3 break-all text-sm font-medium text-slate-950">
                {workspace.id}
              </p>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Created At
              </p>
              <p className="mt-3 text-sm font-medium text-slate-950">
                {workspace.createdAt
                  ? new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(workspace.createdAt)
                  : "Unavailable"}
              </p>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Current User Email
              </p>
              <p className="mt-3 break-all text-sm font-medium text-slate-950">
                {authContext.email}
              </p>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Current User Role
              </p>
              <p className="mt-3 text-lg font-medium text-slate-950">
                {authContext.role}
              </p>
            </article>
          </section>
        ) : (
          <section className="mt-8 rounded-[24px] border border-amber-200 bg-amber-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
              Workspace Unavailable
            </p>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              The current workspace could not be loaded for this session. The
              authenticated user context is still available, but the workspace
              record lookup returned no result.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
