"use client";

export default function InboxError() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section
        role="alert"
        className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm shadow-slate-950/5"
      >
        <h1 className="font-semibold">Inbox could not load</h1>
        <p className="mt-1">
          Refresh the page or check runtime health if this keeps happening.
        </p>
      </section>
    </main>
  );
}
