import { OpenRouter } from "@openrouter/sdk";

const PRIMARY_MODEL = "inclusionai/ling-3.0-flash-sante:free";
const WATERFALL = [
  PRIMARY_MODEL,
  "qwen/qwen3.8-27b:free",
];

const FIRST_TOKEN_MS = 12_000;
const OVERALL_MS = 45_000;

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderRequest = {
  messages: AIMessage[];
  structured: boolean;
  maxTokens: number;
  validate: (content: string) => boolean;
  onAttemptStart?: () => void;
  onChunk?: (text: string) => void;
};

function timeoutError() {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

function chunkText(chunk: unknown) {
  if (!chunk || typeof chunk !== "object") return "";
  const choice = (chunk as { choices?: Array<{ delta?: { content?: string | null } }> }).choices?.[0];
  return choice?.delta?.content || "";
}

function models() {
  const preferred = process.env.OPENROUTER_MODEL?.trim() || PRIMARY_MODEL;
  return [preferred, ...WATERFALL.filter((model) => model !== preferred)];
}

async function runModel(model: string, request: ProviderRequest, apiKey: string) {
  const controller = new AbortController();
  const started = Date.now();
  let sawToken = false;
  const firstToken = setTimeout(() => {
    if (!sawToken) controller.abort(timeoutError());
  }, FIRST_TOKEN_MS);
  const overall = setTimeout(() => controller.abort(timeoutError()), OVERALL_MS);
  const client = new OpenRouter({ apiKey, retryConfig: { strategy: "none" } });

  try {
    const stream = await client.chat.send({
      httpReferer: "https://futureatlas.ai",
      appTitle: "Future Atlas",
      chatRequest: {
        model,
        messages: request.messages,
        stream: true,
        temperature: request.structured ? 0.2 : 0.4,
        topP: 0.9,
        maxTokens: request.maxTokens,
        reasoning: { effort: "none" },
        provider: { sort: "latency", allowFallbacks: true },
      },
    }, { signal: controller.signal, timeoutMs: OVERALL_MS });

    let content = "";
    for await (const chunk of stream as AsyncIterable<unknown>) {
      const text = chunkText(chunk);
      if (!text) continue;
      if (!sawToken) {
        sawToken = true;
        clearTimeout(firstToken);
      }
      content += text;
      request.onChunk?.(text);
    }
    content = content.trim();
    if (!content || !request.validate(content)) throw new Error(`${model} returned an invalid response.`);
    return { content, provider: model };
  } finally {
    clearTimeout(firstToken);
    clearTimeout(overall);
    console.log(`[AI] ${model} finished in ${Date.now() - started}ms`);
  }
}

export async function requestAI(request: ProviderRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("No AI provider is configured.");
  let lastError: unknown;
  for (const model of models()) {
    request.onAttemptStart?.();
    try {
      return await runModel(model, request, apiKey);
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({
        event: "ai_model_failed",
        model,
        message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
      }));
    }
  }
  throw lastError || new Error("No AI provider completed the request.");
}
