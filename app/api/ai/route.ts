import { NextRequest, NextResponse } from "next/server";
import { personalities } from "@/lib/ai/personalities";
import { consumeCredit, completeCreditRequest, CreditError } from "@/lib/ai/credits";
import { requestAI } from "@/lib/ai/providers";
import type { AIMode } from "@/lib/ai/types";
import { getCacheKey } from "@/lib/ai/cache-utils";
import { encodeSseEvent } from "@/lib/ai/sse";
import { isStructuredOutput, normalizeStructuredOutput } from "@/lib/ai/structured-output";
import { rateLimited } from "@/lib/security/rate-limit";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

// ============================================================
// CONFIG
// ============================================================

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_CACHE_ENTRIES = 250;

// Keep history small for latency.
// Structured tool requests generally do not need the whole
// conversation history.
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 8000;

// Fast-response token limits.
// These are deliberately much smaller than your previous 1200.
const STRUCTURED_MAX_TOKENS = 700;
const NORMAL_MAX_TOKENS = 900;

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  const message = error.message.replace(/sk-[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|Bearer\s+\S+/gi, "[redacted]").slice(0, 180);
  return { name: error.name, status, message };
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return name === "timeouterror" || name === "aborterror" || name === "apiuseraborterror" || name === "apiconnectiontimeouterror" || message.includes("timeout") || message.includes("aborted");
}

function streamFailure(error: unknown) {
  if (isTimeoutError(error)) {
    return { code: "AI_PROVIDER_TIMEOUT", message: "The AI service took too long to respond. Please try again.", retryable: true };
  }
  if (error instanceof Error && /invalid response|cut off/i.test(error.message)) {
    return { code: "AI_INVALID_RESPONSE", message: "The live AI returned an invalid response.", retryable: true };
  }
  return { code: "AI_PROVIDER_UNAVAILABLE", message: "The live AI service could not complete this request.", retryable: true };
}

function wantsStream(request: NextRequest, body: Record<string, unknown>) {
  return body.stream === true || (request.headers.get("accept") || "").includes("text/event-stream");
}

function sseResponse(
  requestId: string,
  run: (send: (event: string, data: unknown) => Promise<void>) => Promise<void>
) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let writes = Promise.resolve();

  const send = (event: string, data: unknown) => {
    writes = writes.then(() => writer.write(encoder.encode(encodeSseEvent(event, data))));
    return writes;
  };

  void (async () => {
    try {
      await run(send);
    } catch (error) {
      await send("error", {
        code: isTimeoutError(error) ? "AI_PROVIDER_TIMEOUT" : "AI_INTERNAL_ERROR",
        message: isTimeoutError(error)
          ? "The AI service took too long to respond. Please try again."
          : "Something went wrong while connecting to Future Atlas AI.",
        retryable: true,
      }).catch(() => undefined);
    } finally {
      await writes.catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Request-ID": requestId,
    },
  });
}

function aiResultResponse(
  streamRequested: boolean,
  requestId: string,
  payload: Record<string, unknown>,
  extra?: { delta?: string }
) {
  if (!streamRequested) {
    return NextResponse.json(payload, { headers: { "X-Request-ID": requestId } });
  }

  return sseResponse(requestId, async (send) => {
    await send("meta", {
      mode: payload.mode,
      personality: payload.personality,
      cached: payload.cached === true,
      requestId,
    });
    if (extra?.delta) await send("delta", { text: extra.delta });
    await send("done", payload);
  });
}

// ============================================================
// CONSTANTS
// ============================================================

const STUDY_ABROAD_REDIRECT =
  "I’m here to help with study-abroad-related questions only. Please ask me anything about studying abroad, universities, courses, applications, scholarships, visas, or other study-abroad-related topics.";

type CachedAIResponse = {
  response: string;
  expiresAt: number;
};

type GlobalAIState = {
  aiResponseCache?: Map<string, CachedAIResponse>;
  pendingAIResponses?: Map<string, Promise<string>>;
};

const globalAIState = globalThis as typeof globalThis & GlobalAIState;

const responseCache =
  globalAIState.aiResponseCache ??
  new Map<string, CachedAIResponse>();

