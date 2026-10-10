import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteResult, EmbedResult, Job, Provider } from "./provider.js";
import {
  isTelemetryEnabled, memorySink, noopSink, traceProvider, withTraceContext,
  type TraceSink, type TraceStats,
} from "./trace.js";

const ON = { TELEMETRY_ENABLED: "true" };
const SENTINEL = "ZQ9-SENTINEL-7f3a1c";

function result(over: Partial<CompleteResult> = {}): CompleteResult {
  return { text: "hello", usage: { inputTokens: 11, outputTokens: 5 }, provider: "fake", model: "fake-1", costUsd: 0.002, ...over };
}
function fake(impl: (job: Job) => Promise<CompleteResult>, withEmbed = false): Provider {
  const p: Provider = { name: "fake", complete: impl, listModels: async () => [{ id: "fake-1", label: "Fake" }] };
  if (withEmbed) {
    p.embed = async (j): Promise<EmbedResult> => ({ vectors: j.texts.map(() => [0, 1]), dims: 2, provider: "fake", model: "emb-1" });
  }
  return p;
}
const job = (content = "hi", kind = "extract"): Job => ({ kind, messages: [{ role: "user", content }] });

test("pass-through: same result object, listModels and embed preserved", async () => {
  const r = result();
  const sink = memorySink();
  const p = traceProvider(fake(async () => r, true), { sink, env: ON });
  assert.equal(await p.complete(job()), r);
  assert.deepEqual(await p.listModels(), [{ id: "fake-1", label: "Fake" }]);
  assert.equal(p.name, "fake");
  assert.equal((await p.embed!({ kind: "e", texts: ["a", "bb"] })).dims, 2);
  assert.deepEqual(sink.records.map((x) => x.operation), ["complete", "embed"]);
  assert.equal(traceProvider(fake(async () => r), { sink, env: ON }).embed, undefined);
});

test("pass-through: the very same error object is thrown and recorded by class only", async () => {
  class QuotaError extends Error {
    retryCount = 2;
  }
  const err = new QuotaError("boom " + SENTINEL);
  const sink = memorySink();
  const p = traceProvider(fake(async () => { throw err; }), { sink, env: ON, model: "fallback-m" });
  await assert.rejects(p.complete(job()), (e) => e === err);
  const [rec] = sink.records;
  assert.equal(rec!.outcome, "error");
  assert.equal(rec!.errorClass, "QuotaError");
  assert.equal(rec!.retries, 2);
  assert.equal(rec!.model, "fallback-m");
  assert.ok(!JSON.stringify(sink.records).includes(SENTINEL));
});

test("a synchronous throw from the provider keeps its identity", async () => {
  const err = new TypeError("sync");
  const p = traceProvider(fake((() => { throw err; }) as never), { sink: memorySink(), env: ON });
  await assert.rejects(p.complete(job()), (e) => e === err);
});

test("a malformed job reaches the provider and its error is unchanged", async () => {
  const err = new Error("provider saw it");
  const p = traceProvider(fake(async () => { throw err; }), { sink: memorySink(), env: ON });
  await assert.rejects(p.complete({ kind: "k" } as unknown as Job), (e) => e === err);
});

test("latency, tokens, cost, model and sizes are recorded", async () => {
  let t = 1000;
  const ticks = [1000, 1250];
  const sink = memorySink();
  const p = traceProvider(fake(async () => result({ text: "12345678" })), { sink, env: ON, now: () => ticks.shift() ?? (t += 1) });
  await p.complete(job("abcd"));
  const [rec] = sink.records;
  assert.equal(rec!.startedAtMs, 1000);
  assert.equal(rec!.latencyMs, 250);
  assert.equal(rec!.inputTokens, 11);
  assert.equal(rec!.outputTokens, 5);
  assert.equal(rec!.costUsd, 0.002);
  assert.equal(rec!.model, "fake-1");
  assert.equal(rec!.inputChars, 4);
  assert.equal(rec!.outputChars, 8);
  assert.equal(rec!.jobKind, "extract");
  assert.equal(rec!.retries, null);
  assert.equal(rec!.outcome, "ok");
});

test("privacy: a sentinel in prompt, response, texts and error never reaches the sink", async () => {
  const sink = memorySink();
  const p = traceProvider(
    fake(async (j) => (j.kind === "bad" ? Promise.reject(new Error(SENTINEL)) : result({ text: `out ${SENTINEL}` })), true),
    { sink, env: ON },
  );
  await withTraceContext({ correlationId: "c-1", tenantId: "t-1" }, async () => {
    await p.complete(job(`prompt ${SENTINEL}`));
    await p.complete(job(`prompt ${SENTINEL}`, "bad")).catch(() => {});
    await p.embed!({ kind: "e", texts: [SENTINEL] });
  });
  assert.equal(sink.records.length, 3);
  const dump = JSON.stringify(sink.records);
  assert.ok(!dump.includes(SENTINEL), "sentinel leaked into trace");
  assert.ok(!/prompt|out |authorization|api[-_]?key/i.test(dump.replace(/"(jobKind|inputChars|outputChars)"/g, "")));
});

test("disabled guard returns the original provider object", () => {
  const inner = fake(async () => result());
  assert.equal(traceProvider(inner, { sink: memorySink(), env: {} }), inner);
  assert.equal(traceProvider(inner, { sink: memorySink(), env: { TELEMETRY_ENABLED: "false" } }), inner);
  assert.equal(isTelemetryEnabled({}), false);
  assert.equal(isTelemetryEnabled({ TELEMETRY_ENABLED: " TRUE " }), true);
  assert.notEqual(traceProvider(inner, { sink: noopSink, env: ON }), inner);
});

test("throwing and rejecting sinks never break the call and are counted", async () => {
  const stats: TraceStats = { sinkFailures: 0 };
  const r = result();
  const bad: TraceSink[] = [
    { record() { throw new Error("sync sink"); } },
    { record: () => Promise.reject(new Error("async sink")) },
    { record: () => new Promise<void>(() => {}) }, // never settles: must not delay the call
  ];
  for (const sink of bad) {
    const p = traceProvider(fake(async () => r), { sink, env: ON, stats });
    assert.equal(await p.complete(job()), r);
  }
  await new Promise((res) => setImmediate(res));
  assert.equal(stats.sinkFailures, 2);
  const err = new Error("real");
  const p = traceProvider(fake(async () => { throw err; }), { sink: bad[0]!, env: ON, stats });
  await assert.rejects(p.complete(job()), (e) => e === err);
});

test("concurrent calls keep their own correlation and tenant ids", async () => {
  const sink = memorySink();
  const p = traceProvider(
    fake(async (j) => { await new Promise((r) => setTimeout(r, j.kind === "slow" ? 20 : 1)); return result(); }),
    { sink, env: ON },
  );
  await Promise.all([
    withTraceContext({ correlationId: "A", tenantId: "tA" }, () => p.complete(job("x", "slow"))),
    withTraceContext({ correlationId: "B" }, () => p.complete(job("x", "fast"))),
    p.complete(job("x", "none")),
  ]);
  const by = Object.fromEntries(sink.records.map((r) => [r.jobKind, r]));
  assert.deepEqual([by.slow!.correlationId, by.slow!.tenantId], ["A", "tA"]);
  assert.deepEqual([by.fast!.correlationId, by.fast!.tenantId], ["B", null]);
  assert.deepEqual([by.none!.correlationId, by.none!.tenantId], [null, null]);
});
