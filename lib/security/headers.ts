import type { NextResponse } from "next/server";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function applySecurityHeaders(response: NextResponse, pathname: string) {
  const headers = response.headers;
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), identity-credentials-get=(self \"https://accounts.google.com\")");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("Content-Security-Policy", CSP);
  if (pathname !== "/embed") headers.set("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
