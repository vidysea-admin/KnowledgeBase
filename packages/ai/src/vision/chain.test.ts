import test from "node:test";
import assert from "node:assert/strict";
import { fakeTransport } from "../testUtils.js";
import { buildVisionBackends, createGeminiVisionBackend, createOllamaVisionBackend, extractJsonObject, VisionDemotion, VisionNonJsonError, DEFAULT_VISION_BACKEND_TIMEOUT_MS, MAX_EXTRACT_CHARS, newVisionTally, runVisionChain, VisionAllProvidersFailedError, type VisionImageRequest } from "./chain.js";
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

// ---- visionfix: ISS-OLLAMAFIRST-001 / 002 and the two empty-reply branches ----
const strict = (v: any) => { if (!v || typeof v.readable !== "boolean" || typeof v.ocrText !== "string") throw new Error("bad schema"); return v; };

test("empty Ollama reply (missing, blank, non-string content) throws 'returned no content'", async () => {
  for (const body of [{ message: {} }, { message: { content: "   " } }, { message: { content: 5 } }, null]) {
    const b = createOllamaVisionBackend({ transport: async () => ({ status: 200, body }), model: "m", baseUrl: "https://ollama.com" });
    await assert.rejects(b.call(REQ), /ollama vision m returned no content/);
  }
});

test("empty Gemini reply (no candidates, blank text) throws 'returned no text'", async () => {
  for (const body of [{ candidates: [] }, { candidates: [{ content: { parts: [{ text: "  " }] } }] }, null]) {
    const b = createGeminiVisionBackend({ transport: async () => ({ status: 200, body }), model: "g", apiKey: "k" });
    await assert.rejects(b.call(REQ), /gemini vision g returned no text/);
  }
});

test("timeout ABORTS the request signal (the fetch is really cancelled)", async () => {
  let sig: AbortSignal | undefined;
  const t = async (r: TransportRequest) => { sig = r.signal; return new Promise<TransportResponse>(() => {}); };
  const b = createOllamaVisionBackend({ transport: t, model: "m", baseUrl: "https://ollama.com", timeoutMs: 20 });
  await assert.rejects(b.call(REQ), /timed out after 20ms/);
  assert.ok(sig, "signal passed to transport"); assert.equal(sig!.aborted, true);
  const g = createGeminiVisionBackend({ transport: t, model: "g", apiKey: "k", timeoutMs: 20 });
  await assert.rejects(g.call(REQ), /timed out/); assert.equal(sig!.aborted, true);
});

test("overall deadline: backends get the remaining budget, later ones are skipped when it is spent", async () => {
  const seen: (AbortSignal | undefined)[] = [];
  const t = async (r: TransportRequest) => { seen.push(r.signal); return new Promise<TransportResponse>(() => {}); };
  const backends = [1, 2, 3].map((n) => createOllamaVisionBackend({ transport: t, model: `m${n}`, baseUrl: "https://ollama.com", timeoutMs: 10_000 }));
  const started = Date.now();
  await assert.rejects(runVisionChain(backends, REQ, { deadlineMs: 120 }), (e: unknown) =>
    e instanceof VisionAllProvidersFailedError && e.attempts.length === 3 && /timed out/.test(e.attempts[0]!.error) && /deadline exceeded/.test(e.attempts[1]!.error) && /deadline exceeded/.test(e.attempts[2]!.error));
  assert.ok(Date.now() - started < 1500, "bounded by the deadline, not 3 x per-backend timeout");
  assert.equal(seen.length, 1, "first backend consumed the whole budget"); assert.ok(seen.every((s) => s?.aborted));
});

test("default deadline is 90 s and LKB_VISION_DEADLINE_MS overrides it", async () => {
  const { visionDeadlineMs } = await import("./chain.js");
  assert.equal(visionDeadlineMs({}), 90_000); assert.equal(visionDeadlineMs({ LKB_VISION_DEADLINE_MS: "5000" }), 5000);
  assert.equal(visionDeadlineMs({ LKB_VISION_DEADLINE_MS: "junk" }), 90_000);
});

