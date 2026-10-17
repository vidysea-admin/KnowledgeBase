import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceSlices } from "@lkb/index";
import { chunkContentMatches } from "./chunk-integrity.js";

test("existing recovery span fingerprints bind exact bytes independently of recovery IDs", () => {
  const turn = { _id: "turn", tenantId: "tenant", sessionId: "source", text: "A real source. " + "世界.".repeat(20) };
  const plans = buildSourceSlices([turn], 24);
  const byId = new Map([[turn._id, turn]]);
  for (const plan of plans) {
    const chunk = { ...plan, _id: "recovery-row-id", tenantId: "tenant", sourceRef: "source" };
    assert.equal(chunkContentMatches(chunk, byId, "tenant"), true);
    const altered = new Map([[turn._id, { ...turn, text: turn.text + " Changed." }]]);
    assert.equal(chunkContentMatches(chunk, altered, "tenant"), false);
    assert.equal(chunkContentMatches({ ...chunk, rawTextSha256: "wrong" }, byId, "tenant"), false);
    assert.equal(chunkContentMatches({ ...chunk, sourceSpans: chunk.sourceSpans.map(span => ({ ...span, charStart: -1 })) }, byId, "tenant"), false);
    assert.equal(chunkContentMatches({ ...chunk, tenantId: "foreign" }, byId, "tenant"), false);
    assert.equal(chunkContentMatches(chunk, new Map([[turn._id, { ...turn, tenantId: "foreign" }]]), "tenant"), false);
    assert.equal(chunkContentMatches(chunk, byId, undefined as never), false);
    assert.equal(chunkContentMatches({ ...chunk, sourceRef: "other-source" }, byId, "tenant"), false);
    assert.equal(chunkContentMatches({ ...chunk, sourceSpans: [], rawTextSha256: undefined }, byId, "tenant"), false);
  }
  assert.equal(chunkContentMatches({ _id: "legacy-uuid", tenantId: "tenant", sourceRef: "source", turnRefs: ["turn"] }, byId, "tenant"), false);
});
