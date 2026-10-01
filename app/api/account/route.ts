import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { withRequestLog } from "@/lib/security/request-log";
import { createAdminSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const POST = withRequestLog(async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 128_000) return new NextResponse(null, { status: 413 });
  const auth = await resolveRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.history !== "object" || Array.isArray(body.history)) return NextResponse.json({ error: "Valid history required." }, { status: 400 });
  if (JSON.stringify(body.history).length > 128_000) return new NextResponse(null, { status: 413 });

  try {
    const { error } = await createAdminSupabase().from("future_atlas_history_backups").upsert({
      user_id: auth.user.id,
      history: body.history,
      consent: typeof body.consent === "string" ? body.consent.slice(0, 20) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return new NextResponse(null, { status: error ? 503 : 204 });
  } catch {
    return NextResponse.json({ error: "History backup unavailable." }, { status: 503 });
  }
});

export const DELETE = withRequestLog(async function DELETE(request: NextRequest) {
  const auth = await resolveRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (auth.kind !== "session") return NextResponse.json({ error: "Sign in to delete this account." }, { status: 403 });
  try {
    const admin = createAdminSupabase();
    const tables = ["future_atlas_history_backups", "future_atlas_consent_log", "future_atlas_events", "future_atlas_request_logs", "future_atlas_ai_usage", "future_atlas_ai_reservations", "future_atlas_api_key_access", "future_atlas_api_keys", "future_atlas_api_tokens", "future_atlas_profiles"] as const;
    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq("user_id", auth.user.id);
      if (error && error.code !== "PGRST205" && error.code !== "42P01") return NextResponse.json({ error: "Account data deletion failed." }, { status: 503 });
    }
    const { error: authError } = await admin.auth.admin.deleteUser(auth.user.id);
    return new NextResponse(null, { status: authError ? 503 : 204 });
  } catch {
    return NextResponse.json({ error: "Account deletion unavailable." }, { status: 503 });
  }
});
