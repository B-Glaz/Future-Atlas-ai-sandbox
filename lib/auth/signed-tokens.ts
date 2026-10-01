import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SEC = 60 * 60;
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;
const revokedJtis = new Set<string>();
const userEpoch = new Map<string, number>();
const currentAccessJti = new Map<string, string>();
let databaseTokenRpcsAvailable = true;

export function canUseDatabaseTokenRpcs() {
  return databaseTokenRpcsAvailable;
}

export function markDatabaseTokenRpcsUnavailable() {
  databaseTokenRpcsAvailable = false;
}

export function isMissingSchemaError(error?: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = error.code || "";
  const message = error.message || "";
  const missing = code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01" ||
    /could not find the (table|function)|does not exist/i.test(message);
  if (missing) markDatabaseTokenRpcsUnavailable();
  return missing;
}

function signingSecret() {
  const secret = process.env.API_TOKEN_SIGNING_SECRET || "";
  if (secret.length < 32) throw new Error("API_TOKEN_SIGNING_SECRET is not configured.");
  return secret;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, unknown>) {
  const unsigned = `${toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${toBase64Url(JSON.stringify(payload))}`;
  return `${unsigned}.${createHmac("sha256", signingSecret()).update(unsigned).digest("base64url")}`;
}

function readJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const actual = Buffer.from(parts[2]);
  const expected = Buffer.from(createHmac("sha256", signingSecret()).update(unsigned).digest("base64url"));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function prefixOf(type: "access" | "refresh") {
  return type === "access" ? "fa_atk_" : "fa_rtk_";
}

export function isSignedApiToken(token: string) {
  return (token.startsWith("fa_atk_") || token.startsWith("fa_rtk_")) && token.slice(7).includes(".");
}

export function inspectSignedToken(token: string) {
  const type = token.startsWith("fa_atk_") ? "access" as const : token.startsWith("fa_rtk_") ? "refresh" as const : null;
  if (!type) return { valid: false, token_type: null as string | null, expires_at: null as string | null, user_id: null as string | null, jti: null as string | null, version: 0 };
  const payload = readJwt(token.slice(prefixOf(type).length));
  const expiresAt = typeof payload?.exp === "number" ? new Date(payload.exp * 1000).toISOString() : null;
  const sub = typeof payload?.sub === "string" ? payload.sub : "";
  const jti = typeof payload?.jti === "string" ? payload.jti : "";
  const ver = typeof payload?.ver === "number" ? payload.ver : 0;
  const valid = Boolean(
    payload &&
    payload.typ === type &&
    sub &&
    typeof payload.exp === "number" &&
    payload.exp * 1000 > Date.now() &&
    !revokedJtis.has(jti) &&
    (userEpoch.get(sub) === undefined || ver === userEpoch.get(sub)) &&
    (type !== "access" || !currentAccessJti.has(sub) || currentAccessJti.get(sub) === jti)
  );
  return { valid, token_type: type, expires_at: expiresAt, user_id: valid ? sub : null, jti: jti || null, version: ver };
}

export function issueSignedTokens(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const ver = Date.now();
  userEpoch.set(userId, ver);
  const accessJti = crypto.randomUUID();
  currentAccessJti.set(userId, accessJti);
  return {
    access_token: `fa_atk_${signJwt({ sub: userId, typ: "access", iat: now, exp: now + ACCESS_TTL_SEC, jti: accessJti, ver })}`,
    refresh_token: `fa_rtk_${signJwt({ sub: userId, typ: "refresh", iat: now, exp: now + REFRESH_TTL_SEC, jti: crypto.randomUUID(), ver })}`,
    access_expires_at: new Date((now + ACCESS_TTL_SEC) * 1000).toISOString(),
    refresh_expires_at: new Date((now + REFRESH_TTL_SEC) * 1000).toISOString(),
  };
}

export function refreshSignedAccessToken(refreshToken: string) {
  const inspected = inspectSignedToken(refreshToken);
  if (!inspected.valid || inspected.token_type !== "refresh" || !inspected.user_id) return null;
  const now = Math.floor(Date.now() / 1000);
  const ver = userEpoch.get(inspected.user_id) ?? Date.now();
  if (!userEpoch.has(inspected.user_id)) userEpoch.set(inspected.user_id, ver);
  const accessJti = crypto.randomUUID();
  currentAccessJti.set(inspected.user_id, accessJti);
  return {
    access_token: `fa_atk_${signJwt({ sub: inspected.user_id, typ: "access", iat: now, exp: now + ACCESS_TTL_SEC, jti: accessJti, ver })}`,
    access_expires_at: new Date((now + ACCESS_TTL_SEC) * 1000).toISOString(),
  };
}

export function revokeSignedTokens(options: { accessToken?: string; refreshToken?: string; all?: boolean; userId?: string }) {
  if (options.all && options.userId) {
    userEpoch.set(options.userId, Date.now());
    return true;
  }
  let revoked = false;
  for (const token of [options.accessToken, options.refreshToken]) {
    if (!token) continue;
    const inspected = inspectSignedToken(token);
    const payload = token.startsWith("fa_atk_") || token.startsWith("fa_rtk_")
      ? readJwt(token.slice(7))
      : null;
    const jti = typeof payload?.jti === "string" ? payload.jti : "";
    if (jti) {
      revokedJtis.add(jti);
      revoked = true;
    }
    if (inspected.token_type === "refresh" && inspected.user_id) {
      userEpoch.set(inspected.user_id, Date.now());
      revoked = true;
    }
  }
  return revoked;
}
