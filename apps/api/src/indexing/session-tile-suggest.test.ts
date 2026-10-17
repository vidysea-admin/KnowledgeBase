/**
 * T-042 P9: the opt-in tile-speaker suggestion hook in indexSession.
 * Hook runs only when deps.tileSuggest.enabled === true AND LKB_TILE_SUGGEST=1, only after the
 * index attempt COMMITTED, and its outcome lives under its own key; a throw never touches completion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { indexSession } from "./session.js";
import type { TileCaptureContext, TileCaptureSidecar } from "./tile-speaker-suggest.js";
import { fakeDb, completeWith, embedOk } from "./testutils.js";
import { createIndexGenerationSuggestionPublication, resolveTileSuggest } from "../composition/tile-suggest.js";

const T = "t", S = "s1", MEDIA = "a".repeat(64);
const NAMES = ["Priya Nair", "Rahul Verma", "Asha Rao", "Kiran Shah"];
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const TURNS = Array.from({ length: 8 }, (_, i) => ({
  _id: `t${i}`, tenantId: T, sessionId: S, speakerRef: `spk:${i % 4}`,
  tStart: 20 + i * 40, tEnd: 60 + i * 40, text: "The application process takes several weeks.",
}));
const JSONL = [{ kind: "meta", startedAtEpoch: 1020, source: "meet-dom" },
  ...Array.from({ length: 160 }, (_, i) => ({ tSec: i * 2, displayName: NAMES[Math.floor(i * 2 / 40) % 4], source: "meet-dom" }))]
  .map((r) => JSON.stringify(r)).join("\n") + "\n";
const CONTEXT: TileCaptureContext = { recordingSha256: MEDIA, captureSha256: hash(JSONL), captureId: "capture-1",
  clockBasis: "shared-host-epoch", recordingStartedAtEpoch: 1000, captureStartedAtEpoch: 1020, recordingDurationSec: 340 };
const SIDECAR: TileCaptureSidecar = { tenantId: T, sessionId: S, recordingSha256: MEDIA, captureId: "capture-1", jsonl: JSONL };

/** fakeDb with 8 turns for the producer, and a controllable speaker_suggestions store. */
function rig(opts: { storeThrows?: boolean } = {}) {
  const base = fakeDb();
  const suggestionOps: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const db = { collection(name: string) {
    const c = base.db.collection(name) as unknown as Record<string, unknown>;
    if (name === "turns") return { ...c, find: () => ({ toArray: async () => structuredClone(TURNS) }), findOne: async () => structuredClone(TURNS[0]) };
    if (name === "speaker_suggestions" || name === "speakers") return {
      find: () => ({ toArray: async () => name === "speakers" ? [] : structuredClone(rows) }),
      findOne: async () => null,
      updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
        suggestionOps.push(`${name}.updateOne`);
        if (opts.storeThrows) throw new Error("store down");
        rows.push({ filter, ...structuredClone(update.$setOnInsert ?? {}) });
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      },
      insertOne: async () => { suggestionOps.push(`${name}.insertOne`); return { acknowledged: true }; },
      insertMany: async () => { suggestionOps.push(`${name}.insertMany`); return { acknowledged: true }; },
      bulkWrite: async (ops: unknown[]) => {
        suggestionOps.push(`${name}.bulkWrite`);
        if (opts.storeThrows) throw new Error("store down");
        rows.push(...ops.map((o) => ({ op: o })));
        return { acknowledged: true, upsertedCount: ops.length, insertedCount: ops.length, matchedCount: 0, modifiedCount: 0 };
      },
    };
    return c;
  } } as unknown as Pick<Db, "collection">;
  return { db, calls: base.calls, suggestionOps, rows };
}
function tileDeps(enabled: boolean, reads: { n: number }) {
  return { enabled, context: CONTEXT, readCapture: async () => { reads.n++; return SIDECAR; }, publication: createIndexGenerationSuggestionPublication };
}
async function withEnv<R>(value: string | undefined, fn: () => Promise<R>): Promise<R> {
  const prev = process.env.LKB_TILE_SUGGEST;
  if (value === undefined) delete process.env.LKB_TILE_SUGGEST; else process.env.LKB_TILE_SUGGEST = value;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.LKB_TILE_SUGGEST; else process.env.LKB_TILE_SUGGEST = prev; }
}
const run = (r: ReturnType<typeof rig>, tile: unknown, extra: Record<string, unknown> = {}) =>
  indexSession(T, S, { retrievalMode: "vector", complete: completeWith(extra) as never, embed: embedOk as never, db: r.db, ...(tile ? { tileSuggest: tile as never } : {}) });

test("flag off (no dep, env unset or set): no capture read, no store call, result has no key", async () => {
  for (const env of [undefined, "1"]) await withEnv(env, async () => {
    const r = rig();
    const res = await run(r, undefined);
    assert.equal(res.completion?.complete, true);
    assert.equal("tileSpeakerSuggestions" in res, false);
    assert.deepEqual(r.suggestionOps, []);
  });
});

test("env set but dep disabled: no call; dep enabled but env not exactly 1: no call", async () => {
  for (const [env, enabled] of [["1", false], [undefined, true], ["0", true]] as const) {
    await withEnv(env, async () => {
      const r = rig(), reads = { n: 0 };
      const res = await run(r, tileDeps(enabled, reads));
      assert.equal(res.completion?.complete, true);
      assert.equal("tileSpeakerSuggestions" in res, false);
      assert.deepEqual(r.suggestionOps, []);
      assert.equal(reads.n, 0);
    });
  }
});

