import { test } from "node:test";
import assert from "node:assert/strict";
import type { TraceRecord } from "../trace.js";
import { createLangfuseSink, langfuseSinkFromEnv, selectsLangfuse, type FetchFn, type LangfuseSinkOptions } from "./sink.js";
import { resolveEnvSink } from "../trace-registry.js";
import { noopSink } from "../trace.js";

const PUB = "pk-lf-PUBLICKEY-1111";
const SEC = "sk-lf-SECRETKEY-2222";
const BASE = "https://lf.example.com";
const rec = (o: Partial<TraceRecord> = {}): TraceRecord => ({
  operation: "complete", jobKind: "extract", provider: "gemini", model: "gemini-3.8-flash", startedAtMs: 1_760_000_000_000,
  latencyMs: 10, inputChars: 5, outputChars: 5, inputTokens: 1, outputTokens: 2, costUsd: 0.001, retries: null,
  outcome: "ok", errorClass: null, correlationId: "run-1", tenantId: "t-1", ...o,
});

interface Call { url: string; init: Record<string, any> }
/** Timers with ms < 1000 (backoff) fire for real on the next tick; larger ones (timeout, flush) are manual. */
function clock() {
  const live = new Set<{ fn: () => void; ms: number }>();
  const delays: number[] = [];
  return {
    live, delays,
    setTimer: (fn: () => void, ms: number) => {
      const h = { fn, ms };
      live.add(h);
      if (ms < 1000) { delays.push(ms); setImmediate(() => { if (live.delete(h)) fn(); }); }
      return h;
    },
    clearTimer: (h: unknown) => void live.delete(h as { fn: () => void; ms: number }),
    fire: (ms: number) => { for (const h of [...live]) if (h.ms === ms && live.delete(h)) h.fn(); },
  };
}
function make(fetchImpl: FetchFn, extra: Partial<LangfuseSinkOptions> = {}) {
  const c = clock();
  const errors: string[] = [];
  const sink = createLangfuseSink({
    fetch: fetchImpl, baseUrl: BASE, publicKey: PUB, secretKey: SEC, backoffMs: 10, timeoutMs: 60_000, flushTimeoutMs: 30_000,
    setTimer: c.setTimer, clearTimer: c.clearTimer, genId: (() => { let i = 0; return () => `g${++i}`; })(),
    onError: (e) => errors.push(e), ...extra,
  });
  return { sink, c, errors };
}
const recorder = (status: number | (() => number) = 200) => {
  const calls: Call[] = [];
  const f: FetchFn = async (url, init) => { calls.push({ url, init }); return { status: typeof status === "function" ? status() : status }; };
  return { calls, f };
};

test("sends one POST to <base>/api/public/ingestion with Basic auth; keys only in the header", async () => {
  const { calls, f } = recorder();
  const { sink, c } = make(f);
  sink.record(rec());
  await sink.flush();
  assert.equal(calls.length, 1);
  const { url, init } = calls[0]!;
  assert.equal(url, `${BASE}/api/public/ingestion`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, `Basic ${Buffer.from(`${PUB}:${SEC}`).toString("base64")}`);
  assert.equal(init.redirect, "manual");
  assert.ok(!url.includes(PUB) && !url.includes(SEC) && !url.includes("pk-lf") );
  assert.ok(!String(init.body).includes(PUB) && !String(init.body).includes(SEC));
  assert.ok(!JSON.stringify(init.headers).includes(SEC));
  assert.equal(sink.stats.sent, 1);
  await sink.close();
  assert.equal(c.live.size, 0);
});

test("batching: a synchronous burst goes out in batches of at most batchSize", async () => {
  const { calls, f } = recorder();
  const { sink } = make(f, { batchSize: 3 });
  for (let i = 0; i < 7; i++) sink.record(rec());
  await sink.flush();
  const sizes = calls.map((x) => JSON.parse(x.init.body).batch.length / 2);
  assert.deepEqual(sizes, [3, 3, 1]);
  await sink.close();
});

test("credentials never appear in errors, error-callback codes or warnings", async () => {
  const thrown: string[] = [];
  const f: FetchFn = async (_u, init) => { throw new Error(`boom ${String(init.headers.authorization)} ${SEC}`); };
  const { sink, errors } = make(f, { maxRetries: 1 });
  sink.record(rec());
  await sink.flush();
  thrown.push(...errors);
  assert.deepEqual(errors.filter((e) => e !== "network"), []);
  assert.ok(!JSON.stringify(thrown).includes(SEC) && !JSON.stringify(thrown).includes(PUB));
  assert.throws(() => createLangfuseSink({ fetch: f, baseUrl: "https://u:pw@x.com", publicKey: PUB, secretKey: SEC }), (e: Error) => !/pw|pk-lf|sk-lf/.test(e.message));
  assert.throws(() => createLangfuseSink({ fetch: f, baseUrl: BASE, publicKey: "", secretKey: SEC }), (e: Error) => !e.message.includes(SEC));
  await sink.close();
});

