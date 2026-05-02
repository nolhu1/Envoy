"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 sm:h-9 sm:px-3 sm:text-sm"
    >
      Sign out
    </button>
  );
}
