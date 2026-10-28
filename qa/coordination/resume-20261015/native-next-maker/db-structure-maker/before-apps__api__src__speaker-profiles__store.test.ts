import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientSession, MongoClient, type Db } from "mongodb";
import { createMongoSpeakerProfileDeps, readSpeakerKnowledgeAuthority, readSpeakerAttributeAuthority } from "./store.js";
import { createKnowledgeMetadataVisibility } from "../knowledge/metadata-visibility.js";
import { speakerTranscriptHash } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { suggestSpeakersForSession } from "../indexing/speaker-suggest.js";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions.testdb.js";
import { confirmSpeakerSuggestion } from "../../../../packages/db/src/collections/speaker-suggestions.js";
import type { AcceptedAttributes } from "../speaker-attributes/types.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "../server.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

type Row = Record<string, unknown>;
function values(row: unknown, path: string[]): unknown[] {
  if (Array.isArray(row)) return row.flatMap(v => values(v, path));
  if (!path.length) return [row];
  return row && typeof row === "object" ? values((row as Row)[path[0]!], path.slice(1)) : [];
}
function memory() {
  const data = new Map<string, Row[]>(); const calls: { name: string; filter: Row; session?: ClientSession }[] = [];
  // Real SDK ClientSession lifecycle; only collection reads are synthetic. No connect/Mongo I/O or fake MVCC.
  const client = new MongoClient("mongodb://127.0.0.1:1", { serverSelectionTimeoutMS: 20 });
  let beforeRead: ((name: string) => void) | undefined;
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([k, v]) => values(row, k.split(".")).some(x => v && typeof v === "object" && "$in" in v ? (v as { $in: unknown[] }).$in.includes(x) : x === v));
  const record = (name: string, filter: Row, options: { session?: ClientSession }) => {
    if (options.session) {
      assert.ok(options.session instanceof ClientSession); assert.equal(Reflect.get(options.session, "client"), client);
      assert.equal(options.session.inTransaction(), true, "every snapshot authority read runs inside the actual SDK transaction");
      const transaction = Reflect.get(options.session, "transaction");
      const transactionOptions = Reflect.get(transaction, "options");
      const readConcern = Reflect.get(transactionOptions, "readConcern");
      assert.equal(readConcern === undefined || readConcern === null ? undefined : Reflect.get(readConcern, "level"), "snapshot");
    }
    calls.push({ name, filter, session: options.session }); beforeRead?.(name);
  };
  const db = { client, collection(name: string) { return {
    async findOne(filter: Row, options: { session?: ClientSession } = {}) { record(name, filter, options); return structuredClone((data.get(name) ?? []).find(r => matches(r, filter)) ?? null); },
    find(filter: Row, options: { session?: ClientSession } = {}) { record(name, filter, options); const rows = (data.get(name) ?? []).filter(r => matches(r, filter)); return { limit(n: number) { return { async toArray() { return structuredClone(rows.slice(0, n)); } }; } }; },
  }; } } as unknown as Db;
  return { db, calls, hook(fn: (name: string) => void) { beforeRead = fn; }, rows(name: string) { return data.get(name) ?? []; }, seed(name: string, row: Row) { const rows = data.get(name) ?? []; rows.push(row); data.set(name, rows); } };
}
function seed(m: ReturnType<typeof memory>, tenantId: string, name: string) {
  m.seed("speakers", { _id: `${tenantId}-person:priya`, tenantId, personId: "person:priya", aliases: [name], evidence: [{ sessionId: "s1", turnId: "t0" }], confirmations: [{ suggestionId: `${tenantId}-confirm`, sessionId: "s1", speakerRef: "spk:1", provenance: "human-confirmed" }] });
  const sourceTurns = [`Welcome ${name} to the panel`, `${tenantId} visa knowledge`, "Unrelated moderator", `${tenantId} another person with repeated label`].map((text, i): Turns => ({ _id: `t${i}`, tenantId, sessionId: "s1", speakerRef: i % 2 ? "spk:1" : "spk:0", tStart: i * 10, tEnd: i * 10 + 9, text }));
  m.seed("speaker_suggestions", { _id: `${tenantId}-confirm`, tenantId, sessionId: "s1", personId: "person:priya", speakerRef: "spk:1", displayName: name, status: "confirmed", finalProvenance: "human-confirmed", provenance: [{ turnId: "t0", evidenceQuote: `Welcome ${name} to the panel`, evidenceKind: "called-on" }], evidence: [{ sessionId: "s1", turnId: "t0" }], blocks: [{ startTurnIndex: 1, endTurnIndex: 1, turnIds: ["t1"], transcriptHash: speakerTranscriptHash(sourceTurns) }], suggestedAt: "2026-10-14" });
  m.seed("sessions", { _id: "s1", tenantId, sourceId: "src1", title: `${tenantId} session`, date: "2026-10-14" });
  m.seed("sources", { _id: "src1", tenantId, kind: "recording", path: "fixture/recording", hash: "synthetic-source-fixture", createdAt: "2026-10-14T00:00:00Z", captureMode: "provided", consent: { given: true, recordedBy: "fixture-owner" } });
  for (const t of sourceTurns) m.seed("turns", t);
  m.seed("claims", { _id: `${tenantId}-good`, tenantId, text: `${tenantId} claim`, status: "verified", topicRefs: [`${tenantId}:visa`], evidence: [{ sessionId: "s1", turnId: "t1" }] });
  m.seed("claims", { _id: `${tenantId}-bad`, tenantId, text: `${tenantId} label bleed`, status: "verified", evidence: [{ sessionId: "s1", turnId: "t3" }] });
  m.seed("topics", { _id: `${tenantId}:visa`, tenantId, name: `${tenantId} topic`, sessionRefs: ["s1"] });
}
test("real scoped read predicates isolate identical person/session/turn ids across tenants", async () => {
  const m = memory(); seed(m, "A", "Priya"); seed(m, "B", "ForeignName");
  const deps = createMongoSpeakerProfileDeps(m.db);
  const a = await deps.get("A", "person:priya"); const b = await deps.get("B", "person:priya");
  assert.deepEqual(a!.aliases, ["Priya"]); assert.deepEqual(b!.aliases, ["ForeignName"]);
  assert.deepEqual(a!.claims.map(c => c.id), ["A-good"]); assert.deepEqual(b!.claims.map(c => c.id), ["B-good"]);
  assert.equal(JSON.stringify(a).includes("ForeignName"), false);
  assert.ok(m.calls.every(c => c.filter.tenantId === "A" || c.filter.tenantId === "B"));
  assert.ok(m.calls.some(c => c.name === "claims" && "evidence.sessionId" in c.filter));
  const snapshots = [...new Set(m.calls.flatMap(c => c.session ? [c.session] : []))];
  assert.equal(snapshots.length, 2, "each positive request has its own actual ClientSession");
  for (const session of snapshots) {
    const first = m.calls.findIndex(c => c.session === session);
    assert.ok(first >= 0); assert.equal(m.calls[first]!.name, "speakers");
    const reads = m.calls.filter(c => c.session === session);
    for (const name of ["speakers", "speaker_suggestions", "sessions", "sources", "turns", "claims", "topics", "transcript_reviews", "whatsapp_candidates"]) assert.ok(reads.some(c => c.name === name), name);
    assert.equal(session.hasEnded, true);
  }
  assert.equal(await deps.get("C", "person:priya"), null);
});
test("suggestions are not promoted and malformed tenant cannot reach a database read", async () => {
  const m = memory(); seed(m, "A", "Priya");
  m.seed("speaker_suggestions", { _id: "pending", tenantId: "A", sessionId: "s1", personId: "person:other", displayName: "PendingName", status: "suggested" });
  const deps = createMongoSpeakerProfileDeps(m.db);
  assert.equal(await deps.get("A", "person:other"), null);
  const count = m.calls.length;
  await assert.rejects(deps.get("", "person:priya")); await assert.rejects(deps.get({ $ne: null } as never, "person:priya"));
  assert.equal(m.calls.length, count);
  assert.equal(JSON.stringify(await deps.get("A", "person:priya")).includes("PendingName"), false);
});
test("truncated transcript refuses the whole profile rather than changing block interpretation", async () => {
  const m = memory(); seed(m, "A", "Priya");
  for (let i = 0; i < 10_001; i++) m.seed("turns", { _id: `overflow${i}`, tenantId: "A", sessionId: "s1", speakerRef: "spk:0", text: "extra", tStart: 100 + i, tEnd: 101 + i });
  await assert.rejects(createMongoSpeakerProfileDeps(m.db).get("A", "person:priya"), /limit/);
});
test("known-person profile and mounted API revoke source consent without a cached identity bypass", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const deps = createMongoSpeakerProfileDeps(m.db);
  assert.deepEqual((await deps.get("A", "person:priya"))!.claims.map(c => c.id), ["A-good"]);
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore({ "key-a": { tenantId: "A", scopes: ["sessions"] } }), speakerProfiles: deps }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done, reject) => { server.once("listening", done); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  try {
    m.rows("sources")[0]!.consent = { given: false, recordedBy: "fixture-owner" };
    assert.equal(await deps.get("A", "person:priya"), null);
    const response = await fetch(`http://127.0.0.1:${address.port}/speaker-profiles/person:priya`, { headers: { authorization: "Bearer key-a" } });
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: "not_found" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally { await new Promise<void>(done => server.close(() => done())); }
  for (const damage of ["missing", "foreign", "unreviewed-chat", "during-read"] as const) {
    const f = memory(); seed(f, "A", "Priya");
    if (damage === "missing") f.rows("sources").splice(0);
    if (damage === "foreign") f.rows("sources")[0]!.tenantId = "B";
    if (damage === "unreviewed-chat") f.rows("sources")[0]!.kind = "whatsapp-batch";
    if (damage === "during-read") f.hook(name => { if (name === "topics") f.rows("sources")[0]!.consent = { given: false, recordedBy: "fixture-owner" }; });
    assert.equal(await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya"), null, damage);
    assert.ok(f.calls.every(c => c.filter.tenantId === "A"), damage);
  }
});
test("unsupported snapshot capability cannot fall back to collection-only profile output", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const collectionOnly = { collection: m.db.collection.bind(m.db) } as unknown as Db;
  const deps = createMongoSpeakerProfileDeps(collectionOnly);
  await assert.rejects(deps.get("A", "person:priya"), /Knowledge snapshot unavailable/);
  assert.equal(m.calls.length, 0);
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore({ "key-a": { tenantId: "A", scopes: ["sessions"] } }), speakerProfiles: deps }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done, reject) => { server.once("listening", done); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/speaker-profiles/person:priya`, { headers: { authorization: "Bearer key-a" } });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "speaker_profile_unavailable" });
    assert.equal(m.calls.length, 0);
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
test("cached topic names require every contributing source session to remain visible", async () => {
  const safe = memory(); seed(safe, "A", "Priya");
  assert.deepEqual((await createMongoSpeakerProfileDeps(safe.db).get("A", "person:priya"))!.topics.map(t => t.name), ["A topic"]);
  for (const damage of ["missing-provenance", "withdrawn", "raw-chat", "foreign", "missing-session"] as const) {
    const f = memory(); seed(f, "A", "Priya");
    const topic = f.rows("topics")[0]!; topic.name = `PRIVATE_${damage}`;
    if (damage === "missing-provenance") delete topic.sessionRefs;
    else {
      topic.sessionRefs = ["s1", "s2"];
      if (damage !== "missing-session") f.seed("sessions", { _id: "s2", tenantId: damage === "foreign" ? "B" : "A", sourceId: "src2", title: "Private source", date: "2026-10-14" });
      f.seed("sources", { _id: "src2", tenantId: "A", kind: damage === "raw-chat" ? "whatsapp-batch" : "recording", consent: { given: damage !== "withdrawn", recordedBy: "fixture-owner" }, hash: "synthetic-private-source", createdAt: "2026-10-14T00:00:00Z", captureMode: "provided" });
    }
    const profile = await createMongoSpeakerProfileDeps(f.db).get("A", "person:priya");
    assert.deepEqual(profile!.claims.map(c => c.id), ["A-good"], damage);
    assert.deepEqual(profile!.topics, [], damage); assert.equal(JSON.stringify(profile).includes("PRIVATE_"), false, damage);
    assert.ok(f.calls.every(c => c.filter.tenantId === "A"), damage);
  }
});
test("actual suggestion producer -> durable confirm link -> profile consumes anchored scope", async () => {
  const writer = memoryDb(); const reader = memory();
  const turns: Turns[] = [
    { _id: "t0", tenantId: "A", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 9, text: "Priya Nair, what do you think about the rules?" },
    { _id: "t1", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", tStart: 10, tEnd: 19, text: "Visas require early preparation" },
    { _id: "t2", tenantId: "A", sessionId: "s1", speakerRef: "spk:0", tStart: 20, tEnd: 29, text: "Next question" },
    { _id: "t3", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", tStart: 30, tEnd: 39, text: "A different voice on this label" },
  ];
  const complete = async (job: Job): Promise<CompleteResult> => ({ text: "", json: String(job.messages[0]?.content).includes('"verdict"') ? { verdict: "yes" } : [{ label: "spk:1", name: "Priya Nair", evidenceQuote: "Priya Nair, what do you think about the rules", evidenceKind: "called-on" }], usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "scripted", costUsd: 0 } as CompleteResult);
  const generated = await suggestSpeakersForSession("A", "s1", turns, complete, writer.db);
  assert.equal(generated.inserted, 1); assert.equal(writer.rows("speakers").length, 0);
  const suggestion = writer.rows("speaker_suggestions")[0]!;
  const blocks = suggestion.blocks as Row[];
  assert.deepEqual(blocks[0]!.turnIds, ["t1"]); assert.equal(blocks[0]!.transcriptHash, speakerTranscriptHash(turns));
  const pendingReader = memory();
  for (const row of writer.rows("speaker_suggestions")) pendingReader.seed("speaker_suggestions", row);
  const pendingProfile = await createMongoSpeakerProfileDeps(pendingReader.db).get("A", "person:priya-nair");
  assert.equal(pendingProfile, null);
  const confirmed = await confirmSpeakerSuggestion("A", "s1", suggestion._id as string, writer.db);
  assert.equal(confirmed.result, "ok");
  for (const name of ["speakers", "speaker_suggestions"]) for (const row of writer.rows(name)) reader.seed(name, row);
  reader.seed("sessions", { _id: "s1", tenantId: "A", sourceId: "src1", title: "Synthetic pipeline fixture", date: "2026-10-14" });
  reader.seed("sources", { _id: "src1", tenantId: "A", kind: "recording", path: "fixture/recording", hash: "synthetic-source-fixture", createdAt: "2026-10-14T00:00:00Z", captureMode: "provided", consent: { given: true, recordedBy: "fixture-owner" } });
  for (const turn of turns) reader.seed("turns", turn);
  reader.seed("claims", { _id: "good", tenantId: "A", text: turns[1]!.text, status: "verified", evidence: [{ sessionId: "s1", turnId: "t1" }] });
  reader.seed("claims", { _id: "reused", tenantId: "A", text: turns[3]!.text, status: "verified", evidence: [{ sessionId: "s1", turnId: "t3" }] });
  const profile = await createMongoSpeakerProfileDeps(reader.db).get("A", "person:priya-nair");
  assert.equal(profile!.identityStatus, "human-confirmed"); assert.deepEqual(profile!.claims.map(c => c.id), ["good"]);
  assert.deepEqual(profile!.attribution[0]!.turnIds, ["t1"]);
  assert.equal(profile!.identityEvidence[0]!.quote, "Priya Nair, what do you think about the rules");
  const staleReader = memory();
  for (const name of ["speakers", "speaker_suggestions"]) for (const row of writer.rows(name)) staleReader.seed(name, row);
  staleReader.seed("sessions", { _id: "s1", tenantId: "A", sourceId: "src1", title: "Synthetic pipeline fixture", date: "2026-10-14" });
  staleReader.seed("sources", { _id: "src1", tenantId: "A", kind: "recording", path: "fixture/recording", hash: "synthetic-source-fixture", createdAt: "2026-10-14T00:00:00Z", captureMode: "provided", consent: { given: true, recordedBy: "fixture-owner" } });
  for (const turn of turns) staleReader.seed("turns", { ...turn, text: turn._id === "t1" ? "Reindexed replacement voice" : turn.text });
  staleReader.seed("claims", { _id: "replacement", tenantId: "A", text: "Reindexed replacement voice", status: "verified", evidence: [{ sessionId: "s1", turnId: "t1" }] });
  const staleProfile = await createMongoSpeakerProfileDeps(staleReader.db).get("A", "person:priya-nair");
  assert.equal(staleProfile!.identityStatus, "human-confirmed");
  assert.deepEqual(staleProfile!.attribution, []); assert.deepEqual(staleProfile!.claims, []);
  let activeReader = createMongoSpeakerProfileDeps(pendingReader.db);
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore({ "scripted-key": { tenantId: "A", scopes: ["sessions"] } }), speakerProfiles: { get: (tenantId, personId) => activeReader.get(tenantId, personId) } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done, reject) => { server.once("listening", done); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const call = async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/speaker-profiles/person:priya-nair`, { headers: { authorization: "Bearer scripted-key" } });
    return { status: response.status, body: await response.json(), cacheControl: response.headers.get("cache-control") };
  };
  let httpResponses: Record<"pending" | "confirmed" | "stale", Awaited<ReturnType<typeof call>>> | null = null;
  try {
    const pending = await call(); assert.equal(pending.status, 404);
    activeReader = createMongoSpeakerProfileDeps(reader.db);
    const confirmed = await call(); assert.equal(confirmed.status, 200); assert.deepEqual(confirmed.body, { profile });
    activeReader = createMongoSpeakerProfileDeps(staleReader.db);
    const stale = await call(); assert.equal(stale.status, 200); assert.deepEqual(stale.body, { profile: staleProfile });
    assert.equal(confirmed.cacheControl, "private, no-store"); assert.equal(stale.cacheControl, "private, no-store");
    httpResponses = { pending, confirmed, stale };
  } finally { await new Promise<void>(done => server.close(() => done())); }
  const out = process.env.U24_EVIDENCE_DIR;
  if (out) {
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(join(resolve(out), "scripted-producer-profile-responses.json"), JSON.stringify({ proofClass: "synthetic-scripted-provider-in-memory-db", liveProviderCalls: 0, liveDatabaseWrites: 0, actualProducer: "suggestSpeakersForSession", actualDecisionWriter: "confirmSpeakerSuggestion", pendingProfile, confirmedProfile: profile, staleProfile, httpResponses }, null, 2));
  }
});

