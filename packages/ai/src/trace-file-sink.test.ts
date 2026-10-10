import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompleteResult, Job, Provider } from "./provider.js";
import { traceProvider, type TraceRecord } from "./trace.js";
import { fileSink, fileSinkFromEnv } from "./trace-file-sink.js";

const SENTINEL = "ZQ9-SENTINEL-file-4d2e";
const rec = (i = 0): TraceRecord => ({
  operation: "complete", jobKind: "extract", provider: "p", model: "m", startedAtMs: i, latencyMs: 1,
  inputChars: 3, outputChars: 4, inputTokens: 1, outputTokens: 2, costUsd: 0, retries: null,
  outcome: "ok", errorClass: null, correlationId: "c", tenantId: "t",
});
const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), "lkb-trace-"));

test("appends one JSON line per record, creating missing directories", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "a", "b", "t.jsonl");
    const s = fileSink({ path });
    s.record(rec(1));
    s.record(rec(2));
    await s.flush();
    const lines = (await readFile(path, "utf8")).split("\n");
    assert.equal(lines.pop(), "");
    assert.deepEqual(lines.map((l) => (JSON.parse(l) as TraceRecord).startedAtMs), [1, 2]);
    assert.equal(s.stats.written, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("sentinel: prompt, completion and error message never reach the file", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "t.jsonl");
    const s = fileSink({ path });
    const ok: Provider = {
      name: "fake", listModels: async () => [],
      complete: async (): Promise<CompleteResult> =>
        ({ text: `out ${SENTINEL}`, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "m", costUsd: 0 }),
    };
    const bad: Provider = { ...ok, complete: async () => { throw new Error(`boom ${SENTINEL}`); } };
    const job: Job = { kind: "extract", messages: [{ role: "user", content: `in ${SENTINEL}` }] };
    const env = { TELEMETRY_ENABLED: "true" };
    await traceProvider(ok, { sink: s, env }).complete(job);
    await assert.rejects(traceProvider(bad, { sink: s, env }).complete(job));
    await s.flush();
    const text = await readFile(path, "utf8");
    assert.equal(text.trim().split("\n").length, 2);
    assert.ok(!text.includes(SENTINEL));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("size guard: stops past maxBytes, counts what is already in the file, warns once", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "t.jsonl");
    const one = Buffer.byteLength(JSON.stringify(rec()) + "\n");
    await writeFile(path, "");
    const warns: string[] = [];
    const s = fileSink({ path, maxBytes: one * 2 + 5, warn: (m) => warns.push(m) });
    for (let i = 0; i < 6; i++) s.record(rec(i));
    await s.flush();
    assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 2);
    assert.equal(s.stats.written, 2);
    assert.equal(s.stats.dropped, 4);
    assert.equal(s.stats.stoppedBySize, true);
    assert.equal(warns.length, 1);
    const pre = fileSink({ path, maxBytes: one * 2 + 5, warn: (m) => warns.push(m) });
    pre.record(rec());
    await pre.flush();
    assert.equal(pre.stats.written, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("an unwritable path never throws; failures counted, warned once", async () => {
  const dir = await tmp();
  try {
    const blocker = join(dir, "file");
    await writeFile(blocker, "x");
    const warns: string[] = [];
    const s = fileSink({ path: join(blocker, "sub", "t.jsonl"), warn: (m) => warns.push(m) });
    assert.doesNotThrow(() => { for (let i = 0; i < 3; i++) s.record(rec(i)); });
    await s.flush();
    assert.equal(s.stats.failures, 3);
    assert.equal(warns.length, 1);
    const loud = fileSink({ path: join(blocker, "t.jsonl"), warn: () => { throw new Error("warner broke"); } });
    loud.record(rec());
    await assert.doesNotReject(loud.flush());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("concurrent appends from many callers produce intact lines", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "t.jsonl");
    const a = fileSink({ path });
    const b = fileSink({ path });
    await Promise.all(Array.from({ length: 200 }, async (_, i) => { (i % 2 ? a : b).record(rec(i)); }));
    await Promise.all([a.flush(), b.flush()]);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    assert.equal(lines.length, 200);
    const seen = new Set(lines.map((l) => (JSON.parse(l) as TraceRecord).startedAtMs));
    assert.equal(seen.size, 200);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fileSinkFromEnv: no path -> no-op sink and one warning; path -> real sink", async () => {
  const warns: string[] = [];
  const noop = fileSinkFromEnv({}, (m) => warns.push(m));
  noop.record(rec());
  assert.equal(warns.length, 1);
  const dir = await tmp();
  try {
    const path = join(dir, "e.jsonl");
    const s = fileSinkFromEnv({ TELEMETRY_TRACE_FILE: ` ${path} `, TELEMETRY_TRACE_MAX_BYTES: "100000" }, (m) => warns.push(m)) as ReturnType<typeof fileSink>;
    s.record(rec());
    await s.flush();
    assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
    assert.equal(warns.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
