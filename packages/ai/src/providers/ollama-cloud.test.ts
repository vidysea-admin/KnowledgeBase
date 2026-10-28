import { test } from "node:test";
import assert from "node:assert/strict";
import { canEmbed, type Transport } from "../provider.js";
import { complete, AllProvidersFailedError } from "../router.js";
import { fakeTransport, failingTransport } from "../testUtils.js";
import { createOllamaCloudProviders, OllamaCloudProvider } from "./ollama-cloud.js";

const job = { kind: "answer", messages: [{ role: "user" as const, content: "स्रोत के साथ बताओ" }] };
const ok = { status: 200, body: { message: { content: "source-backed answer" }, prompt_eval_count: 11, eval_count: 7 } };

test("cloud defaults use native direct endpoint, explicit bearer credentials, accurate usage and unknown cost", async () => {
  const t = fakeTransport(ok);
  const p = new OllamaCloudProvider(t, { apiKey: " test-credential " });
  const result = await p.complete(job);
  assert.equal(t.calls[0]!.url, "https://ollama.com/api/chat");
  assert.equal(t.calls[0]!.headers?.authorization, "Bearer test-credential");
  assert.deepEqual(t.calls[0]!.body, { model: "glm-5.3-flash", stream: false, messages: job.messages });
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7 });
  assert.equal(result.costUsd, undefined);
  assert.equal(result.costStatus, "unknown");
  assert.equal(result.provider, "ollama-cloud");
  assert.equal(canEmbed(p), false);
  assert.equal("embed" in p, false);
});

test("cloud key is required explicitly and refused before transport", async () => {
  for (const apiKey of ["", " ", "bad\r\nheader"]) {
    const t = fakeTransport(ok);
    await assert.rejects(new OllamaCloudProvider(t, { apiKey }).complete(job), /credentials unavailable/);
    assert.equal(t.calls.length, 0);
  }
});

test("credentials cannot be routed to a third-party, cleartext, URL credential, or query endpoint", () => {
  for (const baseUrl of ["http://ollama.com", "https://example.com", "https://ollama.com.evil.test", "https://user:secret@ollama.com", "https://ollama.com/?key=x", "https://ollama.com/api/chat", "bad endpoint"]) {
    assert.throws(() => new OllamaCloudProvider(fakeTransport(ok), { apiKey: "test-key", baseUrl }), /official HTTPS endpoint/);
  }
  for (const baseUrl of ["https://ollama.com", "https://ollama.com/", "https://ollama.com/api/"]) {
    assert.doesNotThrow(() => new OllamaCloudProvider(fakeTransport(ok), { apiKey: "test-key", baseUrl }));
  }
});

test("router falls back from GLM to DeepSeek, records each attempt and never calls vectors", async () => {
  const t = fakeTransport({ status: 503, body: { error: "private contents" } }, ok);
  const providers = createOllamaCloudProviders(t, { apiKey: "test-key" });
  const records: unknown[] = [];
  const result = await complete("answer", job, {
    chains: { answer: ["ollama-cloud", "ollama-cloud-verifier"] }, providers,
    tenantId: "tenant-a", write: async entry => { records.push(entry); },
  });
  assert.equal(result.model, "deepseek-v4.1-flash");
  assert.equal(result.provider, "ollama-cloud-verifier");
  assert.deepEqual(t.calls.map(r => (r.body as { model: string }).model), ["glm-5.3-flash", "deepseek-v4.1-flash"]);
  assert.ok(t.calls.every(r => r.url === "https://ollama.com/api/chat"));
  assert.equal(records.length, 2);
  assert.equal((records[0] as { status: string }).status, "failed");
  assert.equal((records[1] as { status: string }).status, "done");
});

test("independent verifier directly selects distinct configured model without calling primary", async () => {
  const t = fakeTransport(ok);
  const providers = createOllamaCloudProviders(t, { apiKey: "test-key", primaryModel: "primary-custom", verifierModel: "verifier-custom" });
  const result = await providers["ollama-cloud-verifier"].complete(job);
  assert.equal(result.model, "verifier-custom");
  assert.equal(t.calls.length, 1);
  assert.match((await providers["ollama-cloud-verifier"].listModels())[0]!.label, /access unverified/);
});

