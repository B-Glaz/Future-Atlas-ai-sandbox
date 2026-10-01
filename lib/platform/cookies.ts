import type { NextRequest, NextResponse } from "next/server";

export const VISITOR_COOKIE = "fa_visitor";
export const CONSENT_COOKIE = "fa_consent";
export const CONSENT_VALUES = ["necessary", "additional"] as const;
export type ConsentValue = (typeof CONSENT_VALUES)[number];

const YEAR = 60 * 60 * 24 * 365;

export function cookieBase(secure = process.env.NODE_ENV === "production") {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: YEAR,
  };
}

export function readConsent(request: NextRequest): ConsentValue | null {
  const value = request.cookies.get(CONSENT_COOKIE)?.value;
  return value === "necessary" || value === "additional" ? value : null;
}

export function readVisitor(request: NextRequest) {
  const value = request.cookies.get(VISITOR_COOKIE)?.value || "";
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

export function requestVisitor(request: NextRequest) {
  const fromCookie = readVisitor(request);
  if (fromCookie) return fromCookie;
  const fromProxy = request.headers.get("x-fa-visitor") || "";
  return /^[0-9a-f-]{36}$/i.test(fromProxy) ? fromProxy : "";
}

export function ensureVisitor(request: NextRequest, response: NextResponse) {
  const existing = readVisitor(request);
  if (existing) return existing;
  const visitorId = crypto.randomUUID();
  response.cookies.set(VISITOR_COOKIE, visitorId, { ...cookieBase(), httpOnly: true });
  return visitorId;
}

export function writeConsent(response: NextResponse, consent: ConsentValue, secure = process.env.NODE_ENV === "production") {
  response.cookies.set(CONSENT_COOKIE, consent, { ...cookieBase(secure), httpOnly: false });
}
