import { supabase } from "@/lib/supabase";
import { parseSseBuffer } from "./sse";

class AIRequestError extends Error {
  retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "AIRequestError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type AIRequestOptions = {
  timeoutMs?: number;
  onDelta?: (text: string) => void;
  onReset?: () => void;
};

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function emitCredits(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const creditsRemaining = (payload as { creditsRemaining?: unknown }).creditsRemaining;
  if (Number.isFinite(creditsRemaining)) {
    window.dispatchEvent(new CustomEvent("future-atlas:credits", { detail: Math.floor(Number(creditsRemaining)) }));
  }
}

async function readSsePayload<T>(
  response: Response,
  { onDelta, onReset }: Pick<AIRequestOptions, "onDelta" | "onReset">
): Promise<T> {
  if (!response.body) {
    throw new AIRequestError("The AI service returned an empty response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: T | undefined;
  let streamError: AIRequestError | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      if (item.event === "delta" && item.data && typeof item.data === "object" && "text" in item.data) {
        const text = String((item.data as { text?: unknown }).text || "");
        if (text) onDelta?.(text);
      } else if (item.event === "reset") {
        onReset?.();
      } else if (item.event === "done") {
        donePayload = item.data as T;
      } else if (item.event === "error") {
        const payload = item.data && typeof item.data === "object" ? item.data as { message?: unknown; retryAfter?: unknown } : {};
        streamError = new AIRequestError(
          String(payload.message || "The AI service could not complete this request."),
          Number(payload.retryAfter) || undefined
        );
      }
    }
  }

  if (streamError) throw streamError;
  if (!donePayload || typeof donePayload !== "object") {
    throw new AIRequestError("The AI service returned an empty response.");
  }

  emitCredits(donePayload);
  return donePayload;
}

export async function requestAI<T>(
  body: Record<string, unknown>,
  { timeoutMs = 125_000, onDelta, onReset }: AIRequestOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Idempotency-Key": crypto.randomUUID(),
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return await readSsePayload<T>(response, { onDelta, onReset });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      emitCredits(payload);
      throw new AIRequestError(
        errorMessage(payload, "The AI service could not complete this request."),
        Number(response.headers.get("Retry-After")) || undefined
      );
    }

    if (!payload || typeof payload !== "object") {
      throw new AIRequestError("The AI service returned an empty response.");
    }

    emitCredits(payload);
    if (typeof payload.response === "string" && payload.response) onDelta?.(payload.response);
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIRequestError(
        "The AI service took too long to respond. Please try again."
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
