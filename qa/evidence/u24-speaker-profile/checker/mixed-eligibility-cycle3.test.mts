import { test } from "node:test";
import { createRequire } from "node:module";
const { MongoClient, ClientSession } = createRequire(new URL("../../../../apps/api/package.json", import.meta.url))("mongodb");
type SdkSession = InstanceType<typeof ClientSession>;
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
  const collectionFixture: any = { collection(name: string) { return {
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
  // Capability adaptation only: genuine Mongo Db/client/ClientSession, synthetic collection reads.
  // Never connect, copy snapshots, emulate MVCC or claim server transaction behavior.
  const sdkClient = new MongoClient("mongodb://127.0.0.1:1", { serverSelectionTimeoutMS: 20 });
  const db: any = sdkClient.db("u24_checker_authored_synthetic");
  const sdkReads: { name: string; session?: SdkSession }[] = [];
  Object.defineProperty(db, "collection", { value(name: string) {
    const collection = collectionFixture.collection(name);
    const inspect = (options: any = {}) => {
      const session = options.session;
      if (session !== undefined) {
        assert.ok(session instanceof ClientSession);
        assert.equal(session.client, sdkClient);
        assert.equal(session.inTransaction(), true);
        assert.equal(session.transaction.options.readConcern?.level, "snapshot");
      }
      sdkReads.push({ name, session });
    };
    return {
      findOne(filter: any, options: any = {}) { inspect(options); return collection.findOne(filter); },
      find(filter: any, options: any = {}) { inspect(options); return collection.find(filter); }
    };
  } });
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
  return { db, sdkClient, sdkReads, rows, turns, speaker, suggestion, sessions, claims, topic, events,
    armRace() { armRace = true; }, get withdrew() { return withdrew; }, get secondarySeen() { return secondarySeen; } };
}

// Distinct new privacy floor: vary only row metadata attributed to an ineligible source.
function metadataFixture(sourceVisible: boolean, privateMetadataPresent: boolean, privateConfidence: number) {
  const f = fixture(); const row = f.speaker as any;
  const hiddenTurn = { _id: "q0", tenantId: "A", sessionId: "s2", speakerRef: "person:priya-nair", text: "I work at SYNTHETIC SECONDARY ORG as SYNTHETIC SECONDARY ROLE", tStart: 0, tEnd: 9 };
  f.rows.get("turns")!.push(hiddenTurn);
  row.evidence.push({ sessionId: "s2", turnId: "q0" });
  row.confidence = privateConfidence;
  const attributeEvidence = [{ sessionId: "s2", turnId: "q0", quote: hiddenTurn.text, status: "accepted" }];
  row.orgEvidence = attributeEvidence; row.roleEvidence = attributeEvidence;
  if (privateMetadataPresent) { row.org = "SYNTHETIC SECONDARY ORG"; row.role = "SYNTHETIC SECONDARY ROLE"; }
  f.rows.get("sources")!.find(r => r._id === "src2")!.consent.given = sourceVisible;
  return f;
}
test("healthy all-visible source allows supported attribute values and recorded metadata", async () => {
  const f = metadataFixture(true, true, 0.13);
  const p = await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya-nair");
  assert.ok(p); assert.deepEqual(p.claims.map(c => c.id), ["safe"]);
  assert.equal(p.organizations[0]!.value, "SYNTHETIC SECONDARY ORG");
  assert.equal(p.roles[0]!.value, "SYNTHETIC SECONDARY ROLE");
  assert.equal(p.recordedConfidence, 0.13); assert.equal(p.withheld.profileFields, 0);
});
test("public profile is invariant or refused when only withdrawn-source row metadata changes", async () => {
  const a = metadataFixture(false, true, 0.13);
  const b = metadataFixture(false, false, 0.93);
  const p = await createMongoSpeakerProfileDeps(a.db).get("A", "person:priya-nair");
  const q = await createMongoSpeakerProfileDeps(b.db).get("A", "person:priya-nair");
  if (p && q) {
    assert.deepEqual(p.aliases, q.aliases); assert.deepEqual(p.claims, q.claims);
    assert.deepEqual(p.identityEvidence, q.identityEvidence); assert.deepEqual(p.attribution, q.attribution);
    assert.deepEqual(p.organizations, []); assert.deepEqual(q.organizations, []);
    assert.deepEqual(p.roles, []); assert.deepEqual(q.roles, []);
    assert.deepEqual(p.topics, []); assert.deepEqual(q.topics, []);
  }
  console.log(JSON.stringify({ synthetic: true, secondarySourceWithdrawnInBoth: true,
    publicA: p ? { recordedConfidence: p.recordedConfidence, withheldProfileFields: p.withheld.profileFields } : null,
    publicB: q ? { recordedConfidence: q.recordedConfidence, withheldProfileFields: q.withheld.profileFields } : null }));
  // Invariance, not a prescribed null value/count: whole-profile refusal is also valid.
  assert.deepEqual(p, q, "changing only withdrawn-source metadata must not change the public persona output");
});