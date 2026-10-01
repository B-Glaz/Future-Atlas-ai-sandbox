import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { cookieBase, readVisitor, VISITOR_COOKIE } from "@/lib/platform/cookies";
import { applySecurityHeaders } from "@/lib/security/headers";

export function proxy(request: NextRequest) {
  const existing = readVisitor(request);
  const visitorId = existing || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-fa-visitor", visitorId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!existing) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      ...cookieBase(request.nextUrl.protocol === "https:"),
      httpOnly: true,
    });
  }
  applySecurityHeaders(response, request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
