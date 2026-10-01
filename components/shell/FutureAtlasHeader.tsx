"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, KeyRound, LogOut } from "lucide-react";
import { clearAIClientCache } from "@/lib/ai/client-cache";
import CreditCounter from "@/components/shell/CreditCounter";
import { useAuth } from "@/components/auth/AuthGate";

function resetTemporaryState() {
  const temporaryPrefixes = ["future-atlas-ai-", "future-atlas-country-", "future-atlas-university-", "future-atlas-scholarship-", "future-atlas-eligibility-", "future-atlas-cost-"];
  Object.keys(localStorage).forEach((key) => {
    if (temporaryPrefixes.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
  });
  clearAIClientCache();
}

export default function FutureAtlasHeader() {
  const router = useRouter();
  const { email, signedIn, signOut, openLogin } = useAuth();

  return (
    <nav className="border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-5 lg:px-10">
        <button type="button" onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Go back" title="Go back">
          <ArrowLeft size={18} />
        </button>
        <Link href="/" onClick={resetTemporaryState} className="flex items-center gap-3 text-left" aria-label="Go to Future Atlas homepage">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><GraduationCap size={20} /></div>
          <div>
            <p className="text-sm font-bold tracking-tight">Future Atlas</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Global Pathways</p>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <CreditCounter />
          <Link href="/tokens" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="API keys" title="API keys"><KeyRound size={16} /></Link>
          {signedIn ? (
            <>
              <span className="max-w-40 truncate text-xs text-slate-500" title={email}>{email || "Signed in"}</span>
              <button type="button" onClick={() => void signOut()} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
            </>
          ) : (
            <button type="button" onClick={openLogin} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign in</button>
          )}
        </div>
      </div>
    </nav>
  );
}
