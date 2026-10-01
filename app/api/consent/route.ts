import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { withRequestLog } from "@/lib/security/request-log";
import { createAdminSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const POST = withRequestLog(async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 2_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || !/^[0-9a-f-]{36}$/i.test(body.anonymousId || "") || body.necessary !== true || typeof body.analytics !== "boolean" || body.advertising !== false) {
    return new NextResponse(null, { status: 400 });
  }
  if (!process.env.SUPABASE_SECRET_KEY) return new NextResponse(null, { status: 204 });

  try {
    const admin = createAdminSupabase();
    const auth = await resolveRequestAuth(request);
    const { error } = await admin.from("future_atlas_consent_log").insert({
      user_id: auth?.user.id || null,
      anonymous_id: body.anonymousId,
      necessary_accepted: true,
      analytics_accepted: body.analytics,
      advertising_accepted: false,
    });
    if (error) console.error(JSON.stringify({ event: "consent_write_failed", code: error.code }));
    return new NextResponse(null, { status: error ? 503 : 204 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
});
