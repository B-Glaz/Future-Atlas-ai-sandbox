import { NextResponse, type NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

function clientKey(request: NextRequest) {
  return request.headers.get("cf-connecting-ip") || "local";
}

export function rateLimit(request: NextRequest, name: string, limit: number, windowMs: number, subject?: string) {
  const key = `${name}:${subject || clientKey(request)}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size > MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true, retryAfter: 0 };
}

export function rateLimited(request: NextRequest, name: string, limit: number, windowMs: number, subject?: string) {
  const result = rateLimit(request, name, limit, windowMs, subject);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" } },
  );
}
