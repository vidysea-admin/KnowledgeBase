// T-049 (lane langfuse207): per-event errors in Langfuse's 207 ingestion response. Fake fetch only:
// no network, no real Langfuse. Response fixtures are built from the DOCUMENTED shape
// { successes: [{id,status}], errors: [{id,status,message,error}] }, not captured from a server.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TraceRecord } from "../trace.js";
import { createLangfuseSink, type FetchFn, type LangfuseSinkOptions } from "./sink.js";
import { MAX_RESPONSE_CHARS, MAX_RESPONSE_ENTRIES, parseIngestionResponse } from "./ingestion-response.js";
import { toLangfuseEvents } from "./payload.js";

const SECRET_TEXT = "PROMPT-TEXT-do-not-leak <script> user said hunter2";
const rec = (o: Partial<TraceRecord> = {}): TraceRecord => ({
  operation: "complete", jobKind: "extract", provider: "gemini", model: "gemini-3.8-flash", startedAtMs: 1_760_000_000_000,
  latencyMs: 10, inputChars: 5, outputChars: 5, inputTokens: 1, outputTokens: 2, costUsd: 0.001, retries: null,
  outcome: "ok", errorClass: null, correlationId: "run-1", tenantId: "t-1", ...o,
});

function clock() {
  const live = new Set<{ fn: () => void; ms: number }>();
  return {
    live,
    setTimer: (fn: () => void, ms: number) => {
      const h = { fn, ms };
      live.add(h);
      if (ms < 1000) setImmediate(() => { if (live.delete(h)) fn(); });
      return h;
    },
    clearTimer: (h: unknown) => void live.delete(h as { fn: () => void; ms: number }),
    fire: (ms: number) => { for (const h of [...live]) if (h.ms === ms && live.delete(h)) h.fn(); },
  };
}
function make(fetchImpl: FetchFn, extra: Partial<LangfuseSinkOptions> = {}) {
  const c = clock();
  const codes: string[] = [];
  const sink = createLangfuseSink({
    fetch: fetchImpl, baseUrl: "https://lf.example.com", publicKey: "pk-lf-PUB-1", secretKey: "sk-lf-SEC-2", backoffMs: 10,
    timeoutMs: 60_000, flushTimeoutMs: 30_000, setTimer: c.setTimer, clearTimer: c.clearTimer,
    genId: (() => { let i = 0; return () => `g${++i}`; })(), onError: (e) => codes.push(e), ...extra,
  });
  return { sink, c, codes };
}

type Ev = { id: string; type: string; body: { id: string; traceId?: string } };
/** A fake Langfuse: `decide(events)` returns the ids to fail / omit; everything else succeeds. */
function server(status: number, decide: (evs: Ev[]) => { fail?: Set<string>; drop?: Set<string>; extraErrors?: unknown[] }) {
  const calls: Ev[][] = [];
  const f: FetchFn = async (_u, init) => {
    const evs = (JSON.parse(String(init.body)) as { batch: Ev[] }).batch;
    calls.push(evs);
    const d = decide(evs);
    const successes = evs.filter((e) => !d.fail?.has(e.id) && !d.drop?.has(e.id)).map((e) => ({ id: e.id, status: 201 }));
    const errors = [
      ...evs.filter((e) => d.fail?.has(e.id)).map((e) => ({ id: e.id, status: 400, message: "Invalid request data", error: SECRET_TEXT })),
      ...(d.extraErrors ?? []),
    ];
    return { status, text: async () => JSON.stringify({ successes, errors }) };
  };
  return { f, calls };
}
const send = async (m: ReturnType<typeof make>, n: number) => {
  for (let i = 0; i < n; i++) m.sink.record(rec({ correlationId: `run-${i}` }));
  await m.sink.flush();
};
const nothingLeaks = (codes: string[]) => {
  for (const c of codes) assert.match(c, /^[a-z0-9_]+$/, `code ${c}`);
  const all = codes.join("|");
  assert.ok(!all.includes("hunter2") && !all.includes("PROMPT") && !all.includes("Invalid") && !/g\d/.test(all));
};

test("200 with an all-successes body: every record counted sent, no errors", async () => {
  const { f, calls } = server(200, () => ({}));
  const m = make(f);
  await send(m, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...m.sink.stats }, { sent: 3, failures: 0, dropped: 0, pending: 0, retries: 0, eventErrors: 0, rejected: 0, unconfirmed: 0 });
  assert.deepEqual(m.codes, []);
  await m.sink.close();
});

