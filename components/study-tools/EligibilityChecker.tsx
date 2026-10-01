"use client";

import { ArrowRight, Check, CheckCircle2, ChevronLeft, CircleAlert, ClipboardCheck, GraduationCap, Sparkles } from "lucide-react";
import { CustomOptionInput } from "@/components/study-tools/CustomOptionInput";
import { useToolFlow } from "@/lib/ai/tool-flow";
import ForumCTA from "@/components/guidance/ForumCTA";
import ResultLoading from "@/components/ai/ResultLoading";

const studyOptions = [
  "Computer Science & AI",
  "Business & Management",
  "Engineering",
  "Medicine & Health",
  "Data Science",
  "Arts & Design",
  "Other",
];
const countryOptions = [
  "Germany",
  "United Kingdom",
  "United States",
  "Canada",
  "France",
  "Ireland",
  "Other",
];
const academicOptions = [
  "90% or above",
  "80% – 89%",
  "70% – 79%",
  "60% – 69%",
  "Below 60%",
  "Other",
];
const englishOptions = [
  "IELTS 7.0+",
  "IELTS 6.5",
  "IELTS 6.0",
  "IELTS below 6.0",
  "I haven't taken a test yet",
  "Other",
];
const levelOptions = [
  "Bachelor's",
  "Master's",
  "PhD / Doctorate",
  "Other",
];

type EligibilityBreakdown = {
  title: string;
  status: "positive" | "caution";
  description: string;
};

type EligibilityResult = {
  score: number;
  status: string;
  summary: string;
  breakdown: EligibilityBreakdown[];
  nextSteps: string[];
};

const steps = [
  { id: "study", title: "What would you like to study?", subtitle: "Select the field you're interested in pursuing abroad.", options: studyOptions },
  { id: "country", title: "Where are you planning to study?", subtitle: "Choose a destination so we can consider typical admission requirements.", options: countryOptions },
  { id: "academic", title: "What's your academic performance?", subtitle: "Select the academic range that best represents your current or previous qualification.", options: academicOptions },
  { id: "english", title: "What's your English proficiency?", subtitle: "Choose your current English language test status or score.", options: englishOptions },
  { id: "level", title: "What level do you want to study?", subtitle: "Different study levels have different academic and language requirements.", options: levelOptions },
] as const;

const stepSubtitles = [
  "Let's understand your academic goal",
  "Choose your preferred destination",
  "Tell us about your academics",
  "Let's check your language readiness",
  "One last question",
];

const stepQuestions = [
  "What would you like to study?",
  "Where are you planning to study?",
  "What's your academic performance?",
  "What's your English proficiency?",
  "What level do you want to study?",
];

const stepDescriptions = [
  "Select the field you're interested in pursuing abroad.",
  "Choose a destination so we can consider typical admission requirements.",
  "Select the academic range that best represents your current or previous qualification.",
  "Choose your current English language test status or score.",
  "Different study levels have different academic and language requirements.",
];

