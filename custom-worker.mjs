import openNextWorker from "./.open-next/worker.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function requestOrigin(request) {
  return normalizeOrigin(request.headers.get("Origin") || "") ||
    normalizeOrigin(request.headers.get("Referer") || "");
}

async function canEmbed(request, env, clientId, origin) {
  if (!origin) return false;

  if (!clientId) {
    return (env.EMBED_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => normalizeOrigin(value.trim()))
      .includes(origin);
  }

  if (!UUID.test(clientId) || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/future_atlas_authorize_embed`,
      {
        method: "POST",
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_public_id: clientId, p_origin: origin }),
      },
    );
    if (!response.ok) return false;
    const result = await response.json();
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error(JSON.stringify({ event: "embed_authorization_failed", message: String(error) }));
    return false;
  }
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await openNextWorker.fetch(request, env, ctx);

    if (url.pathname !== "/embed" && url.pathname !== "/embed/") return response;

    const origin = requestOrigin(request);
    const allowed = await canEmbed(request, env, url.searchParams.get("client"), origin);
    const secured = new Response(response.body, response);
    secured.headers.set("Content-Security-Policy", `frame-ancestors ${allowed ? origin : "'none'"};`);
    secured.headers.set("Cache-Control", "private, no-store");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return secured;
  },
};

export default worker;
