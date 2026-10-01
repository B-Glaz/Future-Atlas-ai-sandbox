"use client";

import { ArrowRight, Award, Check, ChevronLeft, Clock3, GraduationCap, Sparkles } from "lucide-react";
import { CustomOptionInput } from "@/components/study-tools/CustomOptionInput";
import { useToolFlow } from "@/lib/ai/tool-flow";
import ForumCTA from "@/components/guidance/ForumCTA";
import ResultLoading from "@/components/ai/ResultLoading";

const countryOptions = [
  "Germany", "United Kingdom", "United States", "Canada", "France", "Ireland", "Other",
];

const studyOptions = [
  "Computer Science & AI", "Business & Management", "Engineering", "Medicine & Health", "Data Science", "Arts & Design", "Other",
];

const academicOptions = [
  "90% or above", "80% – 89%", "70% – 79%", "60% – 69%", "Below 60%", "Other",
];

type ScholarshipMatch = {
  name: string; provider: string; country: string; amount: string; coverage: string; deadline: string; match: number; type: string; tags: string[];
};

const steps = [
  { id: "country", title: "Where do you want to study?", subtitle: "Choose your preferred destination and we'll look for relevant funding opportunities.", options: countryOptions },
  { id: "study", title: "What would you like to study?", subtitle: "Select your field of study to improve the relevance of your scholarship matches.", options: studyOptions },
  { id: "academic", title: "What's your academic performance?", subtitle: "Your academic profile helps us estimate which opportunities may be a good fit.", options: academicOptions },
] as const;

const stepSubtitles = [
  "Let's find funding in your destination",
  "Let's match funding to your field",
  "Let's understand your academic profile",
];

const stepQuestions = [
  "Where do you want to study?",
  "What would you like to study?",
  "What's your academic performance?",
];

const stepDescriptions = [
  "Choose your preferred destination and we'll look for relevant funding opportunities.",
  "Select your field of study to improve the relevance of your scholarship matches.",
  "Your academic profile helps us estimate which opportunities may be a good fit.",
];