test("HTTP and transport errors cannot leak secrets or source text through fallback logs", async () => {
  for (const t of [fakeTransport({ status: 401, body: { key: "test-secret", source: "private transcript" } }), failingTransport("Authorization: Bearer test-secret; private transcript")]) {
    const records: unknown[] = [];
    await assert.rejects(complete("answer", job, {
      chains: { answer: ["ollama-cloud", "ollama-cloud-verifier"] },
      providers: createOllamaCloudProviders(t, { apiKey: "test-secret" }),
      tenantId: "tenant-a", write: async entry => { records.push(entry); },
    }), (error: unknown) => {
      assert.ok(error instanceof AllProvidersFailedError);
      assert.doesNotMatch(error.message, /test-secret|private transcript/);
      assert.doesNotMatch(JSON.stringify(records), /test-secret|private transcript/);
      return true;
    });
  }
});

test("cloud structured output is prompt guidance only; sampling options preserved, tools refused", async () => {
  const t = fakeTransport(ok);
  const p = new OllamaCloudProvider(t, { apiKey: "test-key" });
  await p.complete({ ...job, schema: { type: "object" }, structured: { options: { num_predict: 300 }, think: "low" } } as Parameters<typeof p.complete>[0]);
  const body = t.calls[0]!.body as Record<string, unknown>;
  assert.equal(body.format, undefined);
  assert.deepEqual(body.options, { num_predict: 300 });
  assert.equal(body.think, "low");
  assert.equal(p.capabilities.nativeStructuredOutput, false);
  assert.match((body.messages as { content: string }[])[0]!.content, /not a server-enforced schema/);
  await assert.rejects(p.complete({ ...job, tools: [{}] }), /does not support tool/);
  assert.equal(t.calls.length, 1);
});

test("malformed content or token usage cannot silently succeed with invented zero counts", async () => {
  for (const body of [null, {}, { ...ok.body, message: { content: "" } }, { ...ok.body, prompt_eval_count: undefined }, { ...ok.body, eval_count: -1 }, { ...ok.body, eval_count: 1.2 }]) {
    await assert.rejects(new OllamaCloudProvider(fakeTransport({ status: 200, body }), { apiKey: "test-key" }).complete(job), /invalid content\/usage/);
  }
});

test("cloud deadline aborts the request even when transport never resolves", async () => {
  let signal: AbortSignal | undefined;
  const t: Transport = async request => { signal = request.signal; return new Promise(() => {}); };
  await assert.rejects(new OllamaCloudProvider(t, { apiKey: "test-key", timeoutMs: 5 }).complete(job), /timed out/);
  assert.equal(signal?.aborted, true);
});

test("HTTP 429 is retried a bounded number of times; 5xx, other statuses and exhausted retries still fail", async () => {
  const limited = { status: 429, body: {} };
  const t = fakeTransport(limited, limited, ok);
  const result = await new OllamaCloudProvider(t, { apiKey: "test-key", retryDelaysMs: [0, 0] }).complete(job);
  assert.equal(result.text, "source-backed answer");
  assert.equal(t.calls.length, 3);
  const stuck = fakeTransport(limited);
  await assert.rejects(new OllamaCloudProvider(stuck, { apiKey: "test-key", retryDelaysMs: [0, 0] }).complete(job), /API error HTTP 429/);
  assert.equal(stuck.calls.length, 3);
  const denied = fakeTransport({ status: 401, body: {} }, ok);
  await assert.rejects(new OllamaCloudProvider(denied, { apiKey: "test-key", retryDelaysMs: [0, 0] }).complete(job), /HTTP 401/);
  assert.equal(denied.calls.length, 1);
  const down = fakeTransport({ status: 503, body: {} }, ok);
  await assert.rejects(new OllamaCloudProvider(down, { apiKey: "test-key", retryDelaysMs: [0, 0] }).complete(job), /HTTP 503/);
  assert.equal(down.calls.length, 1);
  const off = fakeTransport(limited, ok);
  await assert.rejects(new OllamaCloudProvider(off, { apiKey: "test-key", retryDelaysMs: [] }).complete(job), /HTTP 429/);
  assert.equal(off.calls.length, 1);
});
