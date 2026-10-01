import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceForm from "@/components/guidance/ZohoGuidanceForm";

export default function GuidancePage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <section className="mx-auto max-w-3xl px-6 py-14 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
          Future Atlas
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
          Get personalized guidance
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Tell us about your education and study-abroad plans.
        </p>
        <div className="mt-8 border-t border-slate-200 pt-8">
          <GuidanceForm />
        </div>
      </section>
    </main>
  );
}
