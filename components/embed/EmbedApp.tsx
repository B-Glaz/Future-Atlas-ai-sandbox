"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";

import CountryExplorer from "@/components/study-tools/CountryExplorer";
import UniversityExplorer from "@/components/study-tools/UniversityExplorer";
import ScholarshipExplorer from "@/components/study-tools/ScholarshipExplorer";
import CostCalculator from "@/components/study-tools/CostCalculator";
import EligibilityChecker from "@/components/study-tools/EligibilityChecker";
import FutureAtlasAI from "@/components/ai/FutureAtlasAI";

const embedTools = [
  {
    id: "countries",
    title: "Explore Countries",
    description:
      "Compare countries by education, cost, visas, careers, lifestyle, and more.",
    icon: Globe2,
    tag: "Discover",
  },
  {
    id: "universities",
    title: "Explore Universities",
    description:
      "Find universities that match your course, budget, profile, and goals.",
    icon: Search,
    tag: "Find your fit",
  },
  {
    id: "scholarships",
    title: "Scholarship Explorer",
    description:
      "Discover scholarships and funding opportunities you may be eligible for.",
    icon: Trophy,
    tag: "Save money",
  },
  {
    id: "cost-calculator",
    title: "Cost Calculator",
    description:
      "Estimate tuition, living expenses, travel, insurance, and total study costs.",
    icon: Calculator,
    tag: "Plan your budget",
  },
  {
    id: "eligibility",
    title: "Eligibility Checker",
    description:
      "Get a quick assessment of your academic profile and study abroad readiness.",
    icon: CheckCircle2,
    tag: "Check your profile",
  },
] as const;

type EmbedToolId = (typeof embedTools)[number]["id"];

function isEmbedToolId(value: string | null): value is EmbedToolId {
  return embedTools.some((tool) => tool.id === value);
}

function ToolContent({ selectedTool }: { selectedTool: EmbedToolId }) {
  if (selectedTool === "countries") return <CountryExplorer />;
  if (selectedTool === "universities") return <UniversityExplorer />;
  if (selectedTool === "scholarships") return <ScholarshipExplorer />;
  if (selectedTool === "cost-calculator") return <CostCalculator />;
  return <EligibilityChecker />;
}

export default function EmbedApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTool = searchParams.get("tool");
  const selectedTool = isEmbedToolId(queryTool) ? queryTool : null;
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);

  const openTool = (toolId: EmbedToolId) => {
    router.push(`/embed?tool=${toolId}`);
  };

  const returnToTools = () => {
    router.push("/embed");
  };

  return (
    <main className="min-h-screen bg-[#F8F9FC] text-slate-900">
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {!selectedTool ? (
          <>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
                <GraduationCap size={21} />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight">
                  Future Atlas
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Global Pathways
                </p>
              </div>
            </div>

            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm">
                <Sparkles size={14} className="text-violet-500" />
                Study abroad planning tools
              </div>

              <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                Plan your study abroad journey
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-500">
                Explore destinations, universities, scholarships, costs, and
                eligibility using Future Atlas AI.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(showAllTools ? embedTools : embedTools.slice(0, 4)).map((tool, index) => {
                const Icon = tool.icon;

                return (
                  <button
                    key={tool.id}
                    onClick={() => openTool(tool.id)}
                    className={`group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      index === 0 ? "lg:col-span-2" : ""
                    }`}
                  >
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    <div className="relative">
                      <div className="flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white transition-transform duration-300 group-hover:scale-105">
                          <Icon size={21} strokeWidth={1.8} />
                        </div>

                        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {tool.tag}
                        </span>
                      </div>

                      <h2 className="mt-10 text-xl font-semibold tracking-tight">
                        {tool.title}
                      </h2>

                      <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                        {tool.description}
                      </p>

                      <div className="mt-7 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        Open
                        <ArrowRight
                          size={16}
                          className="transition-transform duration-300 group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
                        {!showAllTools && (
              <button type="button" onClick={() => setShowAllTools(true)} className="flex min-h-[64px] items-center justify-between rounded-[28px] border border-dashed border-violet-300 bg-violet-50/60 p-7 text-left text-violet-700 transition hover:border-violet-400 hover:bg-violet-50">
                <span className="text-sm font-semibold">More</span>
                <ArrowRight size={17} />
              </button>
            )}</div>

            <section className="mt-12 overflow-hidden rounded-[32px] bg-slate-900 px-7 py-10 text-white sm:px-10">
              <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <div className="mb-5 flex items-center gap-2 text-sm font-medium text-violet-300">
                    <Sparkles size={17} />
                    Your AI-powered study companion
                  </div>

                  <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                    Not sure where to start?
                  </h2>

                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                    Ask short study-abroad questions about countries,
                    universities, scholarships, costs, applications, visas, or
                    eligibility.
                  </p>
                </div>

                <button
                  onClick={() => setIsAiOpen(true)}
                  className="flex shrink-0 items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-100"
                >
                  Ask Future Atlas AI
                  <ArrowRight size={17} />
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <button
              onClick={returnToTools}
              className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Back to tools
            </button>

            <div className="flex justify-center">
              <ToolContent selectedTool={selectedTool} />
            </div>
          </>
        )}
      </section>

      {isAiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <FutureAtlasAI
            mode="mentor"
            onClose={() => setIsAiOpen(false)}
            embedded
          />
        </div>
      )}
    </main>
  );
}
