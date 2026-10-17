/**
 * T-045 wiring: POST /ingest/source over the real Express app with fakes only (in-memory tenant-scoped collections, fake
 * yt-dlp exec / downloader / STT / reader). No Mongo, no network, no yt-dlp. D-135 idempotence, D-136 tenant-scoped ids.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tenantSourceId } from "@lkb/ingest";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { buildSourceIntakeAdapters } from "./adapters.js";
import { createMongoIntakeSink, createSourceIntakeDeps, type IntakeCollections, type SourceIntakeDeps } from "./store.js";
import { buildSourceIntakeDeps } from "./wiring.js";

const WORK = "/work/media";
const ID = "dQw4w9WgXcQ";
const YT_URL = `https://www.youtube.com/watch?v=${ID}`;
const ONAIR_URL = "https://cloudonair.withgoogle.com/events/next-26-keynote";
const ZOOM_URL = "https://zoom.us/rec/share/AbCdEf123456_token";
const FILES: Record<string, Uint8Array> = {
  [`${WORK}/yt-${ID}.m4a`]: new Uint8Array([1, 2, 3]),
  [`${WORK}/cloudonair-next-26-keynote.mp4`]: new Uint8Array([4, 5, 6]),
  [`${WORK}/zoom-recording-AbCdEf123456_token.mp4`]: new Uint8Array([7, 8, 9]),
};

type Row = { _id: string; tenantId: string; [k: string]: unknown };
function matches(row: Row, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && "$in" in (v as object)) return ((v as { $in: unknown[] }).$in).includes(row[k]);
    return row[k] === v;
  });
}
function memCollections() {
  const tables: Record<string, Row[]> = { sources: [], media: [], sessions: [], turns: [] };
  const fail = { turns: false };
  const coll = (name: string) => (tenantId: string) => ({
    async findOne(f: Record<string, unknown> = {}) { return tables[name]!.find((r) => r.tenantId === tenantId && matches(r, f)) ?? null; },
    async insertOne(d: object) {
      const doc = { ...d, tenantId } as Row;
      if (tables[name]!.some((r) => r._id === doc._id)) throw new Error("E11000 duplicate key");
      tables[name]!.push(doc);
    },
    async insertMany(ds: object[]) {
      if (name === "turns" && fail.turns) throw new Error("turns insert failed");
      for (const d of ds) tables[name]!.push({ ...d, tenantId } as Row);
    },
    async deleteMany(f: Record<string, unknown> = {}) {
      const keep = tables[name]!.filter((r) => !(r.tenantId === tenantId && matches(r, f)));
      tables[name]!.splice(0, tables[name]!.length, ...keep);
    },
  });
  const colls = { sources: coll("sources"), media: coll("media"), sessions: coll("sessions"), turns: coll("turns") } as unknown as IntakeCollections;
  return { tables, fail, colls };
}

type TestTurn = { speakerRef: string; tStart: number; tEnd: number; text: string };
function rig(opts: { turns?: TestTurn[]; downloader?: boolean; indexer?: (t: string, s: string) => Promise<unknown> } = {}) {
  const mem = memCollections();
  const calls = { transcribe: 0, download: 0, index: [] as string[] };
  const transcribe = async () => {
    calls.transcribe++;
    return opts.turns ?? [{ speakerRef: "spk:0", tStart: 0, tEnd: 2, text: "hello" }, { speakerRef: "spk:1", tStart: 2, tEnd: 5, text: "world" }];
  };
  const adapters = buildSourceIntakeAdapters({
    transcribe, workDir: WORK, env: {},
    exec: async () => ({ exitCode: 0, stdout: `${WORK}/yt-${ID}.m4a\n` }),
    reader: async (p) => { const f = FILES[p]; if (!f) throw new Error("no such file"); return f; },
    urlFetcher: async () => "para one\n\npara two", lookup: async () => ["93.184.216.34"],
    downloader: opts.downloader === false ? undefined : async (r) => { calls.download++; return { path: `${WORK}/${r.platform}-${r.id}.mp4` }; },
  });
  let n = 0;
  const indexer = opts.indexer ?? (async (_t: string, s: string) => { calls.index.push(s); return {
    sessionId: s, summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null }, entities: null,
    completion: { version: 2, strict: true, complete: true, generation: "fixture", turnCount: 2, treeWritten: true },
  }; });
  const sourceIntake: SourceIntakeDeps = createSourceIntakeDeps({
    adapters, sink: createMongoIntakeSink(mem.colls), indexSession: indexer as never,
    newId: () => `sess-${++n}`, now: () => "2026-10-13T10:00:00.000Z",
  });
  return { mem, calls, sourceIntake };
}
const KEYS = fakeKeyStore({
  k1: { tenantId: "tenant-1", scopes: ["ingest"] },
  k2: { tenantId: "tenant-2", scopes: ["ingest"] },
  askonly: { tenantId: "tenant-1", scopes: ["ask"] },
});
async function post(base: string, key: string | null, body: unknown) {
  const res = await fetch(`${base}/ingest/source`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function withServer<T>(sourceIntake: SourceIntakeDeps | undefined, fn: (base: string) => Promise<T>): Promise<T> {
  const server = await startTestServer(buildTestDeps({ keyStore: KEYS, sourceIntake }));
  try { return await fn(server.baseUrl); } finally { await server.close(); }
}

for (const [name, url] of [["youtube", YT_URL], ["cloudonair", ONAIR_URL], ["zoom-recording", ZOOM_URL]] as const) {
  test(`${name}: tenant submits a URL -> 201 and rows under that tenant; repeat -> 200 already-ingested, nothing written (D-135)`, async () => {
    const r = rig();
    await withServer(r.sourceIntake, async (base) => {
      const a = await post(base, "k1", { url });
      assert.equal(a.status, 201);
      assert.equal(a.body.status, "created");
      assert.equal(a.body.turnCount, 2);
      assert.match(String(a.body.sourceId), /^tenant-1:/);
      assert.equal(r.mem.tables.sources!.length, 1);
      assert.equal(r.mem.tables.media!.length, 1);
      assert.equal(r.mem.tables.sessions!.length, 1);
      assert.equal(r.mem.tables.turns!.length, 2);
      for (const t of Object.values(r.mem.tables)) for (const row of t) assert.equal(row.tenantId, "tenant-1");
      const before = JSON.stringify(r.mem.tables);
      const b = await post(base, "k1", { url });
      assert.equal(b.status, 200);
      assert.equal(b.body.status, "already-ingested");
      assert.equal(b.body.sessionId, a.body.sessionId);
      assert.equal(JSON.stringify(r.mem.tables), before);
      assert.equal(r.calls.transcribe, 1);
      assert.deepEqual(r.calls.index, [a.body.sessionId]);
    });
  });
}

test("same media for two tenants -> two tenant-scoped source ids, both created (D-136); body tenantId is ignored", async () => {
  const r = rig();
  await withServer(r.sourceIntake, async (base) => {
    const a = await post(base, "k1", { url: YT_URL, tenantId: "tenant-2" });
    const b = await post(base, "k2", { url: YT_URL });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.sourceId, b.body.sourceId);
    assert.equal(a.body.sourceId, tenantSourceId("tenant-1", String(r.mem.tables.sources![0]!.hash)));
    assert.deepEqual(r.mem.tables.sources!.map((s) => s.tenantId).sort(), ["tenant-1", "tenant-2"]);
    assert.equal(r.mem.tables.sessions!.length, 2);
  });
});

test("generic article URL goes through the url adapter, no transcription", async () => {
  const r = rig();
  await withServer(r.sourceIntake, async (base) => {
    assert.equal((await post(base, "k1", { url: "https://example.com/article" })).status, 201);
    assert.equal(r.calls.transcribe, 0);
  });
});

test("onair/zoom without a downloader fail closed: 502, no rows, share token not echoed", async () => {
  const r = rig({ downloader: false });
  await withServer(r.sourceIntake, async (base) => {
    for (const url of [ONAIR_URL, ZOOM_URL]) {
      const a = await post(base, "k1", { url });
      assert.equal(a.status, 502);
      assert.match(String(a.body.message), /downloader-unavailable/);
      assert.ok(!JSON.stringify(a.body).includes("AbCdEf123456_token"));
    }
    assert.equal(Object.values(r.mem.tables).flat().length, 0);
  });
});

test("auth and body gates: no key 401, wrong scope 403, bad bodies 400, nothing fetched or written", async () => {
  const r = rig();
  await withServer(r.sourceIntake, async (base) => {
    assert.equal((await post(base, null, { url: YT_URL })).status, 401);
    assert.equal((await post(base, "askonly", { url: YT_URL })).status, 403);
    for (const body of [{}, { url: 5 }, { url: "ftp://x/y" }, { url: "javascript:alert(1)" }, { url: `https://example.com/${"a".repeat(3000)}` }]) {
      assert.equal((await post(base, "k1", body)).status, 400);
    }
    assert.equal(r.calls.transcribe, 0);
    assert.equal(Object.values(r.mem.tables).flat().length, 0);
  });
});

test("a failing turns insert rolls back exactly this unit's rows and leaves other tenants' rows alone", async () => {
  const r = rig();
  await withServer(r.sourceIntake, async (base) => {
    assert.equal((await post(base, "k2", { url: ZOOM_URL })).status, 201);
    const other = JSON.stringify(r.mem.tables);
    r.mem.fail.turns = true;
    assert.equal((await post(base, "k1", { url: YT_URL })).status, 502);
    assert.equal(JSON.stringify(r.mem.tables), other);
    r.mem.fail.turns = false;
    assert.equal((await post(base, "k1", { url: YT_URL })).status, 201); // retry works: nothing half-stored
  });
});

test("invalid turn timing is refused before the first write; zero turns -> 422", async () => {
  const bad = rig({ turns: [{ speakerRef: "s", tStart: 5, tEnd: 1, text: "x" }] });
  await withServer(bad.sourceIntake, async (base) => {
    assert.equal((await post(base, "k1", { url: YT_URL })).status, 502);
    assert.equal(Object.values(bad.mem.tables).flat().length, 0);
  });
  const none = rig({ turns: [] });
  await withServer(none.sourceIntake, async (base) => {
    assert.equal((await post(base, "k1", { url: YT_URL })).status, 422);
    assert.equal(Object.values(none.mem.tables).flat().length, 0);
  });
});

test("source creation reports downstream failure safely; repeat preserves rows and never claims complete", async () => {
  let attempts = 0;
  const r = rig({ indexer: async () => { attempts++; throw new Error("private provider credential"); } });
  await withServer(r.sourceIntake, async (base) => {
    const first = await post(base, "k1", { url: YT_URL });
    assert.equal(first.status, 201);
    assert.deepEqual(first.body.indexing, { status: "failed", reason: "indexing-incomplete" });
    assert.ok(!JSON.stringify(first.body).includes("credential"));
    const before = JSON.stringify(r.mem.tables);
    const repeat = await post(base, "k1", { url: YT_URL });
    assert.equal(repeat.status, 200);
    assert.deepEqual(repeat.body.indexing, { status: "pending", reason: "already-ingested" });
    assert.equal(JSON.stringify(r.mem.tables), before); assert.equal(attempts, 1);
  });
});

test("only positive complete index receipts report done; degraded/incomplete/mismatched receipts fail", async () => {
  const good = rig();
  await withServer(good.sourceIntake, async (base) => {
    const response = await post(base, "k1", { url: YT_URL });
    const indexing = response.body.indexing as { status: string; receipt: { sessionId: string } };
    assert.equal(indexing.status, "done"); assert.equal(indexing.receipt.sessionId, response.body.sessionId);
  });
  for (const receipt of [{ sessionId: "foreign", chunks: {} }, { sessionId: "sess-1", summary: { degraded: "private error" }, chunks: {} },
    { sessionId: "sess-1", completion: { version: 2, complete: false }, chunks: {} },
    { sessionId: "sess-1", summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null }, entities: null,
      completion: { version: 2, strict: "invalid", complete: true, generation: "fixture", turnCount: 2, treeWritten: true } }]) {
    const failed = rig({ indexer: async () => receipt });
    await withServer(failed.sourceIntake, async (base) => {
      const response = await post(base, "k1", { url: YT_URL });
      assert.deepEqual(response.body.indexing, { status: "failed", reason: "indexing-incomplete" });
      assert.equal(failed.mem.tables.sessions!.length, 1);
    });
  }
});

test("positive index receipt excludes optional raw provider-stage diagnostics", async () => {
  const r = rig({ indexer: async (_tenant, sessionId) => ({ sessionId,
    summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null }, entities: null,
    completion: { version: 2, strict: true, complete: true, generation: "fixture", turnCount: 2, treeWritten: true },
    speakerSuggestions: { suggested: 0, inserted: 0, degraded: "optional-failed", error: "private-provider-key" },
  }) });
  await withServer(r.sourceIntake, async (base) => {
    const response = await post(base, "k1", { url: YT_URL });
    assert.equal((response.body.indexing as { status: string }).status, "done");
    assert.ok(!JSON.stringify(response.body).includes("private-provider-key"));
    assert.ok(!JSON.stringify(response.body).includes("speakerSuggestions"));
  });
});

test("flag OFF: no deps built and the route does not exist (same answer as any unknown path)", async () => {
  assert.equal(buildSourceIntakeDeps({}), undefined);
  assert.equal(buildSourceIntakeDeps({ LKB_SOURCE_INTAKE: "0" }), undefined);
  assert.equal(buildSourceIntakeDeps({ LKB_SOURCE_INTAKE: "true" }), undefined);
  await withServer(undefined, async (base) => {
    const init = { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer k1" }, body: JSON.stringify({ url: YT_URL }) };
    const a = await fetch(`${base}/ingest/source`, init);
    const b = await fetch(`${base}/ingest/no-such-route`, init);
    assert.equal(a.status, b.status);
    assert.equal((await a.text()).replace("/ingest/source", "/X"), (await b.text()).replace("/ingest/no-such-route", "/X"));
  });
});

test("flag ON with no STT configured -> mounted, answers 503, writes nothing", async () => {
  const deps = buildSourceIntakeDeps({ LKB_SOURCE_INTAKE: "1" });
  assert.ok(deps);
  await withServer(deps, async (base) => {
    const a = await post(base, "k1", { url: YT_URL });
    assert.equal(a.status, 503);
    assert.equal(a.body.error, "source_intake_unconfigured");
  });
});

test("flag ON with injected STT yields working deps over the injected sink", async () => {
  const mem = memCollections();
  const deps = buildSourceIntakeDeps({ LKB_SOURCE_INTAKE: "1" }, undefined, {
    transcribe: async () => [{ speakerRef: "s", tStart: 0, tEnd: 1, text: "t" }],
    sink: createMongoIntakeSink(mem.colls),
  });
  assert.ok(deps);
  // A YouTube URL would shell out to yt-dlp here; only assert the deps shape without any network or process.
  assert.equal(typeof deps.intake, "function");
});