const pendingResponses =
  globalAIState.pendingAIResponses ??
  new Map<string, Promise<string>>();

globalAIState.aiResponseCache = responseCache;
globalAIState.pendingAIResponses = pendingResponses;

// ============================================================
// ROUTING INSTRUCTIONS
// ============================================================

const routingInstructions = `
Future Atlas has five study-abroad tools:

- Cost Calculator: tuition, living costs, total budgets, affordability.
- Country Explorer: destination comparison, lifestyle, visa/work context.
- Eligibility Checker: admission readiness, profile gaps, next steps.
- Scholarship Explorer: funding options, scholarship fit, coverage, deadlines.
- University Explorer: university matches, programme fit, tuition and location.

Stay focused on study-abroad guidance.

If the request clearly belongs in another tool, still answer briefly for
the current screen but naturally suggest the most appropriate Future Atlas section.

Interpret common spelling mistakes, abbreviations, and course-name variations
from context.

If a request is genuinely ambiguous, ask one brief clarification question.

Never expose implementation details.

Do not invent facts.
Do not invent exact rankings, tuition fees, deadlines, admission requirements,
scholarship amounts, or visa rules when the supplied information does not verify them.
`;

// ============================================================
// STUDY ABROAD SIGNALS
// ============================================================

const studyAbroadSignals = [
  "abroad",
  "admission",
  "application",
  "bachelor",
  "budget",
  "campus",
  "college",
  "course",
  "degree",
  "destination",
  "education",
  "eligibility",
  "english",
  "funding",
  "ielts",
  "international student",
  "master",
  "phd",
  "program",
  "programme",
  "scholarship",
  "student",
  "study",
  "tuition",
  "university",
  "visa",
];

const unrelatedSignals = [
  "celebrity",
  "crypto",
  "dating",
  "diet",
  "football",
  "football score",
  "game cheat",
  "movie",
  "politics",
  "recipe",
  "soccer",
  "stock",
  "cricket",
  "weather",
];

// ============================================================
// STRUCTURED PROMPTS
// ============================================================

