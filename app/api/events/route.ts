import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/security/request-log";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { readConsent } from "@/lib/platform/cookies";
import { rateLimited } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase";

const EVENTS = new Set(["page_view", "tool_result", "guidance_open", "forum_cta"]);

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "events", 60, 60_000);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") || 0) > 8_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || !EVENTS.has(body.event) || !["necessary", "additional"].includes(body.category) || !/^[0-9a-f-]{36}$/i.test(body.anonymousId || "")) return new NextResponse(null, { status: 400 });
  if (!process.env.SUPABASE_SECRET_KEY) return new NextResponse(null, { status: 204 });
  if (body.category === "additional" && readConsent(request) !== "additional") return new NextResponse(null, { status: 204 });
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
  if (JSON.stringify(metadata).length > 2_000) return new NextResponse(null, { status: 400 });
  try {
    const admin = createAdminSupabase();
    const auth = await resolveRequestAuth(request);
    const { error } = await admin.from("future_atlas_events").insert({ user_id: auth?.user.id || null, anonymous_id: body.anonymousId, event_name: body.event, category: body.category, metadata });
    if (error) console.error(JSON.stringify({ event: "analytics_write_failed", code: error.code }));
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
});
