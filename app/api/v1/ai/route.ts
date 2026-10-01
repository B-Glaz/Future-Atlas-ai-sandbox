export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { POST as handleAIRequest } from "../../ai/route";
import { authenticateApiKey, presentedApiKey, type ApiKeyFailure } from "@/lib/auth/api-key";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

function authError(failure: ApiKeyFailure, requestId: string) {
  return NextResponse.json(
    { error: { code: failure.code, message: failure.error, retryable: failure.status === 503, requestId } },
    { status: failure.status, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } }
  );
}

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!presentedApiKey(request)) return authError({ ok: false, status: 401, error: "API key required", code: "FA_AUTH_REQUIRED" }, requestId);

  const principal = await authenticateApiKey(request);
  if (!principal.ok) return authError(principal, requestId);
  if (!principal.permissions.includes("ai:generate")) {
    return NextResponse.json(
      { error: { code: "FA_FORBIDDEN", message: "Insufficient permissions", retryable: false, requestId } },
      { status: 403, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } }
    );
  }

  const limited = rateLimited(request, "ai-key", 30, 60_000, principal.keyId);
  if (limited) return limited;
  return handleAIRequest(request);
});
