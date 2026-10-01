import { NextRequest, NextResponse } from "next/server";

import { bearerToken } from "@/lib/auth/request-auth";
import { validatePersistedToken } from "@/lib/platform/api-keys/tokens";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "token-validate", 20, 60_000);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") || 0) > 2_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = (typeof body?.token === "string" ? body.token.trim() : "") || bearerToken(request);
  if (!token) return NextResponse.json({ error: "A token is required." }, { status: 400 });

  return NextResponse.json(await validatePersistedToken(token), { headers: { "Cache-Control": "no-store" } });
});
