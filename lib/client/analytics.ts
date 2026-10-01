export type ConsentLevel = "necessary" | "additional";

function anonymousId() {
  const value = localStorage.getItem("future-atlas:anonymous-id") || crypto.randomUUID();
  localStorage.setItem("future-atlas:anonymous-id", value);
  return value;
}

export async function trackEvent(event: string, metadata: Record<string, unknown> = {}, category: ConsentLevel = "necessary") {
  if (typeof window === "undefined") return;
  const consent = localStorage.getItem("future-atlas:consent");
  if (!consent || (category === "additional" && consent !== "additional")) return;
  const visitorId = anonymousId();
  const { data } = await supabase.auth.getSession();
  void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ event, category, anonymousId: visitorId, metadata }), keepalive: true });
}
import { supabase } from "@/lib/supabase";

export async function recordConsent(level: ConsentLevel) {
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getSession();
  void fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ anonymousId: anonymousId(), necessary: true, analytics: level === "additional", advertising: false }),
    keepalive: true,
  });
}
