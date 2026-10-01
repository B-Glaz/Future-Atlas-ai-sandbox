import { createHash } from "node:crypto";

import { createAdminSupabase } from "@/lib/supabase";
import { secondsUntilKolkataMidnight } from "@/lib/ai/credit-policy";

export const DAILY_QUARTER_BUDGET = 120;
export const API_REQUESTS_PER_DAY = 1000;
export const API_REQUESTS_PER_HOUR = 120;
export const MAX_IN_FLIGHT = 1;

export type CreditDecision = {
  requestId: string;
  cacheScope: string;
  creditsRemaining: number;
  replayStatus: string;
  replayPayload: Record<string, unknown> | null;
};

type ReservationRow = {
  id: string;
  status: string;
  request_hash: string;
  result_payload: Record<string, unknown> | null;
};

export function isMissingTable(error?: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(error.message || "");
}

export function displayedCredits(spentQuarters: number) {
  return Math.max(0, Math.floor((DAILY_QUARTER_BUDGET - spentQuarters) / 4));
}

export function kolkataDayStart(now = Date.now()) {
  const offset = 5.5 * 60 * 60 * 1000;
  const local = new Date(now + offset);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset).toISOString();
}

export function resetAtIso(now = Date.now()) {
  return new Date(now + secondsUntilKolkataMidnight(now) * 1000).toISOString();
}

export function hashKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function spentQuarters(userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("future_atlas_ai_usage")
    .select("credit_quarters")
    .eq("user_id", userId)
    .gte("used_at", kolkataDayStart());
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row.credit_quarters || 0), 0);
}

async function inflightCount(userId: string, apiOnly: boolean) {
  const admin = createAdminSupabase();
  const sinceFlight = new Date(Date.now() - 90_000).toISOString();
  let query = admin.from("future_atlas_ai_reservations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "processing").gte("created_at", sinceFlight);
  query = apiOnly ? query.not("api_key_hash", "is", null) : query.is("api_key_hash", null);
  const inflight = await query;
  if (inflight.error) throw inflight.error;
  return inflight.count || 0;
}

export async function apiUsageCounts(userId: string) {
  const admin = createAdminSupabase();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [day, hour] = await Promise.all([
    admin.from("future_atlas_ai_reservations").select("id", { count: "exact", head: true }).eq("user_id", userId).not("api_key_hash", "is", null).in("status", ["processing", "completed"]).gte("created_at", kolkataDayStart()),
    admin.from("future_atlas_ai_reservations").select("created_at").eq("user_id", userId).not("api_key_hash", "is", null).in("status", ["processing", "completed"]).gte("created_at", hourAgo).order("created_at", { ascending: true }),
  ]);
  if (day.error) throw day.error;
  if (hour.error) throw hour.error;
  const hourRows = hour.data || [];
  const oldest = hourRows[0]?.created_at ? new Date(hourRows[0].created_at).getTime() : Date.now();
  return {
    today: day.count || 0,
    hour: hourRows.length,
    hourRetryAfter: Math.max(1, Math.ceil((oldest + 3_600_000 - Date.now()) / 1000)),
  };
}

export async function saveProfile(userId: string, email?: string | null, fullName?: string | null) {
  const admin = createAdminSupabase();
  const { error } = await admin.from("future_atlas_profiles").upsert({
    user_id: userId,
    email: (email || "").slice(0, 320),
    full_name: fullName?.trim() ? fullName.trim().slice(0, 160) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error && !isMissingTable(error)) console.error(JSON.stringify({ event: "profile_upsert_failed", code: error.code }));
  return error;
}

export async function creditStatus(userId: string) {
  const spent = await spentQuarters(userId);
  return { credits_remaining: displayedCredits(spent), reset_at: resetAtIso() };
}

export async function authorizeUser(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  mode: string;
  requestHash: string;
  idempotencyKey: string;
}): Promise<CreditDecision> {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw new Error("FA_INVALID_IDEMPOTENCY_KEY");
  }
  await saveProfile(input.userId, input.email, input.fullName);
  const admin = createAdminSupabase();
  const existing = await admin
    .from("future_atlas_ai_reservations")
    .select("id,status,request_hash,result_payload")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const spent = await spentQuarters(input.userId);
  const row = existing.data as ReservationRow | null;
  if (row) {
    if (row.request_hash !== input.requestHash) throw new Error("FA_IDEMPOTENCY_CONFLICT");
    return {
      requestId: row.id,
      cacheScope: `user:${input.userId}`,
      creditsRemaining: displayedCredits(spent),
      replayStatus: row.status,
      replayPayload: row.status === "completed" ? row.result_payload : null,
    };
  }

  if (await inflightCount(input.userId, false) >= MAX_IN_FLIGHT) throw new Error("FA_USER_BUSY");
  if (spent + 4 > DAILY_QUARTER_BUDGET) throw new Error("FA_DAILY_LIMIT");

  const requestId = crypto.randomUUID();
  const inserted = await admin.from("future_atlas_ai_reservations").insert({
    id: requestId,
    user_id: input.userId,
    api_key_hash: null,
    idempotency_key: input.idempotencyKey,
    request_hash: input.requestHash,
    mode: input.mode,
    credit_quarters: 4,
    status: "processing",
  });
  if (inserted.error) throw inserted.error;
  return {
    requestId,
    cacheScope: `user:${input.userId}`,
    creditsRemaining: displayedCredits(spent + 4),
    replayStatus: "new",
    replayPayload: null,
  };
}

