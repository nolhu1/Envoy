import Link from "next/link";

import {
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  startGmailConnectAction,
  syncGmailRecentThreadsAction,
} from "@/app/settings/workspace/actions";
import { getCurrentWorkspaceGmailIntegration } from "@/lib/gmail-ingestion";

export const dynamic = "force-dynamic";

type WorkspaceSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkspaceSettingsPage({
  searchParams,
}: WorkspaceSettingsPageProps) {
  const authContext = await requirePermission(
    PERMISSIONS.VIEW_WORKSPACE_SETTINGS,
  );
  const canManageIntegrations = hasPermission(
    authContext.role,
    PERMISSIONS.CONNECT_INTEGRATIONS,
  );
  const workspace = await getCurrentWorkspace();
  const gmailIntegration = canManageIntegrations
    ? await getCurrentWorkspaceGmailIntegration()
    : null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gmailStatus = readSearchParam(resolvedSearchParams?.gmail);
  const gmailMessage = readSearchParam(resolvedSearchParams?.message);
  const gmailSyncStatus = readSearchParam(resolvedSearchParams?.gmailSync);
  const gmailSyncThreadCount = readSearchParam(resolvedSearchParams?.threadCount);
  const gmailSyncMessageCount = readSearchParam(resolvedSearchParams?.messageCount);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {gmailStatus === "connected" ? (
          <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Gmail connected successfully. Initial sync and callback follow-up
            flows are still pending.
          </section>
        ) : null}

        {gmailStatus === "error" && gmailMessage ? (
          <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Gmail connect failed: {gmailMessage}
          </section>
        ) : null}

        {gmailSyncStatus === "completed" ? (
          <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Gmail sync completed. Threads fetched: {gmailSyncThreadCount ?? "0"}.
            Messages written: {gmailSyncMessageCount ?? "0"}.
          </section>
        ) : null}

        {gmailSyncStatus === "error" && gmailMessage ? (
          <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            Gmail sync failed: {gmailMessage}
          </section>
        ) : null}

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
              href="/profile"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Profile
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

        {canManageIntegrations ? (
          <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Admin Management
            </p>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">
              Integrations and workspace management
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Start the Gmail OAuth connect flow for this workspace. Callback
              exchange, token storage, and integration persistence are still
              pending.
            </p>
            {gmailIntegration ? (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
                  Gmail connected
                  {gmailIntegration.externalAccountId
                    ? `: ${gmailIntegration.externalAccountId}`
                    : ""}
                </div>
                <form action={syncGmailRecentThreadsAction}>
                  <button
                    type="submit"
                    className="inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Sync Recent Gmail Threads
                  </button>
                </form>
              </div>
            ) : (
              <form action={startGmailConnectAction} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Connect Gmail
                </button>
              </form>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
