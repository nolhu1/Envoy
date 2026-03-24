import Link from "next/link";

import {
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  disconnectIntegrationAction,
  startGmailConnectAction,
  startSlackConnectAction,
  syncIntegrationAction,
} from "@/app/settings/workspace/actions";
import { getCurrentWorkspaceManagedIntegrations } from "@/lib/integration-management";

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
  const managedIntegrations = canManageIntegrations
    ? await getCurrentWorkspaceManagedIntegrations()
    : null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const integrationName = readSearchParam(resolvedSearchParams?.integration);
  const integrationAction = readSearchParam(resolvedSearchParams?.action);
  const integrationStatus = readSearchParam(resolvedSearchParams?.status);
  const integrationMessage = readSearchParam(resolvedSearchParams?.message);
  const syncThreadCount = readSearchParam(resolvedSearchParams?.threadCount);
  const syncMessageCount = readSearchParam(resolvedSearchParams?.messageCount);
  const syncDmConversationCount = readSearchParam(
    resolvedSearchParams?.dmConversationCount,
  );

  function formatDateTime(value: Date | null) {
    if (!value) {
      return "Never";
    }

    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  function renderIntegrationBanner() {
    if (
      integrationStatus === "completed" &&
      integrationAction === "sync" &&
      integrationName === "gmail"
    ) {
      return (
        <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          Gmail sync completed. Threads fetched: {syncThreadCount ?? "0"}.
          Messages written: {syncMessageCount ?? "0"}.
        </section>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "sync" &&
      integrationName === "slack"
    ) {
      return (
        <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          Slack sync completed. DMs fetched: {syncDmConversationCount ?? "0"}.
          Messages written: {syncMessageCount ?? "0"}.
        </section>
      );
    }

    if (
      integrationStatus === "completed" &&
      integrationAction === "disconnect" &&
      integrationName
    ) {
      return (
        <section className="mb-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          {integrationName === "gmail" ? "Gmail" : "Slack"} disconnected successfully.
        </section>
      );
    }

    if (
      integrationStatus === "connected" &&
      (integrationName === "gmail" || integrationName === "slack")
    ) {
      return (
        <section className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          {integrationName === "gmail" ? "Gmail" : "Slack"} connected successfully.
        </section>
      );
    }

    if (
      integrationStatus === "error" &&
      integrationMessage &&
      (integrationName === "gmail" || integrationName === "slack")
    ) {
      return (
        <section className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          {integrationAction === "sync"
            ? `${integrationName === "gmail" ? "Gmail" : "Slack"} sync failed`
            : `${integrationName === "gmail" ? "Gmail" : "Slack"} connect failed`}
          : {integrationMessage}
        </section>
      );
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {renderIntegrationBanner()}

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
              Integrations
            </p>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">
              Integration management
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Connect, review, resync, and disconnect the canonical Gmail and
              Slack integrations for this workspace.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {managedIntegrations?.map((integration) => (
                <article
                  key={integration.platform}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {integration.provider === "gmail" ? "Gmail" : "Slack"}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">
                        {integration.displayName}
                      </h3>
                    </div>

                    <span
                      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${
                        integration.status === "CONNECTED"
                          ? "bg-emerald-100 text-emerald-900"
                          : integration.status === "ERROR"
                            ? "bg-rose-100 text-rose-900"
                            : integration.status === "SYNC_IN_PROGRESS"
                              ? "bg-amber-100 text-amber-900"
                              : integration.status === "PENDING"
                                ? "bg-slate-200 text-slate-800"
                                : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {integration.statusLabel}
                    </span>
                  </div>

                  <dl className="mt-4 space-y-3 text-sm text-slate-700">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Platform
                      </dt>
                      <dd className="mt-1">{integration.platform}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Last synced
                      </dt>
                      <dd className="mt-1">{formatDateTime(integration.lastSyncedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Summary
                      </dt>
                      <dd className="mt-1">
                        {integration.diagnosticsSummary ?? "No diagnostics available."}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {integration.provider === "gmail" ? (
                      <form action={startGmailConnectAction}>
                        <button
                          type="submit"
                          className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          {integration.isConnected ? "Reconnect Gmail" : "Connect Gmail"}
                        </button>
                      </form>
                    ) : (
                      <form action={startSlackConnectAction}>
                        <button
                          type="submit"
                          className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-white"
                        >
                          {integration.isConnected ? "Reconnect Slack" : "Connect Slack"}
                        </button>
                      </form>
                    )}

                    {integration.integrationId ? (
                      <>
                        <form action={syncIntegrationAction}>
                          <input
                            type="hidden"
                            name="integrationId"
                            value={integration.integrationId}
                          />
                          <button
                            type="submit"
                            className="inline-flex rounded-full border border-cyan-300 px-4 py-2 text-sm font-medium text-cyan-950 transition hover:border-cyan-400 hover:bg-cyan-50"
                          >
                            {integration.provider === "gmail"
                              ? "Resync Gmail"
                              : "Resync Slack"}
                          </button>
                        </form>

                        <form action={disconnectIntegrationAction}>
                          <input
                            type="hidden"
                            name="integrationId"
                            value={integration.integrationId}
                          />
                          <button
                            type="submit"
                            className="inline-flex rounded-full border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 transition hover:border-rose-400 hover:bg-rose-50"
                          >
                            Disconnect
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