test("2xx with no readable body (status only) is still trusted, as before", async () => {
  const m = make(async () => ({ status: 200 }));
  await send(m, 2);
  assert.equal(m.sink.stats.sent, 2);
  assert.equal(m.sink.stats.failures, 0);
  await m.sink.close();
});

test("207 partial: only the rejected records are dropped, not retried, not reported as success; no payload text leaks", async () => {
  const { f, calls } = server(207, (evs) => ({ fail: new Set([evs[3]!.id]) })); // record #2's trace event
  const m = make(f);
  await send(m, 3);
  assert.equal(calls.length, 1, "no retry of a per-event error");
  const s = m.sink.stats;
  assert.equal(s.sent, 2);
  assert.equal(s.rejected, 1);
  assert.equal(s.eventErrors, 1);
  assert.equal(s.dropped, 1);
  assert.equal(s.failures, 1, "a partial 207 is a failed batch, never total success");
  assert.equal(s.unconfirmed, 0);
  assert.equal(s.pending, 0);
  assert.deepEqual(m.codes, ["event_rejected", "event_http_400"]);
  nothingLeaks(m.codes);
  await m.sink.close();
});

test("207 where the failing event is the generation (second event) of a record also drops that record", async () => {
  const { f } = server(207, (evs) => ({ fail: new Set([evs[1]!.id]) }));
  const m = make(f);
  await send(m, 2);
  assert.equal(m.sink.stats.sent, 1);
  assert.equal(m.sink.stats.rejected, 1);
  await m.sink.close();
});

test("207 where both events of a record fail counts two event errors but one rejected record", async () => {
  const { f } = server(207, (evs) => ({ fail: new Set([evs[0]!.id, evs[1]!.id]) }));
  const m = make(f);
  await send(m, 2);
  assert.equal(m.sink.stats.eventErrors, 2);
  assert.equal(m.sink.stats.rejected, 1);
  assert.equal(m.sink.stats.sent, 1);
  await m.sink.close();
});

test("207 all events fail: nothing sent, everything dropped and counted", async () => {
  const { f, calls } = server(207, (evs) => ({ fail: new Set(evs.map((e) => e.id)) }));
  const m = make(f);
  await send(m, 3);
  const s = m.sink.stats;
  assert.equal(calls.length, 1);
  assert.deepEqual({ sent: s.sent, rejected: s.rejected, dropped: s.dropped, eventErrors: s.eventErrors, failures: s.failures }, { sent: 0, rejected: 3, dropped: 3, eventErrors: 6, failures: 1 });
  nothingLeaks(m.codes);
  await m.sink.close();
});

test("200 (not 207) carrying a non-empty errors array is honoured the same way", async () => {
  const { f } = server(200, (evs) => ({ fail: new Set([evs[0]!.id]) }));
  const m = make(f);
  await send(m, 2);
  assert.equal(m.sink.stats.sent, 1);
  assert.equal(m.sink.stats.rejected, 1);
  await m.sink.close();
});

test("207 whose body is unusable is NEVER success: unconfirmed, dropped, not retried", async () => {
  const bodies: Array<[string, () => Promise<string>]> = [
    ["not json", async () => "<html>gateway</html>"],
    ["empty", async () => ""],
    ["json scalar", async () => "42"],
    ["json array", async () => "[]"],
    ["object without the arrays", async () => JSON.stringify({ ok: true })],
    ["arrays of wrong type", async () => JSON.stringify({ successes: "x", errors: {} })],
    ["text() rejects", async () => { throw new Error(SECRET_TEXT); }],
    ["text() returns non-string", (async () => 7) as unknown as () => Promise<string>],
    ["over the size cap", async () => " ".repeat(MAX_RESPONSE_CHARS + 1)],
  ];
  for (const [name, text] of bodies) {
    let calls = 0;
    const m = make(async () => { calls++; return { status: 207, text }; });
    await send(m, 2);
    const s = m.sink.stats;
    assert.equal(calls, 1, name);
    assert.deepEqual({ sent: s.sent, dropped: s.dropped, unconfirmed: s.unconfirmed, failures: s.failures }, { sent: 0, dropped: 2, unconfirmed: 2, failures: 1 }, name);
    assert.deepEqual(m.codes, ["malformed_207"], name);
    await m.sink.close();
  }
});

