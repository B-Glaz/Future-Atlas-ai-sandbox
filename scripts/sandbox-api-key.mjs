import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const PREFIX = "FA_AiT_";
const MAX_KEYS = 10;

function loadEnv() {
  const text = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index < 1 || line.startsWith("#")) continue;
    const name = line.slice(0, index);
    if (!process.env[name]) process.env[name] = line.slice(index + 1);
  }
}

function usage() {
  console.log("Usage:");
  console.log("  npm run sandbox:api-key -- create <name> <origin> [origin...]");
  console.log("  npm run sandbox:api-key -- list");
  console.log("  npm run sandbox:api-key -- revoke <id>");
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase configuration is missing.");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", secret);
        if (secret.startsWith("sb_") && headers.get("authorization") === `Bearer ${secret}`) headers.delete("authorization");
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function cleanName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 80) throw new Error("Name the API key using 1 to 80 characters.");
  return name;
}

function cleanOrigins(values) {
  if (!values.length) throw new Error("Add at least one authorized website origin.");
  return [...new Set(values.map((entry) => {
    const url = new URL(entry.trim());
    if (url.pathname !== "/" || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) {
      throw new Error("Use origins such as https://example.com without a path.");
    }
    if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("Public website origins must use HTTPS.");
    }
    return url.origin.toLowerCase();
  }))].slice(0, 20);
}

loadEnv();
const [command, ...args] = process.argv.slice(2);
const db = admin();

if (command === "create") {
  const [rawName, ...rawOrigins] = args;
  const name = cleanName(rawName);
  const allowedOrigins = cleanOrigins(rawOrigins);
  const counted = await db.from("future_atlas_api_keys").select("id", { count: "exact", head: true }).eq("user_id", OWNER_ID).is("revoked_at", null);
  if (counted.error) throw counted.error;
  if ((counted.count || 0) >= MAX_KEYS) throw new Error("Revoke an API key before creating another. The limit is 10 active keys.");
  const apiKey = `${PREFIX}${randomBytes(32).toString("hex")}`;
  const inserted = await db.from("future_atlas_api_keys").insert({
    user_id: OWNER_ID,
    name,
    key_hash: createHash("sha256").update(apiKey).digest("hex"),
    key_prefix: apiKey.slice(0, PREFIX.length + 4),
    permissions: ["ai:generate"],
    allowed_origins: allowedOrigins,
  }).select("id,name,key_prefix,allowed_origins").single();
  if (inserted.error) throw inserted.error;
  console.log(JSON.stringify({ ...inserted.data, api_key: apiKey }, null, 2));
  console.log("Copy api_key now. It is not shown again.");
} else if (command === "list") {
  const listed = await db.from("future_atlas_api_keys").select("id,name,key_prefix,allowed_origins,created_at,last_used_at,expires_at,revoked_at").eq("user_id", OWNER_ID).order("created_at", { ascending: false });
  if (listed.error) throw listed.error;
  console.log(JSON.stringify((listed.data || []).map((row) => ({
    ...row,
    status: row.revoked_at ? "revoked" : row.expires_at && new Date(row.expires_at).getTime() <= Date.now() ? "expired" : "active",
  })), null, 2));
} else if (command === "revoke") {
  const id = args[0] || "";
  const revoked = await db.from("future_atlas_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", OWNER_ID).is("revoked_at", null).select("id").maybeSingle();
  if (revoked.error) throw revoked.error;
  if (!revoked.data) {
    console.error("API key not found.");
    process.exit(1);
  }
  console.log("Revoked.");
} else {
  usage();
  process.exit(command ? 1 : 0);
}
