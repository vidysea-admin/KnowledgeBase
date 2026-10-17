import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpeakerProfileInput } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import { applyAcceptedSpeakerAttributes, attributeDerivedRevision } from "./attribute-authority.js";
import type { AcceptedAttributes } from "../speaker-attributes/types.js";

function input(): SpeakerProfileInput {
  return { tenantId: "A", speaker: { _id: "sp", tenantId: "A", personId: "person:priya", aliases: ["Priya"], evidence: [{ sessionId: "s", turnId: "t" }], org: "Cached organization", role: "Cached role", orgEvidence: [{ status: "accepted", sessionId: "s", turnId: "t", quote: "Cached organization" }] }, sessions: [], turns: [], claims: [], topics: [], suggestions: [] };
}

test("accepted attribute projection replaces cached fields and never falls back on absent or conflicted values", () => {
  const before = input();
  const accepted: AcceptedAttributes = { fields: { org: { value: "New organization", evidence: [{ sessionId: "s", turnId: "t", quote: "New organization", transcriptHash: "a".repeat(64), speakerRef: "spk:1", startTurnIndex: 0, endTurnIndex: 0 }] } }, withheldFields: [], revision: "b".repeat(64) };
  const result = applyAcceptedSpeakerAttributes(before, accepted);
  assert.equal(result.speaker.org, "New organization"); assert.equal(result.speaker.role, undefined);
  assert.equal((result.speaker.orgEvidence as { status: string }[])[0]!.status, "accepted");
  assert.equal(before.speaker.org, "Cached organization");
  const conflicted = applyAcceptedSpeakerAttributes(before, { ...accepted, withheldFields: ["org"] });
  assert.equal(conflicted.speaker.org, undefined); assert.equal(conflicted.speaker.orgEvidence, undefined); assert.equal(conflicted.speaker.role, undefined);
});

test("attribute-derived revisions change on accepted-source generation and source correction", () => {
  const a = attributeDerivedRevision("source", "accepted");
  assert.match(a, /^[a-f0-9]{64}$/); assert.equal(a, attributeDerivedRevision("source", "accepted"));
  assert.notEqual(a, attributeDerivedRevision("source", "revoked"));
  assert.notEqual(a, attributeDerivedRevision("corrected", "accepted"));
});
