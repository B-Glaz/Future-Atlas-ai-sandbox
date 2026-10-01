import { createAdminSupabase } from "@/lib/supabase";
import { hashKey, isMissingTable, apiUsageCounts, API_REQUESTS_PER_DAY, API_REQUESTS_PER_HOUR } from "@/lib/platform/credits/daily";
import { inspectSignedToken, issueSignedTokens, refreshSignedAccessToken, revokeSignedTokens } from "@/lib/auth/signed-tokens";

type TokenRow = {
  jti: string;
  user_id: string;
  token_type: "access" | "refresh";
  expires_at: string;
  revoked_at: string | null;
};

function readJti(token: string) {
  const inspected = inspectSignedToken(token);
  return inspected.jti || "";
}

export async function confirmApiToken(token: string) {
  const inspected = inspectSignedToken(token);
  if (!inspected.valid || !inspected.jti || inspected.token_type !== "access") return false;
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("future_atlas_api_tokens")
    .select("jti,revoked_at,expires_at")
    .eq("jti", inspected.jti)
    .maybeSingle();
  if (error || !data) return false;
  return !data.revoked_at && new Date(data.expires_at).getTime() > Date.now();
}

export async function persistIssuedTokens(userId: string, accessToken: string, refreshToken: string) {
  const access = inspectSignedToken(accessToken);
  const refresh = inspectSignedToken(refreshToken);
  if (!access.jti || !refresh.jti || !access.expires_at || !refresh.expires_at) return;
  const admin = createAdminSupabase();
  await admin.from("future_atlas_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  const { error } = await admin.from("future_atlas_api_tokens").insert([
    { jti: access.jti, user_id: userId, token_type: "access", token_hash: hashKey(accessToken), expires_at: access.expires_at, version: access.version || 0 },
    { jti: refresh.jti, user_id: userId, token_type: "refresh", token_hash: hashKey(refreshToken), expires_at: refresh.expires_at, version: refresh.version || 0 },
  ]);
  if (error) throw error;
}

export async function issuePersistedTokens(userId: string) {
  const issued = issueSignedTokens(userId);
  await persistIssuedTokens(userId, issued.access_token, issued.refresh_token);
  return issued;
}

export async function refreshPersistedToken(refreshToken: string) {
  const current = inspectSignedToken(refreshToken);
  if (!current.valid || current.token_type !== "refresh" || !current.user_id || !current.jti) return null;
  const admin = createAdminSupabase();
  const stored = await admin.from("future_atlas_api_tokens").select("jti,revoked_at,expires_at").eq("jti", current.jti).maybeSingle();
  if (stored.error || !stored.data || stored.data.revoked_at || new Date(stored.data.expires_at).getTime() <= Date.now()) return null;
  const issued = refreshSignedAccessToken(refreshToken);
  if (!issued) return null;
  const access = inspectSignedToken(issued.access_token);
  if (access.jti && access.expires_at && current.user_id) {
    await admin.from("future_atlas_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", current.user_id).eq("token_type", "access").is("revoked_at", null);
    const { error } = await admin.from("future_atlas_api_tokens").insert({
      jti: access.jti,
      user_id: current.user_id,
      token_type: "access",
      token_hash: hashKey(issued.access_token),
      expires_at: access.expires_at,
      version: access.version || current.version || 0,
    });
    if (error) return null;
  }
  return issued;
}

export async function revokePersistedTokens(options: { accessToken?: string; refreshToken?: string; all?: boolean; userId?: string }) {
  const memoryRevoked = revokeSignedTokens(options);
  const admin = createAdminSupabase();
  const now = new Date().toISOString();
  if (options.all && options.userId) {
    const { error } = await admin.from("future_atlas_api_tokens").update({ revoked_at: now }).eq("user_id", options.userId).is("revoked_at", null);
    if (error && !isMissingTable(error)) return false;
    return true;
  }
  const jtis = [options.accessToken, options.refreshToken].map((token) => token ? readJti(token) : "").filter(Boolean);
  if (!jtis.length) return memoryRevoked;
  const { error } = await admin.from("future_atlas_api_tokens").update({ revoked_at: now }).in("jti", jtis);
  if (error && !isMissingTable(error)) return false;
  if (options.refreshToken) {
    const refresh = inspectSignedToken(options.refreshToken);
    if (refresh.user_id) {
      await admin.from("future_atlas_api_tokens").update({ revoked_at: now }).eq("user_id", refresh.user_id).eq("token_type", "access").is("revoked_at", null);
    }
  }
  return true;
}

export async function apiTokenStatus(userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("future_atlas_api_tokens")
    .select("token_type,expires_at,revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const usage = error && isMissingTable(error) ? { today: 0, hour: 0, hourRetryAfter: 1 } : await apiUsageCounts(userId).catch(() => ({ today: 0, hour: 0, hourRetryAfter: 1 }));
  const rows = (error ? [] : data || []) as TokenRow[];
  const active = (type: "access" | "refresh") => rows.find((row) => row.token_type === type && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now());
  const refresh = active("refresh");
  const access = active("access");
  return {
    has_active_refresh: Boolean(refresh),
    access_expires_at: access?.expires_at || null,
    refresh_expires_at: refresh?.expires_at || null,
    api_requests_today: usage.today,
    api_requests_remaining_today: Math.max(0, API_REQUESTS_PER_DAY - usage.today),
    api_requests_this_hour: usage.hour,
    api_requests_remaining_hour: Math.max(0, API_REQUESTS_PER_HOUR - usage.hour),
    schemaPending: Boolean(error && isMissingTable(error)),
  };
}

export async function validatePersistedToken(token: string) {
  const inspected = inspectSignedToken(token);
  if (!inspected.valid || !inspected.jti) return { valid: false };
  if (inspected.token_type === "access" && !(await confirmApiToken(token))) return { valid: false };
  if (inspected.token_type === "refresh") {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("future_atlas_api_tokens").select("revoked_at,expires_at").eq("jti", inspected.jti).maybeSingle();
    if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return { valid: false };
  }
  return { valid: true, token_type: inspected.token_type, expires_at: inspected.expires_at };
}