test("speaker metadata eligibility permits empty optional evidence and all-visible attribute references", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const { memberVisible } = createKnowledgeMetadataVisibility(m.db);
  const row = { _id: "A-person:priya", tenantId: "A", evidence: [{ sessionId: "s1", turnId: "t0" }] };
  assert.equal(await memberVisible("A", "speaker", { ...row, orgEvidence: [], roleEvidence: [] }), true);
  assert.equal(await memberVisible("A", "speaker", { ...row, orgEvidence: [{ sessionId: "s1", turnId: "t1" }], roleEvidence: [{ sessionId: "s1", turnId: "t1" }] }), true);
  assert.ok(m.calls.length > 0); assert.ok(m.calls.every(c => c.filter.tenantId === "A"));
});

test("speaker metadata eligibility checks withdrawn independent attribute references despite absent values", async () => {
  const m = memory(); seed(m, "A", "Priya");
  m.seed("sessions", { _id: "s2", tenantId: "A", sourceId: "src2", title: "Synthetic withdrawn secondary", date: "2026-10-15" });
  m.seed("sources", { _id: "src2", tenantId: "A", kind: "recording", path: "fixture/secondary", consent: { given: false } });
  const { memberVisible } = createKnowledgeMetadataVisibility(m.db);
  const row = { _id: "A-person:priya", tenantId: "A", evidence: [{ sessionId: "s1", turnId: "t0" }] };
  const refs = [{ sessionId: "s2", turnId: "q0" }];
  assert.equal(await memberVisible("A", "speaker", { ...row, orgEvidence: refs }), false);
  assert.equal(await memberVisible("A", "speaker", { ...row, roleEvidence: refs }), false);
  assert.equal(await memberVisible("A", "speaker", { ...row, orgEvidence: refs, roleEvidence: refs }), false);
  assert.ok(m.calls.some(c => c.name === "sources" && c.filter._id === "src2"));
  assert.ok(m.calls.every(c => c.filter.tenantId === "A"));
});

