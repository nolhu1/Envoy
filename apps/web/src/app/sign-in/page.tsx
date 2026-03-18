import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";

import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams?: Promise<{
    accepted?: string;
    email?: string;
    registered?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : undefined;
  const accepted = params?.accepted === "1";
  const acceptedEmail = params?.email;
  const registered = params?.registered === "1";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">
              Envoy
            </p>
            <h1 className="mt-6 max-w-lg text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Sign in to review conversations and keep the queue moving.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              MVP credentials auth backed by Prisma. Workspace selection and invite
              flows stay out of the way for now.
            </p>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use the email and password stored in the Envoy database.
              </p>
            </div>

            {registered ? (
              <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Account created. You can sign in now.
              </p>
            ) : null}

            {accepted ? (
              <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Invite accepted{acceptedEmail ? ` for ${acceptedEmail}` : ""}. Sign
                in with your new password.
              </p>
            ) : null}

            <SignInForm />

            <p className="mt-6 text-sm text-slate-600">
              Need an account?{" "}
              <Link href="/sign-up" className="font-medium text-slate-950">
                Create one
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
