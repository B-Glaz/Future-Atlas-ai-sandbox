"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { recordConsent, trackEvent } from "@/lib/client/analytics";

type Consent = "necessary" | "additional" | null;
const CONSENT_VERSION = 1;

export default function ConsentManager() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const [details, setDetails] = useState(false);
  const [rejected, setRejected] = useState(false);
  useEffect(() => { queueMicrotask(() => {
    const fromCookie = document.cookie.split("; ").find((item) => item.startsWith("fa_consent="))?.split("=")[1] as Consent;
    const saved = (fromCookie === "necessary" || fromCookie === "additional" ? fromCookie : localStorage.getItem("future-atlas:consent")) as Consent;
    let meta: { version?: number } | null = null;
    try { meta = JSON.parse(localStorage.getItem("future-atlas:consent-meta") || "null") as { version?: number } | null; } catch { /* reset malformed local consent */ }
    if (fromCookie === "necessary" || fromCookie === "additional" || (saved && meta?.version === CONSENT_VERSION)) setConsent(saved);
    if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) setRejected(true);
    setReady(true);
    void fetch("/api/cookies", { cache: "no-store" });
  }); }, []);
  useEffect(() => { if (consent) trackEvent("page_view", { path: pathname }, consent === "additional" ? "additional" : "necessary"); }, [consent, pathname]);
  function save(value: Exclude<Consent, null>) {
    localStorage.setItem("future-atlas:consent", value);
    localStorage.setItem("future-atlas:consent-meta", JSON.stringify({ version: CONSENT_VERSION, decidedAt: new Date().toISOString() }));
    setConsent(value);
    const anonymousId = localStorage.getItem("future-atlas:anonymous-id") || crypto.randomUUID();
    localStorage.setItem("future-atlas:anonymous-id", anonymousId);
    void fetch("/api/cookies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: value, anonymousId }),
    });
    void recordConsent(value);
  }
  function reopen() { setDetails(true); setRejected(false); setConsent(null); }
  return <>
    {consent === "additional" && <Script id="pagesenseCode" strategy="afterInteractive" src="https://cdn-in.pagesense.io/js/onewindow/42f611b451ab4de4a126d343bc30d3d1.js" />}
    {consent && <button type="button" onClick={reopen} className="fixed bottom-3 left-3 z-[80] text-[10px] font-medium text-slate-400 hover:text-slate-700">Privacy</button>}
    {ready && !consent && <div className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5" role="dialog" aria-label="Cookie preferences">
      <p className="text-sm font-semibold text-slate-900">Privacy choices</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">Necessary cookies keep Future Atlas working. Additional cookies improve analytics.</p>
      {rejected && <p className="mt-2 text-xs font-medium text-amber-700">Necessary cookies are required to use the application.</p>}
      {details && <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2"><p><strong className="text-slate-800">Necessary:</strong> account, security, credits, and study preferences.</p><p><strong className="text-slate-800">Additional:</strong> PageSense usage and performance analytics.</p></div>}
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => save("additional")} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">Accept cookies</button><button onClick={() => rejected ? save("necessary") : setRejected(true)} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">{rejected ? "Continue with necessary" : "Reject"}</button><button onClick={() => setDetails((value) => !value)} className="rounded-full px-3 py-2 text-xs font-semibold text-slate-500">Details</button></div>
    </div>}
  </>;
}
