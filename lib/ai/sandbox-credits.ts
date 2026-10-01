import { createAdminSupabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/platform/credits/daily";

const TABLE = "future_atlas_sandbox_credits";

type Row = { credits_remaining: number };
type SchemaError = { code?: string; message?: string };

function missingSandboxSchema(error?: SchemaError | null) {
  if (!error) return false;
  return isMissingTable(error);
}

function asCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) throw new Error("FA_SCHEMA_PENDING");
  return count;
}

export function isSandboxSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return error instanceof Error && error.message === "FA_SCHEMA_PENDING";
  return missingSandboxSchema(error as SchemaError) || (error instanceof Error && error.message === "FA_SCHEMA_PENDING");
}

async function readBalance() {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from(TABLE).select("credits_remaining").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("FA_SCHEMA_PENDING");
  return asCount((data as Row).credits_remaining);
}

async function writeBalance(from: number, to: number) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from(TABLE)
    .update({ credits_remaining: to, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .eq("credits_remaining", from)
    .select("credits_remaining")
    .maybeSingle();
  if (error) throw error;
  return data ? asCount((data as Row).credits_remaining) : null;
}

export async function sandboxCreditsRemaining() {
  return readBalance();
}

export async function takeSandboxCredit() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readBalance();
    if (current <= 0) throw new Error("FA_SANDBOX_EXHAUSTED");
    const next = await writeBalance(current, current - 1);
    if (next !== null) return next;
  }
  throw new Error("FA_USER_BUSY");
}

export async function refundSandboxCredit() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readBalance();
    const next = await writeBalance(current, current + 1);
    if (next !== null) return next;
  }
  throw new Error("FA_USER_BUSY");
}
