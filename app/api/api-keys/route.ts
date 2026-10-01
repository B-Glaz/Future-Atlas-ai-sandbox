import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { cleanAllowedOrigins, cleanKeyName, createApiKey, listApiKeys, resolveExpiry, revokeApiKey, rotateApiKey, type ExpirationChoice } from "@/lib/platform/api-keys/keys";
import { isMissingTable } from "@/lib/platform/credits/daily";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

const CHOICES = new Set<ExpirationChoice>(["never", "30d", "90d", "1y", "custom"]);

async function sessionUser(request: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const auth = await resolveRequestAuth(request);
  if (!auth) return { ok: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (auth.kind !== "session") return { ok: false, response: NextResponse.json({ error: "Sign in to manage API keys." }, { status: 403 }) };
  return { ok: true, userId: auth.user.id };
}

function expiryFromBody(body: { expiresIn?: unknown; expiresAt?: unknown }) {
  const choice = typeof body.expiresIn === "string" ? body.expiresIn : "never";
  if (!CHOICES.has(choice as ExpirationChoice)) throw new Error("Choose never, 30 days, 90 days, 1 year, or a custom date.");
  const custom = typeof body.expiresAt === "string" ? body.expiresAt : null;
  return resolveExpiry(choice as ExpirationChoice, custom);
}

export const GET = withRequestLog(async function GET(request: NextRequest) {
  const session = await sessionUser(request);
  if (!session.ok) return session.response;
  try {
    const result = await listApiKeys(session.userId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "API keys are unavailable." }, { status: 503 });
  }
});

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const limited = rateLimited(request, "api-key-issue", 5, 60_000);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") || 0) > 4_000) return new NextResponse(null, { status: 413 });
  const session = await sessionUser(request);
  if (!session.ok) return session.response;
  const body = await request.json().catch(() => null) as { name?: unknown; expiresIn?: unknown; expiresAt?: unknown; rotateId?: unknown; allowedOrigins?: unknown } | null;
  if (!body) return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  try {
    const name = cleanKeyName(body.name);
    const expiresAt = expiryFromBody(body);
    const allowedOrigins = cleanAllowedOrigins(body.allowedOrigins);
    const rotateId = typeof body.rotateId === "string" ? body.rotateId.trim() : "";
    const created = rotateId
      ? await rotateApiKey(session.userId, rotateId, name, expiresAt, allowedOrigins)
      : await createApiKey(session.userId, name, expiresAt, allowedOrigins);
    if (!created) return NextResponse.json({ error: "API key not found." }, { status: 404 });
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json({ error: "API keys are unavailable." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Could not create the API key.";
    const status = /Name the API key|expiration|future date|Revoke an API key|origin|HTTPS/i.test(message) ? 400 : 503;
    return NextResponse.json({ error: status === 400 ? message : "Could not create the API key." }, { status });
  }
});

export const DELETE = withRequestLog(async function DELETE(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 4_000) return new NextResponse(null, { status: 413 });
  const session = await sessionUser(request);
  if (!session.ok) return session.response;
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "API key id is required." }, { status: 400 });
  try {
    const revoked = await revokeApiKey(session.userId, id);
    if (!revoked) return NextResponse.json({ error: "API key not found." }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json({ error: "API keys are unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not revoke the API key." }, { status: 503 });
  }
});
