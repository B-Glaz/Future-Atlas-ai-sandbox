import { headers } from "next/headers";

import EmbedApp from "@/components/embed/EmbedApp";
import AccessRestricted from "@/components/embed/AccessRestricted";
import { evaluateEmbedAccess } from "@/lib/security/embed-access";
import { logUnauthorizedEmbedAccess } from "@/lib/security/unauthorized-access";
import { createPublicSupabase } from "@/lib/supabase";
import { getRefererOrigin, normalizeOrigin } from "@/lib/security/embed-utils";

export const dynamic = "force-dynamic";

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const requestHeaders = new Headers(await headers());
  const { client } = await searchParams;
  let decision = evaluateEmbedAccess(requestHeaders);

  if (client) {
    const origin = normalizeOrigin(requestHeaders.get("origin") || "") || getRefererOrigin(requestHeaders.get("referer"));
    const validClientId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(client);
    const { data } = validClientId && origin
      ? await createPublicSupabase().rpc("future_atlas_authorize_embed", { p_public_id: client, p_origin: origin })
      : { data: null };
    decision = {
      allowed: Array.isArray(data) && data.length > 0,
      reason: "Tenant or embedding domain is not authorized.",
      detectedOrigin: origin || undefined,
      allowedOrigins: [],
    };
  }

  if (!decision.allowed) {
    await logUnauthorizedEmbedAccess(
      requestHeaders,
      "/embed",
      decision.reason || "Embed access denied."
    );

    return <AccessRestricted />;
  }

  return <EmbedApp />;
}
