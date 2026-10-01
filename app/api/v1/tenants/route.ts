import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { createAdminSupabase } from "@/lib/supabase";
import { normalizeOrigin } from "@/lib/security/embed-utils";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validText(value: unknown, max = 100): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function reply(requestId: string, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "X-Request-ID": requestId } });
}

export const GET = withRequestLog(async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveRequestAuth(request);
  if (!auth || auth.kind !== "session") return reply(requestId, { error: { code: "AUTH_REQUIRED", message: "Sign in first.", requestId } }, 401);
  const client = auth.client;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (tenantId && !UUID.test(tenantId)) return reply(requestId, { error: { code: "INVALID_TENANT_ID", message: "Valid tenantId required.", requestId } }, 400);
  const { data, error } = tenantId
    ? await client.rpc("future_atlas_tenant_details", { p_tenant_id: tenantId })
    : await client.rpc("future_atlas_list_tenants");
  if (error) return reply(requestId, { error: { code: "TENANT_LIST_FAILED", message: "Could not load tenants.", requestId } }, 500);
  return reply(requestId, { data, requestId });
});

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (Number(request.headers.get("content-length") || 0) > 16_000) {
    return reply(requestId, { error: { code: "REQUEST_TOO_LARGE", message: "Request is too large.", requestId } }, 413);
  }
  const auth = await resolveRequestAuth(request);
  if (!auth || auth.kind !== "session") return reply(requestId, { error: { code: "AUTH_REQUIRED", message: "Sign in first.", requestId } }, 401);
  const client = auth.client;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid action required.", requestId } }, 400);
  }

  let result;
  if (body.action === "create") {
    if (!validText(body.name) || !validText(body.slug, 60) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Name and lowercase URL-safe slug required.", requestId } }, 400);
    result = await client.rpc("future_atlas_create_tenant", { p_name: body.name, p_slug: body.slug, p_environment: body.environment === "production" ? "production" : "sandbox" });
  } else if (body.action === "issueCredential") {
    if (typeof body.tenantId !== "string" || !UUID.test(body.tenantId) || !validText(body.name)) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid tenantId and credential name required.", requestId } }, 400);
    if (body.expiresAt && (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt)))) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "expiresAt must be an ISO date.", requestId } }, 400);
    result = await client.rpc("future_atlas_issue_credential", { p_tenant_id: body.tenantId, p_name: body.name, p_scopes: ["ai:generate"], p_expires_at: body.expiresAt || null });
  } else if (body.action === "revokeCredential") {
    if (typeof body.credentialId !== "string" || !UUID.test(body.credentialId)) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid credentialId required.", requestId } }, 400);
    result = await client.rpc("future_atlas_revoke_credential", { p_credential_id: body.credentialId });
  } else if (body.action === "registerDomain") {
    const origin = typeof body.origin === "string" ? normalizeOrigin(body.origin) : null;
    if (typeof body.tenantId !== "string" || !UUID.test(body.tenantId) || !origin) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid tenantId and HTTP(S) origin required.", requestId } }, 400);
    result = await client.rpc("future_atlas_register_domain", { p_tenant_id: body.tenantId, p_origin: origin });
  } else if (body.action === "removeDomain") {
    if (typeof body.domainId !== "string" || !UUID.test(body.domainId)) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid domainId required.", requestId } }, 400);
    result = await client.rpc("future_atlas_remove_domain", { p_domain_id: body.domainId });
  } else if (body.action === "setTenantStatus") {
    if (typeof body.tenantId !== "string" || !UUID.test(body.tenantId) || (body.status !== "active" && body.status !== "suspended")) return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Valid tenantId and status required.", requestId } }, 400);
    result = await client.rpc("future_atlas_set_tenant_status", { p_tenant_id: body.tenantId, p_status: body.status });
  } else if (body.action === "verifyDomain") {
    const origin = typeof body.origin === "string" ? normalizeOrigin(body.origin) : null;
    if (typeof body.domainId !== "string" || !UUID.test(body.domainId) || !origin || !validText(body.verificationToken, 150)) {
      return reply(requestId, { error: { code: "INVALID_REQUEST", message: "Domain verification details required.", requestId } }, 400);
    }
    const authorization = await client.rpc("future_atlas_can_verify_domain", { p_domain_id: body.domainId, p_origin: origin, p_token: body.verificationToken });
    if (authorization.error || authorization.data !== true) return reply(requestId, { error: { code: "DOMAIN_FORBIDDEN", message: "This domain does not belong to your tenant.", requestId } }, 403);
    let hostname: string;
    try { hostname = new URL(origin).hostname; } catch { return reply(requestId, { error: { code: "INVALID_ORIGIN", message: "Valid origin required.", requestId } }, 400); }
    const dns = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent("_future-atlas." + hostname) + "&type=TXT", {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
    }).then((response) => response.json()).catch(() => null) as { Answer?: Array<{ data?: string }> } | null;
    const verified = dns?.Answer?.some((answer) => answer.data?.replace(/^"|"$/g, "") === body.verificationToken);
    if (!verified) return reply(requestId, { error: { code: "DOMAIN_NOT_VERIFIED", message: "Required TXT record was not found.", requestId } }, 409);
    try {
      result = await createAdminSupabase().rpc("future_atlas_mark_domain_verified", { p_domain_id: body.domainId, p_origin: origin, p_token: body.verificationToken });
    } catch {
      return reply(requestId, { error: { code: "SERVER_CONFIGURATION_ERROR", message: "Domain verification is not configured.", requestId } }, 503);
    }
  } else {
    return reply(requestId, { error: { code: "INVALID_ACTION", message: "Unknown tenant action.", requestId } }, 400);
  }

  if (result.error) {
    const code = /^FA_[A-Z_]+$/.test(result.error.message) ? result.error.message : "TENANT_ACTION_FAILED";
    return reply(requestId, { error: { code, message: "Tenant action failed.", requestId } }, code === "FA_TENANT_FORBIDDEN" ? 403 : 400);
  }
  return reply(requestId, { data: result.data, requestId }, body.action === "create" ? 201 : 200);
});