test("speaker metadata eligibility refuses malformed declared attribute references before source reads", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const { memberVisible } = createKnowledgeMetadataVisibility(m.db);
  const row = { _id: "A-person:priya", tenantId: "A", evidence: [{ sessionId: "s1", turnId: "t0" }] };
  for (const field of ["orgEvidence", "roleEvidence"] as const) {
    for (const refs of [null, {}, "invalid", [null], [{}], [{ sessionId: "" }], [{ sessionId: 42 }]]) {
      assert.equal(await memberVisible("A", "speaker", { ...row, [field]: refs }), false);
    }
  }
  assert.equal(m.calls.length, 0);
});

test("speaker metadata eligibility enforces the combined contributor bound and tenant guard before reads", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const { memberVisible } = createKnowledgeMetadataVisibility(m.db);
  const row = { _id: "A-person:priya", tenantId: "A", evidence: [{ sessionId: "s1", turnId: "t0" }] };
  const refs = Array.from({ length: 250 }, () => ({ sessionId: "s1", turnId: "t1" }));
  assert.equal(await memberVisible("A", "speaker", { ...row, orgEvidence: refs, roleEvidence: refs }), false);
  assert.equal(await memberVisible("B", "speaker", row), false);
  assert.equal(m.calls.length, 0);
});

