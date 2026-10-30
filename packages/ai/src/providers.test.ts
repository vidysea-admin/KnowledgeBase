/**
 * packages/ai/src/providers.test.ts — T-019 C2/C3. Per-adapter behaviour not already covered
 * by provider.test.ts's parity test: openai, ollama (incl. its real-transport-call listModels),
 * anthropic's two modes (api-key, and oauth delegating to claude-code), and claude-code's static
 * manifest. Every call goes through a fake transport (C2) — no real network/process call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Job } from "./provider.js";
import { canEmbed } from "./provider.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OpenAiProvider } from "./providers/openai.js";
import { OllamaProvider } from "./providers/ollama.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { ClaudeCodeProvider, CLAUDE_CODE_MODELS } from "./providers/claude-code.js";
import { fakeTransport } from "./testUtils.js";

const FIXTURE_JOB: Job = { kind: "test", messages: [{ role: "user", content: "hi" }] };

test("openai adapter completes via its injected transport", async () => {
  const transport = fakeTransport({
    status: 200,
    body: { choices: [{ message: { content: "hi from openai" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } },
  });
  const provider = new OpenAiProvider(transport, { apiKey: "k" });
  const result = await provider.complete(FIXTURE_JOB);
  assert.equal(result.text, "hi from openai");
  assert.equal(result.usage.inputTokens, 4);
  assert.equal(result.provider, "openai");
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0]!.kind, "http");
});

test("openai adapter throws on a non-2xx transport response, never swallows it", async () => {
  const provider = new OpenAiProvider(fakeTransport({ status: 500, body: { error: "down" } }), { apiKey: "k" });
  await assert.rejects(() => provider.complete(FIXTURE_JOB));
});

test("ollama adapter completes via its local /api/chat transport", async () => {
  const transport = fakeTransport({
    status: 200,
    body: { message: { content: "hi from ollama" }, prompt_eval_count: 3, eval_count: 1 },
  });
  const provider = new OllamaProvider(transport);
  const result = await provider.complete(FIXTURE_JOB);
  assert.equal(result.text, "hi from ollama");
  assert.equal(result.provider, "ollama");
});

test("ollama listModels() is a real call to a /api/tags-shaped transport (C3)", async () => {
  const transport = fakeTransport({
    status: 200,
    body: { models: [{ name: "llama3.1" }, { name: "mistral" }] },
  });
  const provider = new OllamaProvider(transport);
  const models = await provider.listModels();
  assert.deepEqual(models, [
    { id: "llama3.1", label: "llama3.1" },
    { id: "mistral", label: "mistral" },
  ]);
  assert.equal(transport.calls[0]!.url?.endsWith("/api/tags"), true);
});

test("anthropic adapter (api-key mode) completes via the Messages API shape", async () => {
  const transport = fakeTransport({
    status: 200,
    body: { content: [{ type: "text", text: "hi from anthropic" }], usage: { input_tokens: 6, output_tokens: 2 } },
  });
  const provider = new AnthropicProvider(transport, { mode: "api-key", apiKey: "sk-test" });
  const result = await provider.complete(FIXTURE_JOB);
  assert.equal(result.text, "hi from anthropic");
  assert.equal(result.provider, "anthropic");
  assert.equal((await provider.listModels()).length > 0, true);
});

test("anthropic adapter (api-key mode) requires an apiKey", () => {
  assert.throws(() => new AnthropicProvider(fakeTransport({ status: 200, body: {} }), { mode: "api-key" }));
});

test("anthropic adapter (oauth mode) delegates to the claude-code CLI transport shape — one implementation, not two", async () => {
  const transport = fakeTransport({
    status: 0,
    body: { result: "hi via oauth", usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0 },
  });
  const provider = new AnthropicProvider(transport, { mode: "oauth" });
  const result = await provider.complete(FIXTURE_JOB);
  assert.equal(result.text, "hi via oauth");
  assert.equal(result.provider, "anthropic");
  assert.equal(transport.calls[0]!.kind, "cli", "oauth mode must go through the CLI transport, not HTTP");
  assert.deepEqual(await provider.listModels(), CLAUDE_CODE_MODELS);
});

test("claude-code adapter returns its static model-alias manifest", async () => {
  const provider = new ClaudeCodeProvider(fakeTransport({ status: 0, body: { result: "x" } }));
  const models = await provider.listModels();
  assert.ok(models.length > 0);
  assert.ok(models.every((m) => typeof m.id === "string" && typeof m.label === "string"));
});

test("claude-code adapter throws on a non-zero CLI exit code", async () => {
  const provider = new ClaudeCodeProvider(fakeTransport({ status: 1, body: {}, text: "auth expired" }));
  await assert.rejects(() => provider.complete(FIXTURE_JOB));
});

/**
 * U1.1 — `embed()` on the provider seam. Every case is an ATTACK on the contract that makes a
 * vector index trustworthy: one vector per text, in order, all the same length. A short or ragged
 * response corrupts similarity search silently, which is the failure that would be hardest to
 * trace back here, so the adapters refuse rather than return something plausible.
 */
