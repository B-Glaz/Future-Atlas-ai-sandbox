import { createAdminSupabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/platform/credits/daily";
import { generateApiKey } from "@/lib/platform/api-keys/format";

const AI_SCOPE = "ai:generate";
const MAX_KEYS = 10;

export type ExpirationChoice = "never" | "30d" | "90d" | "1y" | "custom";

export type ApiKeyRecord = {
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

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  permissions: string[] | null;
  allowed_origins: string[] | null;
};

function statusOf(row: Pick<KeyRow, "revoked_at" | "expires_at">): ApiKeyRecord["status"] {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

function present(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    permissions: Array.isArray(row.permissions) && row.permissions.length ? row.permissions : [AI_SCOPE],
    allowed_origins: row.allowed_origins || [],
    status: statusOf(row),
  };
}

export function resolveExpiry(choice: ExpirationChoice, custom: string | null) {
  const now = Date.now();
  if (choice === "never") return null;
  if (choice === "30d") return new Date(now + 30 * 86_400_000).toISOString();
  if (choice === "90d") return new Date(now + 90 * 86_400_000).toISOString();
  if (choice === "1y") return new Date(now + 365 * 86_400_000).toISOString();
  if (!custom || !/^\d{4}-\d{2}-\d{2}$/.test(custom)) throw new Error("Choose a valid expiration date.");
  const expiresAt = new Date(`${custom}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) throw new Error("Expiration must be a future date.");
  return expiresAt.toISOString();
}

export function cleanKeyName(value: unknown) {
  if (typeof value !== "string") throw new Error("Name the API key.");
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 80) throw new Error("Name the API key using 1 to 80 characters.");
  return name;
}

export function cleanAllowedOrigins(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Add at least one authorized website origin.");
  const origins = value.map((entry) => {
    if (typeof entry !== "string") throw new Error("Use valid website origins.");
    let url: URL;
    try { url = new URL(entry.trim()); } catch { throw new Error("Use valid website origins."); }
    if (url.pathname !== "/" || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) throw new Error("Use origins such as https://example.com without a path.");
    if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Public website origins must use HTTPS.");
    return url.origin.toLowerCase();
  });
  return [...new Set(origins)].slice(0, 20);
}

export async function listApiKeys(userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("future_atlas_api_keys")
    .select("id,name,key_prefix,created_at,expires_at,revoked_at,last_used_at,permissions,allowed_origins")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return { keys: [] as ApiKeyRecord[], schemaPending: true };
    throw error;
  }
  return { keys: ((data || []) as KeyRow[]).map(present), schemaPending: false };
}

async function insertKey(userId: string, name: string, expiresAt: string | null, allowedOrigins: string[], replacingId?: string) {
  const admin = createAdminSupabase();
  let active = admin
    .from("future_atlas_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (replacingId) active = active.neq("id", replacingId);
  const counted = await active;
  if (counted.error) throw counted.error;
  if ((counted.count || 0) >= MAX_KEYS) throw new Error("Revoke an API key before creating another. The limit is 10 active keys.");
  const generated = generateApiKey();
  const { data, error } = await admin
    .from("future_atlas_api_keys")
    .insert({
      user_id: userId,
      name,
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
      expires_at: expiresAt,
      permissions: [AI_SCOPE],
      allowed_origins: allowedOrigins,
    })
    .select("id,name,key_prefix,created_at,expires_at,permissions,allowed_origins")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    name: data.name as string,
    api_key: generated.apiKey,
    key_prefix: data.key_prefix as string,
    created_at: data.created_at as string,
    expires_at: (data.expires_at as string | null) ?? null,
    permissions: (data.permissions as string[]) || [AI_SCOPE],
    allowed_origins: (data.allowed_origins as string[]) || [],
  };
}

export async function createApiKey(userId: string, name: string, expiresAt: string | null, allowedOrigins: string[]) {
  return insertKey(userId, name, expiresAt, allowedOrigins);
}

export async function revokeApiKey(userId: string, keyId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("future_atlas_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function rotateApiKey(userId: string, keyId: string, name: string, expiresAt: string | null, allowedOrigins: string[]) {
  const admin = createAdminSupabase();
  const existing = await admin
    .from("future_atlas_api_keys")
    .select("id")
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return null;
  const created = await insertKey(userId, name, expiresAt, allowedOrigins, keyId);
  await revokeApiKey(userId, keyId);
  return created;
}