test("speaker knowledge uses the same authoritative tenant snapshot and revokes withdrawn source", async () => {
  const m = memory(); seed(m, "A", "Priya"); seed(m, "B", "ForeignName");
  const deps = createMongoSpeakerProfileDeps(m.db);
  const view = await deps.getKnowledge!("A", "person:priya");
  assert.ok(view); assert.equal(view.tenantId, "A"); assert.equal(view.personId, "person:priya");
  assert.deepEqual(view.statements.map(s => s.id), ["A-good"]);
  assert.equal(JSON.stringify(view).includes("ForeignName"), false);
  assert.ok(m.calls.some(c => c.session));
  m.rows("sources").find(s => s.tenantId === "A")!.consent = { given: false };
  assert.equal(await deps.getKnowledge!("A", "person:priya"), null);
});

test("source-only authority is session-free and relation-independent with exact effective transcript hashes", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const authority = await readSpeakerKnowledgeAuthority({ collection: m.db.collection.bind(m.db) }, "A", "person:priya");
  assert.ok(authority); assert.equal(authority.view.identityStatus, "human-confirmed");
  const turns = m.rows("turns") as unknown as Turns[];
  assert.equal(authority.transcriptHashes.s1, speakerTranscriptHash(turns));
  assert.equal(m.calls.some(c => c.name === "speaker_relationships"), false);
  assert.equal(m.calls.some(c => c.session), false);
  m.seed("speaker_relationships", { _id: "irrelevant", tenantId: "A", status: "accepted" });
  const again = await readSpeakerKnowledgeAuthority({ collection: m.db.collection.bind(m.db) }, "A", "person:priya");
  assert.equal(again?.view.revision, authority.view.revision);
});

