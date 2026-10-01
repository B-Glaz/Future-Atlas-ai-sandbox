export type EmbedAccessDecision = {
  allowed: boolean;
  reason?: string;
  matchedOrigin?: string;
  detectedOrigin?: string;
  refererOrigin?: string;
  allowedOrigins: string[];
};

export type SecurityEventMetadata = {
  timestamp: string;
  path: string;
  detectedOrigin?: string;
  referer?: string;
  refererOrigin?: string;
  userAgent?: string;
  ip?: string;
  reason: string;
  clientId?: string;
};

import {
  normalizeOrigin,
  getAllowedEmbedOrigins,
  getRefererOrigin,
  getClientIp,
} from "./embed-utils";

export function evaluateEmbedAccess(headers: Headers): EmbedAccessDecision {
  const allowedOrigins = getAllowedEmbedOrigins();
  const detectedOrigin = normalizeOrigin(headers.get("origin") || "");
  const refererOrigin = getRefererOrigin(headers.get("referer"));

  if (!allowedOrigins.length) {
    return {
      allowed: false,
      reason: "No authorized iframe origins are configured.",
      detectedOrigin: detectedOrigin || undefined,
      refererOrigin,
      allowedOrigins,
    };
  }

  const matchedOrigin = [detectedOrigin, refererOrigin].find(
    (origin): origin is string =>
      Boolean(origin && allowedOrigins.includes(origin))
  );

  if (matchedOrigin) {
    return {
      allowed: true,
      detectedOrigin: detectedOrigin || undefined,
      refererOrigin,
      matchedOrigin,
      allowedOrigins,
    };
  }

  return {
    allowed: false,
    reason:
      detectedOrigin || refererOrigin
        ? "Detected origin is not in EMBED_ALLOWED_ORIGINS."
        : "No origin or referer signal was available for embed authorization.",
    detectedOrigin: detectedOrigin || undefined,
    refererOrigin,
    allowedOrigins,
  };
}

export function getSecurityEventMetadata(
  headers: Headers,
  path: string,
  reason: string
): SecurityEventMetadata {
  return {
    timestamp: new Date().toISOString(),
    path,
    detectedOrigin: normalizeOrigin(headers.get("origin") || "") || undefined,
    referer: headers.get("referer") || undefined,
    refererOrigin: getRefererOrigin(headers.get("referer")),
    userAgent: headers.get("user-agent") || undefined,
    ip: getClientIp(headers),
    reason,
  };
}