test("Ollama request uses structured output: format json by default, the schema when given, think false", async () => {
  const bodies: any[] = [];
  const t = async (r: TransportRequest) => { bodies.push(r.body); return ollamaOk(); };
  const b = createOllamaVisionBackend({ transport: t, model: "m", baseUrl: "https://ollama.com" });
  await b.call(REQ); await b.call({ ...REQ, schema: { type: "object" } });
  assert.equal(bodies[0].format, "json"); assert.deepEqual(bodies[1].format, { type: "object" });
  assert.equal(bodies[0].think, false);
});

test("extractJsonObject: bare, fenced, prose-wrapped, nested/braces-in-strings, think-block; strict validator still applies", () => {
  const o = { readable: true, ocrText: "a {b} \"c\"" };
  assert.deepEqual(extractJsonObject(JSON.stringify(o), strict), o);
  assert.deepEqual(extractJsonObject("```json\n" + JSON.stringify(o) + "\n```", strict), o);
  assert.deepEqual(extractJsonObject("The user wants JSON. Here: " + JSON.stringify(o) + " done.", strict), o);
  assert.deepEqual(extractJsonObject('<think>try {"x":1} maybe</think>' + JSON.stringify(o), strict), o, "skips a valid-JSON candidate the validator rejects");
  assert.throws(() => extractJsonObject('{"readable":"yes","ocrText":1}', strict), /no valid JSON object/);
  assert.throws(() => extractJsonObject("The user wants me to describe the image {", strict), /no valid JSON object/);
});

test("extractor error never echoes the model reply (ISS-OLLAMAFIRST-002 leak)", async () => {
  const t = split({ ollama: () => ({ status: 200, body: { message: { content: "SECRETREPLY The user w..." } } }), gemini: geminiOk });
  const tally = newVisionTally();
  await runVisionChain(buildVisionBackends(ENV, t), REQ, { tally, validateJson: strict });
  assert.ok(tally.failures.length >= 1 && tally.failures.every((f) => !/SECRETREPLY|The user/.test(f.error)));
});

test("validateJson: reasoning prose around valid JSON is served by the first ollama model", async () => {
  const t = split({ ollama: () => ({ status: 200, body: { message: { content: "The user wants JSON.\n```json\n" + OK_JSON + "\n```" } } }), gemini: geminiOk });
  const r = await runVisionChain(buildVisionBackends(ENV, t), REQ, { validateJson: strict });
  assert.equal(r.provider, "ollama"); assert.equal(r.attempts, 1);
});

// ---- visionfix cycle 1: ISS-VISIONFIX-002 (linear extractor) and ISS-VISIONFIX-003 (surviving mutants) ----
test("ISS-VISIONFIX-002: extractor is linear: 32k '{', 16k '{\"', 200 KB unbalanced all finish < 100 ms and throw the fixed message", () => {
  for (const input of ["{".repeat(32_000), '{"'.repeat(16_000), "{".repeat(200_000), '{"a":'.repeat(30_000)]) {
    const t0 = performance.now();
    assert.throws(() => extractJsonObject(input, strict), /no valid JSON object/);
    assert.ok(performance.now() - t0 < 100, `took ${performance.now() - t0} ms`);
  }
});

test("extractor: input beyond the cap is not scanned (object after the cap is ignored)", () => {
  const ok = JSON.stringify({ readable: true, ocrText: "x" });
  assert.deepEqual(extractJsonObject(" ".repeat(100) + ok, strict), { readable: true, ocrText: "x" });
  assert.throws(() => extractJsonObject(" ".repeat(MAX_EXTRACT_CHARS) + ok, strict), /no valid JSON object/);
});

test("extractor: a '}' and '{' inside a string do not end/open an object (string-aware); stray quote in prose does not desync", () => {
  const o = { readable: true, ocrText: "tail } and {{ head" };
  assert.deepEqual(extractJsonObject("He said \"hi and then " + JSON.stringify(o), strict), o);
  assert.deepEqual(extractJsonObject(JSON.stringify({ readable: true, ocrText: "a } b" }), strict), { readable: true, ocrText: "a } b" });
});