const structuredPrompts: Record<AIMode, string> = {
  mentor: `
Return JSON only with this exact shape:

{
  "response": "Short study-abroad guidance."
}

Rules:
- Keep the response concise.
- Only answer study-abroad-related questions.
- Do not invent facts.
`,

  country: `
Return JSON only with this exact shape:

{
  "countries": [
    {
      "name": "Country name",
      "code": "Two-letter display code",
      "score": 92,
      "description": "One concise sentence tailored to the user.",
      "tags": ["Tag", "Tag", "Tag"]
    }
  ],
  "summary": "Short guidance sentence."
}

Rules:
- Create exactly 3 countries.
- Scores must be integers from 70 to 98.
- Give each description two useful sentences: why it fits and one tradeoff.
- Do not invent exact visa rules, tuition fees, rankings, deadlines,
  or other specific facts unless supplied or clearly known.
- If a fact is uncertain, use cautious wording.
`,

  university: `
Return JSON only with this exact shape:

{
  "universities": [
    {
      "name": "University name",
      "shortName": "Short label",
      "country": "Country",
      "location": "City, Country",
      "ranking": "Current ranking must be verified",
      "tuition": "Approximate tuition range or cost level",
      "match": 92,
      "type": "University type",
      "highlights": ["Highlight", "Highlight", "Highlight"]
    }
  ],
  "summary": "Short guidance sentence."
}

Rules:
- Create up to 3 real, accredited universities only.
- Every university must physically match the selected country if a country is supplied.
- Do not repeat the same university or online-only institution.
- Match values must be integers from 70 to 98.
- Do not invent exact admissions claims.
- Use "Verify current ranking" unless ranking data was supplied by the user.
- Use "Check official tuition page" unless tuition data was supplied by the user.
- If you cannot name a real fitting university, return fewer items rather than filling with fake data.
- Never list a university unless it is known to offer the requested subject or a direct equivalent.
- For Germany + Pharmacy, safe examples include University of Bonn, Heidelberg University, LMU Munich, and University of Hamburg; do not use TUM for Pharmacy.
`,

  scholarship: `
Return JSON only with this exact shape:

{
  "scholarships": [
    {
      "name": "Scholarship or funding category",
      "provider": "Provider",
      "country": "Country",
      "amount": "Amount or varies",
      "coverage": "What it may cover",
      "deadline": "Deadline guidance",
      "match": 92,
      "type": "Scholarship type",
      "tags": ["Tag", "Tag", "Tag"]
    }
  ],
  "summary": "Short guidance sentence."
}

Rules:
- Create exactly 3 scholarship matches.
- Match values must be integers from 70 to 98.
- Never invent exact deadlines.
- If exact deadlines are not verified, say they vary or should be checked.
- Never invent scholarship amounts.
`,

  eligibility: `
Return JSON only with this exact shape:

{
  "score": 82,
  "status": "Strong initial profile",
  "summary": "Two concise sentences explaining the assessment.",
  "breakdown": [
    {
      "title": "Academic Profile",
      "status": "positive",
      "description": "Concise personalized assessment."
    },
    {
      "title": "English Requirement",
      "status": "caution",
      "description": "Concise personalized assessment."
    },
    {
      "title": "Programme Fit",
      "status": "positive",
      "description": "Concise personalized assessment."
    }
  ],
  "nextSteps": ["Step one", "Step two", "Step three"]
}

Rules:
- Score must be an integer from 0 to 98.
- Use status values "positive" or "caution".
- Never guarantee admission.
- Never guarantee visa approval.
- Do not invent intake years, deadline dates, or application cycles.
- Keep the assessment clear, specific, and tied to every supplied input.
- Base the assessment on supplied user information.
`,

  cost: `
Return JSON only with this exact shape:

{
  "tuition": "Estimated range",
  "accommodation": "Estimated range",
  "living": "Estimated range",
  "insurance": "Estimated range",
  "visa": "Estimated range",
  "travel": "Estimated range",
  "other": "Estimated range",
  "total": "Estimated annual total range",
  "budgetStatus": {
    "label": "Comfortable budget range",
    "description": "Concise personalized explanation."
  },
  "aiAnalysis": "Concise analysis formatted as plain text."
}

Rules:
- Use approximate ranges.
- Explain assumptions when exact costs are unavailable.
- Do not invent precise costs.
- Give a useful breakdown of assumptions, affordability, and cost-saving priorities.
`,
};

// ============================================================
// JSON EXTRACTION
// ============================================================

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // Try to recover JSON if the model surrounded it with text.
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("AI response did not include valid JSON.");
    }

    const possibleJson = content.slice(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(possibleJson);
    } catch {
      throw new Error("AI response contained invalid JSON.");
    }
  }
}

// ============================================================
// TEXT HELPERS
// ============================================================

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

// ============================================================
// CACHE
// ============================================================

function readCachedResponse(cacheKey: string) {
  const cached = responseCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  // Refresh LRU position.
  responseCache.delete(cacheKey);
  responseCache.set(cacheKey, cached);

  return cached.response;
}

function writeCachedResponse(
  cacheKey: string,
  response: string
) {
  responseCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    responseCache.delete(oldestKey);
  }
}
// ============================================================
// HISTORY
// ============================================================

