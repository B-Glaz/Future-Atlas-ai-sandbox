"use client";

import { useEffect, useState } from "react";
import { SANDBOX_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/ai/sandbox-credit-copy";

export default function CreditCounter() {
  const [remaining, setRemaining] = useState<number>();
  const [status, setStatus] = useState<"loading" | "ready" | "pending" | "unavailable">("loading");

  useEffect(() => {
    const update = (event: Event) => {
      const next = Math.floor((event as CustomEvent<number>).detail);
      setRemaining(next);
      setStatus("ready");
    };
    window.addEventListener("future-atlas:credits", update);
    void fetch("/api/credits")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (response.ok && Number.isFinite(payload?.credits_remaining)) {
          setRemaining(Math.floor(payload.credits_remaining));
          setStatus("ready");
        } else {
          setStatus(payload?.pendingMigration ? "pending" : "unavailable");
        }
      })
      .catch(() => setStatus("unavailable"));
    return () => window.removeEventListener("future-atlas:credits", update);
  }, []);

  if (status === "loading") return <span className="whitespace-nowrap text-xs font-medium text-slate-400" aria-busy="true">Checking credits</span>;
  if (status === "pending") return <span className="whitespace-nowrap text-xs font-medium text-amber-600" aria-label="Credits are waiting for database setup">Credits pending</span>;
  if (status === "unavailable") return <span className="whitespace-nowrap text-xs font-medium text-rose-500" aria-label="Credits unavailable">Credits unavailable</span>;
  if (remaining === 0) return <span className="whitespace-nowrap text-xs font-medium text-amber-700" aria-label={SANDBOX_CREDITS_EXHAUSTED_MESSAGE}>{SANDBOX_CREDITS_EXHAUSTED_MESSAGE}</span>;
  return <span className="whitespace-nowrap text-xs font-medium text-slate-500" aria-label={`${remaining ?? "Loading"} AI credits remaining`}>{remaining?.toLocaleString("en-US") ?? "Loading"} credits</span>;
}
