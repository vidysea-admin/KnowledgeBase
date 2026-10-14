import test from "node:test";
import assert from "node:assert/strict";
import { fakeTransport } from "../testUtils.js";
import { buildVisionBackends, newVisionTally, runVisionChain, VisionAllProvidersFailedError, type VisionImageRequest } from "./chain.js";
import { detectGeminiFreeTier, GeminiFreeTierQuotaError } from "../gemini-quota.js";
import { createGeminiSttAdapter } from "../stt/gemini.js";
import { parseRoutingYaml } from "../routing-config.js";
import { readFileSync } from "node:fs";
import type { TransportRequest, TransportResponse } from "../provider.js";

const REQ: VisionImageRequest = { imageBase64: "QUJD", mimeType: "image/jpeg", prompt: "describe" };
const OK_JSON = '{"readable":true,"ocrText":"Slide","visualDescription":""}';
const ollamaOk = (): TransportResponse => ({ status: 200, body: { message: { content: OK_JSON } } });
const geminiOk = (): TransportResponse => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: OK_JSON }] } }] } });
const FREE_TIER_BODY = { error: { code: 429, details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [
    { quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } };
const ENV = { OLLAMA_API_KEY: "k-ollama", GEMINI_API_KEY: "k-gemini", WEBINAR_VISION_MODEL: "gemini-2.5-flash" };

/** One transport that routes by URL host so a single fake serves both providers. */
function split(handlers: { ollama: (r: TransportRequest) => TransportResponse; gemini: (r: TransportRequest) => TransportResponse }) {
  const calls: TransportRequest[] = [];
  const t = async (r: TransportRequest) => { calls.push(r); return r.url!.includes("ollama.com") ? handlers.ollama(r) : handlers.gemini(r); };
  return Object.assign(t, { calls });
}

test("ollama ok: served by the first ollama model, gemini never called, no fallback counted", async () => {
  const t = split({ ollama: ollamaOk, gemini: geminiOk });
  const tally = newVisionTally();
  const logs: string[] = [];
  const r = await runVisionChain(buildVisionBackends(ENV, t), REQ, { tally, log: (l) => logs.push(l) });
  assert.equal(r.provider, "ollama"); assert.equal(r.model, "glm-5.3-flash");
  assert.deepEqual(tally.byProvider, { ollama: 1 }); assert.equal(tally.fallbacks, 0);
  assert.equal(t.calls.length, 1);
  assert.match(logs[0]!, /served by ollama\/glm-5.3-flash/);
  assert.equal(t.calls[0]!.headers!.authorization, "Bearer k-ollama");
  assert.deepEqual((t.calls[0]!.body as { messages: { images: string[] }[] }).messages[0]!.images, ["QUJD"]);
});

test("ollama 5xx on every model -> gemini serves, fallback counted and logged", async () => {
  const t = split({ ollama: () => ({ status: 503, body: "down" }), gemini: geminiOk });
  const tally = newVisionTally(); const logs: string[] = [];
  const r = await runVisionChain(buildVisionBackends(ENV, t), REQ, { tally, log: (l) => logs.push(l) });
  assert.equal(r.provider, "gemini");
  assert.equal(tally.fallbacks, 1); assert.deepEqual(tally.byProvider, { gemini: 1 });
  assert.equal(tally.failures.length, 2, "both ollama models failed first");
  assert.ok(logs.some((l) => /gemini\/gemini-2.5-flash \(fallback/.test(l)));
});

test("first ollama model fails, second ollama model serves: counted as a fallback within ollama", async () => {
  let n = 0;
  const t = split({ ollama: () => (n++ === 0 ? { status: 500, body: "x" } : ollamaOk()), gemini: geminiOk });
  const tally = newVisionTally();
  const r = await runVisionChain(buildVisionBackends(ENV, t), REQ, { tally });
  assert.equal(r.model, "deepseek-v4.1-flash"); assert.equal(tally.fallbacks, 1);
});

test("invalid ollama reply (fails validate) falls back to gemini", async () => {
  const t = split({ ollama: () => ({ status: 200, body: { message: { content: "not json" } } }), gemini: geminiOk });
  const r = await runVisionChain(buildVisionBackends(ENV, t), REQ, { validate: (s) => JSON.parse(s) });
  assert.equal(r.provider, "gemini");
});

test("ollama timeout falls back to gemini", async () => {
  const hang = new Promise<TransportResponse>(() => {});
  const calls: string[] = [];
  const t = async (r: TransportRequest) => { calls.push(r.url!); return r.url!.includes("ollama.com") ? hang : geminiOk(); };
  const [b1, b2, g] = buildVisionBackends(ENV, t);
  // rebuild with a tiny timeout
  const { createOllamaVisionBackend } = await import("./chain.js");
  const fast = [createOllamaVisionBackend({ transport: t, model: "m", baseUrl: "https://ollama.com", timeoutMs: 20 }), g!];
  void b1; void b2;
  const r = await runVisionChain(fast, REQ);
  assert.equal(r.provider, "gemini");
});

test("both providers fail -> typed VisionAllProvidersFailedError listing each attempt", async () => {
  const t = split({ ollama: () => ({ status: 500, body: "x" }), gemini: () => ({ status: 500, body: "y" }) });
  await assert.rejects(runVisionChain(buildVisionBackends(ENV, t), REQ), (e: unknown) =>
    e instanceof VisionAllProvidersFailedError && e.attempts.length === 3 && /ollama\/glm-5.3-flash/.test(e.message) && /gemini\/gemini-2.5-flash/.test(e.message));
});

test("gemini 429 FreeTier: typed error with quotaId and the billed-key fix; tally flags it", async () => {
  const t = split({ ollama: () => ({ status: 500, body: "x" }), gemini: () => ({ status: 429, body: FREE_TIER_BODY }) });
  const tally = newVisionTally();
  await assert.rejects(runVisionChain(buildVisionBackends(ENV, t), REQ, { tally }), (e: unknown) =>
    e instanceof VisionAllProvidersFailedError && /GenerateRequestsPerDayPerProjectPerModel-FreeTier/.test(e.message) && /billed/.test(e.message));
  assert.equal(tally.geminiFreeTierQuota, true);
});

test("a plain 429 (not FreeTier) is NOT reported as a free-tier error", () => {
  assert.equal(detectGeminiFreeTier(429, { error: { details: [{ violations: [{ quotaId: "PerMinute" }] }] } }), undefined);
  assert.equal(detectGeminiFreeTier(500, FREE_TIER_BODY), undefined);
  assert.ok(detectGeminiFreeTier(429, FREE_TIER_BODY) instanceof GeminiFreeTierQuotaError);
});

test("STT: Gemini 429 FreeTier throws GeminiFreeTierQuotaError (keeps the status text, adds the fix)", async () => {
  const stt = createGeminiSttAdapter(fakeTransport({ status: 429, body: FREE_TIER_BODY }), { apiKey: "k" });
  await assert.rejects(stt.transcribe(new Uint8Array([1]), {}), (e: unknown) =>
    e instanceof GeminiFreeTierQuotaError && e.quotaId.endsWith("FreeTier") && /gemini STT error 429/.test(e.message) && !/\bk\b/.test(e.message));
});

test("STT: Gemini non-quota error keeps the original message", async () => {
  const stt = createGeminiSttAdapter(fakeTransport({ status: 500, body: "boom" }), { apiKey: "k" });
  await assert.rejects(stt.transcribe(new Uint8Array([1]), {}), (e: unknown) => !(e instanceof GeminiFreeTierQuotaError) && /gemini STT error 500/.test((e as Error).message));
});

test("order lives in config: unconfigured providers are skipped; gemini-first order is honoured; unknown provider rejected", () => {
  const t = fakeTransport({ status: 200, body: {} });
  assert.deepEqual(buildVisionBackends({ GEMINI_API_KEY: "g", WEBINAR_VISION_MODEL: "gemini-2.5-flash" }, t).map((b) => b.provider), ["gemini"]);
  assert.deepEqual(buildVisionBackends(ENV, t, ["gemini", "ollama"]).map((b) => b.provider), ["gemini", "ollama", "ollama"]);
  assert.deepEqual(buildVisionBackends({ ...ENV, OLLAMA_VISION_MODELS: "a, b ,c" }, t).map((b) => b.model).slice(0, 3), ["a", "b", "c"]);
  assert.throws(() => buildVisionBackends(ENV, t, ["claude"]), /unknown provider/);
  assert.deepEqual(parseRoutingYaml(readFileSync(new URL("../../../../config/ai-routing.yaml", import.meta.url), "utf8")).vision, ["ollama", "gemini"]);
});

test("no configured backend -> clear error, no call", async () => {
  await assert.rejects(runVisionChain([], REQ), /no configured backend/);
});