export async function authorizeApiKey(input: {
  userId: string;
  mode: string;
  requestHash: string;
  idempotencyKey: string;
  apiKeyHash: string;
}): Promise<CreditDecision> {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) throw new Error("FA_INVALID_IDEMPOTENCY_KEY");
  const admin = createAdminSupabase();
  const existing = await admin
    .from("future_atlas_ai_reservations")
    .select("id,status,request_hash,result_payload")
    .eq("user_id", input.userId)
    .eq("api_key_hash", input.apiKeyHash)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const row = existing.data as ReservationRow | null;
  if (row) {
    const usage = await apiUsageCounts(input.userId);
    if (row.request_hash !== input.requestHash) throw new Error("FA_IDEMPOTENCY_CONFLICT");
    return {
      requestId: row.id,
      cacheScope: `api:${input.userId}`,
      creditsRemaining: Math.max(0, API_REQUESTS_PER_DAY - usage.today),
      replayStatus: row.status,
      replayPayload: row.status === "completed" ? row.result_payload : null,
    };
  }
  const replayed = await admin
    .from("future_atlas_ai_reservations")
    .select("id,status,request_hash,result_payload")
    .eq("user_id", input.userId)
    .eq("api_key_hash", input.apiKeyHash)
    .eq("request_hash", input.requestHash)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (replayed.error) throw replayed.error;
  if (replayed.data) {
    const usage = await apiUsageCounts(input.userId);
    return {
      requestId: replayed.data.id,
      cacheScope: `api:${input.userId}`,
      creditsRemaining: Math.max(0, API_REQUESTS_PER_DAY - usage.today),
      replayStatus: "completed",
      replayPayload: replayed.data.result_payload,
    };
  }
  const usage = await apiUsageCounts(input.userId);
  if (usage.hour >= API_REQUESTS_PER_HOUR) throw new Error(`FA_API_HOURLY_LIMIT:${usage.hourRetryAfter}`);
  if (usage.today >= API_REQUESTS_PER_DAY) throw new Error("FA_API_DAILY_LIMIT");
  if (await inflightCount(input.userId, true) >= MAX_IN_FLIGHT) throw new Error("FA_USER_BUSY");

  const requestId = crypto.randomUUID();
  const inserted = await admin.from("future_atlas_ai_reservations").insert({
    id: requestId,
    user_id: input.userId,
    api_key_hash: input.apiKeyHash,
    idempotency_key: input.idempotencyKey,
    request_hash: input.requestHash,
    mode: input.mode,
    credit_quarters: 0,
    status: "processing",
  });
  if (inserted.error) throw inserted.error;
  return {
    requestId,
    cacheScope: `api:${input.userId}`,
    creditsRemaining: Math.max(0, API_REQUESTS_PER_DAY - usage.today - 1),
    replayStatus: "new",
    replayPayload: null,
  };
}

export async function completeUser(input: {
  userId: string;
  requestId: string;
  status: "completed" | "failed";
  quarters: number;
  payload?: Record<string, unknown> | null;
}) {
  const admin = createAdminSupabase();
  const update = await admin
    .from("future_atlas_ai_reservations")
    .update({
      status: input.status,
      credit_quarters: input.status === "completed" ? input.quarters : 0,
      result_payload: input.status === "completed" ? input.payload || null : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("user_id", input.userId)
    .eq("status", "processing")
    .select("mode,api_key_hash")
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data || input.status !== "completed" || update.data.api_key_hash) {
    if (update.data?.api_key_hash) return Math.max(0, API_REQUESTS_PER_DAY - (await apiUsageCounts(input.userId)).today);
    return displayedCredits(await spentQuarters(input.userId));
  }
  const usage = await admin.from("future_atlas_ai_usage").insert({
    user_id: input.userId,
    request_id: input.requestId,
    mode: update.data.mode,
    credit_quarters: input.quarters,
  });
  if (usage.error && usage.error.code !== "23505") throw usage.error;
  return displayedCredits(await spentQuarters(input.userId));
}
