import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { authenticateApiKey, presentedApiKey } from "@/lib/auth/api-key";
import { isTenantApiKey, isUserAccessToken, resolveRequestAuth } from "@/lib/auth/request-auth";
import { inspectSignedToken } from "@/lib/auth/signed-tokens";
import { creditQuarters, secondsUntilKolkataMidnight } from "@/lib/ai/credit-policy";
import { authorizeApiKey, authorizeUser, completeUser, hashKey, isMissingTable } from "@/lib/platform/credits/daily";
import { confirmApiToken } from "@/lib/platform/api-keys/tokens";
import { isSandboxSchemaError, refundSandboxCredit, takeSandboxCredit } from "@/lib/ai/sandbox-credits";
import { isAllowedSandboxEmail, recordSandboxEmailUse } from "@/lib/ai/sandbox-emails";
import { SANDBOX_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/ai/sandbox-credit-copy";
import { readEmailLogin } from "@/lib/auth/email-login";

export class CreditError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryAfter?: number
  ) {
    super(message);
  }
}

type Authorization = {
  requestId: string;
  cacheScope: string;
  creditsRemaining: number;
  replayStatus: string;
  replayPayload: Record<string, unknown> | null;
  apiKey: string;
  mode: string;
  userId?: string;
  sandbox?: boolean;
  sandboxHeld?: boolean;
  sandboxEmail?: string;
};

const errors: Record<string, [number, string, number?]> = {
  FA_AUTH_REQUIRED: [401, "Sign in or provide a valid API key."],
  FA_EMAIL_REQUIRED: [401, "Enter your email to use credits."],
  FA_EMAIL_FORBIDDEN: [403, "This email is not on the list. Ask us to add it."],
  FA_INVALID_API_KEY: [401, "Invalid or expired API key."],
  FA_INVALID_IDEMPOTENCY_KEY: [400, "Idempotency-Key must contain 8 to 128 characters."],
  FA_IDEMPOTENCY_CONFLICT: [409, "Idempotency-Key was already used for another request."],
  FA_RATE_LIMIT: [429, "Please wait before another AI request.", 30],
  FA_USER_BUSY: [429, "An AI request is already running for this account.", 5],
  FA_DAILY_LIMIT: [429, "Daily AI credits exhausted. Credits renew within 24 hours."],
  FA_API_DAILY_LIMIT: [429, "API daily limit reached. The limit renews on the next calendar day."],
  FA_API_HOURLY_LIMIT: [429, "API hourly limit reached. Try again later.", 3600],
  FA_SCHEMA_PENDING: [503, "The new database is not ready yet.", 30],
};

function creditError(message: string) {
  const hourly = message.match(/FA_API_HOURLY_LIMIT:(\d+)/);
  const code = hourly ? "FA_API_HOURLY_LIMIT" : Object.keys(errors).find((item) => message.includes(item)) || "FA_ADMISSION_FAILED";
  const [status, configuredMessage, configuredRetryAfter] = errors[code] || [503, "AI admission is temporarily unavailable."];
  const retryAfter = code === "FA_DAILY_LIMIT" || code === "FA_API_DAILY_LIMIT"
    ? secondsUntilKolkataMidnight()
    : hourly ? Number(hourly[1]) : configuredRetryAfter;
  const hours = Math.ceil((retryAfter || 0) / 3600);
  const publicMessage = code === "FA_DAILY_LIMIT"
    ? `Daily AI credits exhausted. Credits renew in ${hours} hours.`
    : code === "FA_API_DAILY_LIMIT"
      ? `API daily limit of 1,000 requests is reached. It renews in ${hours} hours.`
      : configuredMessage;
  return new CreditError(publicMessage, status, code, retryAfter);
}

function displayName(user: Partial<User>) {
  const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return metadata?.full_name || metadata?.name || null;
}

