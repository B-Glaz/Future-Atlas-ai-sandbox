"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { supabase } from "@/lib/supabase";

type ApiKeyRecord = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  permissions: string[];
  allowed_origins: string[];
  status: "active" | "revoked" | "expired";
};

type IssuedKey = {
  id: string;
  name: string;
  api_key: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  allowed_origins: string[];
};

type ExpiresIn = "never" | "30d" | "90d" | "1y" | "custom";

async function sessionHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in required.");
  return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" };
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function relativeTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (Number.isNaN(delta)) return "Never";
  if (delta < 60_000) return "Just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

function maskedKey(prefix: string) {
  return `${prefix}••••••••••••••••`;
}

export default function ApiTokensPanel() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("never");
  const [customDate, setCustomDate] = useState("");
  const [origins, setOrigins] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadKeys = useCallback(async () => {
    const response = await fetch("/api/api-keys", { headers: await sessionHeaders() });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Could not load API keys.");
    setKeys(payload.keys || []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Initial server state; subsequent refreshes happen after key actions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys().catch((loadError) => {
      setLoaded(true);
      setError(loadError instanceof Error ? loadError.message : "Could not load API keys.");
    });
  }, [loadKeys]);

  async function run(action: string, work: () => Promise<void>) {
    setBusy(action);
    setError("");
    try {
      await work();
    } catch (workError) {
      setError(workError instanceof Error ? workError.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }

  async function createKey(options?: { rotateId?: string; name?: string; expiresIn?: ExpiresIn; expiresAt?: string; origins?: string[] }) {
    const nextName = options?.name ?? name;
    const nextExpires = options?.expiresIn ?? expiresIn;
    const nextDate = options?.expiresAt ?? customDate;
    const allowedOrigins = options?.origins ?? origins.split(/[\n,]+/).map((origin) => origin.trim()).filter(Boolean);
    const response = await fetch("/api/api-keys", {
      method: "POST",
      headers: await sessionHeaders(),
      body: JSON.stringify({
        name: nextName.trim(),
        expiresIn: nextExpires,
        expiresAt: nextExpires === "custom" ? nextDate : undefined,
        rotateId: options?.rotateId,
        allowedOrigins,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Could not create the API key.");
    setIssued(payload);
    setCreating(false);
    setName("");
    setOrigins("");
    await loadKeys();
  }

  return (
    <div className="grid gap-6">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}

      {issued && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-slate-900">API key created</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">Copy this API key now. You will not be able to see the complete key again.</p>
          <CopyField value={issued.api_key} />
          <p className="mt-3 text-xs leading-5 text-slate-600">Store this key securely. Send it as <code className="rounded bg-white px-1">X-API-Key</code> from your server. If you lose it, create a new key.</p>
        </section>
      )}

      <section className="grid gap-4">
        {!loaded && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500">Loading API keys…</p>}
        {loaded && keys.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500">No API keys yet. Create one to call the API from your server.</p>}
        {keys.map((key) => (
          <article key={key.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{key.name}</h2>
                <p className="mt-2 font-mono text-sm text-slate-600">{maskedKey(key.key_prefix)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${key.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{key.status === "active" ? "Active" : key.status === "expired" ? "Expired" : "Revoked"}</span>
            </div>
            <dl className="mt-4 grid gap-1 text-sm text-slate-500">
              <div>Created: {formatDate(key.created_at)}</div>
              <div>Last used: {relativeTime(key.last_used_at)}</div>
              <div>Expires: {key.expires_at ? formatDate(key.expires_at) : "Never"}</div>
              <div>Authorized: {key.allowed_origins.length ? key.allowed_origins.join(", ") : "No origins - replace required"}</div>
            </dl>
            {key.status === "active" && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void run(`revoke-${key.id}`, async () => {
                  const response = await fetch("/api/api-keys", { method: "DELETE", headers: await sessionHeaders(), body: JSON.stringify({ id: key.id }) });
                  const payload = await response.json().catch(() => null);
                  if (!response.ok) throw new Error(payload?.error || "Could not revoke the API key.");
                  await loadKeys();
                })} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">
                  {busy === `revoke-${key.id}` ? "Revoking…" : "Revoke"}
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run(`rotate-${key.id}`, () => createKey({
                  rotateId: key.id,
                  name: key.name,
                  expiresIn: key.expires_at ? "custom" : "never",
                  expiresAt: key.expires_at?.slice(0, 10),
                  origins: key.allowed_origins,
                }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                  {busy === `rotate-${key.id}` ? "Replacing…" : "Replace"}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      {creating ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create API key</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Production API" />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Expiration
            <select value={expiresIn} onChange={(event) => setExpiresIn(event.target.value as ExpiresIn)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="never">Never</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
              <option value="custom">Custom date</option>
            </select>
          </label>
          {expiresIn === "custom" && (
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Date
              <input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
          )}
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Authorized website origins
            <textarea value={origins} onChange={(event) => setOrigins(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="https://client.example.com" />
            <span className="mt-1 block text-xs leading-5 text-slate-500">One origin per line. Use http://localhost:3000 for local testing.</span>
          </label>
          <div className="mt-5 flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void run("create", () => createKey())} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy === "create" ? "Creating…" : "Create API key"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-4 py-3 text-sm font-medium text-slate-500">Cancel</button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => { setIssued(null); setCreating(true); }} className="justify-self-start rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
          + Create API key
        </button>
      )}

      <p className="text-sm leading-6 text-slate-500">Use the key in the <code className="rounded bg-slate-100 px-1">X-API-Key</code> header. It authenticates the request by itself. Website sign-in still uses your Google session.</p>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex gap-2">
      <input readOnly value={value} className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800" />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="grid h-10 shrink-0 place-items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Copied" : "Copy API key"}
      </button>
    </div>
  );
}
