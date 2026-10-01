import assert from "node:assert/strict";
import { encodeSseEvent, parseSseBuffer } from "../lib/ai/sse.ts";

const encoded = `${encodeSseEvent("delta", { text: "Hel" })}${encodeSseEvent("delta", { text: "lo" })}${encodeSseEvent("done", { response: "Hello" })}`;
const first = parseSseBuffer(encoded.slice(0, 24));
const second = parseSseBuffer(first.rest + encoded.slice(24));
assert.equal(second.events.at(-1)?.event, "done");
assert.deepEqual(second.events.find((item) => item.event === "done")?.data, { response: "Hello" });

process.env.OPENROUTER_API_KEY = "test";
process.env.OPENROUTER_MODEL = "inclusionai/ling-3.0-flash-fin:free";

let calls = 0;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("openrouter.ai")) return new Response("{}", { status: 404 });
  calls += 1;
  const content = calls === 1 ? "" : "valid fallback";
  const payload = JSON.stringify({
    id: "gen",
    object: "chat.completion.chunk",
    created: 1,
    model: "test",
    choices: [{ index: 0, delta: { content }, finish_reason: content ? "stop" : null }],
  });
  return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
};

const { requestAI } = await import("../lib/platform/ai/openrouter.ts");
const chunks = [];
const result = await requestAI({
  messages: [{ role: "user", content: "test" }],
  structured: false,
  maxTokens: 20,
  validate: Boolean,
  onChunk: (text) => chunks.push(text),
});
assert.equal(result.content, "valid fallback");
assert.equal(result.provider, "inclusionai/ling-3.0-flash-sante:free");
assert.equal(calls, 2);
assert.deepEqual(chunks, ["valid fallback"]);
console.log("Provider fallback contract passed.");