test("construction refuses a bad base URL (remote http, userinfo, query, non-URL)", () => {
  const { f } = recorder();
  for (const baseUrl of ["http://lf.example.com", "https://a:b@lf.example.com", "https://lf.example.com?k=v", "nope"]) {
    assert.throws(() => createLangfuseSink({ fetch: f, baseUrl, publicKey: PUB, secretKey: SEC }), /invalid Langfuse base URL/);
  }
  assert.doesNotThrow(() => createLangfuseSink({ fetch: f, baseUrl: "http://localhost:3000", publicKey: PUB, secretKey: SEC }));
});

test("redirect is a failure and is not followed (one call, no retry)", async () => {
  for (const r of [{ status: 302 }, { status: 307 }, { status: 0, type: "opaqueredirect" }]) {
    const calls: Call[] = [];
    const f: FetchFn = async (url, init) => { calls.push({ url, init }); return r; };
    const { sink, errors } = make(f);
    sink.record(rec());
    await sink.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.init.redirect, "manual");
    assert.deepEqual(errors, ["redirect"]);
    assert.equal(sink.stats.dropped, 1);
    await sink.close();
  }
});

test("4xx is not retried", async () => {
  for (const st of [400, 401, 403, 404, 429]) {
    const { calls, f } = recorder(st);
    const { sink, c } = make(f);
    sink.record(rec());
    await sink.flush();
    assert.equal(calls.length, 1, `status ${st}`);
    assert.deepEqual(c.delays, []);
    assert.equal(sink.stats.failures, 1);
    await sink.close();
  }
});

test("5xx is retried at most maxRetries times with exponential backoff, then dropped", async () => {
  const { calls, f } = recorder(503);
  const { sink, c, errors } = make(f, { maxRetries: 2 });
  sink.record(rec());
  await sink.flush();
  assert.equal(calls.length, 3);
  assert.deepEqual(c.delays, [10, 20]);
  assert.equal(sink.stats.retries, 2);
  assert.equal(sink.stats.dropped, 1);
  assert.ok(errors.every((e) => e === "http_503"));
  await sink.close();
});

test("network error then success: retried once, delivered", async () => {
  let n = 0;
  const f: FetchFn = async () => { if (n++ === 0) throw new Error("ECONNRESET"); return { status: 200 }; };
  const { sink } = make(f);
  sink.record(rec());
  await sink.flush();
  assert.equal(n, 2);
  assert.equal(sink.stats.sent, 1);
  await sink.close();
});

test("timeout aborts the request (signal aborted) and counts as a retryable failure", async () => {
  const signals: AbortSignal[] = [];
  const f: FetchFn = (_u, init) => { signals.push(init.signal as AbortSignal); return new Promise(() => undefined); };
  const { sink, c, errors } = make(f, { maxRetries: 0 });
  sink.record(rec());
  await new Promise((r) => setImmediate(r));
  c.fire(60_000);
  await sink.flush();
  assert.equal(signals.length, 1);
  assert.equal(signals[0]!.aborted, true);
  assert.deepEqual(errors, ["timeout"]);
  assert.equal(sink.stats.dropped, 1);
  await sink.close();
  assert.equal(c.live.size, 0);
});

test("permanently failing endpoint, 100,000 emits: queue bounded, drops counted, memory bounded", async () => {
  const f: FetchFn = async () => { throw new Error("down"); };
  const { sink, errors } = make(f, { maxPending: 1000, maxRetries: 0 });
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100_000; i++) sink.record(rec());
  assert.ok(sink.stats.pending <= 1000);
  assert.equal(sink.stats.dropped, 99_000);
  assert.ok(errors.includes("queue_full"));
  await sink.flush();
  assert.equal(sink.stats.pending, 0);
  assert.equal(sink.stats.dropped, 100_000);
  const growthMiB = (process.memoryUsage().heapUsed - before) / 1048576;
  assert.ok(growthMiB < 32, `heap grew ${growthMiB.toFixed(1)} MiB`);
  await sink.close();
});

test("record() never throws or returns a promise: failing fetch, throwing fetch, throwing onError, hostile record", async () => {
  const f: FetchFn = () => { throw new Error("sync boom"); };
  const { sink } = make(f, { onError: () => { throw new Error("cb boom"); } });
  const r = sink.record(rec());
  assert.equal(r, undefined);
  assert.doesNotThrow(() => sink.record(null as never));
  assert.doesNotThrow(() => sink.record(new Proxy(rec(), { get() { throw new Error("x"); } })));
  await sink.flush();
  await sink.close();
  assert.doesNotThrow(() => sink.record(rec())); // after close: dropped and counted
});

test("record() after earlier delivery failures still never throws", async () => {
  const { sink } = make(async () => ({ status: 500 }), { maxRetries: 0 });
  sink.record(rec());
  await sink.flush();
  assert.equal(sink.stats.failures, 1);
  assert.doesNotThrow(() => sink.record(rec()));
  await sink.flush();
  await sink.close();
});