test("207 with no text() at all (nothing to confirm with) is unconfirmed, not success", async () => {
  const m = make(async () => ({ status: 207 }));
  await send(m, 1);
  assert.equal(m.sink.stats.sent, 0);
  assert.equal(m.sink.stats.unconfirmed, 1);
  await m.sink.close();
});

test("207 body that omits an event from both lists leaves that record unconfirmed", async () => {
  const { f } = server(207, (evs) => ({ drop: new Set([evs[2]!.id]) }));
  const m = make(f);
  await send(m, 2);
  assert.equal(m.sink.stats.sent, 1);
  assert.equal(m.sink.stats.unconfirmed, 1);
  assert.equal(m.sink.stats.failures, 1);
  assert.deepEqual(m.codes, ["event_unconfirmed"]);
  await m.sink.close();
});

test("207 with errors whose ids match nothing we sent: counted and flagged, records confirmed by successes stay sent", async () => {
  const { f } = server(207, () => ({ extraErrors: [{ id: "zzz", status: 500, message: SECRET_TEXT }, { status: 400 }, "junk", null] }));
  const m = make(f);
  await send(m, 2);
  assert.equal(m.sink.stats.sent, 2);
  assert.equal(m.sink.stats.eventErrors, 4);
  assert.equal(m.sink.stats.failures, 1);
  assert.deepEqual(m.codes, ["event_rejected", "event_http_500", "event_http_400"]);
  nothingLeaks(m.codes);
  await m.sink.close();
});

test("whole-batch 4xx/5xx are unchanged: 400 final, 503 retried twice, bodies never read", async () => {
  let read = 0;
  const f400: FetchFn = async () => ({ status: 400, text: async () => { read++; return "{}"; } });
  let n503 = 0;
  const f503: FetchFn = async () => { n503++; return { status: 503, text: async () => { read++; return "{}"; } }; };
  const a = make(f400);
  await send(a, 2);
  assert.deepEqual([a.sink.stats.sent, a.sink.stats.dropped, a.sink.stats.failures, a.sink.stats.retries, a.sink.stats.eventErrors], [0, 2, 1, 0, 0]);
  assert.deepEqual(a.codes, ["http_400"]);
  const b = make(f503);
  await send(b, 2);
  assert.equal(n503, 3);
  assert.deepEqual([b.sink.stats.sent, b.sink.stats.dropped, b.sink.stats.retries], [0, 2, 2]);
  assert.equal(read, 0);
  await a.sink.close();
  await b.sink.close();
});

test("503 then a partial 207: the retry's response is the one accounted, once", async () => {
  let n = 0;
  const base = server(207, (evs) => ({ fail: new Set([evs[0]!.id]) }));
  const f: FetchFn = async (u, i) => (n++ === 0 ? { status: 503 } : base.f(u, i));
  const m = make(f);
  await send(m, 2);
  assert.equal(n, 2);
  assert.deepEqual([m.sink.stats.sent, m.sink.stats.rejected, m.sink.stats.eventErrors, m.sink.stats.failures, m.sink.stats.retries], [1, 1, 1, 1, 1]);
  await m.sink.close();
});

test("a 207 body that never arrives is bounded by the request timeout and counted unconfirmed", async () => {
  const m = make(async () => ({ status: 207, text: () => new Promise<string>(() => undefined) }));
  m.sink.record(rec());
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  m.c.fire(60_000);
  await m.sink.flush();
  assert.equal(m.sink.stats.sent, 0);
  assert.equal(m.sink.stats.unconfirmed, 1);
  await m.sink.close();
  assert.equal(m.c.live.size, 0);
});

test("the sink never throws into the AI call path: hostile responses, throwing onError, record() returns undefined", async () => {
  const shapes: FetchFn[] = [
    async () => ({ status: 207, text: () => { throw new Error("sync"); } }),
    async () => ({ status: 207, text: async () => JSON.stringify({ successes: [{ id: "a" }], errors: [] }) }),
    async () => ({ status: 207, text: async () => JSON.stringify({ successes: [], errors: Array.from({ length: MAX_RESPONSE_ENTRIES * 2 }, () => ({ id: "a", status: 99999 })) }) }),
    async () => { throw new Error(SECRET_TEXT); },
    async () => null as never,
  ];
  for (const f of shapes) {
    const m = make(f, { maxRetries: 0, onError: () => { throw new Error("cb"); } });
    for (let i = 0; i < 3; i++) assert.equal(m.sink.record(rec()), undefined);
    await assert.doesNotReject(m.sink.flush());
    await assert.doesNotReject(m.sink.close());
    assert.equal(m.sink.stats.pending, 0);
  }
});

