import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase runtime configuration is missing.");
  return { url, key };
}

function opaqueKeyFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("apikey", apiKey);
    if (apiKey.startsWith("sb_") && headers.get("authorization") === `Bearer ${apiKey}`) {
      headers.delete("authorization");
    }
    return fetch(input, { ...init, headers });
  };
}

function clientOptions(apiKey: string, extraHeaders?: Record<string, string>) {
  return {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: opaqueKeyFetch(apiKey),
      headers: extraHeaders,
    },
  };
}

let browserClient: SupabaseClient | undefined;

function browserSupabase() {
  if (!browserClient) {
    const { url, key } = publicConfig();
    browserClient = createClient(url, key, { global: { fetch: opaqueKeyFetch(key) } });
  }
  return browserClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = browserSupabase();
    const value = client[property as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function createPublicSupabase() {
  const { url, key } = publicConfig();
  return createClient(url, key, clientOptions(key));
}

export function createAdminSupabase() {
  const { url } = publicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  return createClient(url, secret, clientOptions(secret));
}

export function createRequestSupabase(accessToken: string) {
  const { url, key } = publicConfig();
  return createClient(url, key, clientOptions(key, { Authorization: `Bearer ${accessToken}` }));
}

export function createAccessTokenSupabase(accessToken: string) {
  const { url } = publicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  return createClient(url, secret, clientOptions(secret, { "x-future-atlas-token": accessToken }));
}

export type { SupabaseClient };
