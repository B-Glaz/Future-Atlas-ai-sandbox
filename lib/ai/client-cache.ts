"use client";

import { getCacheKey } from "./cache-utils";

const CLIENT_CACHE_TTL_MS = 1000 * 60 * 10;

type CachedResponse<T> = {
  data: T;
  expiresAt: number;
};

const responseCache = new Map<string, CachedResponse<unknown>>();

export function getAIClientCacheKey(payload: unknown) {
  return getCacheKey(payload, "future-atlas-ai-response:");
}

export function readAIClientCache<T>(cacheKey: string) {
  const cached = responseCache.get(cacheKey) as CachedResponse<T> | undefined;

  if (!cached || cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

export function writeAIClientCache<T>(cacheKey: string, data: T) {
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
  });
}

export function clearAIClientCache() {
  responseCache.clear();
}