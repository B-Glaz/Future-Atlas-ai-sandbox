import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/email-address";
import { clearEmailLogin, emailLoginToken, readEmailLogin, writeEmailLogin } from "@/lib/auth/email-login";
import { isAllowedSandboxEmail } from "@/lib/ai/sandbox-emails";
import { isSandboxSchemaError } from "@/lib/ai/sandbox-credits";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

const NOT_ALLOWED = "This email is not on the list. Ask us to add it.";

async function allowed(email: string) {
  try {
    return await isAllowedSandboxEmail(email);
  } catch (error) {
    if (isSandboxSchemaError(error) || (error instanceof Error && error.message === "FA_SCHEMA_PENDING")) {
      return NextResponse.json({ error: "Sign-in is not ready yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });
  }
}

export const GET = withRequestLog(async function GET(request: NextRequest) {
  const email = await readEmailLogin(request);
  if (!email) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  const access = await allowed(email);
  if (access instanceof NextResponse) return access;
  return NextResponse.json({ signedIn: access }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const access = await allowed(email);
  if (access instanceof NextResponse) return access;
  if (!access) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
  const token = await emailLoginToken(email);
  if (!token) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });
  const response = NextResponse.json({ signedIn: true }, { headers: { "Cache-Control": "no-store" } });
  writeEmailLogin(response, token);
  return response;
});

export const DELETE = withRequestLog(async function DELETE() {
  const response = NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  clearEmailLogin(response);
  return response;
});
