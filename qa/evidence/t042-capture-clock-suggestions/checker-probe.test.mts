import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { Turns } from "@lkb/core";
import { memoryDb } from "../../../packages/db/src/collections/speaker-suggestions.testdb.js";
import { listSessionSuggestions } from "../../../packages/db/src/collections/speaker-suggestions.js";
import { suggestTileSpeakersForSession, type TileCaptureContext } from "../../../apps/api/src/indexing/tile-speaker-suggest.js";

const tenant = "checker-tenant", session = "checker-session", media = "b".repeat(64);
function fixture(ambiguous = false) {
  const rows: unknown[] = [{ kind: "meta", startedAtEpoch: 1020, source: "meet-dom" }];
  for (let tSec = 0; tSec < 160; tSec += 2) {
    rows.push({ tSec, displayName: "Priya Nair", source: "meet-dom" });
    if (ambiguous) rows.push({ tSec, displayName: "Rahul Verma", source: "meet-dom" });
  }
  const jsonl = rows.map((r) => JSON.stringify(r)).join("\n");
  const context: TileCaptureContext = { captureId: "checker-capture", recordingSha256: media,
    captureSha256: createHash("sha256").update(jsonl).digest("hex"), clockBasis: "shared-host-epoch",
    recordingStartedAtEpoch: 1000, captureStartedAtEpoch: 1020, recordingDurationSec: 180 };
  const turns: Turns[] = [{ _id: "checker-turn", tenantId: tenant, sessionId: session,
    speakerRef: "spk:0", tStart: 20, tEnd: 180, text: "The admission deadline is tomorrow." }];
  const payload = { tenantId: tenant, sessionId: session, recordingSha256: media, captureId: "checker-capture", jsonl };
  return { context, turns, payload };
}

test("independent snapshot survives caller context and transcript mutation during awaited loader", async () => {
  const f = fixture(), m = memoryDb();
  const result = await suggestTileSpeakersForSession(tenant, session, f.turns, f.context, async () => {
    f.context.captureStartedAtEpoch = 99999;
    f.turns[0]!.tenantId = "foreign-tenant";
    f.turns[0]!.text = "My name is Rahul Verma.";
    return f.payload;
  }, m.db, { enabled: true });
  assert.deepEqual(result, { suggested: 1, inserted: 1, reason: "suggested" });
  const views = await listSessionSuggestions(tenant, session, m.db);
  assert.equal(views[0]!.suggestedName, "Priya Nair");
  assert.ok(views[0]!.quotes[0]!.quote.includes("offset=20s"));
  assert.equal(m.rows("speakers").length, 0);
});

test("every sample with two simultaneous active names is refused downstream", async () => {
  const f = fixture(true), m = memoryDb();
  const result = await suggestTileSpeakersForSession(tenant, session, f.turns, f.context,
    async () => f.payload, m.db, { enabled: true });
  assert.deepEqual(result, { suggested: 0, inserted: 0, reason: "no-evidence" });
  assert.deepEqual(await listSessionSuggestions(tenant, session, m.db), []);
  assert.equal(m.rows("speakers").length, 0);
});

test("lost acknowledgement after successful upsert exposes unknown writes and retries without replacing row", async () => {
  const f = fixture(), m = memoryDb();
  const broken = { collection(name: string) {
    const collection = m.db.collection(name);
    return new Proxy(collection, { get(target, key) {
      if (name === "speaker_suggestions" && key === "updateOne") return async (...args: unknown[]) => {
        await Reflect.apply(target.updateOne, target, args);
        throw new Error("acknowledgement lost after durable write");
      };
      return Reflect.get(target, key);
    } });
  } } as unknown as Db;
  const failed = await suggestTileSpeakersForSession(tenant, session, f.turns, f.context,
    async () => f.payload, broken, { enabled: true });
  assert.deepEqual(failed, { suggested: 1, inserted: null, reason: "write-outcome-unknown" });
  assert.equal(m.rows("speaker_suggestions").length, 1);
  const saved = structuredClone(m.rows("speaker_suggestions"));
  const retried = await suggestTileSpeakersForSession(tenant, session, f.turns, f.context,
    async () => f.payload, m.db, { enabled: true });
  assert.deepEqual(retried, { suggested: 1, inserted: 0, reason: "suggested" });
  assert.deepEqual(m.rows("speaker_suggestions"), saved);
  assert.equal((await listSessionSuggestions(tenant, session, m.db)).length, 1);
  assert.equal(m.rows("speakers").length, 0);
});
