export default function AccessRestricted() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FC] px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
          !
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Access Restricted
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          This embedded application is not authorized to run on this website.
        </p>

        <p className="mt-4 text-xs leading-5 text-slate-400">
          Please contact the application owner if you believe this is an error.
        </p>
      </section>
    </main>
  );
}
