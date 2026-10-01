"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Globe2,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";
import FutureAtlasAI from "@/components/ai/FutureAtlasAI";
import { useAuth } from "@/components/auth/AuthGate";
import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";

const tools = [
  {
    title: "Explore Countries",
    description:
      "Compare countries by education, cost, visas, careers, lifestyle, and more.",
    icon: Globe2,
    tag: "Discover",
    path: "/countries",
  },
  {
    title: "Explore Universities",
    description:
      "Find universities that match your course, budget, profile, and goals.",
    icon: Search,
    tag: "Find your fit",
    path: "/universities",
  },
  {
    title: "Scholarship Explorer",
    description:
      "Discover scholarships and funding opportunities you may be eligible for.",
    icon: Trophy,
    tag: "Save money",
    path: "/scholarships",
  },
  {
    title: "Cost Calculator",
    description:
      "Estimate tuition, living expenses, travel, insurance, and total study costs.",
    icon: Calculator,
    tag: "Plan your budget",
    path: "/cost-calculator",
  },
  {
    title: "Eligibility Checker",
    description:
      "Get a quick assessment of your academic profile and study abroad readiness.",
    icon: CheckCircle2,
    tag: "Check your profile",
    path: "/eligibility",
  },
];
export default function FutureAtlasDashboard() {
     const [isAiOpen, setIsAiOpen] = useState(false);
     const [openAiAfterLogin, setOpenAiAfterLogin] = useState(false);
     const { requireAuth, signedIn } = useAuth();
     useEffect(() => {
       if (!signedIn || !openAiAfterLogin) return;
       setOpenAiAfterLogin(false);
       setIsAiOpen(true);
     }, [signedIn, openAiAfterLogin]);
  return (
    <main className="min-h-screen bg-[#F8F9FC] text-slate-900">
      <FutureAtlasHeader />

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 lg:px-10 lg:pt-24">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm">
            <Sparkles size={14} className="text-violet-500" />
            Your global study journey starts here
          </div>

          <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            Your world is bigger
            <br />
            <span className="text-slate-400">than you think.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">
            Explore countries, discover universities, find scholarships,
            understand your costs, and see where your profile can take you.
          </p>
        </div>

        {/* TOOLS */}
        <div className="mt-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                Explore
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Start with what you need
              </h2>
            </div>

            <p className="hidden text-xs text-slate-400 sm:block">
              Five tools. One global journey.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool, index) => {
              const Icon = tool.icon;

              return (
                <button
                  key={tool.title}
                  onClick={() => requireAuth(tool.path)}
                  className={`group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    index === 0
                      ? "lg:col-span-2"
                      : ""
                  }`}
                >
                  {/* subtle decoration */}
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

                    <h3 className="mt-10 text-xl font-semibold tracking-tight">
                      {tool.title}
                    </h3>

                    <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                      {tool.description}
                    </p>

                    <div className="mt-7 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      Explore
                      <ArrowRight
                        size={16}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI SECTION */}
        <section className="mt-20 overflow-hidden rounded-[32px] bg-slate-900 px-7 py-10 text-white sm:px-10 sm:py-12 lg:px-14">
          <div className="relative flex flex-col justify-between gap-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-violet-300">
                <Sparkles size={17} />
                Your AI-powered study companion
              </div>

              <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Not sure where to start?
              </h2>

              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
                Tell us what you&apos;re looking for. We&apos;ll help you explore
                countries, universities, scholarships, costs, and eligibility
                based on your goals.
              </p>
            </div>

            <button
              onClick={() => {
                if (signedIn) setIsAiOpen(true);
                else {
                  setOpenAiAfterLogin(true);
                  requireAuth();
                }
              }}
              className="flex shrink-0 items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              Ask Future Atlas AI
              <ArrowRight size={17} />
            </button>
          </div>
        </section>

        <GuidanceCTA />

        {/* FOOTER NOTE */}
        <div className="py-10 text-center">
          <p className="text-xs text-slate-400">
            Your journey. Your choices. Your future.
          </p>
        </div>
      </section>

      {isAiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <FutureAtlasAI
            mode="mentor"
            onClose={() => setIsAiOpen(false)}
          />
        </div>
      )}
    </main>
  );
}