export async function consumeCredit(
  request: NextRequest,
  mode: string,
  requestHash: string
): Promise<Authorization> {
  const apiKeyHeader = presentedApiKey(request);
  if (apiKeyHeader) {
    const principal = await authenticateApiKey(request);
    if (!principal.ok) throw new CreditError(principal.error, principal.status, principal.code, principal.status === 503 ? 30 : undefined);
    if (!principal.permissions.includes("ai:generate")) throw new CreditError("Insufficient permissions", 403, "FA_FORBIDDEN");
    const admission = await admitSandbox(mode, `api:${principal.keyPrefix}`);
    return { ...admission, apiKey: principal.keyHash, mode, userId: principal.userId };
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken || (!isTenantApiKey(accessToken) && !isUserAccessToken(accessToken))) {
    const email = await readEmailLogin(request);
    if (!email) throw creditError("FA_EMAIL_REQUIRED");
    try {
      if (!(await isAllowedSandboxEmail(email))) throw new CreditError("This email is not on the list. Ask us to add it.", 403, "FA_EMAIL_FORBIDDEN");
    } catch (error) {
      if (error instanceof CreditError) throw error;
      if (isSandboxSchemaError(error) || (error instanceof Error && error.message === "FA_SCHEMA_PENDING")) throw creditError("FA_SCHEMA_PENDING");
      throw creditError("FA_ADMISSION_FAILED");
    }
    const admission = await admitSandbox(mode, `email:${email}`);
    return { ...admission, sandboxEmail: email };
  }

  const apiKey = isTenantApiKey(accessToken) || isUserAccessToken(accessToken) ? accessToken : "";
  const userAuth = apiKey ? null : await resolveRequestAuth(request);
  if (!apiKey && !userAuth) throw new CreditError("Your session has expired. Please sign in again.", 401, "FA_AUTH_REQUIRED");

  const signed = apiKey && isUserAccessToken(apiKey) ? inspectSignedToken(apiKey) : null;
  if (apiKey && isUserAccessToken(apiKey) && (!signed?.valid || !(await confirmApiToken(apiKey)))) {
    throw new CreditError("Invalid or expired API key.", 401, "FA_INVALID_API_KEY");
  }
  if (apiKey && !isUserAccessToken(apiKey)) throw new CreditError("Invalid or expired API key.", 401, "FA_INVALID_API_KEY");

  const userId = userAuth?.user.id || (signed?.valid ? signed.user_id : "") || "";
  if (!userId) throw new CreditError("Invalid or expired API key.", 401, "FA_INVALID_API_KEY");

  const requestId = crypto.randomUUID();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || requestId;
  try {
    const decision = apiKey
      ? await authorizeApiKey({ userId, mode, requestHash, idempotencyKey, apiKeyHash: hashKey(apiKey) })
      : await authorizeUser({
        userId,
        email: userAuth?.user.email,
        fullName: userAuth ? displayName(userAuth.user) : null,
        mode,
        requestHash,
        idempotencyKey,
      });
    return { ...decision, apiKey, mode, userId };
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) throw creditError("FA_SCHEMA_PENDING");
    throw creditError(error instanceof Error ? error.message : "FA_ADMISSION_FAILED");
  }
}

async function admitSandbox(mode: string, cacheScope = "sandbox"): Promise<Authorization> {
  try {
    const creditsRemaining = await takeSandboxCredit();
    return {
      requestId: crypto.randomUUID(),
      cacheScope,
      creditsRemaining,
      replayStatus: "new",
      replayPayload: null,
      apiKey: "",
      mode,
      sandbox: true,
      sandboxHeld: true,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "FA_SANDBOX_EXHAUSTED") {
      throw new CreditError(SANDBOX_CREDITS_EXHAUSTED_MESSAGE, 429, "FA_SANDBOX_EXHAUSTED");
    }
    if (isSandboxSchemaError(error) || isMissingTable(error as { code?: string; message?: string })) {
      throw creditError("FA_SCHEMA_PENDING");
    }
    throw creditError(error instanceof Error ? error.message : "FA_ADMISSION_FAILED");
  }
}

export async function completeCreditRequest(
  _request: NextRequest,
  authorization: Authorization,
  status: "completed" | "failed",
  payload?: Record<string, unknown>,
  details?: { errorCode?: string; provider?: string; durationMs?: number }
) {
  if (authorization.sandbox) {
    if (status === "completed") {
      authorization.sandboxHeld = false;
      if (authorization.sandboxEmail) {
        try {
          await recordSandboxEmailUse(authorization.sandboxEmail);
        } catch (error) {
          console.error(JSON.stringify({
            event: "sandbox_email_usage_failed",
            requestId: authorization.requestId,
            code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
          }));
        }
      }
    }
    if (status === "failed" && authorization.sandboxHeld) {
      authorization.sandboxHeld = false;
      try {
        const remaining = await refundSandboxCredit();
        if (payload) payload.creditsRemaining = remaining;
      } catch (error) {
        console.error(JSON.stringify({
          event: "sandbox_credit_refund_failed",
          requestId: authorization.requestId,
          code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
        }));
      }
    }
    return;
  }
  if (!authorization.userId) return;
  try {
    const remaining = await completeUser({
      userId: authorization.userId,
      requestId: authorization.requestId,
      status,
      quarters: status === "completed" && !authorization.apiKey ? creditQuarters(authorization.mode, payload) : 0,
      payload,
    });
    if (payload && status === "completed") payload.creditsRemaining = remaining;
  } catch (error) {
    console.error(JSON.stringify({
      event: "ai_request_completion_failed",
      requestId: authorization.requestId,
      provider: details?.provider,
      failure: details?.errorCode,
      code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    }));
  }
}

export async function signedInCreditStatus(userId: string) {
  const { creditStatus } = await import("@/lib/platform/credits/daily");
  return creditStatus(userId);
}