test("optional accepted relationship reader runs only inside existing source snapshot", async () => {
  const m = memory(); seed(m, "A", "Priya");
  m.seed("claims", { _id: "A-second", tenantId: "A", text: "Second claim", status: "verified", evidence: [{ sessionId: "s1", turnId: "t1" }] });
  let called = 0;
  const deps = createMongoSpeakerProfileDeps(m.db, async (snapshotDb, tenant, person, authority) => {
    called++; assert.equal("client" in snapshotDb, false); assert.equal(tenant, "A"); assert.equal(person, "person:priya");
    assert.ok(m.calls.at(-1)?.session); assert.equal(authority.view.edges.some(e => e.type === "contradicts"), false);
    return [{ id: "r", tenantId: "A", status: "accepted", type: "contradicts", fromClaimId: "A-good", toClaimId: "A-second", evidence: [{ sessionId: "s1", turnId: "t1", quote: "A visa knowledge", transcriptHash: authority.transcriptHashes.s1! }] }];
  });
  const view = await deps.getKnowledge!("A", "person:priya");
  assert.equal(called, 1); assert.equal(view?.edges.filter(e => e.type === "contradicts").length, 1);
  m.rows("sources")[0]!.consent = { given: false };
  assert.equal(await deps.getKnowledge!("A", "person:priya"), null); assert.equal(called, 1);
});

