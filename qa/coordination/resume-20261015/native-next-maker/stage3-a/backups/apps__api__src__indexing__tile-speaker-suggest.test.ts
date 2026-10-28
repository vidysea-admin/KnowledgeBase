import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Turns } from "@lkb/core";
import type { Db } from "mongodb";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions/testdb.js";
import { confirmSpeakerSuggestion, rejectSpeakerSuggestion, listSessionSuggestions } from "../../../../packages/db/src/collections/speaker-suggestions/index.js";
import { alignVerifiedTileCapture, suggestTileSpeakersForSession, tileSpeakerSuggestEnabled,
  type TileCaptureContext, type TileCaptureSidecar } from "./tile-speaker-suggest.js";
import { indexTurnDigest } from "./generation.js";

const T = "tenant-A", S = "session-4-panel", MEDIA = "a".repeat(64);
const NAMES = ["Priya Nair", "Rahul Verma", "Asha Rao", "Kiran Shah"];
const NOW = new Date("2026-10-14T00:00:00Z");
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const turns: Turns[] = Array.from({ length: 8 }, (_, i) => ({
  _id: `t${i}`, tenantId: T, sessionId: S, speakerRef: `spk:${i % 4}`,
  tStart: 20 + i * 40, tEnd: 60 + i * 40, text: "The application process takes several weeks.",
}));
function fixture(nameFor: (i: number) => string | null = (i) => NAMES[i % 4]!, confidence?: number) {
  const rows: unknown[] = [{ kind: "meta", startedAtEpoch: 1020, source: "meet-dom" }];
  for (let tSec = 0; tSec < 320; tSec += 2) rows.push({ tSec, displayName: nameFor(Math.floor(tSec / 40)), source: "meet-dom", ...(confidence === undefined ? {} : { confidence }) });
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}
function context(jsonl: string): TileCaptureContext {
  return { recordingSha256: MEDIA, captureSha256: hash(jsonl), captureId: "capture-1", clockBasis: "shared-host-epoch",
    recordingStartedAtEpoch: 1000, captureStartedAtEpoch: 1020, recordingDurationSec: 340 };
}
function sidecar(jsonl: string): TileCaptureSidecar { return { tenantId: T, sessionId: S, recordingSha256: MEDIA, captureId: "capture-1", jsonl }; }
async function run(jsonl = fixture(), ts = turns, m = memoryDb(), c = context(jsonl), payload = sidecar(jsonl)) {
  // This original alignment unit uses an explicit synthetic DB publication model. The root
  // composition test separately exercises the real generation verifier/transaction factory.
  const binding = { sourceId: "synthetic-source", generation: "synthetic-index", turnDigest: indexTurnDigest(ts),
    reviewRevision: null, captureGeneration: "synthetic-capture", receiptSha256: "d".repeat(64) };
  if (!m.rows("sessions").some(row => row._id === S && row.tenantId === T)) {
    m.seed("sessions", { _id: S, tenantId: T, sourceId: binding.sourceId, status: { index: "done" },
      indexAttempt: { ...binding, sessionId: S, state: "complete" } });
    m.seed("sources", { _id: binding.sourceId, tenantId: T, kind: "recording", hash: MEDIA, consent: { given: true },
      captureConsent: { sessionId: S, generation: binding.captureGeneration, receiptSha256: binding.receiptSha256, sanitizedAudioSha256: MEDIA } });
  }
  const model = { collection(name: string) {
    const coll = m.db.collection(name);
    return new Proxy(coll, { get(target, key) {
      if (name === "speaker_suggestions" && key === "updateOne") return (filter: object, update: any, options: object) =>
        target.updateOne(filter, { ...update, $setOnInsert: { ...update.$setOnInsert, nativePublication: binding } }, options);
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
  } } as unknown as Db;
  return { result: await suggestTileSpeakersForSession(T, S, ts, c, async () => payload, m.db,
    { enabled: true, now: NOW, publication: { async assertCurrent() {}, async write(work) { return work(model); } } }), m };
}

test("default/off performs no capture or database access; env opt-in is exact", async () => {
  let reads = 0, queries = 0;
  const db = { collection() { queries++; throw new Error("should not read"); } } as unknown as Db;
  const loader = async () => { reads++; throw new Error("should not load"); };
  for (const options of [{}, { enabled: false }]) assert.deepEqual(await suggestTileSpeakersForSession(T, S, turns, context(fixture()), loader, db, options), { suggested: 0, inserted: 0, reason: "disabled" });
  assert.deepEqual([reads, queries], [0, 0]);
  for (const v of [undefined, "", "0", "true", "on"]) assert.equal(tileSpeakerSuggestEnabled({ LKB_TILE_SUGGEST: v }), false);
  assert.equal(tileSpeakerSuggestEnabled({ LKB_TILE_SUGGEST: "1" }), true);
});

test("four synthetic panelists: measured offset -> suggestions -> review -> explicit human confirmation", async () => {
  const aligned = alignVerifiedTileCapture(fixture(), context(fixture()))!;
  assert.deepEqual([aligned[0]!.tSec, aligned.at(-1)!.tSec], [20, 338]);
  const { result, m } = await run();
  assert.deepEqual(result, { suggested: 4, inserted: 4, reason: "suggested" });
  assert.equal(m.rows("speakers").length, 0);
  const views = await listSessionSuggestions(T, S, m.db);
  assert.deepEqual(new Set(views.map((v) => v.suggestedName)), new Set(NAMES));
  assert.ok(views.every((v) => v.status === "suggested" && v.quotes[0]!.kind === "tile"));
  assert.ok(views.every((v) => v.quotes[0]!.quote.includes("offset=20s") && v.quotes[0]!.quote.includes(MEDIA) && v.quotes[0]!.quote.includes("capture-1")));
  const done = await confirmSpeakerSuggestion(T, S, views[0]!.id, m.db, NOW);
  assert.equal(done.result, "ok");
  assert.equal(m.rows("speakers").length, 1);
  assert.deepEqual((m.rows("speakers")[0]!.evidence as { sessionId: string }[]).every((e) => e.sessionId === S), true);
  assert.equal(m.rows("speakers")[0]!.provenance, "human-confirmed");
  assert.ok((m.rows("speakers")[0]!.aliases as string[]).includes(views[0]!.suggestedName));
  console.log("T-042 adapter sample: 4/4 suggestions; review consumed 4; auto-final 0; explicit confirmation final 1 (synthetic)");
});

test("tile/introduction agreement stays suggested; transcript text and timing unchanged", async () => {
  const ts = turns.map((t) => t._id === "t0" ? { ...t, text: "Hello everyone, my name is Priya Nair and I lead admissions." } : { ...t });
  const before = structuredClone(ts);
  const { m } = await run(fixture(), ts);
  const row = m.rows("speaker_suggestions").find((r) => r.speakerRef === "spk:0")!;
  assert.equal(row.status, "suggested");
  assert.ok((row.provenance as { evidenceQuote: string }[])[0]!.evidenceQuote.includes("agree"));
  assert.equal(m.rows("speakers").length, 0);
  assert.deepEqual(ts, before);
});

test("confirmed and rejected decisions survive rerun; no new names for confirmed labels/people", async () => {
  const { m } = await run();
  const views = await listSessionSuggestions(T, S, m.db);
  await confirmSpeakerSuggestion(T, S, views[0]!.id, m.db, NOW);
  await rejectSpeakerSuggestion(T, S, views[1]!.id, m.db, NOW);
  const before = structuredClone(m.rows("speaker_suggestions"));
  const again = await run(fixture(), turns, m);
  assert.equal(again.result.inserted, 0);
  assert.equal(again.result.suggested, 2);
  assert.deepEqual(m.rows("speaker_suggestions"), before);
  assert.equal(m.rows("speakers").length, 1);
});

test("foreign tenant/session/media/capture instance refuses sidecar before any writes", async () => {
  for (const override of [{ tenantId: "tenant-B" }, { sessionId: "session-other" }, { recordingSha256: "b".repeat(64) }, { captureId: "capture-old" }]) {
    const jsonl = fixture(), m = memoryDb();
    const { result } = await run(jsonl, turns, m, context(jsonl), { ...sidecar(jsonl), ...override });
    assert.equal(result.reason, "capture-mismatch");
    assert.equal(m.rows("speaker_suggestions").length, 0);
  }
  const { m } = await run();
  assert.deepEqual(await listSessionSuggestions("tenant-B", S, m.db), []);
  assert.equal((await confirmSpeakerSuggestion("tenant-B", S, m.rows("speaker_suggestions")[0]!._id as string, m.db)).result, "not_found");
});

test("populated foreign tenant with colliding session/label/person stays byte-identical", async () => {
  const template = (await run()).m.rows("speaker_suggestions")[0]!;
  const m = memoryDb();
  const foreignId = String(template._id).replace(T, "tenant-B");
  m.seed("speaker_suggestions", { ...template, _id: foreignId, tenantId: "tenant-B" });
  m.seed("speakers", { _id: "tenant-B-sentinel", tenantId: "tenant-B", personId: template.personId,
    aliases: ["Foreign identity sentinel"], evidence: [{ turnId: "t0", sessionId: S }], confidence: 1, provenance: "human-confirmed" });
  const foreignBefore = structuredClone([m.rows("speaker_suggestions")[0], m.rows("speakers")[0]]);
  const first = await run(fixture(), turns, m);
  assert.equal(first.result.inserted, 4);
  const a = await listSessionSuggestions(T, S, m.db);
  assert.equal(a.length, 4);
  assert.ok(a.every((v) => v.id !== foreignId));
  assert.equal((await confirmSpeakerSuggestion(T, S, foreignId, m.db)).result, "not_found");
  await confirmSpeakerSuggestion(T, S, a.find((v) => v.suggestedName === template.displayName)!.id, m.db, NOW);
  assert.equal((await run(fixture(), turns, m)).result.inserted, 0);
  assert.deepEqual([m.rows("speaker_suggestions").find((r) => r.tenantId === "tenant-B"), m.rows("speakers").find((r) => r.tenantId === "tenant-B")], foreignBefore);
  assert.equal((await listSessionSuggestions(T, S, m.db)).length, 4);
  assert.equal((await listSessionSuggestions("tenant-B", S, m.db)).length, 1);
});

test("second upsert failure reports unknown partial writes; idempotent retry recovers and review reads all rows", async () => {
  const m = memoryDb();
  let upserts = 0;
  const failingDb = { collection(name: string) {
    const coll = m.db.collection(name);
    return new Proxy(coll, { get(target, key) {
      if (name === "speaker_suggestions" && key === "updateOne") return async (...args: unknown[]) => {
        if (++upserts === 2) throw new Error("private database details");
        return Reflect.apply(target.updateOne, target, args);
      };
      return Reflect.get(target, key);
    } });
  } } as unknown as Db;
  const jsonl = fixture();
  const r = await suggestTileSpeakersForSession(T, S, turns, context(jsonl), async () => sidecar(jsonl), failingDb, { enabled: true, now: NOW });
  assert.deepEqual(r, { suggested: 4, inserted: null, reason: "write-outcome-unknown" });
  assert.equal(m.rows("speaker_suggestions").length, 1);
  const saved = structuredClone(m.rows("speaker_suggestions")[0]);
  assert.equal((await run(jsonl, turns, m)).result.inserted, 3);
  assert.equal(m.rows("speaker_suggestions").length, 4);
  assert.deepEqual(m.rows("speaker_suggestions")[0], saved);
  assert.equal((await listSessionSuggestions(T, S, m.db)).length, 4);
  assert.equal(m.rows("speakers").length, 0);
});

test("unknown clock, bad origins and foreign turns refuse before loader/database access", async () => {
  let reads = 0;
  const loader = async () => { reads++; return sidecar(fixture()); };
  const m = memoryDb();
  for (const override of [{ clockBasis: "sidecar-said-so" }, { captureStartedAtEpoch: NaN }, { recordingStartedAtEpoch: -1 }, { recordingDurationSec: 0 }, { captureStartedAtEpoch: 1340 }, { recordingSha256: "" }]) {
    const r = await suggestTileSpeakersForSession(T, S, turns, { ...context(fixture()), ...override } as TileCaptureContext, loader, m.db, { enabled: true });
    assert.equal(r.reason, "invalid-context");
  }
  for (const ts of [[{ ...turns[0]!, tenantId: "tenant-B" }], [{ ...turns[0]!, sessionId: "other" }], [{ ...turns[0]!, tEnd: 999 }]]) {
    assert.equal((await suggestTileSpeakersForSession(T, S, ts, context(fixture()), loader, m.db, { enabled: true })).reason, "invalid-turns");
  }
  assert.equal(reads, 0);
});

test("exact digest, sole first metadata, source, monotonic time and confidence validation", async () => {
  const jsonl = fixture(), c = context(jsonl);
  assert.equal(alignVerifiedTileCapture(jsonl + " ", c), null);
  const lines = jsonl.trim().split("\n");
  for (const bad of [jsonl + lines[0] + "\n", lines.slice(1).join("\n"), jsonl.replace('"startedAtEpoch":1020', '"startedAtEpoch":1000'), jsonl.replace('"source":"meet-dom"', '"source":"zoom-dom"'), jsonl + '{"tSec":1,"displayName":null,"source":"meet-dom"}\n', jsonl + "broken\n", fixture(undefined, 2)]) {
    assert.equal(alignVerifiedTileCapture(bad, context(bad)), null);
    assert.equal((await run(bad)).result.reason, "invalid-capture");
  }
});

test("pre-recording samples clipped, confidence preserved, samples beyond recording discarded", () => {
  const jsonl = [{ kind: "meta", startedAtEpoch: 990, source: "meet-dom" }, ...[0, 10, 12, 100].map((tSec) => ({ tSec, displayName: "Priya Nair", source: "meet-dom", confidence: 0.25 }))].map((r) => JSON.stringify(r)).join("\n");
  const c = { ...context(jsonl), captureStartedAtEpoch: 990, recordingDurationSec: 20 };
  assert.deepEqual(alignVerifiedTileCapture(jsonl, c), [{ tSec: 0, displayName: "Priya Nair", source: "meet-dom", confidence: 0.25 }, { tSec: 2, displayName: "Priya Nair", source: "meet-dom", confidence: 0.25 }]);
});

test("low-confidence, no overlap, conflicting tiles and tile-intro disagreement do not guess names", async () => {
  assert.equal((await run(fixture(undefined, 0.1))).result.suggested, 0);
  assert.equal((await run(fixture(() => null))).result.suggested, 0);
  assert.equal((await run(fixture(() => "Priya Nair"))).result.suggested, 0);
  const ts = turns.map((t) => t.speakerRef === "spk:0" ? { ...t, text: "Hello everyone, my name is Rahul Verma and I lead admissions." } : t);
  assert.ok(!(await run(fixture(), ts)).m.rows("speaker_suggestions").some((r) => r.speakerRef === "spk:0"));
  const late = { ...context(fixture()), recordingDurationSec: 1000, captureStartedAtEpoch: 1500 };
  const data = fixture().replace('"startedAtEpoch":1020', '"startedAtEpoch":1500');
  late.captureSha256 = hash(data);
  assert.equal((await run(data, turns, memoryDb(), late)).result.suggested, 0);
});

test("loader cannot change trusted origins; thrown failures return fixed safe reasons", async () => {
  const jsonl = fixture(), c = context(jsonl), before = structuredClone(c), m = memoryDb();
  const result = await suggestTileSpeakersForSession(T, S, turns, c, async (_t, _s, passed) => { (passed as TileCaptureContext).captureStartedAtEpoch = 99999; return sidecar(jsonl); }, m.db, { enabled: true });
  assert.equal(result.inserted, 4);
  assert.deepEqual(c, before);
  const failed = await suggestTileSpeakersForSession(T, S, turns, c, async () => { throw new Error("private transcript or credential"); }, m.db, { enabled: true });
  assert.deepEqual(failed, { suggested: 0, inserted: 0, reason: "failed" });
});

test("native publication rechecks current registry after async lookups and inside writer", async () => {
  for (const failAt of [1, 2]) {
    const m = memoryDb();
    let checks = 0, writes = 0;
    const result = await suggestTileSpeakersForSession(T, S, turns, context(fixture()),
      async () => sidecar(fixture()), m.db, { enabled: true, publication: {
        async assertCurrent() { if (++checks === failAt) throw new Error("stale generation or replaced receipt"); },
        async write(work) { writes++; return work(m.db); },
      } });
    assert.equal(result.reason, "failed");
    assert.equal(result.inserted, 0);
    assert.equal(m.rows("speaker_suggestions").length, 0);
    assert.equal(writes, failAt === 2 ? 1 : 0);
  }
});

test("native publication writes only through trusted transaction and leaves names unconfirmed", async () => {
  const m = memoryDb();
  let checks = 0, writes = 0;
  const result = await suggestTileSpeakersForSession(T, S, turns, context(fixture()),
    async () => sidecar(fixture()), m.db, { enabled: true, publication: {
      async assertCurrent() { checks++; },
      async write(work) { writes++; return work(m.db); },
    } });
  assert.equal(result.inserted, 4);
  assert.equal(checks, 2);
  assert.equal(writes, 1);
  assert.equal(m.rows("speakers").length, 0);
  assert.ok(m.rows("speaker_suggestions").every(row => row.status === "suggested"));
});
