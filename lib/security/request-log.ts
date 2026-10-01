import { after, type NextRequest } from "next/server";

import { authenticateApiKey, presentedApiKey } from "@/lib/auth/api-key";
import { isTenantApiKey, isUserAccessToken, resolveRequestAuth } from "@/lib/auth/request-auth";
import { isFaApiKey } from "@/lib/platform/api-keys/format";
import { recordApiKeyAccess } from "@/lib/platform/api-keys/access";
import { getClientIp } from "@/lib/security/embed-utils";
import { createAdminSupabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const loggedRequests = new WeakSet<NextRequest>();

type RouteHandler = (request: NextRequest, context?: unknown) => Response | Promise<Response>;

export function withRequestLog<T extends RouteHandler>(handler: T): T {
  const wrapped = async (request: NextRequest, context?: unknown) => {
    if (loggedRequests.has(request)) return handler(request, context);
    loggedRequests.add(request);
    const started = Date.now();
    try {
      const response = await handler(request, context);
      scheduleRequestLog(request, response.status, Date.now() - started, response.headers.get("x-request-id"));
      return response;
    } catch (error) {
      scheduleRequestLog(request, 500, Date.now() - started, null);
      throw error;
    }
  };
  return wrapped as T;
}

function scheduleRequestLog(
  request: NextRequest,
  statusCode: number,
  durationMs: number,
  requestId: string | null
) {
  const write = async () => {
    try {
      await persistRequestLog(request, statusCode, durationMs, requestId);
    } catch (error) {
      console.error(JSON.stringify({
        event: "request_log_failed",
        message: error instanceof Error ? error.message : "unknown",
      }));
    }
  };

  try {
    after(write);
  } catch {
    void write();
  }
}

async function persistRequestLog(
  request: NextRequest,
  statusCode: number,
  durationMs: number,
  requestId: string | null
) {
  if (!process.env.SUPABASE_SECRET_KEY) return;

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const apiKey = presentedApiKey(request);
  const admin = createAdminSupabase();
  let authType: "user" | "api_key" | "anonymous" = "anonymous";
  let userId: string | null = null;

  if (apiKey) {
    authType = "api_key";
    const principal = await authenticateApiKey(request);
    if (principal.ok) userId = principal.userId;
    if (isFaApiKey(apiKey)) {
      await recordApiKeyAccess({
        token: apiKey,
        userId,
        path: request.nextUrl.pathname,
        ip: getClientIp(request.headers),
      });
    }
  } else if (isTenantApiKey(token) || isUserAccessToken(token)) {
    authType = "api_key";
    const auth = isUserAccessToken(token) ? await resolveRequestAuth(request) : null;
    userId = auth?.user.id || null;
    await recordApiKeyAccess({
      token,
      userId,
      path: request.nextUrl.pathname,
      ip: getClientIp(request.headers),
    });
  } else if (token) {
    const auth = await resolveRequestAuth(request);
    if (auth) {
      authType = "user";
      userId = auth.user.id;
    }
  }

  const { error } = await admin.from("future_atlas_request_logs").insert({
    user_id: userId,
    auth_type: authType,
    method: request.method.slice(0, 10),
    path: request.nextUrl.pathname.slice(0, 200),
    status_code: statusCode,
    duration_ms: durationMs,
    request_id: requestId && UUID.test(requestId) ? requestId : null,
    origin: request.headers.get("origin")?.slice(0, 200) || null,
    ip: getClientIp(request.headers)?.slice(0, 64) || null,
  });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return;
    console.error(JSON.stringify({ event: "request_log_write_failed", code: error.code }));
  }
}
