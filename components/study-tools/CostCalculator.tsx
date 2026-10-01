"use client";

import { ArrowRight, Calculator, Check, ChevronLeft, ChevronRight, Home, Plane, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import Link from "next/link";
import { CustomOptionInput } from "@/components/study-tools/CustomOptionInput";
import { useToolFlow } from "@/lib/ai/tool-flow";
import ForumCTA from "@/components/guidance/ForumCTA";
import ResultLoading from "@/components/ai/ResultLoading";

type BudgetStatus = { label: string; description: string; };

type CostData = {
  country: string; course: string; studyLevel: string; tuition: string; accommodation: string; living: string;
  insurance: string; visa: string; travel: string; other: string; total: string; budget: string;
  budgetStatus?: BudgetStatus; aiAnalysis?: string;
};

const questions = [
  { id: "country", title: "Where are you planning to study?", subtitle: "Choose your preferred study destination.", options: ["Germany", "France", "United Kingdom", "United States", "Canada", "Australia", "Ireland", "Netherlands", "New Zealand", "Italy", "Spain", "Sweden", "Finland", "Denmark", "Norway", "Switzerland", "Belgium", "Austria", "Poland", "Portugal", "Japan", "South Korea", "Singapore", "United Arab Emirates", "Other"] },
  { id: "studyLevel", title: "What level are you planning to study?", subtitle: "This helps us estimate tuition and other costs.", options: ["Bachelor's", "Master's", "MBA", "PhD", "Diploma / Certificate", "Other"] },
  { id: "course", title: "What do you want to study?", subtitle: "Select your broad field of study.", options: ["Computer Science / IT", "Engineering", "Business / Management", "Data Science / AI", "Healthcare / Medicine", "Arts / Design", "Other"] },
  { id: "budget", title: "What is your approximate annual budget?", subtitle: "This helps us understand how comfortable the estimated cost may be.", options: ["Under ₹10 Lakhs", "₹10–20 Lakhs", "₹20–30 Lakhs", "₹30–50 Lakhs", "Above ₹50 Lakhs", "I'm not sure", "Other"] },
];

const steps = questions.map(q => ({ id: q.id, title: q.title, subtitle: q.subtitle, options: q.options }));

function CostCard({ icon: Icon, title, value }: { icon: typeof Wallet; title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon size={19} /></div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
      </div>
      <p className="mt-5 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function CostCalculator() {
  const flow = useToolFlow({
    steps,
    aiMode: "cost",
    aiMessage: "Generate a personalized study-abroad cost estimate from the user's inputs.",
    getInputs: (answers) => answers,
    resultKey: "data",
  });

  const { step, currentStep, currentCustomValue, isOtherSelected, canContinue, visibleOptions, showAllOptions, setShowAllOptions, results, isLoading, error, answers, selectOption, previousStep, nextStep, clearSelection, handleCustomChange, totalSteps } = flow;

  const data = answers as Record<string, string>;
  const result = results as CostData | null;

  if (result) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-600"><Sparkles size={16} /> Your Study Abroad Cost Estimate</div><h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Estimated cost for {result.country}</h1><p className="mt-2 text-sm text-slate-500">{result.studyLevel} · {result.course}</p></div>
          <button onClick={clearSelection} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><X size={15} /> Clear Selection</button>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <CostCard icon={Wallet} title="Tuition" value={result.tuition} />
          <CostCard icon={Home} title="Accommodation" value={result.accommodation} />
          <CostCard icon={Wallet} title="Living Expenses" value={result.living} />
          <CostCard icon={ShieldCheck} title="Insurance" value={result.insurance} />
          <CostCard icon={Check} title="Visa" value={result.visa} />
          <CostCard icon={Plane} title="Travel" value={result.travel} />
          <CostCard icon={Wallet} title="Other Expenses" value={result.other} />
          <div className="rounded-3xl bg-slate-900 p-7 text-white"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Estimated Total</p><p className="mt-4 text-2xl font-semibold">{result.total}</p><p className="mt-3 text-xs leading-5 text-slate-400">This is an estimated range. Actual costs depend on your university, city, accommodation, lifestyle, and current regulations.</p></div>
        </div>
        <div className="mt-8 rounded-3xl border border-violet-100 bg-violet-50/50 p-7"><div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm"><Sparkles size={18} /></div><div className="flex-1"><p className="text-xs font-medium uppercase tracking-wider text-violet-600">AI Cost Advisor</p><h3 className="mt-2 font-semibold text-slate-900">Your personalized cost analysis</h3><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{result.aiAnalysis}</p><Link href="/guidance" className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700">Get Personalized Guidance <ArrowRight size={15} /></Link></div></div></div>
        <div className="mt-6 overflow-hidden rounded-3xl border border-violet-100"><ForumCTA context="cost" /></div>
        <p className="mt-4 text-center text-[10px] font-medium text-slate-400">Powered by One Window</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex justify-end"><button type="button" onClick={clearSelection} className="text-sm font-medium text-slate-500 transition hover:text-slate-900">Clear Selection</button></div>
      <div className="mb-10 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Calculator size={24} /></div><h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Estimate your study abroad cost</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">Answer a few quick questions and get an estimated picture of what studying abroad could cost you.</p></div>
      <div className="mb-8 flex gap-2">{questions.map((_, index) => (<div key={index} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-slate-900" : "bg-slate-200"}`} />))}</div>
      <div className="rounded-[32px] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Question {step} of {totalSteps}</p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{currentStep.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{currentStep.subtitle}</p>
        <div className="mt-8 space-y-3">{visibleOptions.map((option) => {if (option === "__future_atlas_more__") {return (<button key="__more__" type="button" onClick={() => setShowAllOptions(true)} aria-expanded={showAllOptions} className="group flex w-full items-center justify-between rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-4 text-left text-violet-700 transition-all duration-200 ease-out hover:border-violet-400 hover:bg-violet-50"><span className="text-sm font-semibold">More</span><ArrowRight size={17} /></button>);}return (<button key={option} onClick={() => selectOption(option)} className={`group flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${data[currentStep.id] === option ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}><span className="text-sm font-medium">{option}</span><ChevronRight size={17} className={`transition-transform group-hover:translate-x-1 ${data[currentStep.id] === option ? "text-white" : "text-slate-300"}`} /></button>);})}</div>
        {isOtherSelected && <CustomOptionInput value={currentCustomValue} onChange={handleCustomChange} placeholder="Enter your own study-abroad related answer" />}
        <div className="mt-8 flex items-center justify-between gap-4"><button type="button" onClick={previousStep} disabled={step === 1 || isLoading} className={`flex items-center gap-2 text-sm font-medium transition ${step === 1 || isLoading ? "pointer-events-none opacity-0" : "text-slate-500 hover:text-slate-900"}`}><ChevronLeft size={17} /> Back</button><button type="button" onClick={nextStep} disabled={!canContinue || isLoading} className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition ${canContinue && !isLoading ? "bg-slate-900 text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>{isLoading ? "Generating..." : step === totalSteps ? "Generate Estimate" : "Continue"} <ArrowRight size={16} /></button></div>
      </div>
      <div className="mt-6 text-center text-[10px] leading-5 text-slate-400">{isLoading ? <ResultLoading messages={["Understanding your budget...", "Comparing study costs...", "Preparing your estimate..."]} /> : error || "Estimates are indicative only. Actual costs vary by university, location, lifestyle, exchange rates, and individual circumstances."}</div>
      <p className="mt-3 text-center text-[10px] font-medium text-slate-400">Powered by One Window</p>
    </div>
  );
}