function prepareHistory(history: unknown[]) {
  const validHistory = history
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as { role?: string; content?: string };
      return (
        (candidate.role === "user" || candidate.role === "model") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .map((item) => {
      const candidate = item as { role: string; content: string };
      return {
        role:
          candidate.role === "model"
            ? ("assistant" as const)
            : ("user" as const),
        content: candidate.content.trim(),
      };
    });

  // Only keep recent messages.
  const recentHistory = validHistory.slice(
    -MAX_HISTORY_MESSAGES
  );

  // Prevent an unexpectedly large conversation from
  // destroying latency.
  let totalChars = 0;

  const limitedHistory = [];

  for (
    let index = recentHistory.length - 1;
    index >= 0;
    index -= 1
  ) {
    const item = recentHistory[index];

    if (
      totalChars + item.content.length >
      MAX_HISTORY_CHARS
    ) {
      break;
    }

    limitedHistory.unshift(item);
    totalChars += item.content.length;
  }

  return limitedHistory;
}

// ============================================================
// STUDY ABROAD FILTER
// ============================================================

function isClearlyUnrelatedStudyAbroadQuestion(
  mode: AIMode,
  message: string
) {
  if (mode !== "mentor") {
    return false;
  }

  const normalizedMessage = normalizeText(message);

  const hasStudySignal = studyAbroadSignals.some(
    (signal) => normalizedMessage.includes(signal)
  );

  const hasUnrelatedSignal = unrelatedSignals.some(
    (signal) => normalizedMessage.includes(signal)
  );

  return hasUnrelatedSignal && !hasStudySignal;
}

// ============================================================
// POST
// ============================================================

async function handleAIRequest(
  request: NextRequest
) {
  const requestStartedAt = Date.now();
  const routeRequestId = crypto.randomUUID();
  let requestMode: string | undefined;
  let credit: Awaited<ReturnType<typeof consumeCredit>> | undefined;

  try {
    const limited = rateLimited(request, "ai", 30, 60_000);
    if (limited) return limited;

    const rawBody = await request.text();
    if (rawBody.length > 64_000) {
      return NextResponse.json(
        { error: { code: "REQUEST_TOO_LARGE", message: "Request is too large.", retryable: false, requestId: routeRequestId } },
        { status: 413, headers: { "X-Request-ID": routeRequestId } }
      );
    }

    // --------------------------------------------------------
    // Read request
    // --------------------------------------------------------

    const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "A JSON object is required.", retryable: false, requestId: routeRequestId } },
        { status: 400, headers: { "X-Request-ID": routeRequestId } }
      );
    }

    const mode = body.mode as AIMode;
    requestMode = mode;
    const message = body.message;
    const inputs = body.inputs;
    const context = typeof body.context === "string" ? body.context.slice(0, 4_000) : "";
    const streamRequested = wantsStream(request, body as Record<string, unknown>);

    const responseFormat =
      body.responseFormat as string | undefined;

    const history = Array.isArray(body.history)
      ? body.history
      : [];

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (
      !mode ||
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 8_000
    ) {
      return NextResponse.json(
        {
          error: { code: "INVALID_REQUEST", message: "A valid message under 8,000 characters is required.", retryable: false, requestId: routeRequestId },
        },
        { status: 400, headers: { "X-Request-ID": routeRequestId } }
      );
    }

    if (responseFormat !== undefined && responseFormat !== "structured") {
      return NextResponse.json(
        { error: { code: "INVALID_RESPONSE_FORMAT", message: "responseFormat must be structured when provided.", retryable: false, requestId: routeRequestId } },
        { status: 400, headers: { "X-Request-ID": routeRequestId } }
      );
    }

    const personality = personalities[mode];

    if (!personality) {
      return NextResponse.json(
        {
          error: { code: "INVALID_MODE", message: "Invalid AI mode.", retryable: false, requestId: routeRequestId },
        },
        { status: 400, headers: { "X-Request-ID": routeRequestId } }
      );
    }

    const disabledModes = (process.env.AI_DISABLED_MODES || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (process.env.AI_ENABLED === "false" || disabledModes.includes(mode)) {
      return NextResponse.json(
        { error: { code: "AI_DISABLED", message: "This AI tool is temporarily unavailable.", retryable: true, requestId: routeRequestId } },
        { status: 503, headers: { "Retry-After": "60", "X-Request-ID": routeRequestId } }
      );
    }

    const requestHash = getCacheKey({ mode, message: message.trim(), inputs, context, responseFormat, history });
    credit = await consumeCredit(request, mode, requestHash);
    const admission = credit;

    if (admission.replayStatus === "completed" && admission.replayPayload) {
      const replay = { ...admission.replayPayload, cached: true } as Record<string, unknown>;
      const replayResponse = aiResultResponse(
        streamRequested,
        admission.requestId,
        replay,
        typeof replay.response === "string" ? { delta: replay.response } : undefined
      );
      replayResponse.headers.set("Idempotency-Replayed", "true");
      return replayResponse;
    }

    if (admission.replayStatus === "processing") {
      return NextResponse.json(
        { error: { code: "AI_REQUEST_IN_PROGRESS", message: "This request is already processing.", retryable: true, retryAfter: 2, requestId: admission.requestId } },
        { status: 409, headers: { "Retry-After": "2", "X-Request-ID": admission.requestId } }
      );
    }

    if (isClearlyUnrelatedStudyAbroadQuestion(mode, message)) {
      const payload = {
        response: STUDY_ABROAD_REDIRECT,
        mode,
        personality: personality.name,
        cached: true,
        requestId: admission.requestId,
      };
      await completeCreditRequest(request, admission, "failed", undefined, { errorCode: "AI_NOT_GENERATED", durationMs: Date.now() - requestStartedAt });
      return aiResultResponse(streamRequested, admission.requestId, payload, { delta: STUDY_ABROAD_REDIRECT });
    }

    // --------------------------------------------------------
    // Provider credentials are read only inside the request-time router.
    // --------------------------------------------------------

    // --------------------------------------------------------
    // History
    // --------------------------------------------------------

    const validHistory =
      responseFormat === "structured"
        ? []
        : prepareHistory(history);

    // --------------------------------------------------------
    // Build messages
    // --------------------------------------------------------

    const isStructured =
      responseFormat === "structured";

    let messages;

    if (isStructured) {
      /*
       * IMPORTANT:
       *
       * Structured tool calls do NOT receive the whole chat history.
       *
       * This keeps the request small and fast.
       */

      messages = [
        {
          role: "system" as const,
          content: `
${routingInstructions}

${structuredPrompts[mode]}

Current date: ${new Date().toISOString().slice(0, 10)}.
Use every supplied input when ranking and explaining results.
Do not claim information is current unless it is present in supplied data.
Treat every user-provided value as authoritative. Never change, round, replace,
or contradict supplied scores, budgets, countries, courses, dates, or study levels.
Make recommendations materially depend on every supplied input.
For each recommendation, explain the fit and one relevant limitation or tradeoff.
For deadlines, visa rules, rankings, fees, and admission thresholds, avoid precise
claims unless supplied. State what the student should verify on the official source.

IMPORTANT:
- Return valid JSON only.
- Do not include markdown.
- Do not include explanations outside the JSON.
- Do not invent facts.
- If information is missing or uncertain, clearly indicate that
  instead of making up a precise answer.
`,
        },
        {
          role: "user" as const,
          content: JSON.stringify({
            question: message.trim(),
            inputs: inputs ?? {},
          }),
        },
      ];
    } else {
      /*
       * Normal mentor/chat request.
       */

      messages = [
        {
          role: "system" as const,
          content: `
${personality.systemPrompt}

${routingInstructions}

Recent tool context supplied by this student's device:
${context || "None"}

Answer directly and tailor every point to the student's exact question.
Use short sections or numbered steps when they improve clarity.
Give practical next actions and explain why they matter.
Repeat supplied scores, budgets, dates, courses, and destinations exactly.
Never substitute a different value or infer a missing value.
For time-sensitive requirements, explain what must be checked on the relevant
official government or university source. Never pretend you performed a live search.
Do not state exact current visa funds, fees, processing times, deadlines, rankings,
tuition, work rights, or immigration rules unless the user supplied them. Describe
the requirement generally and direct the student to the official source instead.
Do not invent facts.
If you do not have enough information, say so.
`,
        },
        ...validHistory,
        {
          role: "user" as const,
          content: message.trim(),
        },
      ];
    }

    // --------------------------------------------------------
    // Cache key
    // --------------------------------------------------------

    const cacheKey = getCacheKey({
      cacheScope: admission.cacheScope,
      providerRoutingVersion: 2,
      mode,
      responseFormat,
      messages,
    });

    // --------------------------------------------------------
    // Cache lookup
    // --------------------------------------------------------

    const cachedResponse =
      readCachedResponse(cacheKey);

    if (cachedResponse) {
      console.log(
        `[AI] CACHE HIT | ${Date.now() - requestStartedAt}ms | mode=${mode}`
      );

      if (isStructured) {
        try {
          const payload = {
            data: normalizeStructuredOutput(mode, extractJson(cachedResponse) as Record<string, unknown>, inputs),
            mode,
            personality: personality.name,
            cached: true,
            creditsRemaining: admission.creditsRemaining,
            requestId: admission.requestId,
          };
          await completeCreditRequest(request, admission, "completed", payload, { durationMs: Date.now() - requestStartedAt });
          return aiResultResponse(streamRequested, admission.requestId, payload);
        } catch {
          responseCache.delete(cacheKey);
          console.warn(`[AI] INVALID CACHED JSON | mode=${mode}`);
        }
      } else {
        const payload = {
          response: cachedResponse,
          mode,
          personality: personality.name,
          cached: true,
          creditsRemaining: admission.creditsRemaining,
          requestId: admission.requestId,
        };
        await completeCreditRequest(request, admission, "completed", payload, { durationMs: Date.now() - requestStartedAt });
        return aiResultResponse(streamRequested, admission.requestId, payload, { delta: cachedResponse });
      }
    }

    // --------------------------------------------------------
    // Existing in-flight request
    // --------------------------------------------------------

    const pendingResponse =
      pendingResponses.get(cacheKey);

    if (pendingResponse) {
      console.log(
        `[AI] WAITING FOR EXISTING REQUEST | mode=${mode}`
      );

      let response: string;
      try {
        response = await pendingResponse;
      } catch {
        await completeCreditRequest(request, admission, "failed", undefined, { errorCode: "AI_PROVIDER_UNAVAILABLE", durationMs: Date.now() - requestStartedAt });
        return NextResponse.json(
          { error: { code: "AI_PROVIDER_UNAVAILABLE", message: "The live AI service could not complete this request.", retryable: true, requestId: admission.requestId } },
          { status: 503, headers: { "Retry-After": "5", "X-Request-ID": admission.requestId } }
        );
      }

      console.log(
        `[AI] DUPLICATE REQUEST COMPLETE | ${
          Date.now() - requestStartedAt
        }ms | mode=${mode}`
      );

      if (isStructured) {
        try {
          const payload = {
            data: normalizeStructuredOutput(mode, extractJson(response) as Record<string, unknown>, inputs),
            mode,
            personality: personality.name,
            cached: true,
            creditsRemaining: admission.creditsRemaining,
            requestId: admission.requestId,
          };
          await completeCreditRequest(request, admission, "completed", payload, { durationMs: Date.now() - requestStartedAt });
          return aiResultResponse(streamRequested, admission.requestId, payload);
        } catch {
          responseCache.delete(cacheKey);
          await completeCreditRequest(request, admission, "failed", undefined, { errorCode: "AI_INVALID_RESPONSE", durationMs: Date.now() - requestStartedAt });
          return NextResponse.json({ error: "The live AI returned an invalid response. Please try again." }, { status: 502 });
        }
      }

      const payload = {
        response,
        mode,
        personality: personality.name,
        cached: true,
        creditsRemaining: admission.creditsRemaining,
        requestId: admission.requestId,
      };
      await completeCreditRequest(request, admission, "completed", payload, { durationMs: Date.now() - requestStartedAt });
      return aiResultResponse(streamRequested, admission.requestId, payload, { delta: response });
    }

    // --------------------------------------------------------
    // Ordered provider request with bounded fallback.
    // --------------------------------------------------------

    let selectedProvider = "";
    const validateContent = (content: string) => {
      if (!content.trim()) return false;
      if (!isStructured) return true;

      try {
        const parsed = normalizeStructuredOutput(mode, extractJson(content) as Record<string, unknown>, inputs);
        return isStructuredOutput(mode, parsed);
      } catch {
        return false;
      }
    };

    if (streamRequested) {
      let resolvePending!: (value: string) => void;
      let rejectPending!: (error: unknown) => void;
      const pending = new Promise<string>((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
      });
      pending.catch(() => undefined);
      pendingResponses.set(cacheKey, pending);

      return sseResponse(admission.requestId, async (send) => {
        let settled = false;
        try {
          await send("meta", {
            mode,
            personality: personality.name,
            cached: false,
            requestId: admission.requestId,
          });

          let live = false;
          const { content, provider } = await requestAI({
            messages,
            structured: isStructured,
            maxTokens: isStructured ? STRUCTURED_MAX_TOKENS : NORMAL_MAX_TOKENS,
            validate: validateContent,
            onAttemptStart: () => {
              if (!live) return;
              live = false;
              void send("reset", { reason: "provider_fallback" });
            },
            onChunk: (text) => {
              live = true;
              void send("delta", { text });
            },
          });

          selectedProvider = provider;
          console.log(`[AI] RESPONSE WINNER | provider=${provider} | mode=${mode}`);
          writeCachedResponse(cacheKey, content);
          settled = true;
          resolvePending(content);

          console.log(`[AI] TOTAL ROUTE TIME | ${Date.now() - requestStartedAt}ms | mode=${mode}`);

          if (isStructured) {
            let parsed;
            try {
              parsed = normalizeStructuredOutput(mode, extractJson(content) as Record<string, unknown>, inputs);
              if (!isStructuredOutput(mode, parsed)) {
                throw new Error("AI response did not match the required result shape.");
              }
            } catch (jsonError) {
              console.error(JSON.stringify({
                event: "ai_invalid_structured_response",
                mode,
                requestId: admission.requestId,
                ...errorDetails(jsonError),
              }));
              await completeCreditRequest(request, admission, "failed", undefined, {
                errorCode: "AI_INVALID_RESPONSE",
                durationMs: Date.now() - requestStartedAt,
              });
              await send("error", {
                code: "AI_INVALID_RESPONSE",
                message: "The live AI returned an invalid response.",
                retryable: true,
              });
              return;
            }

            const payload = {
              data: parsed,
              mode,
              personality: personality.name,
              cached: false,
              creditsRemaining: admission.creditsRemaining,
              requestId: admission.requestId,
            };
            await completeCreditRequest(request, admission, "completed", payload, {
              provider: selectedProvider || undefined,
              durationMs: Date.now() - requestStartedAt,
            });
            await send("done", payload);
            return;
          }

          const payload = {
            response: content,
            mode,
            personality: personality.name,
            cached: false,
            creditsRemaining: admission.creditsRemaining,
            requestId: admission.requestId,
          };
          await completeCreditRequest(request, admission, "completed", payload, {
            provider: selectedProvider || undefined,
            durationMs: Date.now() - requestStartedAt,
          });
          await send("done", payload);
        } catch (error) {
          if (!settled) rejectPending(error);
          console.error(JSON.stringify({
            event: "ai_provider_request_failed",
            mode,
            durationMs: Date.now() - requestStartedAt,
            ...errorDetails(error),
          }));
          if (settled) return;
          const failure = streamFailure(error);
          await completeCreditRequest(request, admission, "failed", undefined, {
            errorCode: failure.code,
            durationMs: Date.now() - requestStartedAt,
          });
          await send("error", failure);
        } finally {
          pendingResponses.delete(cacheKey);
        }
      });
    }

    const nextResponse = requestAI({
      messages,
      structured: isStructured,
      maxTokens: isStructured ? STRUCTURED_MAX_TOKENS : NORMAL_MAX_TOKENS,
      validate: validateContent,
    })
        .then(({ content, provider }) => {
          selectedProvider = provider;
          console.log(`[AI] RESPONSE WINNER | provider=${provider} | mode=${mode}`);
          writeCachedResponse(cacheKey, content);
          return content;
        })
        .catch((error) => {
          console.error(JSON.stringify({
            event: "ai_provider_request_failed",
            mode,
            durationMs: Date.now() - requestStartedAt,
            ...errorDetails(error),
          }));

          throw error;
        })
        .finally(() => {
          pendingResponses.delete(
            cacheKey
          );
        });

    // Store in-flight request.
    pendingResponses.set(
      cacheKey,
      nextResponse
    );

    let response: string;

    try {
      response = await nextResponse;
    } catch (error) {
      await completeCreditRequest(request, admission, "failed", undefined, {
        errorCode: isTimeoutError(error) ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE",
        durationMs: Date.now() - requestStartedAt,
      });
      if (isTimeoutError(error)) {
        return NextResponse.json(
          { error: { code: "AI_PROVIDER_TIMEOUT", message: "The AI service took too long to respond. Please try again.", retryable: true, requestId: admission.requestId } },
          { status: 504, headers: { "Retry-After": "5", "X-Request-ID": admission.requestId } }
        );
      }
      return NextResponse.json(
        { error: { code: "AI_PROVIDER_UNAVAILABLE", message: "The live AI service could not complete this request.", retryable: true, requestId: admission.requestId } },
        { status: 503, headers: { "Retry-After": "5", "X-Request-ID": admission.requestId } }
      );
    }

    // --------------------------------------------------------
    // Final response
    // --------------------------------------------------------

    console.log(
      `[AI] TOTAL ROUTE TIME | ${
        Date.now() - requestStartedAt
      }ms | mode=${mode}`
    );

    if (isStructured) {
      let parsed;

      try {
        parsed = normalizeStructuredOutput(mode, extractJson(response) as Record<string, unknown>, inputs);
        if (!isStructuredOutput(mode, parsed)) {
          throw new Error("AI response did not match the required result shape.");
        }
      } catch (jsonError) {
        console.error(JSON.stringify({
          event: "ai_invalid_structured_response",
          mode,
          requestId: admission.requestId,
          ...errorDetails(jsonError),
        }));

        await completeCreditRequest(request, admission, "failed", undefined, {
          errorCode: "AI_INVALID_RESPONSE",
          durationMs: Date.now() - requestStartedAt,
        });
        return NextResponse.json(
          { error: { code: "AI_INVALID_RESPONSE", message: "The live AI returned an invalid response.", retryable: true, requestId: admission.requestId } },
          { status: 502, headers: { "X-Request-ID": admission.requestId } }
        );
      }

      const payload = {
        data: parsed,
        mode,
        personality: personality.name,
        cached: false,
        creditsRemaining: admission.creditsRemaining,
        requestId: admission.requestId,
      };
      await completeCreditRequest(request, admission, "completed", payload, {
        provider: selectedProvider || undefined,
        durationMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json(payload, { headers: { "X-Request-ID": admission.requestId } });
    }

    const payload = {
      response,
      mode,
      personality: personality.name,
      cached: false,
      creditsRemaining: admission.creditsRemaining,
      requestId: admission.requestId,
    };
    await completeCreditRequest(request, admission, "completed", payload, {
      provider: selectedProvider || undefined,
      durationMs: Date.now() - requestStartedAt,
    });
    return NextResponse.json(payload, { headers: { "X-Request-ID": admission.requestId } });
  } catch (error: unknown) {
    const totalTime =
      Date.now() - requestStartedAt;

    console.error(JSON.stringify({
      event: "ai_route_error",
      mode: requestMode,
      requestId: credit?.requestId || routeRequestId,
      durationMs: totalTime,
      ...errorDetails(error),
    }));

    if (credit) {
      await completeCreditRequest(request, credit, "failed", undefined, {
        errorCode: "AI_INTERNAL_ERROR",
        durationMs: totalTime,
      }).catch(() => undefined);
    }

    if (error instanceof CreditError) {
      const requestId = credit?.requestId || routeRequestId;
      return NextResponse.json(
        {
          error: { code: error.code, message: error.message, retryable: error.status >= 429, retryAfter: error.retryAfter, requestId },
          ...(error.code === "FA_SANDBOX_EXHAUSTED" ? { creditsRemaining: 0 } : {}),
        },
        {
          status: error.status,
          headers: { ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}), "X-Request-ID": requestId },
        }
      );
    }

    // --------------------------------------------------------
    // Rate limit
    // --------------------------------------------------------

    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 429
    ) {
      return NextResponse.json(
        {
          error:
            "AI usage limit reached. Please try again shortly.",
        },
        { status: 429 }
      );
    }

    // --------------------------------------------------------
    // Timeout
    // --------------------------------------------------------

    if (isTimeoutError(error)) {
      return NextResponse.json(
        {
          error:
            "The AI service took too long to respond. Please try again.",
        },
        { status: 504 }
      );
    }

    // --------------------------------------------------------
    // Generic error
    // --------------------------------------------------------

    return NextResponse.json(
      {
        error:
          "Something went wrong while connecting to Future Atlas AI.",
      },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handleAIRequest);
