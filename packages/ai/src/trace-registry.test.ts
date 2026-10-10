import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { CompleteResult, Job, Provider } from "./provider.js";
import { route } from "./router.js";
import { memorySink, noopSink } from "./trace.js";
import { getTraceSink, setTraceSink, withTracing } from "./trace-registry.js";

const ON = { TELEMETRY_ENABLED: "true" };
const res: CompleteResult = { text: "ok", usage: { inputTokens: 1, outputTokens: 2 }, provider: "fake", model: "m", costUsd: 0 };
const fake: Provider = { name: "fake", complete: async () => res, listModels: async () => [] };
const job: Job = { kind: "extract", messages: [{ role: "user", content: "hi" }] };

afterEach(() => {
  setTraceSink(null);
  delete process.env.TELEMETRY_ENABLED;
});

test("registry: default is the no-op sink; set replaces; null restores", () => {
  assert.equal(getTraceSink(), noopSink);
  const a = memorySink();
  setTraceSink(a);
  assert.equal(getTraceSink(), a);
  const b = memorySink();
  setTraceSink(b);
  assert.equal(getTraceSink(), b);
  setTraceSink(undefined);
  assert.equal(getTraceSink(), noopSink);
});

test("disabled: withTracing and route return the ORIGINAL provider object", () => {
  assert.equal(withTracing(fake, {}), fake);
  assert.equal(withTracing(fake, { TELEMETRY_ENABLED: "false" }), fake);
  delete process.env.TELEMETRY_ENABLED;
  const [p] = route("extract", { chains: { extract: ["fake"] }, providers: { fake } });
  assert.equal(p, fake);
});

test("enabled: route hands out a traced wrapper whose calls reach the registered sink", async () => {
  process.env.TELEMETRY_ENABLED = "true";
  const sink = memorySink();
  setTraceSink(sink);
  const [p] = route("extract", { chains: { extract: ["fake"] }, providers: { fake } });
  assert.notEqual(p, fake);
  assert.equal(await p!.complete(job), res);
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0]!.jobKind, "extract");
  assert.equal(sink.records[0]!.provider, "fake");
});

test("a sink installed AFTER wrapping still receives traces (late binding)", async () => {
  const p = withTracing(fake, ON);
  const sink = memorySink();
  setTraceSink(sink);
  await p.complete(job);
  assert.equal(sink.records.length, 1);
});

test("enabled with no sink and no TELEMETRY_TRACE_FILE: call succeeds, one stderr notice", async () => {
  const saved = process.env.TELEMETRY_TRACE_FILE;
  delete process.env.TELEMETRY_TRACE_FILE;
  const orig = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((c: string) => { lines.push(String(c)); return true; }) as never;
  try {
    const p = withTracing(fake, ON);
    await p.complete(job);
    await p.complete(job);
  } finally {
    process.stderr.write = orig;
    if (saved !== undefined) process.env.TELEMETRY_TRACE_FILE = saved;
  }
  assert.equal(lines.filter((l) => l.includes("TELEMETRY_TRACE_FILE")).length, 1);
});
