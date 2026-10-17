import { test } from "node:test";
import assert from "node:assert/strict";
import { createMongoSpeakerProfileDeps } from "../../../../apps/api/src/speaker-profiles/store.js";
import { buildSpeakerProfile, speakerTranscriptHash } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";

// Independent, authored synthetic rows only. No fixture imports, private inputs or I/O.
function fixture() {
  const rows = new Map<string, any[]>();
  const events: string[] = [];
  let secondarySeen = false; let withdrew = false; let armRace = false;
  const seed = (name: string, row: any) => rows.set(name, [...(rows.get(name) ?? []), row]);
  const values = (row: any, path: string[]): any[] => Array.isArray(row) ? row.flatMap(v => values(v, path))
    : !path.length ? [row] : row && typeof row === "object" ? values(row[path[0]!], path.slice(1)) : [];
  const matches = (row: any, filter: any) => Object.entries(filter).every(([k, v]: [string, any]) =>
    values(row, k.split(".")).some(x => v && typeof v === "object" && "$in" in v ? v.$in.includes(x) : x === v));
  const db: any = { collection(name: string) { return {
    async findOne(filter: any) {
      assert.equal(filter.tenantId, "A", "every database read stays in the authenticated tenant");
      events.push(`${name}/${filter._id ?? "other"}`);
      // Both topic sessions have been checked when the later primary-session lookup starts.
      if (armRace && secondarySeen && !withdrew && name === "sessions" && filter._id === "s1") {
        rows.get("sources")!.find(r => r._id === "src2")!.consent.given = false;
        withdrew = true; events.push("secondary-source-withdrawn-before-final-primary-check");
      }
      const row = structuredClone((rows.get(name) ?? []).find(r => matches(r, filter)) ?? null);
      if (name === "sources" && filter._id === "src2" && row?.consent.given === true) secondarySeen = true;
      return row;
    },
    find(filter: any) {
      assert.equal(filter.tenantId, "A");
      let cap = Infinity;
      const cursor = { limit(n: number) { cap = n; return cursor; }, async toArray() {
        return structuredClone((rows.get(name) ?? []).filter(r => matches(r, filter)).slice(0, cap));
      } }; return cursor;
    }
  }; } };
  const turns = [
    { _id: "t0", tenantId: "A", sessionId: "s1", speakerRef: "spk:0", text: "Welcome Priya Nair to the session", tStart: 0, tEnd: 9 },
    { _id: "t1", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", text: "Prepare applications early", tStart: 10, tEnd: 19 },
    { _id: "t2", tenantId: "A", sessionId: "s1", speakerRef: "spk:0", text: "The next panelist will speak", tStart: 20, tEnd: 29 },
    { _id: "t3", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", text: "A different person uses the recurring label", tStart: 30, tEnd: 39 }
  ];
  const suggestion = { _id: "qa-confirm", tenantId: "A", sessionId: "s1", personId: "person:priya-nair", speakerRef: "spk:1", displayName: "Priya Nair", status: "confirmed", finalProvenance: "human-confirmed", suggestedAt: "2026-10-14T00:00:00Z", decidedAt: "2026-10-14T00:01:00Z",
    provenance: [{ turnId: "t0", evidenceQuote: turns[0]!.text, evidenceKind: "called-on" }], evidence: [{ sessionId: "s1", turnId: "t0" }],
    blocks: [{ startTurnIndex: 1, endTurnIndex: 1, turnIds: ["t1"], transcriptHash: speakerTranscriptHash(turns) }] };
  const speaker = { _id: "A-person:priya-nair", tenantId: "A", personId: "person:priya-nair", aliases: ["Priya Nair", "UNSUPPORTED ALIAS"], evidence: [{ sessionId: "s1", turnId: "t0" }],
    confirmations: [{ suggestionId: "qa-confirm", sessionId: "s1", speakerRef: "spk:1", provenance: "human-confirmed" }] };
  const sessions = [{ _id: "s1", tenantId: "A", sourceId: "src1", title: "Synthetic primary", date: "2026-10-14" },
    { _id: "s2", tenantId: "A", sourceId: "src2", title: "Synthetic secondary", date: "2026-10-14" }];
  const claims = [{ _id: "safe", tenantId: "A", text: turns[1]!.text, status: "verified", evidence: [{ sessionId: "s1", turnId: "t1" }], topicRefs: ["topic"] },
    { _id: "label-bleed", tenantId: "A", text: turns[3]!.text, status: "verified", evidence: [{ sessionId: "s1", turnId: "t3" }] }];
  const topic = { _id: "topic", tenantId: "A", name: "SECONDARY SOURCE METADATA", sessionRefs: ["s1", "s2"] };
  seed("speakers", speaker); seed("speaker_suggestions", suggestion);
  for (const s of sessions) { seed("sessions", s); seed("sources", { _id: s.sourceId, tenantId: "A", kind: "recording", path: "synthetic/fixture", consent: { given: true } }); }
  for (const t of turns) seed("turns", t); for (const c of claims) seed("claims", c); seed("topics", topic);
  return { db, rows, turns, speaker, suggestion, sessions, claims, topic, events,
    armRace() { armRace = true; }, get withdrew() { return withdrew; }, get secondarySeen() { return secondarySeen; } };
}

test("actual store positive control retains only anchored knowledge and supported alias", async () => {
  const f = fixture(); const p = await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya-nair");
  assert.ok(p); assert.deepEqual(p.aliases, ["Priya Nair"]); assert.deepEqual(p.claims.map(c => c.id), ["safe"]);
  assert.deepEqual(p.attribution[0]!.turnIds, ["t1"]); assert.deepEqual(p.topics.map(t => t.id), ["topic"]);
});
test("same person row from another tenant cannot establish identity", async () => {
  const f = fixture(); f.speaker.tenantId = "B";
  assert.equal(await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya-nair"), null);
});
test("correct current hash cannot rescue wrong turn anchors and stale hash cannot rescue current ids", async () => {
  const wrong = fixture(); wrong.suggestion.blocks[0]!.turnIds = ["t3"];
  const p = await createMongoSpeakerProfileDeps(wrong.db).get("A", "person:priya-nair");
  assert.ok(p); assert.deepEqual(p.claims, []); assert.deepEqual(p.attribution, []);
  const stale = fixture(); stale.turns[1]!.text = "Reindexed synthetic content";
  const q = await createMongoSpeakerProfileDeps(stale.db).get("A", "person:priya-nair");
  assert.ok(q); assert.deepEqual(q.claims, []); assert.deepEqual(q.attribution, []);
});
test("withdrawn primary source refuses all persona output", async () => {
  const f = fixture(); f.rows.get("sources")![0]!.consent.given = false;
  assert.equal(await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya-nair"), null);
});
test("quoted self-name cannot restore legacy floor attribution", () => {
  const f = fixture(); f.turns[1]!.text = 'He said, "My name is Priya Nair."';
  const p = buildSpeakerProfile({ tenantId: "A", speaker: f.speaker, suggestions: [], turns: f.turns, sessions: f.sessions, claims: f.claims, topics: [f.topic] } as any)!;
  assert.equal(p.identityStatus, "unresolved"); assert.deepEqual(p.aliases, []); assert.deepEqual(p.claims, []);
});
test("secondary contributing source withdrawal before final primary check withholds cached topic name", async () => {
  const f = fixture(); f.armRace();
  const p = await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya-nair");
  assert.equal(f.secondarySeen, true, "positive secondary visibility prerequisite executed");
  assert.equal(f.withdrew, true, "withdrawal latch fired before final primary session recheck");
  assert.ok(p); assert.deepEqual(p.claims.map(c => c.id), ["safe"], "own-source claim remains available");
  console.log(JSON.stringify({ synthetic: true, secondaryChecked: f.secondarySeen, withdrewBeforeFinalPrimaryCheck: f.withdrew, returnedTopicIds: p.topics.map(t => t.id) }));
  assert.deepEqual(p.topics, [], "a withdrawn secondary source cannot supply cached topic metadata");
});
