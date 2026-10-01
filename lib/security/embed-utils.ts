export function normalizeOrigin(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  try {
    const parsedUrl = new URL(trimmedValue);

    const localHttp = parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !localHttp) {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

export function getAllowedEmbedOrigins() {
  return (process.env.EMBED_ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));
}

export function getRefererOrigin(referer: string | null) {
  if (!referer) return undefined;
  return normalizeOrigin(referer) || undefined;
}

export function getClientIp(headers: Headers) {
  return headers.get("cf-connecting-ip") || undefined;
}
