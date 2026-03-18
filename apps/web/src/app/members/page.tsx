import Link from "next/link";

import { requireAppAuthContext } from "@/lib/app-auth";
import { getCurrentWorkspaceMembers } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  await requireAppAuthContext();
  const members = await getCurrentWorkspaceMembers();

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
              href="/settings/workspace"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Workspace settings
            </Link>
          </div>
        </header>

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
      </div>
    </main>
  );
}