test("flush and close are bounded with a hanging fetch; close aborts it and leaves no timer", async () => {
  const signals: AbortSignal[] = [];
  const f: FetchFn = (_u, init) => { signals.push(init.signal as AbortSignal); return new Promise(() => undefined); };
  const { sink, c } = make(f);
  sink.record(rec());
  await new Promise((r) => setImmediate(r));
  const fl = sink.flush();
  c.fire(30_000); // flushTimeoutMs elapses
  await fl; // resolves although fetch never settles
  const cl = sink.close();
  c.fire(30_000);
  await cl;
  assert.equal(signals[0]!.aborted, true);
  assert.equal(c.live.size, 0);
  assert.equal(sink.stats.pending, 0);
});

test("close during a backoff sleep wakes it, drops the batch and leaves no timer running", async () => {
  const { calls, f } = recorder(503);
  const { sink, c } = make(f, { backoffMs: 5000, maxRetries: 3 });
  sink.record(rec());
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.ok([...c.live].some((h) => h.ms === 5000), "backoff timer should be pending");
  const cl = sink.close();
  c.fire(30_000);
  await cl;
  assert.equal(c.live.size, 0);
  assert.equal(calls.length, 1);
  assert.equal(sink.stats.pending, 0);
});

test("no unhandled rejection from a rejecting fetch after the request was abandoned", async () => {
  const seen: unknown[] = [];
  const h = (e: unknown): void => void seen.push(e);
  process.on("unhandledRejection", h);
  try {
    let rej: (e: Error) => void = () => undefined;
    const f: FetchFn = () => new Promise((_, r) => { rej = r; });
    const { sink, c } = make(f, { maxRetries: 0 });
    sink.record(rec());
    await new Promise((r) => setImmediate(r));
    c.fire(60_000);
    await sink.flush();
    rej(new Error("late"));
    await sink.close();
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", h);
  }
  assert.deepEqual(seen, []);
});

test("default selection unchanged: today's env never constructs the Langfuse sink", () => {
  let lf = 0;
  let file = 0;
  const factories = { langfuse: () => { lf++; return null; }, file: () => { file++; return noopSink; } };
  const envs: Array<Record<string, string | undefined>> = [
    {}, { TELEMETRY_ENABLED: "true" }, { TELEMETRY_ENABLED: "true", TELEMETRY_TRACE_FILE: "t.jsonl" },
    { TELEMETRY_ENABLED: "false", TELEMETRY_SINK: "langfuse", LANGFUSE_BASE_URL: BASE, LANGFUSE_PUBLIC_KEY: PUB, LANGFUSE_SECRET_KEY: SEC },
    { TELEMETRY_ENABLED: "true", LANGFUSE_BASE_URL: BASE, LANGFUSE_PUBLIC_KEY: PUB, LANGFUSE_SECRET_KEY: SEC },
    { TELEMETRY_ENABLED: "true", TELEMETRY_SINK: "file" },
  ];
  for (const e of envs) resolveEnvSink(e, factories);
  assert.equal(lf, 0);
  assert.equal(file, envs.length);
  assert.equal(selectsLangfuse({ TELEMETRY_ENABLED: "true", TELEMETRY_SINK: "langfuse" }), true);
  assert.equal(selectsLangfuse({ TELEMETRY_SINK: "langfuse" }), false);
});

test("explicit setting selects the factory; a declining factory falls back to the file sink", () => {
  let lf = 0;
  const sel = { TELEMETRY_ENABLED: "true", TELEMETRY_SINK: "langfuse" };
  const made = { record() {} };
  assert.equal(resolveEnvSink(sel, { langfuse: () => { lf++; return made; }, file: () => noopSink }), made);
  assert.equal(resolveEnvSink(sel, { langfuse: () => null, file: () => noopSink }), noopSink);
  assert.equal(lf, 1);
});

test("langfuseSinkFromEnv: null (never constructed) unless selected AND configured; refuses bad URL", () => {
  const warns: string[] = [];
  const o = { fetch: (async () => ({ status: 200 })) as FetchFn, warn: (m: string) => void warns.push(m) };
  const full = { TELEMETRY_ENABLED: "true", TELEMETRY_SINK: "langfuse", LANGFUSE_BASE_URL: BASE, LANGFUSE_PUBLIC_KEY: PUB, LANGFUSE_SECRET_KEY: SEC };
  assert.equal(langfuseSinkFromEnv({}, o), null);
  assert.equal(langfuseSinkFromEnv({ ...full, TELEMETRY_ENABLED: undefined }, o), null);
  assert.equal(warns.length, 0);
  assert.equal(langfuseSinkFromEnv({ ...full, LANGFUSE_SECRET_KEY: "" }, o), null);
  assert.equal(langfuseSinkFromEnv({ ...full, LANGFUSE_BASE_URL: "http://evil.example.com" }, o), null);
  assert.equal(warns.length, 2);
  assert.ok(!warns.join("\n").includes(SEC) && !warns.join("\n").includes("evil.example.com"));
  assert.ok(langfuseSinkFromEnv(full, o));
});
