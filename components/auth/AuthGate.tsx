"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LockKeyhole, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { accountHistorySnapshot, clearAccountHistory } from "@/lib/client/local-history";
import { normalizeEmail } from "@/lib/auth/email-address";

type AuthContextValue = {
  user: User | null;
  email: string;
  signedIn: boolean;
  loading: boolean;
  requireAuth: (path?: string) => void;
  openLogin: () => void;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  backupHistory: () => Promise<void>;
};

const EMAIL_STORAGE_KEY = "future-atlas-email";

function readStoredEmail() {
  try {
    return normalizeEmail(localStorage.getItem(EMAIL_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

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
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const pendingPath = useRef("");

  useEffect(() => {
    let cancelled = false;
    const syncProfile = (accessToken?: string) => {
      if (!accessToken) return;
      void fetch("/api/profile", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    };
    const stored = readStoredEmail();
    if (stored) setEmail(stored);
    const session = supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      syncProfile(data.session?.access_token);
    });
    const login = fetch("/api/login").then((response) => response.json()).then((payload) => {
      if (!cancelled) setSignedIn(Boolean(payload?.signedIn));
    }).catch(() => undefined);
    void Promise.all([session, login]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, sessionState) => {
      setUser(sessionState?.user ?? null);
      syncProfile(sessionState?.access_token);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const openLogin = useCallback(() => setOpen(true), []);

  const signInWithEmail = useCallback(async (value: string) => {
    const next = normalizeEmail(value);
    if (!next) throw new Error("Enter a valid email address.");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: next }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Could not sign in. Please try again.");
    localStorage.setItem(EMAIL_STORAGE_KEY, next);
    setEmail(next);
    setSignedIn(true);
    setOpen(false);
    const path = pendingPath.current;
    pendingPath.current = "";
    if (path) router.push(path);
  }, [router]);

  const requireAuth = useCallback((path?: string) => {
    if (!signedIn) {
      pendingPath.current = path || "";
      setOpen(true);
      return;
    }
    if (path) router.push(path);
  }, [router, signedIn]);

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
    localStorage.removeItem(EMAIL_STORAGE_KEY);
    await fetch("/api/login", { method: "DELETE" }).catch(() => undefined);
    await supabase.auth.signOut().catch(() => undefined);
    setEmail("");
    setSignedIn(false);
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
    <AuthContext.Provider value={{ user, email, signedIn, loading, requireAuth, openLogin, signInWithEmail, signOut, deleteAccount, backupHistory }}>
      {children}
      {open && <EmailLoginDialog initialEmail={email} onClose={() => setOpen(false)} onSubmit={signInWithEmail} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export function ProtectedTool({ children }: { children: ReactNode }) {
  const { signedIn, loading, signInWithEmail, email } = useAuth();
  if (loading) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500">Checking sign-in…</p>;
  if (!signedIn) return <EmailLoginForm initialEmail={email} onSubmit={signInWithEmail} />;
  return <>{children}</>;
}

function EmailLoginForm({ initialEmail, onSubmit }: { initialEmail: string; onSubmit: (email: string) => Promise<void> }) {
  const [value, setValue] = useState(initialEmail);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        void onSubmit(value).catch((submitError) => {
          setError(submitError instanceof Error ? submitError.message : "Could not sign in. Please try again.");
          setBusy(false);
        });
      }}
    >
      <h2 className="text-lg font-semibold text-slate-900">Sign in with your email</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Enter the email we added for you. It is checked against that list before credits can be used.</p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="you@example.com"
        />
      </label>
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}

function EmailLoginDialog({ initialEmail, onClose, onSubmit }: { initialEmail: string; onClose: () => void; onSubmit: (email: string) => Promise<void> }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500" aria-label="Close"><X size={16} /></button>
        </div>
        <EmailLoginForm initialEmail={initialEmail} onSubmit={onSubmit} />
      </div>
    </div>
  );
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
