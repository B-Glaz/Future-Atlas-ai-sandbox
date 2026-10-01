import { spawnSync } from "node:child_process";
import fs from "node:fs";

const allowed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_FORUM_URL",
  "OPENROUTER_MODEL",
  "AI_ENABLED",
  "SUPABASE_JWKS_URL",
  "EMBED_ALLOWED_ORIGINS",
]);

const raw = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/,\s*([}\]])/g, "$1");
const { vars = {} } = JSON.parse(stripped);
for (const [key, value] of Object.entries(vars)) {
  if (!allowed.has(key) || process.env[key] || typeof value !== "string") continue;
  process.env[key] = value;
}

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
