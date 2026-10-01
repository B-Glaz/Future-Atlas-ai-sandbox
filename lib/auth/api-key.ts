import type { NextRequest } from "next/server";

import { isFaApiKey } from "@/lib/platform/api-keys/format";
import { hashKey, isMissingTable } from "@/lib/platform/credits/daily";
import { createAdminSupabase } from "@/lib/supabase";

const AI_SCOPE = "ai:generate";

export type ApiKeyPrincipal = {
  ok: true;
  userId: string;
  keyId: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
};

export type ApiKeyFailure = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
  code: string;
};

export type ApiKeyResult = ApiKeyPrincipal | ApiKeyFailure;

type KeyRow = {
  id: string;
  user_id: string;
  key_prefix: string;
  expires_at: string | null;
  revoked_at: string | null;
  permissions: string[] | null;
  allowed_origins: string[] | null;
};

const resolved = new WeakMap<NextRequest, ApiKeyResult>();

export function presentedApiKey(request: NextRequest) {
  return request.headers.get("x-api-key")?.trim() || "";
}

export async function authenticateApiKey(request: NextRequest): Promise<ApiKeyResult> {
  const cached = resolved.get(request);
  if (cached) return cached;
  const result = await lookupApiKey(presentedApiKey(request), request.headers.get("origin") || request.headers.get("x-client-origin") || "");
  resolved.set(request, result);
  return result;
}

async function lookupApiKey(token: string, requestOrigin: string): Promise<ApiKeyResult> {
  if (!token) return { ok: false, status: 401, error: "API key required", code: "FA_AUTH_REQUIRED" };
  if (!isFaApiKey(token)) return { ok: false, status: 401, error: "Invalid API key", code: "FA_INVALID_API_KEY" };

  try {
    const admin = createAdminSupabase();
    const keyHash = hashKey(token);
    const { data, error } = await admin
      .from("future_atlas_api_keys")
      .select("id,user_id,key_prefix,expires_at,revoked_at,permissions,allowed_origins")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { ok: false, status: 503, error: "The account store is not ready.", code: "FA_SCHEMA_PENDING" };
      console.error(JSON.stringify({ event: "api_key_lookup_failed", code: error.code }));
      return { ok: false, status: 401, error: "Invalid API key", code: "FA_INVALID_API_KEY" };
    }
    const row = data as KeyRow | null;
    if (!row || row.revoked_at) return { ok: false, status: 401, error: "Invalid API key", code: "FA_INVALID_API_KEY" };
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return { ok: false, status: 401, error: "API key expired", code: "FA_API_KEY_EXPIRED" };
    }
    const allowedOrigins = row.allowed_origins || [];
    let normalizedOrigin = "";
    try { normalizedOrigin = new URL(requestOrigin).origin.toLowerCase(); } catch {}
    if (!normalizedOrigin || !allowedOrigins.includes(normalizedOrigin)) {
      return { ok: false, status: 403, error: "This website origin is not authorized for the API key.", code: "FA_ORIGIN_FORBIDDEN" };
    }
    const permissions = Array.isArray(row.permissions) && row.permissions.length ? row.permissions : [AI_SCOPE];
    void admin
      .from("future_atlas_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(({ error: touchError }) => {
        if (touchError && !isMissingTable(touchError)) {
          console.error(JSON.stringify({ event: "api_key_last_used_failed", code: touchError.code }));
        }
      });
    return {
      ok: true,
      userId: row.user_id,
      keyId: row.id,
      keyHash,
      keyPrefix: row.key_prefix,
      permissions,
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "api_key_lookup_failed",
      message: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    }));
    return { ok: false, status: 401, error: "Invalid API key", code: "FA_INVALID_API_KEY" };
  }
}