export default function ScholarshipExplorer() {
  const flow = useToolFlow({
    steps,
    aiMode: "scholarship",
    aiMessage: "Recommend suitable study-abroad scholarships or funding options.",
    getInputs: (answers) => ({ country: answers.country, study: answers.study, academic: answers.academic }),
    resultKey: "scholarships",
  });

  const { step, currentSelection, currentCustomValue, isOtherSelected, canContinue, visibleOptions, showAllOptions, setShowAllOptions, showResults, setShowResults, results, isLoading, error, selectOption, previousStep, nextStep, clearSelection, handleCustomChange, progress, totalSteps } = flow;

  const country = flow.answers.country || "";
  const study = flow.answers.study || "";
  const academic = flow.answers.academic || "";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex justify-end"><button type="button" onClick={clearSelection} className="text-sm font-medium text-slate-500 transition hover:text-slate-900">Clear Selection</button></div>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        {!showResults ? (
          <>
            <div className="border-b border-slate-100 px-6 py-6 sm:px-10"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg"><Award size={23} strokeWidth={1.8} /></div><div><div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight text-slate-900">Scholarship Explorer</h1><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">AI Guided</span></div><p className="mt-1 text-sm text-slate-500">Discover funding opportunities that match your profile.</p></div></div><div className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 sm:flex"><Sparkles size={13} /> Find scholarships in seconds</div></div></div>
            <div className="px-6 pt-7 sm:px-10"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-400">Step {step} of {totalSteps}</span><span className="text-xs font-medium text-slate-400">{progress}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>
            <div className="px-6 py-10 sm:px-10 sm:py-14"><div className="mx-auto max-w-3xl"><p className="mb-3 text-sm font-medium text-violet-600">{stepSubtitles[step - 1]}</p><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-4xl">{stepQuestions[step - 1]}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{stepDescriptions[step - 1]}</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{visibleOptions.map((option) => {if (option === "__future_atlas_more__") {return (<button key="__more__" type="button" onClick={() => setShowAllOptions(true)} aria-expanded={showAllOptions} className="group flex min-h-[64px] items-center justify-between rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 px-5 text-left text-violet-700 transition-all duration-200 ease-out hover:border-violet-400 hover:bg-violet-50"><span className="text-sm font-semibold">More</span><ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" /></button>);}const selected = currentSelection === option;return (<button key={option} onClick={() => selectOption(option)} className={`group flex min-h-[64px] items-center justify-between rounded-2xl border px-5 text-left transition-all duration-200 ${selected ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}><span className="text-sm font-medium">{option}</span><span className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${selected ? "border-white bg-white text-slate-900" : "border-slate-200 text-transparent group-hover:border-slate-300"}`}><Check size={13} strokeWidth={3} /></span></button>);})}</div>{isOtherSelected && <CustomOptionInput value={currentCustomValue} onChange={handleCustomChange} placeholder="Enter your own education-related answer" />}<div className="mt-10 flex items-center justify-between"><button onClick={previousStep} disabled={step === 1} className={`flex items-center gap-2 text-sm font-medium transition ${step === 1 ? "pointer-events-none opacity-0" : "text-slate-500 hover:text-slate-900"}`}><ChevronLeft size={17} /> Back</button><button onClick={nextStep} disabled={!canContinue} className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all ${canContinue ? "bg-slate-900 text-white shadow-lg shadow-slate-900/15 hover:-translate-y-0.5 hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>{step === 3 ? "Find Scholarships" : "Continue"} <ArrowRight size={16} /></button></div></div></div>
            <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-10"><div className="flex items-center justify-center gap-2 text-xs text-slate-400"><GraduationCap size={13} /> We&apos;ll personalize scholarship opportunities for you.</div></div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-100 px-6 py-7 sm:px-10"><button onClick={() => setShowResults(false)} className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"><ChevronLeft size={17} /> Change preferences</button><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-600"><Sparkles size={15} /> Your personalized matches</div><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">Scholarships worth exploring</h2><p className="mt-2 text-sm text-slate-500">Funding opportunities for <span className="font-medium text-slate-700">{study}</span> in <span className="font-medium text-slate-700">{country}</span>.</p></div><div className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Academic profile</p><p className="mt-1 text-sm font-semibold text-slate-800">{academic}</p></div></div></div>
            <div className="grid gap-4 p-6 sm:p-10 lg:grid-cols-3">{(results as ScholarshipMatch[] || []).map((scholarship, index) => (<div key={`${scholarship.name}-${index}`} className="group rounded-3xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"><div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Award size={21} strokeWidth={1.8} /></div><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Match</p><p className="mt-0.5 text-xl font-bold text-slate-900">{scholarship.match}%</p></div></div><div className="mt-6"><p className="text-xs font-medium text-violet-600">{scholarship.provider}</p><h3 className="mt-2 min-h-[56px] text-xl font-semibold leading-7 tracking-tight text-slate-900">{scholarship.name}</h3><p className="mt-3 text-xs text-slate-500">{scholarship.type} · {scholarship.country}</p></div><div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Funding</p><p className="mt-1 text-sm font-semibold text-slate-900">{scholarship.amount}</p><p className="mt-1 text-xs leading-5 text-slate-500">{scholarship.coverage}</p></div><div className="mt-5 flex items-center justify-between"><div className="flex items-center gap-2"><Clock3 size={14} className="text-slate-400" /><span className="text-xs text-slate-500">Deadline</span></div><span className="text-xs font-medium text-slate-700">{scholarship.deadline}</span></div><div className="mt-5 flex flex-wrap gap-2">{scholarship.tags.map((tag) => (<span key={tag} className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">{tag}</span>))}</div>{index === 0 && <div className="mt-7 text-center text-[10px] font-medium text-violet-500">Best match for your profile</div>}</div>))}</div>
            {(isLoading || error || !Array.isArray(results) || !results.length) && (<div className="px-6 pb-6 text-center text-xs text-slate-400 sm:px-10">{isLoading ? <ResultLoading messages={["Reviewing your profile...", "Comparing funding options...", "Preparing scholarship matches..."]} /> : error || "Your AI matches will appear here."}</div>)}
            <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-5 sm:px-10"><div className="text-center"><p className="text-xs text-slate-400">Scholarship availability and deadlines can change. Always verify details with the official provider.</p></div></div>
            {!isLoading && Array.isArray(results) && Boolean(results.length) && <ForumCTA context="scholarship" />}
          </>
        )}
      </div>
      <p className="mt-4 text-center text-[10px] font-medium text-slate-400">Powered by One Window</p>
    </div>
  );
}
