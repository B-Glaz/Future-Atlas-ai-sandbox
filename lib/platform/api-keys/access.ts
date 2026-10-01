import { createAdminSupabase } from "@/lib/supabase";
import { displayPrefix } from "@/lib/platform/api-keys/format";
import { hashKey, isMissingTable } from "@/lib/platform/credits/daily";

export async function recordApiKeyAccess(input: {
  token: string;
  userId?: string | null;
  path: string;
  ip?: string | null;
}) {
  if (!input.token) return;
  const admin = createAdminSupabase();
  const { error } = await admin.from("future_atlas_api_key_access").insert({
    user_id: input.userId || null,
    key_prefix: displayPrefix(input.token),
    key_hash: hashKey(input.token),
    path: input.path.slice(0, 200),
    ip: input.ip?.slice(0, 64) || null,
  });
  if (error && !isMissingTable(error)) {
    console.error(JSON.stringify({ event: "api_key_access_failed", code: error.code }));
  }
}
