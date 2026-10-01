import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { CONSENT_VALUES, readConsent, requestVisitor, writeConsent, type ConsentValue } from "@/lib/platform/cookies";
import { createAdminSupabase } from "@/lib/supabase";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const GET = withRequestLog(async function GET(request: NextRequest) {
  const response = NextResponse.json({ consent: readConsent(request), visitor: Boolean(requestVisitor(request)) }, { headers: { "Cache-Control": "no-store" } });
  return response;
});

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "cookies", 30, 60_000);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") || 0) > 2_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null) as { consent?: unknown; anonymousId?: unknown } | null;
  const consent = body?.consent;
  if (consent !== "necessary" && consent !== "additional") return NextResponse.json({ error: "Choose necessary or additional cookies." }, { status: 400 });
  if (!CONSENT_VALUES.includes(consent)) return NextResponse.json({ error: "Choose necessary or additional cookies." }, { status: 400 });

  const response = NextResponse.json({ consent }, { headers: { "Cache-Control": "no-store" } });
  const visitorId = requestVisitor(request);
  if (!visitorId) return NextResponse.json({ error: "Visitor cookie is missing." }, { status: 400 });
  writeConsent(response, consent as ConsentValue, request.nextUrl.protocol === "https:");

  if (process.env.SUPABASE_SECRET_KEY) {
    const auth = await resolveRequestAuth(request).catch(() => null);
    const anonymousId = typeof body?.anonymousId === "string" && /^[0-9a-f-]{36}$/i.test(body.anonymousId) ? body.anonymousId : visitorId;
    const { error } = await createAdminSupabase().from("future_atlas_consent_log").insert({
      user_id: auth?.user.id || null,
      anonymous_id: anonymousId,
      necessary_accepted: true,
      analytics_accepted: consent === "additional",
      advertising_accepted: false,
    });
    if (error) console.error(JSON.stringify({ event: "consent_write_failed", code: error.code }));
  }
  return response;
});