test("source-only attribute authority exposes exact confirmed blocks without recursive accepted attributes", async () => {
  const m = memory(); seed(m, "A", "Priya");
  const readDb = { collection: m.db.collection.bind(m.db) };
  const authority = await readSpeakerAttributeAuthority(readDb, "A", "person:priya");
  assert.ok(authority);
  assert.deepEqual(authority.attributedTurns, [{ sessionId: "s1", turnId: "t1", text: "A visa knowledge", speakerRef: "spk:1", startTurnIndex: 1, endTurnIndex: 1 }]);
  m.seed("speaker_attributes", { _id: "proposed", tenantId: "A", personId: "person:priya", status: "accepted" });
  assert.equal((await readSpeakerAttributeAuthority(readDb, "A", "person:priya"))?.view.revision, authority.view.revision);
  assert.equal(m.calls.some(c => c.name === "speaker_attributes" || c.name === "speaker_relationships" || c.session), false);
});

test("accepted attributes update profile and graph in the same source snapshot and clear revoked cached fields", async () => {
  const m = memory(); seed(m, "A", "Priya");
  m.rows("speakers")[0]!.org = "Cached organization"; m.rows("speakers")[0]!.role = "Cached role";
  let active = true; const baseRevisions: string[] = [];
  const deps = createMongoSpeakerProfileDeps(m.db, undefined, async (snapshotDb, tenant, person, authority) => {
    assert.equal("client" in snapshotDb, false); assert.equal(tenant, "A"); assert.equal(person, "person:priya"); assert.ok(m.calls.at(-1)?.session);
    assert.equal(authority.attributedTurns[0]?.turnId, "t1"); baseRevisions.push(authority.view.revision);
    const accepted: AcceptedAttributes = { revision: (active ? "a" : "b").repeat(64), withheldFields: [], fields: active ? { org: { value: "visa", evidence: [{ sessionId: "s1", turnId: "t1", quote: "A visa knowledge", transcriptHash: authority.transcriptHashes.s1!, speakerRef: "spk:1", startTurnIndex: 1, endTurnIndex: 1 }] } } : {} };
    return accepted;
  });
  const profile = await deps.get("A", "person:priya"); const graph = await deps.getKnowledge!("A", "person:priya");
  assert.equal(profile?.organizations[0]?.value, "visa"); assert.deepEqual(profile?.roles, []);
  assert.ok(graph); active = false;
  const revoked = await deps.get("A", "person:priya"); const revokedGraph = await deps.getKnowledge!("A", "person:priya");
  assert.deepEqual(revoked?.organizations, []); assert.deepEqual(revoked?.roles, []);
  assert.notEqual(graph.revision, revokedGraph?.revision); assert.equal(new Set(baseRevisions).size, 1);
});
