import { NextResponse } from "next/server";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const GET = withRequestLog(function GET() {
  const requestId = crypto.randomUUID();
  const ready = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.OPENROUTER_API_KEY && process.env.API_TOKEN_SIGNING_SECRET) && process.env.AI_ENABLED !== "false";
  return NextResponse.json(
    { status: ready ? "ready" : "degraded", requestId },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } }
  );
});
