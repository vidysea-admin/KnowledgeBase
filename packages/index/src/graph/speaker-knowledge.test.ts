import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, SpeakerSuggestions, Speakers, Sessions, Turns } from "@lkb/core";
import { speakerTranscriptHash } from "../pipeline/speaker-profiles/profile.js";
import { buildSpeakerKnowledgeView, routeSpeakerKnowledge, type SpeakerKnowledgeRelation } from "./speaker-knowledge.js";

function fixture() {
  const turns: Turns[] = [
    { _id: "t0", tenantId: "A", sessionId: "s1", speakerRef: "host", text: "Welcome Example to our panel", tStart: 0, tEnd: 4 },
    { _id: "t1", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", text: "वीजा के लिए तैयारी जरूरी है", tStart: 5, tEnd: 10 },
    { _id: "t2", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", text: "Visa ki tayari jaldi karo", tStart: 11, tEnd: 15 },
  ];
  const speaker: Speakers = { _id: "person-example", tenantId: "A", personId: "person:example", aliases: ["Example"], evidence: [{ sessionId: "s1", turnId: "t0" }],
    confirmations: [{ suggestionId: "suggestion", sessionId: "s1", speakerRef: "spk:1", provenance: "human-confirmed" }] };
  const suggestions: SpeakerSuggestions[] = [{ _id: "suggestion", tenantId: "A", sessionId: "s1", personId: "person:example", speakerRef: "spk:1", displayName: "Example", status: "confirmed", finalProvenance: "human-confirmed", suggestedAt: "2026-10-15T00:00:00Z", evidence: [{ sessionId: "s1", turnId: "t0" }], provenance: [{ turnId: "t0", evidenceKind: "called-on", evidenceQuote: "Welcome Example to our panel" }], blocks: [{ startTurnIndex: 1, endTurnIndex: 2, turnIds: ["t1", "t2"], transcriptHash: speakerTranscriptHash(turns) }] }];
  const sessions: Sessions[] = [{ _id: "s1", tenantId: "A", sourceId: "src", title: "Example session", date: "2026-10-15", status: { transcribe: "done", index: "done" } }];
  const claims: Claims[] = [
    { _id: "c1", tenantId: "A", text: "Visa preparation", status: "verified", topicRefs: ["visa"], evidence: [{ sessionId: "s1", turnId: "t1", quote: turns[1]!.text }] },
    { _id: "c2", tenantId: "A", text: "Prepare early", status: "verified", topicRefs: ["visa"], evidence: [{ sessionId: "s1", turnId: "t2", quote: turns[2]!.text }] },
  ];
  return { tenantId: "A", speaker, turns, sessions, suggestions, claims, topics: [{ _id: "visa", tenantId: "A", name: "Visa" }], visibleSessionIds: ["s1"], relationships: [] as SpeakerKnowledgeRelation[] };
}
const relation = (f: ReturnType<typeof fixture>): SpeakerKnowledgeRelation => ({ id: "r1", tenantId: "A", status: "accepted", fromClaimId: "c1", toClaimId: "c2", type: "agrees_with", evidence: [{ sessionId: "s1", turnId: "t2", quote: f.turns[2]!.text, transcriptHash: speakerTranscriptHash(f.turns) }] });

test("projects canonical source-backed speaker/session/topic/statement nodes without inventing relations", () => {
  const view = buildSpeakerKnowledgeView(fixture())!;
  assert.equal(view.identityStatus, "human-confirmed");
  assert.deepEqual(view.nodes.map(n => n.id), ["person:example", "session:s1", "statement:c1", "statement:c2", "topic:visa"]);
  assert.equal(view.edges.filter(e => e.type === "stated").length, 2);
  assert.ok(view.edges.every(e => e.evidence.length && e.evidence.every(c => c.sessionId === "s1")));
  assert.ok(!view.edges.some(e => ["agrees_with", "contradicts", "supersedes"].includes(e.type)));
});

test("suggested identity never becomes a named or attributed speaker graph", () => {
  const f = fixture(); f.suggestions[0]!.status = "suggested";
  const view = buildSpeakerKnowledgeView(f)!;
  assert.equal(view.identityStatus, "unresolved"); assert.deepEqual(view.nodes, []); assert.deepEqual(view.statements, []);
  assert.deepEqual(routeSpeakerKnowledge(view, { query: "visa" }).passages, []);
});

test("tenant, visibility withdrawal and source deletion remove graph before hydration", () => {
  const f = fixture(); const before = buildSpeakerKnowledgeView(f)!;
  assert.equal(buildSpeakerKnowledgeView({ ...f, tenantId: "B" }), null);
  for (const changed of [{ ...f, visibleSessionIds: [] }, { ...f, sessions: [] }, { ...f, turns: [] }]) {
    const after = buildSpeakerKnowledgeView(changed)!;
    assert.deepEqual(after.statements, []); assert.deepEqual(after.nodes, []); assert.notEqual(after.revision, before.revision);
  }
});

test("stale transcript identity blocks and forged claim quotes cannot survive projection", () => {
  const f = fixture(); f.turns[2]!.text = "Corrected text";
  assert.deepEqual(buildSpeakerKnowledgeView(f)!.statements, []);
  const forged = fixture(); forged.claims[0]!.evidence[0]!.quote = "Invented source";
  assert.deepEqual(buildSpeakerKnowledgeView(forged)!.statements.map(c => c.id), ["c2"]);
  const mixed = fixture(); mixed.claims[0]!.evidence.push({ sessionId: "foreign", turnId: "secret" });
  assert.deepEqual(buildSpeakerKnowledgeView(mixed)!.statements.map(c => c.id), ["c2"]);
});

test("only explicitly accepted exact current evidence can publish a relationship", () => {
  const f = fixture(); f.relationships = [relation(f)];
  assert.equal(buildSpeakerKnowledgeView(f)!.edges.filter(e => e.type === "agrees_with").length, 1);
  for (const patch of [{ tenantId: "B" }, { status: "revoked" as const }, { status: "suggested" as const }, { toClaimId: "missing" }, { evidence: [] }, { evidence: [{ ...relation(f).evidence[0]!, transcriptHash: "old" }] }, { evidence: [{ ...relation(f).evidence[0]!, quote: "not spoken" }] }]) {
    const view = buildSpeakerKnowledgeView({ ...f, relationships: [{ ...relation(f), ...patch }] })!;
    assert.equal(view.withheldRelationships, 1); assert.ok(!view.edges.some(e => e.type === "agrees_with"));
  }
});

test("routing handles Devanagari and Hinglish, preserves exact evidence, filters and hard limits", () => {
  const view = buildSpeakerKnowledgeView(fixture())!;
  assert.equal(routeSpeakerKnowledge(view, { query: "वीजा" }).passages[0]!.turnId, "t1");
  assert.equal(routeSpeakerKnowledge(view, { query: "tayari" }).passages[0]!.turnId, "t2");
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", maxPassages: 1 }).passages.length, 1);
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", maxCharacters: 1 }).passages.length, 0);
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", maxCharacters: 1 }).truncated, true);
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", sessionIds: [] }).passages.length, 0);
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", topicIds: ["absent"] }).passages.length, 0);
  assert.equal(routeSpeakerKnowledge(view, { query: "visa", maxPassages: NaN }).passages.length, 0);
});

test("revised, revoked and duplicate statements cannot leave stale routed passages", () => {
  const f = fixture(); const before = buildSpeakerKnowledgeView(f)!;
  f.claims[0]!.status = "needs-review";
  const after = buildSpeakerKnowledgeView(f)!;
  assert.notEqual(before.revision, after.revision); assert.deepEqual(routeSpeakerKnowledge(after, { query: "वीजा" }).passages, []);
  f.claims.push({ ...f.claims[1]! }); assert.equal(buildSpeakerKnowledgeView(f), null);
});

test("oversized snapshots refuse instead of silently truncating attribution; repeated edges deduplicate", () => {
  const f = fixture();
  assert.equal(buildSpeakerKnowledgeView({ ...f, sessions: Array.from({ length: 101 }, () => f.sessions[0]!) }), null);
  f.relationships = [relation(f), { ...relation(f), id: "duplicate" }];
  assert.equal(buildSpeakerKnowledgeView(f)!.edges.filter(e => e.type === "agrees_with").length, 1);
});

test("canonical collisions and oversized serialized evidence refuse the entire view", () => {
  const collision = fixture(); collision.claims.push({ ...collision.claims[0]!, _id: "statement:c1" });
  assert.equal(buildSpeakerKnowledgeView(collision), null);
  const huge = fixture(); huge.turns[2]!.text = "Visa ".repeat(120000);
  huge.claims[1]!.evidence[0]!.quote = huge.turns[2]!.text;
  huge.suggestions[0]!.blocks![0]!.transcriptHash = speakerTranscriptHash(huge.turns);
  assert.equal(buildSpeakerKnowledgeView(huge), null);
});

test("colliding tenant metadata and source ids cannot widen the authorized graph", () => {
  const f = fixture(); const before = buildSpeakerKnowledgeView(f)!;
  f.sessions.push({ ...f.sessions[0]!, tenantId: "B", title: "Foreign session" });
  f.turns.push(...f.turns.map(t => ({ ...t, tenantId: "B", text: "Foreign transcript" })));
  f.suggestions.push({ ...f.suggestions[0]!, tenantId: "B", displayName: "Foreign alias" });
  f.claims.push({ ...f.claims[0]!, tenantId: "B", _id: "foreign-claim", text: "Foreign claim" });
  f.topics.push({ ...f.topics[0]!, tenantId: "B", name: "Foreign topic" });
  assert.deepEqual(buildSpeakerKnowledgeView(f), before);
});

test("own subject and exact quote cannot attribute another speaker's statement or relationship", () => {
  const f = fixture();
  f.turns.push({ _id: "other-turn", tenantId: "A", sessionId: "s1", speakerRef: "spk:2", text: "Foreign speaker visa advice", tStart: 16, tEnd: 20 });
  f.suggestions[0]!.blocks![0]!.transcriptHash = speakerTranscriptHash(f.turns);
  f.claims.push({ _id: "other-claim", tenantId: "A", text: "Foreign speaker visa advice", status: "verified", topicRefs: ["visa"], evidence: [{ sessionId: "s1", turnId: "other-turn", quote: "Foreign speaker visa advice" }] });
  f.relationships = [{ ...relation(f), toClaimId: "other-claim", evidence: [{ sessionId: "s1", turnId: "other-turn", quote: "Foreign speaker visa advice", transcriptHash: speakerTranscriptHash(f.turns) }] }];
  const view = buildSpeakerKnowledgeView(f)!;
  assert.deepEqual(view.statements.map(c => c.id), ["c1", "c2"]);
  assert.ok(!view.edges.some(e => e.type === "agrees_with"));
  assert.deepEqual(routeSpeakerKnowledge(view, { query: "Foreign" }).passages, []);
});
