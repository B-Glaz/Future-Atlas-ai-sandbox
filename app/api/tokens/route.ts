import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { revokeSignedTokens } from "@/lib/auth/signed-tokens";
import { apiTokenStatus, issuePersistedTokens, revokePersistedTokens } from "@/lib/platform/api-keys/tokens";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const GET = withRequestLog(async function GET(request: NextRequest) {
  const auth = await resolveRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await apiTokenStatus(auth.user.id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Token status unavailable." }, { status: 503 });
  }
});

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "token-issue", 5, 60_000);
  if (limited) return limited;
  const auth = await resolveRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (auth.kind !== "session") return NextResponse.json({ error: "Sign in to generate API tokens." }, { status: 403 });
  try {
    return NextResponse.json(await issuePersistedTokens(auth.user.id), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not generate API tokens." }, { status: 503 });
  }
});

export const DELETE = withRequestLog(async function DELETE(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 4_000) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => ({})) as { accessToken?: unknown; refreshToken?: unknown; all?: unknown };
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
  const revokeAll = body.all === true;
  if (!revokeAll && !accessToken && !refreshToken) return NextResponse.json({ error: "Provide an access token, refresh token, or all." }, { status: 400 });

  const auth = await resolveRequestAuth(request);
  if (revokeAll && auth?.kind !== "session") return NextResponse.json({ error: "Sign in to revoke all API tokens." }, { status: 401 });

  try {
    const revoked = await revokePersistedTokens({
      accessToken: accessToken || undefined,
      refreshToken: refreshToken || undefined,
      all: revokeAll,
      userId: auth?.user.id,
    });
    return NextResponse.json({ revoked });
  } catch {
    const signedRevoked = revokeSignedTokens({
      accessToken: accessToken || undefined,
      refreshToken: refreshToken || undefined,
      all: revokeAll,
      userId: auth?.user.id,
    });
    if (signedRevoked) return NextResponse.json({ revoked: true });
    return NextResponse.json({ error: "Token revocation unavailable." }, { status: 503 });
  }
});
