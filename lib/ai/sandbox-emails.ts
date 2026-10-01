import { createAdminSupabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/platform/credits/daily";

const TABLE = "future_atlas_sandbox_allowed_emails";

type Row = { credits_used: number };

function asCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) throw new Error("FA_SCHEMA_PENDING");
  return count;
}

export async function isAllowedSandboxEmail(email: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from(TABLE).select("email").eq("email", email).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new Error("FA_SCHEMA_PENDING");
    throw error;
  }
  return Boolean(data);
}

export async function recordSandboxEmailUse(email: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const admin = createAdminSupabase();
    const current = await admin.from(TABLE).select("credits_used").eq("email", email).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return;
    const used = asCount((current.data as Row).credits_used);
    const next = await admin
      .from(TABLE)
      .update({ credits_used: used + 1, last_used_at: new Date().toISOString() })
      .eq("email", email)
      .eq("credits_used", used)
      .select("credits_used")
      .maybeSingle();
    if (next.error) throw next.error;
    if (next.data) return;
  }
}
