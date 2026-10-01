import type { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/email-address";
import { cookieBase } from "@/lib/platform/cookies";

export const EMAIL_LOGIN_COOKIE = "fa_email_login";
const MAX_AGE = 60 * 60 * 24 * 30;

function signingSecret() {
  const value = process.env.API_TOKEN_SIGNING_SECRET || "";
  return value.length >= 32 ? value : "";
}

function encode(bytes: ArrayBuffer) {
  let text = "";
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encodeText(value: string) {
  const bytes = new TextEncoder().encode(value);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeText(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function mac(payload: string) {
  const secret = signingSecret();
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export async function emailLoginToken(email: string) {
  const body = `${Math.floor(Date.now() / 1000) + MAX_AGE}.${encodeText(email)}`;
  const signature = await mac(body);
  return signature ? `${body}.${signature}` : "";
}

export async function readEmailLogin(request: NextRequest) {
  const token = request.cookies.get(EMAIL_LOGIN_COOKIE)?.value || "";
  const signatureStart = token.lastIndexOf(".");
  if (signatureStart < 1) return "";
  const body = token.slice(0, signatureStart);
  const signature = token.slice(signatureStart + 1);
  const split = body.indexOf(".");
  if (split < 1) return "";
  const expires = Number(body.slice(0, split));
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return "";
  const expected = await mac(body);
  if (!expected || expected.length !== signature.length) return "";
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (difference !== 0) return "";
  try {
    return normalizeEmail(decodeText(body.slice(split + 1)));
  } catch {
    return "";
  }
}

export function writeEmailLogin(response: NextResponse, token: string) {
  response.cookies.set(EMAIL_LOGIN_COOKIE, token, { ...cookieBase(), httpOnly: true, maxAge: MAX_AGE });
}

export function clearEmailLogin(response: NextResponse) {
  response.cookies.set(EMAIL_LOGIN_COOKIE, "", { ...cookieBase(), httpOnly: true, maxAge: 0 });
}
