import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createAccessTokenSupabase, createAdminSupabase, createRequestSupabase } from "@/lib/supabase";
import { confirmApiToken } from "@/lib/platform/api-keys/tokens";
import { inspectSignedToken, isMissingSchemaError, isSignedApiToken } from "@/lib/auth/signed-tokens";

export type RequestAuth = {
  user: Pick<User, "id"> & { email?: string };
  token: string;
  kind: "session" | "access_token";
  client: SupabaseClient;
};

export function bearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

export function isTenantApiKey(token: string) {
  return token.startsWith("fa_test_") || token.startsWith("fa_live_");
}

export function isUserAccessToken(token: string) {
  return token.startsWith("fa_atk_");
}

export async function resolveRequestAuth(request: NextRequest): Promise<RequestAuth | null> {
  const token = bearerToken(request);
  if (!token || isTenantApiKey(token) || token.startsWith("fa_rtk_")) return null;

  if (isUserAccessToken(token)) {
    if (isSignedApiToken(token)) {
      const inspected = inspectSignedToken(token);
      if (inspected.valid && inspected.user_id && await confirmApiToken(token)) {
        return { user: { id: inspected.user_id }, token, kind: "access_token", client: createAccessTokenSupabase(token) };
      }
      return null;
    }
    try {
      const admin = createAdminSupabase();
      const { data, error } = await admin.rpc("future_atlas_resolve_access_token", { p_token: token });
      if (isMissingSchemaError(error)) return null;
      const userId = typeof data === "string" ? data : "";
      if (error || !userId) return null;
      return { user: { id: userId }, token, kind: "access_token", client: createAccessTokenSupabase(token) };
    } catch {
      return null;
    }
  }

  const client = createRequestSupabase(token);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  return { user, token, kind: "session", client };
}