test("parseIngestionResponse: shape, caps, and only id/status are ever read", () => {
  assert.equal(parseIngestionResponse(undefined), null);
  assert.equal(parseIngestionResponse("{"), null);
  assert.equal(parseIngestionResponse("{}"), null);
  const r = parseIngestionResponse(JSON.stringify({ successes: [{ id: "a", status: 201 }], errors: [{ id: "b", status: 600, message: "m", error: "e" }, { id: 5, status: "x" }, null] }))!;
  assert.deepEqual(r.successes, [{ id: "a", status: 201 }]);
  assert.deepEqual(r.errors, [{ id: "b", status: null }, { id: null, status: null }, { id: null, status: null }]);
  assert.ok(JSON.stringify(r).indexOf("message") < 0);
  const big = parseIngestionResponse(JSON.stringify({ errors: Array.from({ length: MAX_RESPONSE_ENTRIES + 50 }, () => ({ id: "a" })) }))!;
  assert.equal(big.errors.length, MAX_RESPONSE_ENTRIES);
  assert.equal(big.hasSuccesses, false);
});

// --- Payload shape vs. Langfuse's PUBLIC ingestion API, from documentation (no pinned schema or fixture
// exists in this repo; nothing here was checked against a live server). Documented IngestionEvent:
// { id, timestamp (ISO-8601), type, body }, batch in { batch: [...] }; trace-create body (TraceBody),
// generation-create body (CreateGenerationBody: traceId, name, startTime, endTime, model, level in
// DEBUG|DEFAULT|WARNING|ERROR, statusMessage, usageDetails / costDetails as string->number maps, metadata).
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DOC_KEYS: Record<string, Set<string>> = {
  "trace-create": new Set(["id", "name", "timestamp", "sessionId", "metadata", "userId", "input", "output", "release", "version", "tags", "environment", "public"]),
  "generation-create": new Set(["id", "traceId", "name", "startTime", "endTime", "model", "level", "statusMessage", "usageDetails", "costDetails", "metadata", "input", "output", "completionStartTime", "modelParameters", "parentObservationId", "version", "promptName", "promptVersion", "environment"]),
  "span-create": new Set(["id", "traceId", "name", "startTime", "endTime", "level", "statusMessage", "metadata", "input", "output", "parentObservationId", "version", "environment"]),
};
test("emitted events conform to the documented trace-create / generation-create shapes (documentation-derived)", () => {
  let i = 0;
  for (const r of [rec(), rec({ outcome: "error", errorClass: "ProviderTimeout", inputTokens: null, costUsd: null }), rec({ operation: "embed", model: null, tenantId: null, correlationId: null })]) {
    const evs = toLangfuseEvents(r, () => `id${++i}`);
    assert.deepEqual(evs.map((e) => e.type), ["trace-create", "generation-create"]);
    const [t, g] = evs as [any, any];
    for (const e of evs) {
      assert.deepEqual(Object.keys(e).sort(), ["body", "id", "timestamp", "type"]);
      assert.match(e.timestamp, ISO);
      for (const k of Object.keys(e.body)) assert.ok(DOC_KEYS[e.type]!.has(k), `${e.type}.${k} not a documented key`);
    }
    assert.equal(g.body.traceId, t.body.id);
    assert.ok(["DEBUG", "DEFAULT", "WARNING", "ERROR"].includes(g.body.level));
    assert.match(g.body.startTime, ISO);
    assert.match(g.body.endTime, ISO);
    for (const m of [g.body.usageDetails, g.body.costDetails]) if (m) for (const v of Object.values(m)) assert.equal(typeof v, "number");
    assert.equal(new Set([t.id, g.id, t.body.id, g.body.id]).size, 4, "event ids and body ids distinct");
  }
});

test("a documented-shape response naming trace-create, generation-create and span-create event ids parses (ids are opaque)", () => {
  const doc = { successes: [{ id: "ev-trace", status: 201 }, { id: "ev-gen", status: 201 }], errors: [{ id: "ev-span", status: 400, message: "Invalid request data", error: "..." }] };
  const r = parseIngestionResponse(JSON.stringify(doc))!;
  assert.equal(r.successes.length, 2);
  assert.deepEqual(r.errors, [{ id: "ev-span", status: 400 }]);
  assert.ok(DOC_KEYS["span-create"]);
});
