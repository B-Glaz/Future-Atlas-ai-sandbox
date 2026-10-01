import fs from "fs";
import { pathToFileURL } from "url";

const text = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].trim();
}

const secret = env.SUPABASE_SECRET_KEY;
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const sql = fs.readFileSync("supabase/migrations/20260926_future_atlas_platform.sql", "utf8");
if (!secret || !projectUrl) {
  console.log(JSON.stringify({ ok: false, reason: "missing supabase env" }));
  process.exit(1);
}

const health = await fetch(`${projectUrl}/auth/v1/health`, { headers: { apikey: secret } });
const rest = await fetch(`${projectUrl}/rest/v1/future_atlas_profiles?select=user_id&limit=1`, {
  headers: { apikey: secret, Accept: "application/json" },
});
const restBody = await rest.text();
console.log(JSON.stringify({
  authHealth: health.status,
  profiles: rest.status,
  profilesBody: restBody.slice(0, 180),
}));
if (rest.ok) {
  console.log(JSON.stringify({ applied: true, reason: "profiles table already exists" }));
  process.exit(0);
}

const connectionString = env.SUPABASE_DB_URL || env.NEXT_PUBLIC_SUPABASE_DIRECT_CONNECTION_STRING;
if (!connectionString) {
  console.log(JSON.stringify({ applied: false, reason: "session pooler URI is required to create tables" }));
  process.exit(1);
}

const pgPath = pathToFileURL(`${process.env.TEMP}/pg-drop/node_modules/pg/lib/index.js`).href;
const pg = (await import(pgPath)).default;
const dbUrl = new URL(connectionString);
const client = new pg.Client({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 5432),
  database: dbUrl.pathname.replace(/^\//, ""),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();
await client.query(sql);
const tables = await client.query(
  "select tablename from pg_tables where schemaname = 'public' and tablename like 'future_atlas%' order by tablename",
);
await client.query("notify pgrst, 'reload schema'");
await client.end();
let profiles = 0;
for (let attempt = 0; attempt < 5; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const check = await fetch(`${projectUrl}/rest/v1/future_atlas_profiles?select=user_id&limit=1`, {
    headers: { apikey: secret, Accept: "application/json" },
  });
  profiles = check.status;
  if (check.ok) break;
}
console.log(JSON.stringify({ applied: true, tables: tables.rows.map((row) => row.tablename), profiles }));
