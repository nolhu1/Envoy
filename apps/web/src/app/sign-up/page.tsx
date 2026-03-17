import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";

import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,_#f8fafc_0%,_#ecfeff_44%,_#f8fafc_100%)] px-6 py-16">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] bg-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Phase D1
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
            Create an Envoy account.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
            Sign-up creates one user and one temporary default workspace so the
            app is usable before invite flows and workspace onboarding land.
          </p>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-950">Set up credentials</h2>
            <p className="mt-2 text-sm text-slate-600">
              Passwords are hashed with bcrypt before they reach the database.
            </p>
          </div>

          <SignUpForm />

          <p className="mt-6 text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-slate-950">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
