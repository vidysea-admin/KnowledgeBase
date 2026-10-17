import test from "node:test";
import assert from "node:assert/strict";
import { makeTileRegistryFixture, SYNTHETIC_PANEL } from "./fixture.js";
import { suggestTileSpeakersForSession } from "../../../apps/api/src/indexing/tile-speaker-suggest.js";
import { memoryDb } from "../../../packages/db/src/collections/speaker-suggestions.testdb.js";
import { listSessionSuggestions, confirmSpeakerSuggestion } from "../../../packages/db/src/collections/speaker-suggestions.js";

test("synthetic actual filesystem receipt/source/media/clock -> registry -> existing adapter -> review and human confirm", async () => {
  const f = makeTileRegistryFixture(), db = memoryDb();
  try {
    const registry = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(registry.status, "ready"); if (registry.status !== "ready") return;
    assert.equal(registry.evidenceKind, "synthetic");
    const out = await suggestTileSpeakersForSession(f.tenant, f.session, f.turns, registry.context, registry.readCapture, db.db, { enabled: true });
    assert.deepEqual(out, { suggested: 4, inserted: 4, reason: "suggested" });
    const rows = await listSessionSuggestions(f.tenant, f.session, db.db);
    assert.deepEqual(new Set(rows.map(r => r.suggestedName)), new Set(SYNTHETIC_PANEL));
    assert.equal(db.rows("speakers").length, 0);
    await registry.assertCurrent();
    await confirmSpeakerSuggestion(f.tenant, f.session, rows[0]!.id, db.db);
    assert.equal(db.rows("speakers").length, 1);
    assert.ok(db.rows("speaker_suggestions").every(r => r.blocks === undefined));
    console.log("SYNTHETIC registry downstream: 4 suggestions/review rows, auto-final0, human-final1, invented-blocks0; native producer/mount unproven");
  } finally { f.cleanup(); }
});

test("revoked native-readback seam refuses before adapter insertion; persisted suggestions need central revocation/confirmation policy", async () => {
  const f = makeTileRegistryFixture(), db = memoryDb();
  try {
    const registry = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(registry.status, "ready"); if (registry.status !== "ready") return;
    f.setCommitted(false);
    const out = await suggestTileSpeakersForSession(f.tenant, f.session, f.turns, registry.context, registry.readCapture, db.db, { enabled: true });
    assert.deepEqual(out, { suggested: 0, inserted: 0, reason: "failed" });
    assert.equal(db.rows("speaker_suggestions").length, 0);
  } finally { f.cleanup(); }
});