test("backend default timeout is 45 s (not 120 s)", () => { assert.equal(DEFAULT_VISION_BACKEND_TIMEOUT_MS, 45_000); });

test("outer signal (ctx.signal) abort cancels the in-flight request and rejects", async () => {
  let sig: AbortSignal | undefined;
  const t = async (r: TransportRequest) => { sig = r.signal; return new Promise<TransportResponse>(() => {}); };
  const outer = new AbortController();
  const b = createOllamaVisionBackend({ transport: t, model: "m", baseUrl: "https://ollama.com", timeoutMs: 5000 });
  const p = b.call(REQ, { signal: outer.signal }).then(() => "resolved", (e: Error) => e.message);
  await new Promise((r) => setTimeout(r, 10)); outer.abort();
  assert.equal(await Promise.race([p, new Promise((r) => setTimeout(() => r("hung"), 500))]).then((x) => (x === "hung" ? "hung" : "settled")), "settled");
  assert.equal(sig!.aborted, true);
  const pre = new AbortController(); pre.abort();
  await b.call(REQ, { signal: pre.signal }).catch(() => {}); assert.equal(sig!.aborted, true, "pre-aborted outer signal aborts at once");
});

// ---- w27 aitransport: ISS-OLLAMAFIRST-001 (caller AbortSignal through the chain) and -002 (demote the prose model) ----
const PROSE = "The user wants me to describe the image. Let me think about it";
/** ollama: first model replies with prose, every other model replies with JSON; gemini JSON. Records the model per call. */
function proseFirst(failModel?: string) {
  const models: string[] = [];
  const t = async (r: TransportRequest): Promise<TransportResponse> => {
    if (!r.url!.includes("ollama.com")) { models.push("gemini"); return geminiOk(); }
    const m = (r.body as { model: string }).model; models.push(m);
    if (m === failModel) return { status: 500, body: "x" };
    return m === "glm-5.3-flash" ? { status: 200, body: { message: { content: PROSE } } } : ollamaOk();
  };
  return Object.assign(t, { models });
}

test("ISS-OLLAMAFIRST-002: prose from the first model demotes it; later frames skip the wasted call; ollama stays ahead of gemini", async () => {
  const t = proseFirst(); const backends = buildVisionBackends(ENV, t); const tally = newVisionTally(); const logs: string[] = [];
  const frame1 = await runVisionChain(backends, REQ, { tally, log: (l) => logs.push(l), validateJson: strict });
  assert.equal(frame1.model, "deepseek-v4.1-flash"); assert.equal(frame1.attempts, 2);
  assert.ok(logs.some((l) => /glm-5.3-flash demoted/.test(l)));
  const frame2 = await runVisionChain(backends, REQ, { tally, validateJson: strict });
  const frame3 = await runVisionChain(backends, REQ, { tally, validateJson: strict });
  assert.deepEqual(t.models, ["glm-5.3-flash", "deepseek-v4.1-flash", "deepseek-v4.1-flash", "deepseek-v4.1-flash"], "glm paid once, not per frame");
  assert.equal(frame2.attempts, 1); assert.equal(frame3.provider, "ollama");
  assert.equal(tally.failures.length, 1); assert.ok(!/The user|Let me think/.test(tally.failures[0]!.error));
});

test("demotion reorders only inside a provider group: a demoted ollama model is still tried before gemini", async () => {
  const t = proseFirst("deepseek-v4.1-flash"); const backends = buildVisionBackends(ENV, t);
  const d = new VisionDemotion(); d.recordNonJson(backends[0]!);
  assert.deepEqual(d.order(backends).map((b) => `${b.provider}/${b.model}`), ["ollama/deepseek-v4.1-flash", "ollama/glm-5.3-flash", "gemini/gemini-2.5-flash"]);
  await assert.doesNotReject(runVisionChain(backends, REQ, { demotion: d, validateJson: strict }));
  assert.deepEqual(t.models, ["deepseek-v4.1-flash", "glm-5.3-flash", "gemini"], "demoted glm still comes before gemini");
});

