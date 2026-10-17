/** T-045 fix cycle 1: ISS-W045-001 (SSRF guard on the url adapter) and ISS-W045-002 (rollback of partial insertMany). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceIntakeAdapters, guardUrlFetcher } from "./adapters.js";
import { createMongoIntakeSink, type IntakeCollections } from "./store.js";

// The ledger's recorded reproductions for ISS-W045-001, verbatim (plus the 127/8 literal and extra spellings).
const RECORDED = [
  "http://localhost:8080/a", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/x",
  "http://[::1]/x", "http://192.168.1.1/", "http://172.16.0.1/",
];
const EXTRA = [
  "http://127.0.0.1/", "http://2130706433/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/",
  "http://0.0.0.0/", "http://100.64.0.1/", "http://user:pw@example.com/", "file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "not a url",
];
const PUBLIC = async () => ["93.184.216.34"];

async function refused(url: string, lookup: (h: string) => Promise<string[]> = PUBLIC) {
  let forwarded = 0;
  const g = guardUrlFetcher(async () => { forwarded++; return "x"; }, lookup);
  await assert.rejects(g(url), /url-blocked/);
  return forwarded === 0;
}

test("ISS-W045-001: recorded private/loopback/metadata targets are refused before anything is forwarded", async () => {
  const lookup = async (h: string) => (h === "localhost" ? ["127.0.0.1"] : ["93.184.216.34"]);
  const results = await Promise.all(RECORDED.map((u) => refused(u, lookup)));
  console.log(`ISS-W045-001: ${results.filter(Boolean).length}/${RECORDED.length} refused`);
  assert.ok(results.every(Boolean));
});

test("ISS-W045-001: extra spellings, non-http schemes and credentials are refused", async () => {
  const results = await Promise.all(EXTRA.map((u) => refused(u)));
  assert.ok(results.every(Boolean), `forwarded: ${EXTRA.filter((_, i) => !results[i]).join(",")}`);
});

test("ISS-W045-001: hostnames resolving to private addresses (any one of several) or failing/empty DNS are refused", async () => {
  assert.ok(await refused("http://internal.example.com/", async () => ["10.1.2.3"]));
  assert.ok(await refused("http://rebind.example.com/", async () => ["93.184.216.34", "169.254.169.254"]));
  assert.ok(await refused("http://v6.example.com/", async () => ["fd00::1"]));
  assert.ok(await refused("http://nx.example.com/", async () => []));
  assert.ok(await refused("http://nx.example.com/", async () => { throw new Error("ENOTFOUND"); }));
});

test("ISS-W045-001: a public host is forwarded; the guard wraps the default and an injected fetcher via buildSourceIntakeAdapters", async () => {
  const seen: string[] = [];
  const g = guardUrlFetcher(async (u) => { seen.push(u); return "ok"; }, PUBLIC);
  assert.equal(await g("https://example.com/a"), "ok");
  assert.deepEqual(seen, ["https://example.com/a"]);

  // Through the real registry with global fetch stubbed: a private URL must never reach fetch.
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => { fetched++; return new Response("body"); }) as typeof fetch;
  try {
    const adapters = buildSourceIntakeAdapters({ transcribe: async () => [], env: {}, lookup: async () => ["10.0.0.9"] });
    const input = { kind: "url", url: "http://10.0.0.5/x", tenantId: "tenant-1" };
    const adapter = adapters.find((a) => a.detect(input));
    assert.ok(adapter);
    const consent = { captureMode: "public", given: true, recordedBy: "web-ingest" } as never;
    await assert.rejects(adapter.fetch(input as never, consent), /url-blocked/);
    assert.equal(fetched, 0);
  } finally { globalThis.fetch = realFetch; }
});

type Row = { _id: string; tenantId: string };
function partialColls(failAfter: { turns?: number; media?: number }) {
  const tables: Record<string, Row[]> = { sources: [], media: [], sessions: [], turns: [] };
  const coll = (name: string) => (tenantId: string) => ({
    async findOne() { return null; },
    async insertOne(d: object) { tables[name]!.push({ ...d, tenantId } as Row); },
    async insertMany(ds: object[]) {
      const n = failAfter[name as "turns" | "media"];
      if (n === undefined) { for (const d of ds) tables[name]!.push({ ...d, tenantId } as Row); return; }
      for (const d of ds.slice(0, n)) tables[name]!.push({ ...d, tenantId } as Row);
      throw new Error(`${name} insert failed after ${n}`);
    },
    async deleteMany(f: { _id: unknown }) {
      const ids = typeof f._id === "string" ? [f._id] : (f._id as { $in: string[] }).$in;
      const keep = tables[name]!.filter((r) => !(r.tenantId === tenantId && ids.includes(r._id)));
      tables[name]!.splice(0, tables[name]!.length, ...keep);
    },
  });
  return { tables, colls: { sources: coll("sources"), media: coll("media"), sessions: coll("sessions"), turns: coll("turns") } as unknown as IntakeCollections };
}
const plan = (tenantId: string) => ({
  source: { _id: "src-1", tenantId }, media: [{ _id: "m1" }, { _id: "m2" }, { _id: "m3" }],
  session: { _id: "sess-1", tenantId },
  turns: [0, 1, 2].map((i) => ({ _id: `t${i}`, sessionId: "sess-1", speakerRef: "s", tStart: i, tEnd: i + 1, text: "x" })),
}) as never;

for (const which of ["turns", "media"] as const) {
  test(`ISS-W045-002: ${which} insertMany writes a prefix then throws -> zero rows left; other tenants untouched`, async () => {
    const m = partialColls({ [which]: 1 });
    m.tables.turns!.push({ _id: "other-turn", tenantId: "tenant-2" });
    const sink = createMongoIntakeSink(m.colls);
    await assert.rejects(sink.save(plan("tenant-1")), /insert failed/);
    const left = Object.entries(m.tables).map(([k, v]) => `${k}${v.filter((r) => r.tenantId === "tenant-1").length}`).join(" ");
    console.log(`ISS-W045-002 (${which}): ${left}`);
    assert.equal(left, "sources0 media0 sessions0 turns0");
    assert.deepEqual(m.tables.turns!.map((r) => r._id), ["other-turn"]);
  });
}
