import { randomBytes } from "node:crypto";

import { hashKey } from "@/lib/platform/credits/daily";

export const API_KEY_PREFIX = "FA_AiT_";
const SECRET_BYTES = 32;
const DISPLAY_HEX = 4;

export function isFaApiKey(value: string) {
  return /^FA_AiT_[0-9a-f]{64}$/.test(value);
}

export function generateApiKey() {
  const apiKey = `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString("hex")}`;
  return {
    apiKey,
    keyPrefix: apiKey.slice(0, API_KEY_PREFIX.length + DISPLAY_HEX),
    keyHash: hashKey(apiKey),
  };
}

export function displayPrefix(token: string) {
  if (token.startsWith(API_KEY_PREFIX)) return token.slice(0, API_KEY_PREFIX.length + DISPLAY_HEX);
  return token.slice(0, 12);
}