test("a demoted model that later serves valid JSON is restored; below-threshold strikes keep the order; demotion:false retries the prose model every call", async () => {
  const [a, b] = [1, 2].map((n) => createOllamaVisionBackend({ transport: async () => ollamaOk(), model: `m${n}`, baseUrl: "https://ollama.com" }));
  const d = new VisionDemotion(); d.recordNonJson(a!);
  assert.deepEqual(d.order([a!, b!]).map((x) => x.model), ["m2", "m1"]);
  d.recordServed(a!); assert.deepEqual(d.order([a!, b!]).map((x) => x.model), ["m1", "m2"]);
  const lenient = new VisionDemotion(2); lenient.recordNonJson(a!); assert.deepEqual(lenient.order([a!, b!]).map((x) => x.model), ["m1", "m2"]);
  const t = proseFirst(); const backends = buildVisionBackends(ENV, t);
  await runVisionChain(backends, REQ, { demotion: false, validateJson: strict }); await runVisionChain(backends, REQ, { demotion: false, validateJson: strict });
  assert.equal(t.models.filter((m) => m === "glm-5.3-flash").length, 2);
});

test("ISS-OLLAMAFIRST-002: JSON.parse SyntaxError from a `validate` callback does not leak the reply into tally/log and counts as prose", async () => {
  const t = proseFirst(); const backends = buildVisionBackends(ENV, t); const tally = newVisionTally(); const logs: string[] = [];
  await runVisionChain(backends, REQ, { tally, log: (l) => logs.push(l), validate: (s) => JSON.parse(s) });
  assert.equal(tally.failures.length, 1);
  assert.equal(tally.failures[0]!.error, new VisionNonJsonError().message);
  assert.ok(![...logs, tally.failures[0]!.error].some((l) => /The user|Unexpected token|is not valid JSON/.test(l)));
  assert.ok(logs.some((l) => /demoted/.test(l)));
});

test("status/transport failures do NOT demote (only prose does)", async () => {
  const t = split({ ollama: () => ({ status: 503, body: "down" }), gemini: geminiOk }); const backends = buildVisionBackends(ENV, t);
  const d = new VisionDemotion();
  await runVisionChain(backends, REQ, { demotion: d, validateJson: strict });
  assert.ok(backends.every((x) => !d.isDemoted(x)));
});

test("ISS-OLLAMAFIRST-001: opts.signal reaches every backend request; abort cancels the in-flight call and no later backend is tried", async () => {
  const sigs: (AbortSignal | undefined)[] = [];
  const t = async (r: TransportRequest) => { sigs.push(r.signal); return new Promise<TransportResponse>(() => {}); };
  const backends = [1, 2, 3].map((n) => createOllamaVisionBackend({ transport: t, model: `m${n}`, baseUrl: "https://ollama.com", timeoutMs: 10_000 }));
  const outer = new AbortController(); const started = Date.now();
  const p = runVisionChain(backends, REQ, { signal: outer.signal, deadlineMs: 60_000 });
  await new Promise((r) => setTimeout(r, 15)); outer.abort();
  await assert.rejects(p, (e: unknown) => e instanceof VisionAllProvidersFailedError && e.attempts.length === 3 && /aborted/.test(e.attempts[0]!.error) && /aborted before this backend/.test(e.attempts[2]!.error));
  assert.ok(Date.now() - started < 1500, "returns on abort, not after the 10 s backend timeout");
  assert.equal(sigs.length, 1, "no further backend request after the abort"); assert.equal(sigs[0]!.aborted, true);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(runVisionChain(backends, REQ, { signal: pre.signal }), VisionAllProvidersFailedError); assert.equal(sigs.length, 1, "pre-aborted: no request at all");
});
