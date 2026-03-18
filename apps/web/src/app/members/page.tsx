import Link from "next/link";

import { createInviteAction } from "@/app/members/actions";
import { listInvitesForCurrentWorkspace } from "@/lib/invite";
import {
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/lib/permissions";
import { getCurrentWorkspaceMembers } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  searchParams?: Promise<{
    error?: string;
    invite?: string;
  }>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_MEMBERS);
  const canManageInvites = hasPermission(
    authContext.role,
    PERMISSIONS.CREATE_INVITES,
  );
  const members = await getCurrentWorkspaceMembers();
  const invites = canManageInvites
    ? await listInvitesForCurrentWorkspace()
    : [];
  const params = searchParams ? await searchParams : undefined;
  const errorMessage = params?.error;
  const inviteCreated = params?.invite === "created";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-[28px] bg-slate-950 px-8 py-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Members
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Workspace members
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Server-rendered workspace member list for future invite and member
            management flows.
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
              href="/settings/workspace"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Workspace settings
            </Link>
          </div>
        </header>

        {inviteCreated ? (
          <section className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
              Invite Created
            </p>
            <p className="mt-3 text-sm leading-6 text-emerald-900">
              The invitation was created for this workspace.
            </p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-700">
              Invite Error
            </p>
            <p className="mt-3 text-sm leading-6 text-rose-900">{errorMessage}</p>
          </section>
        ) : null}

        <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Create Invite
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                Invite a workspace member
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                Invite creation is workspace-scoped and currently limited to
                admins. Email delivery and acceptance completion will be added
                later.
              </p>
            </div>

            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {authContext.role}
            </div>
          </div>

          {canManageInvites ? (
            <form action={createInviteAction} className="mt-6 grid gap-4 md:grid-cols-[1.4fr_0.8fr_auto]">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  name="role"
                  defaultValue="MEMBER"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Create invite
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You do not have permission to create workspace invites.
            </p>
          )}
        </section>

        {members.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-[1.5fr_1.6fr_0.8fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Created At</span>
            </div>

            <div className="divide-y divide-slate-200">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-[1.5fr_1.6fr_0.8fr_1fr] gap-4 px-6 py-5 text-sm text-slate-950"
                >
                  <span className="font-medium text-slate-950">
                    {member.name || "Unnamed user"}
                  </span>
                  <span className="break-all text-slate-700">{member.email}</span>
                  <span className="text-slate-700">{member.role}</span>
                  <span className="text-slate-700">
                    {member.createdAt
                      ? new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                        }).format(member.createdAt)
                      : "Unavailable"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              No Members Yet
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              This workspace does not have any visible members yet. Invite flows
              will be added later.
            </p>
          </section>
        )}

        {canManageInvites && invites.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <span>Email</span>
              <span>Role</span>
              <span>Expires</span>
              <span>Invite Link</span>
            </div>

            <div className="divide-y divide-slate-200">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr] gap-4 px-6 py-5 text-sm text-slate-950"
                >
                  <div>
                    <p className="break-all font-medium text-slate-950">
                      {invite.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Invited by {invite.invitedByUser.name || invite.invitedByUser.email}
                    </p>
                  </div>
                  <span className="text-slate-700">{invite.role}</span>
                  <span className="text-slate-700">
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                    }).format(invite.expiresAt)}
                  </span>
                  <Link
                    href={`/invite/${invite.token}`}
                    className="text-sm font-medium text-slate-950 underline decoration-slate-300 underline-offset-4"
                  >
                    Open invite
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : canManageInvites ? (
          <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              No Pending Invites
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              This workspace does not have any pending invites yet.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