export default function EligibilityChecker() {
  const flow = useToolFlow({
    steps,
    aiMode: "eligibility",
    aiMessage: "Create a preliminary study-abroad eligibility assessment for this student.",
    getInputs: (answers) => ({
      study: answers.study,
      country: answers.country,
      academic: answers.academic,
      english: answers.english,
      level: answers.level,
    }),
    resultKey: "data",
  });

  const {
    step,
    currentSelection,
    currentCustomValue,
    isOtherSelected,
    canContinue,
    visibleOptions,
    showAllOptions,
    setShowAllOptions,
    showResults,
    setShowResults,
    results,
    isLoading,
    error,
    answers,
    selectOption,
    previousStep,
    nextStep,
    clearSelection,
    handleCustomChange,
    progress,
    totalSteps,
  } = flow;

  const study = answers.study || "";
  const country = answers.country || "";
  const academic = answers.academic || "";
  const english = answers.english || "";
  const level = answers.level || "";

  const assessment = results as EligibilityResult | null;
  const score = assessment?.score ?? 0;

  if (showResults) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={clearSelection} className="text-sm font-medium text-slate-500 transition hover:text-slate-900">
            Clear Selection
          </button>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-7 sm:px-10">
            <button onClick={() => setShowResults(false)} className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900">
              <ChevronLeft size={17} /> Review my answers
            </button>
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-600">
                <Sparkles size={15} /> Your preliminary assessment
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">
                Your eligibility snapshot
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Based on the information you provided, here&apos;s an initial assessment of your study abroad readiness.
              </p>
            </div>
          </div>
          <div className="p-6 sm:p-10">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl bg-slate-900 p-7 text-white sm:p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Estimated eligibility match</p>
                    <p className="mt-4 text-6xl font-bold tracking-[-0.05em]">{score}%</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                    <CheckCircle2 size={24} />
                  </div>
                </div>
                <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${score}%` }} />
                </div>
                <div className="mt-6">
                  <p className="text-lg font-semibold">{assessment?.status || "Assessment pending"}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {assessment?.summary || "Your AI assessment will appear here shortly."}
                  </p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 p-7 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your profile</p>
                <div className="mt-6 space-y-5">
                  {[
                    { label: "Study field", value: study },
                    { label: "Destination", value: country },
                    { label: "Academic performance", value: academic },
                    { label: "English proficiency", value: english },
                    { label: "Study level", value: level },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Your readiness breakdown</h3>
              <p className="mt-1 text-xs text-slate-500">A quick view of the areas that may influence your eligibility.</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {(assessment?.breakdown || []).slice(0, 3).map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-3xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    {item.status === "caution" ? (
                      <CircleAlert size={18} className="text-slate-500" />
                    ) : (
                      <CheckCircle2 size={18} className="text-slate-700" />
                    )}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 rounded-3xl bg-slate-50 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <CircleAlert size={19} className="text-slate-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">What you should do next</h3>
                <div className="mt-4 space-y-3">
                  {(assessment?.nextSteps || []).slice(0, 3).map((s, index) => (
                    <div key={s} className="flex items-start gap-3">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-slate-600">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 text-center text-xs leading-5 text-slate-400">
            {isLoading ? (
              <ResultLoading messages={["Reviewing your profile...", "Checking programme fit...", "Preparing your assessment..."]} />
            ) : (
              error || "This tool provides an initial estimate based on the information you provide. It does not guarantee admission or visa approval. Requirements vary by university, programme, country, and applicant circumstances. Always verify requirements with official sources."
            )}
          </div>
          {!isLoading && Boolean(results) && <ForumCTA context="eligibility" />}
        </div>
        <p className="mt-4 text-center text-[10px] font-medium text-slate-400">Powered by One Window</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={clearSelection} className="text-sm font-medium text-slate-500 transition hover:text-slate-900">
          Clear Selection
        </button>
      </div>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
                <ClipboardCheck size={23} strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-slate-900">Eligibility Checker</h1>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">
                    AI Guided
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">Get a quick assessment of your study abroad eligibility.</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 sm:flex">
              <Sparkles size={13} /> Takes about 60 seconds
            </div>
          </div>
        </div>
        <div className="px-6 pt-7 sm:px-10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Step {step} of {totalSteps}</span>
            <span className="text-xs font-medium text-slate-400">{progress}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 text-sm font-medium text-violet-600">{stepSubtitles[step - 1]}</p>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-4xl">{stepQuestions[step - 1]}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{stepDescriptions[step - 1]}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {visibleOptions.map((option) => {
                if (option === "__future_atlas_more__") {
                  return (
                    <button key="__more__" type="button" onClick={() => setShowAllOptions(true)} aria-expanded={showAllOptions} className="group flex min-h-[64px] items-center justify-between rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 px-5 text-left text-violet-700 transition-all duration-200 ease-out hover:border-violet-400 hover:bg-violet-50">
                      <span className="text-sm font-semibold">More</span>
                      <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  );
                }
                const selected = currentSelection === option;
                return (
                  <button key={option} onClick={() => selectOption(option)} className={`group flex min-h-[64px] items-center justify-between rounded-2xl border px-5 text-left transition-all duration-200 ${selected ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}>
                    <span className="text-sm font-medium">{option}</span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${selected ? "border-white bg-white text-slate-900" : "border-slate-200 text-transparent group-hover:border-slate-300"}`}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
            {isOtherSelected && (
              <CustomOptionInput value={currentCustomValue} onChange={handleCustomChange} placeholder="Enter your own education-related answer" />
            )}
            <div className="mt-10 flex items-center justify-between">
              <button onClick={previousStep} disabled={step === 1} className={`flex items-center gap-2 text-sm font-medium transition ${step === 1 ? "pointer-events-none opacity-0" : "text-slate-500 hover:text-slate-900"}`}>
                <ChevronLeft size={17} /> Back
              </button>
              <button onClick={nextStep} disabled={!canContinue} className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all ${canContinue ? "bg-slate-900 text-white shadow-lg shadow-slate-900/15 hover:-translate-y-0.5 hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
                {step === 5 ? "Check My Eligibility" : "Continue"} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-10">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <GraduationCap size={13} /> This assessment is an initial guide, not an admission decision.
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] font-medium text-slate-400">Powered by One Window</p>
    </div>
  );
}
