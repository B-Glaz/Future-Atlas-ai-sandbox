import { NextRequest, NextResponse } from "next/server";

import { refreshPersistedToken } from "@/lib/platform/api-keys/tokens";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "token-refresh", 10, 60_000);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") || 0) > 2_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null) as { refreshToken?: unknown } | null;
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
  if (!refreshToken.startsWith("fa_rtk_")) return NextResponse.json({ error: "A valid refresh token is required." }, { status: 400 });

  const signed = await refreshPersistedToken(refreshToken);
  if (signed) return NextResponse.json(signed, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ error: "Refresh token is invalid or expired." }, { status: 401 });
});
