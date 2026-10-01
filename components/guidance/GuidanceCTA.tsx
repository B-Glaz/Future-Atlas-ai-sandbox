import Link from "next/link";

export default function GuidanceCTA() {
  return (
    <section className="mx-auto mt-12 flex max-w-5xl flex-col items-center justify-between gap-5 border-t border-slate-200 px-1 pt-8 text-center sm:flex-row sm:text-left">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Ready for personalized guidance?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Share your study plans and we will help you take the next step.
        </p>
      </div>
      <Link
        href="/guidance"
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Get Personalized Guidance
      </Link>
    </section>
  );
}