test("enabled and committed: four synthetic suggestion rows inserted via insertSuggestionsIfAbsent, no final speaker", async () => {
  await withEnv("1", async () => {
    const r = rig(), reads = { n: 0 };
    const res = await run(r, tileDeps(true, reads));
    assert.equal(res.completion?.complete, true);
    assert.equal(reads.n, 1);
    assert.equal(res.tileSpeakerSuggestions!.reason, "suggested");
    assert.equal(res.tileSpeakerSuggestions!.suggested, 4);
    assert.equal(r.rows.length, 4, `expected 4 suggestion rows, saw ${r.rows.length} via ${r.suggestionOps.join(",")}`);
    assert.ok(r.suggestionOps.length > 0 && r.suggestionOps.every((o) => o.startsWith("speaker_suggestions.")), "only speaker_suggestions is written");
    assert.equal("speakerSuggestions" in res, false, "U2.4 key stays independent");
  });
});

test("enabled but index NOT committed (degraded claims): hook never runs, no key", async () => {
  await withEnv("1", async () => {
    const r = rig(), reads = { n: 0 };
    const res = await run(r, tileDeps(true, reads), { claimsFails: true });
    assert.equal(res.completion?.complete, false);
    assert.equal("tileSpeakerSuggestions" in res, false);
    assert.deepEqual(r.suggestionOps, []);
    assert.equal(reads.n, 0);
  });
});

test("store throws: degraded key, completion and every other field unchanged", async () => {
  await withEnv("1", async () => {
    const off = await run(rig(), undefined);
    const res = await run(rig({ storeThrows: true }), tileDeps(true, { n: 0 }));
    assert.equal(res.tileSpeakerSuggestions!.reason, "write-outcome-unknown");
    assert.equal(res.tileSpeakerSuggestions!.inserted, null);
    assert.equal(res.completion?.complete, true);
    const { tileSpeakerSuggestions: _t, ...rest } = res as Record<string, any>;
    const strip = (o: Record<string, any>) => ({ ...o, completion: { ...o.completion, generation: "g" } });
    assert.deepEqual(strip(rest), strip(off as never));
  });
});

test("hook throws outside the producer (context accessor): reason failed, completion unchanged", async () => {
  await withEnv("1", async () => {
    let touched = 0;
    const tile = { enabled: true, readCapture: async () => SIDECAR, publication: createIndexGenerationSuggestionPublication, get context(): TileCaptureContext { touched++; throw new Error("boom"); } };
    const res = await run(rig(), tile);
    assert.equal(res.completion?.complete, true);
    assert.deepEqual(res.tileSpeakerSuggestions, { suggested: 0, inserted: null, reason: "failed" });
    assert.equal(touched, 1);
  });
});

test("w17-wireapi: composition resolver is off unless LKB_TILE_SUGGEST=1 and never supplies a context", async () => {
  for (const v of [undefined, "", "0", "true", " 1"]) assert.equal(resolveTileSuggest(v === undefined ? {} : { LKB_TILE_SUGGEST: v }), undefined);
  const dep = resolveTileSuggest({ LKB_TILE_SUGGEST: "1" })!;
  assert.equal(dep.enabled, true); assert.equal(dep.context, undefined); assert.equal(dep.readCapture, undefined);
  assert.equal(dep.publication, createIndexGenerationSuggestionPublication);
  await withEnv("1", async () => {
    const r = rig(); const res = await run(r, dep);
    assert.equal(res.completion?.complete, true); assert.equal("tileSpeakerSuggestions" in res, false); assert.deepEqual(r.suggestionOps, []);
  });
});

test("w17-wireapi: enabled with context but no publication fence is a no-op (no read, no write)", async () => {
  await withEnv("1", async () => {
    const r = rig(), reads = { n: 0 }; const { publication: _p, ...unfenced } = tileDeps(true, reads);
    const res = await run(r, unfenced);
    assert.equal("tileSpeakerSuggestions" in res, false); assert.deepEqual(r.suggestionOps, []); assert.equal(reads.n, 0);
  });
});

test("w17-wireapi: a superseded generation fails the fence; no suggestion row is written", async () => {
  await withEnv("1", async () => {
    const r = rig(), reads = { n: 0 }, seen: string[] = [];
    const stale = { ...tileDeps(true, reads), publication: (db: Db, t: string, s: string, g: string) => { seen.push(g); return createIndexGenerationSuggestionPublication(db, t, s, `${g}-superseded`); } };
    const res = await run(r, stale);
    assert.equal(res.completion?.complete, true); assert.equal(seen.length, 1); assert.ok(seen[0]);
    assert.equal(res.tileSpeakerSuggestions!.inserted, 0); assert.equal(res.tileSpeakerSuggestions!.reason, "failed");
    assert.equal(r.rows.length, 0); assert.deepEqual(r.suggestionOps, []);
  });
});

test("w17-wireapi: fence write never runs work when the generation is not current", async () => {
  const db = { collection: () => ({ findOne: async () => null }) } as unknown as Db; let ran = 0;
  const pub = createIndexGenerationSuggestionPublication(db, T, S, "g1");
  await assert.rejects(pub.assertCurrent(), /tile_suggestion_generation_stale/);
  await assert.rejects(pub.write(async () => { ran++; }), /tile_suggestion_generation_stale/); assert.equal(ran, 0);
  await assert.rejects(createIndexGenerationSuggestionPublication(db, T, S, "").assertCurrent(), /stale/);
});
