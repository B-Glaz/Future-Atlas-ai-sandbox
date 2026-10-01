"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LockKeyhole, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { accountHistorySnapshot, clearAccountHistory } from "@/lib/client/local-history";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  requireAuth: (path?: string) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  backupHistory: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_TIMEOUT_MS = 15_000;
const withAuthTimeout = <T,>(operation: PromiseLike<T>) => Promise.race([
  Promise.resolve(operation),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Authentication timed out. Please try again.")), AUTH_TIMEOUT_MS)),
]);
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window {
    futureAtlasGoogleCallback?: (response: { credential?: string }) => void;
    futureAtlasGoogleClientId?: string;
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const syncProfile = (accessToken?: string) => {
      if (!accessToken) return;
      void fetch("/api/profile", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    };
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
      syncProfile(data.session?.access_token);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      syncProfile(session?.access_token);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const requireAuth = useCallback((path?: string) => {
    if (path) router.push(path);
  }, [router]);

  const backupHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ history: await accountHistorySnapshot(user.id), consent: localStorage.getItem("future-atlas:consent") }),
    });
    if (!response.ok) throw new Error("History backup failed. Please try again.");
  }, [user]);

  const signOut = useCallback(async () => {
    window.google?.accounts.id.disableAutoSelect();
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  }, [router]);

  const deleteAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const response = await fetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${data.session.access_token}` } });
    if (!response.ok) throw new Error("Account deletion failed. Please try again.");
    await clearAccountHistory(data.session.user.id);
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, requireAuth, signOut, deleteAccount, backupHistory }}>
      {children}
      {open && <AuthDialog onClose={() => setOpen(false)} onVerified={(verifiedUser) => {
        setUser(verifiedUser);
        setOpen(false);
      }} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export function ProtectedTool({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type PendingGoogle = { credential: string; email: string };

function googleEmail(credential: string) {
  try {
    const payload = credential.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = JSON.parse(atob(padded)) as { email?: string };
    return typeof json.email === "string" ? json.email : "";
  } catch {
    return "";
  }
}

function AuthDialog({ onClose, onVerified }: { onClose: () => void; onVerified: (user: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingGoogle | null>(null);
  const [googleAttempt, setGoogleAttempt] = useState(0);
  const googleButton = useRef<HTMLDivElement>(null);
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    if (!googleClientId || pending || !googleButton.current) return;
    let cancelled = false;
    const render = () => {
      if (!window.google || !googleButton.current || cancelled) return;
      window.futureAtlasGoogleCallback = ({ credential }) => {
        if (!credential) return setError("Google did not return a valid login credential.");
        setError("");
        setPending({ credential, email: googleEmail(credential) });
      };
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: false,
        cancel_on_tap_outside: false,
        callback: (response) => window.futureAtlasGoogleCallback?.(response),
      });
      window.futureAtlasGoogleClientId = googleClientId;
      googleButton.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButton.current, { type: "standard", theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 280 });
    };
    const stop = () => {
      cancelled = true;
      window.futureAtlasGoogleCallback = undefined;
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google) render();
      else existing.addEventListener("load", render, { once: true });
      return () => {
        stop();
        existing.removeEventListener("load", render);
      };
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    script.onerror = () => setError("Google login could not be loaded.");
    document.head.appendChild(script);
    return stop;
  }, [googleAttempt, pending]);

  async function continueWithGoogle() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: googleError } = await withAuthTimeout(supabase.auth.signInWithIdToken({
        provider: "google",
        token: pending.credential,
      }));
      if (googleError || !data.user) throw googleError || new Error("Google login failed.");
      onVerifiedRef.current(data.user);
    } catch (googleError) {
      setBusy(false);
      setError(googleError instanceof Error ? googleError.message : "Google login failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Sign in to Future Atlas">
      <div className="w-full max-w-sm rounded-2xl border border-white/40 bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="float-right grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={17} /></button>
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><LockKeyhole size={20} /></div>
        <h2 className="text-xl font-semibold text-slate-900">Continue to your tools</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{pending ? "Confirm the Google account you want to use." : "Sign in securely with Google to continue."}</p>
        <div className="mt-5">
          {error && <p className="mb-4 text-sm text-rose-600" role="alert">{error}</p>}
          {googleClientId ? (
            <>
              <div ref={googleButton} className={pending ? "hidden" : "flex min-h-10 justify-center"} aria-label="Continue with Google" />
              {pending && (
                <div className="grid gap-3">
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">{pending.email || "Your Google account"}</p>
                  <button type="button" disabled={busy} onClick={() => void continueWithGoogle()} className="rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                    {busy ? "Continuing…" : pending.email ? `Continue with ${pending.email}` : "Continue"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => { setPending(null); setGoogleAttempt((attempt) => attempt + 1); }} className="text-sm font-medium text-slate-500">Use a different account</button>
                </div>
              )}
            </>
          ) : <p className="text-sm text-rose-600" role="alert">Google login is not configured.</p>}
        </div>
      </div>
    </div>
  );
}