const vec = (n: number, fill: number) => Array.from({ length: n }, () => fill);


test("embed: gemini batches texts within the API limit into ONE call and pairs vectors by index", async () => {
  const t = fakeTransport({
    status: 200,
    body: { embeddings: [{ values: vec(768, 0.1) }, { values: vec(768, 0.2) }] },
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  const r = await p.embed!({ kind: "embedding", texts: ["alpha", "beta"] });

  assert.equal(t.calls.length, 1, "two texts must cost one call, not two");
  assert.match(t.calls[0]!.url!, /batchEmbedContents/);
  assert.equal(r.vectors.length, 2);
  assert.equal(r.dims, 768);
  assert.equal(r.vectors[0]![0], 0.1, "order must be preserved — the caller pairs by index");
  assert.equal(r.vectors[1]![0], 0.2);
  });


test("embed: gemini sends RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT so a query is not embedded as a document", async () => {
  const t = fakeTransport({ status: 200, body: { embeddings: [{ values: vec(4, 1) }] } });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await p.embed!({ kind: "embedding", texts: ["q"], purpose: "query" });
  const body = t.calls[0]!.body as { requests: { taskType: string }[] };
  assert.equal(body.requests[0]!.taskType, "RETRIEVAL_QUERY");
  });


test("embed: REFUSES a short response rather than pairing the wrong vector to the wrong text", async () => {
  // The dangerous case: two texts, one vector. Silently zipping these would attach chunk B's
  // meaning to chunk A's id, and every later search would be subtly wrong with nothing to show.
  const t = fakeTransport({ status: 200, body: { embeddings: [{ values: vec(768, 0.1) }] } });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await assert.rejects(
    p.embed!({ kind: "embedding", texts: ["alpha", "beta"] }),
    /returned 1 vector\(s\) for 2 text\(s\)/,
  );
  });


test("embed: REFUSES a ragged response — differing lengths cannot be compared by cosine", async () => {
  const t = fakeTransport({
    status: 200,
    body: { embeddings: [{ values: vec(768, 0.1) }, { values: vec(512, 0.2) }] },
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await assert.rejects(p.embed!({ kind: "embedding", texts: ["a", "b"] }), /ragged set/);
});

/* ── The 100-per-batch API limit (found live by the U1.0 backfill, 2026-09-08) ────────────────
 * `batchEmbedContents` rejects >100 requests with a 400. Three of the 26 real TOC sessions are
 * over it (237, 228, 111 chunks). Because the caller degrades instead of throwing, the whole
 * failure surfaced as "the three biggest sessions have no vectors" — an index that looks
 * populated and silently omits its richest content. Every case below is over the boundary,
 * because a test at 2 texts can never see this.
 */
test("embed: gemini SPLITS a batch over the 100-request API limit instead of being rejected", async () => {
  // The fake answers each call with exactly as many vectors as that call asked for, so a
  // provider that sent one oversized request would fail the arity check below.
  const t = fakeTransport((req) => {
    const n = (req.body as { requests: unknown[] }).requests.length;
    assert.ok(n <= 100, `sent a batch of ${n} — the real API rejects anything over 100`);
    return { status: 200, body: { embeddings: Array.from({ length: n }, () => ({ values: vec(768, 0.5) })) } };
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  const r = await p.embed!({ kind: "embedding", texts: Array.from({ length: 237 }, (_, i) => `chunk ${i}`) });

  assert.equal(t.calls.length, 3, "237 texts must become 3 calls (100 + 100 + 37)");
  assert.equal(r.vectors.length, 237, "every text must come back with a vector");
  assert.equal(r.dims, 768);
});

test("embed: a split batch preserves ORDER across call boundaries — the caller pairs by index", async () => {
  // Each text embeds to a vector whose first component encodes its global position, so any
  // reordering or mis-concatenation across the three calls is detectable.
  let seen = 0;
  const t = fakeTransport((req) => {
    const n = (req.body as { requests: unknown[] }).requests.length;
    const body = { embeddings: Array.from({ length: n }, (_, j) => ({ values: [seen + j, 0, 0] })) };
    seen += n;
    return { status: 200, body };
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  const r = await p.embed!({ kind: "embedding", texts: Array.from({ length: 250 }, (_, i) => `t${i}`) });

  assert.equal(r.vectors.length, 250);
  for (let i = 0; i < 250; i++) {
    assert.equal(r.vectors[i]![0], i, `vector at index ${i} came back out of order`);
  }
});

test("embed: a dimension change ACROSS batch boundaries is still caught — no single batch can see it", async () => {
  // The per-batch arity check cannot catch this: both batches are internally consistent. Only
  // the combined check can, which is why it was kept after the split.
  const t = fakeTransport((req) => {
    const n = (req.body as { requests: unknown[] }).requests.length;
    const dims = t.calls.length === 1 ? 768 : 512;
    return { status: 200, body: { embeddings: Array.from({ length: n }, () => ({ values: vec(dims, 0.1) })) } };
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await assert.rejects(
    p.embed!({ kind: "embedding", texts: Array.from({ length: 150 }, (_, i) => `t${i}`) }),
    /ragged set/,
  );
});

test("embed: a short SECOND batch is refused and names its offset, not silently truncated", async () => {
  const t = fakeTransport((req) => {
    const n = (req.body as { requests: unknown[] }).requests.length;
    const give = t.calls.length === 1 ? n : n - 1; // second batch returns one too few
    return { status: 200, body: { embeddings: Array.from({ length: give }, () => ({ values: vec(768, 0.1) })) } };
  });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await assert.rejects(
    p.embed!({ kind: "embedding", texts: Array.from({ length: 150 }, (_, i) => `t${i}`) }),
    /offset 100/,
  );
  });


test("embed: ollama embeds locally through the same seam, so the corpus need never leave", async () => {
  const t = fakeTransport({ status: 200, body: { embeddings: [vec(384, 0.5), vec(384, 0.6)] } });
  const p = new OllamaProvider(t, {});
  const r = await p.embed!({ kind: "embedding", texts: ["a", "b"] });
  assert.equal(t.calls.length, 1);
  assert.match(t.calls[0]!.url!, /\/api\/embed$/);
  assert.equal(r.dims, 384);
  assert.equal(r.provider, "ollama");
  });


test("embed: ollama applies the same short-response refusal", async () => {
  const t = fakeTransport({ status: 200, body: { embeddings: [vec(384, 0.5)] } });
  const p = new OllamaProvider(t, {});
  await assert.rejects(p.embed!({ kind: "embedding", texts: ["a", "b"] }), /refusing to pair/);
  });


test("embed: an empty batch costs no call at all", async () => {
  const t = fakeTransport({ status: 200, body: {} });
  const p = new GeminiProvider(t, { apiKey: "k" });
  const r = await p.embed!({ kind: "embedding", texts: [] });
  assert.equal(t.calls.length, 0, "an empty batch must not hit a paid endpoint");
  assert.deepEqual(r.vectors, []);
  });


test("embed: canEmbed() distinguishes providers that support embeddings from those that cannot", async () => {
  // claude-code runs a CLI and Anthropic ships no embedding API. The router uses this to SKIP
  // them rather than fail the chain at the first member without an embed().
  assert.equal(canEmbed(new GeminiProvider(fakeTransport(), { apiKey: "k" })), true);
  assert.equal(canEmbed(new OllamaProvider(fakeTransport(), {})), true);
  assert.equal(canEmbed(new AnthropicProvider(fakeTransport(), { mode: "oauth" })), false);
  });

test("embed: REFUSES all-empty vectors — the degenerate case relative guards miss (ISS-096)", async () => {
  // The count guard passes (2 vectors for 2 texts) and the ragged guard passes (both length 0),
  // because both are RELATIVE and neither has a floor. A zero-length embedding has no direction,
  // so cosine against it is 0/0: the row looks populated and matches nothing, forever.
  const t = fakeTransport({ status: 200, body: { embeddings: [{ values: [] }, { values: [] }] } });
  const p = new GeminiProvider(t, { apiKey: "k" });
  await assert.rejects(p.embed!({ kind: "embedding", texts: ["a", "b"] }), /empty vector\(s\)/);
});

test("embed: ollama applies the same empty-vector floor (ISS-096)", async () => {
  const t = fakeTransport({ status: 200, body: { embeddings: [[], []] } });
  const p = new OllamaProvider(t, {});
  await assert.rejects(p.embed!({ kind: "embedding", texts: ["a", "b"] }), /empty vector\(s\)/);
});

test("embed: an EMPTY BATCH still returns dims 0 without throwing — no texts, nothing to embed", async () => {
  // The floor must not fire here: zero texts legitimately yields zero vectors, and throwing would
  // make a no-op batch an error.
  const t = fakeTransport({ status: 200, body: {} });
  const p = new GeminiProvider(t, { apiKey: "k" });
  const r = await p.embed!({ kind: "embedding", texts: [] });
  assert.equal(r.dims, 0);
  assert.equal(t.calls.length, 0);
});

// ---- D-207 item 3: gemini-3.5-flash-lite with a thinking level ---------------------------------------------------------------
test("gemini thinkingLevel: configured -> generationConfig.thinkingConfig.thinkingLevel is sent; unset -> the body is unchanged", async () => {
  const body = { candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } };
  const lite = fakeTransport({ status: 200, body });
  const p = new GeminiProvider(lite, { apiKey: "k", model: "gemini-3.5-flash-lite", thinkingLevel: "minimal", name: "gemini-flash-lite" });
  const r = await p.complete(FIXTURE_JOB);
  assert.equal(p.name, "gemini-flash-lite");
  assert.equal(r.provider, "gemini-flash-lite");
  assert.equal(r.model, "gemini-3.5-flash-lite");
  assert.match(lite.calls[0]!.url!, /models\/gemini-3\.5-flash-lite:generateContent/);
  assert.deepEqual((lite.calls[0]!.body as { generationConfig?: unknown }).generationConfig, { thinkingConfig: { thinkingLevel: "minimal" } });
  const plain = fakeTransport({ status: 200, body });
  await new GeminiProvider(plain, { apiKey: "k" }).complete(FIXTURE_JOB);
  assert.equal("generationConfig" in (plain.calls[0]!.body as object) && (plain.calls[0]!.body as { generationConfig?: unknown }).generationConfig !== undefined, false);
  assert.equal(new GeminiProvider(plain, { apiKey: "k" }).name, "gemini", "default name unchanged");
});

test("gemini: job.signal is handed to the transport so an aborted /route step B really cancels the fetch; the model is listed", async () => {
  const t = fakeTransport({ status: 200, body: { candidates: [{ content: { parts: [{ text: "x" }] } }] } });
  const ctl = new AbortController();
  const p = new GeminiProvider(t, { apiKey: "k" });
  await p.complete({ ...FIXTURE_JOB, signal: ctl.signal });
  assert.equal(t.calls[0]!.signal, ctl.signal);
  assert.ok((await p.listModels()).some((m) => m.id === "gemini-3.5-flash-lite"));
});
