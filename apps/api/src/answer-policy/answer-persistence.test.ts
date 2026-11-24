import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AskV2Result } from "@lkb/ask";
import { resolveAll } from "@lkb/ingest";
import { answerEvidence, createMongoEvidenceVerifier, createPublisherEvidenceReader, digest } from "./answer-evidence.js";
import { createMongoAnswerRecordStore, ANSWER_RUNS } from "./answer-mongo-store.js";
import { answerTestDb } from "./answer-testdb.js";
import type { AnswerRun, SourceConflict } from "./answer-records.js";
import { headId, type ReviewHead } from "../transcript-review/store.js";

const text = "Fee is 100.", sha = (value: string) => createHash("sha256").update(value).digest("hex");
const actor = { actor: "api-key:tenant-a" };

test("publisher evidence preserves final URL, page title and visible quotation on each fresh read", async () => {
  let html = '<html><head><title>Observatory</title><style>.suppressed{visibility:hidden}</style></head><body><section class="suppressed"><p>Titan Titan Saturn secret.</p></section><p hidden>Titan Saturn hidden.</p><div style="display:none"><p>Another hidden Titan.</p></div><p>Titan is a moon of Saturn.</p></body></html>';
  const final = "https://observatory.example/titan";
  const hosts: string[] = [];
  const reader = createPublisherEvidenceReader({ resolve: async host => { hosts.push(host); return ["93.184.216.34"]; },
    request: async url => url === final ? { status: 200, body: html, location: null } : { status: 302, body: "", location: final } });
  const source = await reader.resolve("Titan Saturn", "https://discovery.example/page");
  assert.deepEqual(source, { url: final, title: "Observatory", content: "Titan is a moon of Saturn." });
  assert.deepEqual(hosts, ["discovery.example", "observatory.example"]);
  const bind = (s: Record<string, unknown>) => ({ id: "web:0", origin: "web" as const, source: s, fingerprint: digest(s), excerpt: String(s.content) });
  for (const off of [{ title: "Changed publisher" }, { content: "Titan Saturn hidden." }, { snippet: "extra" }, { url: "https://discovery.example/page" }]) {
    assert.equal(await reader.verify("tenant-a", [bind({ ...source, ...off })]), false);
  }
  assert.equal(await reader.verify("tenant-a", [bind(source!)]), true);
  html = html.replace("Titan is a moon of Saturn.", "The page has been revised.");
  assert.equal(await reader.verify("tenant-a", [bind(source!)]), false);
});

test("publisher redirects keep the original deadline and enforce HTTPS at each hop", async () => {
  let clock = 0, location = "https://redirect.example/final";
  const calls: string[] = [], budgets: number[] = [];
  const reader = createPublisherEvidenceReader({ now: () => clock, timeoutMs: 100,
    resolve: async (_host, opts) => { budgets.push(opts!.timeoutMs); clock += 30; return ["93.184.216.34"]; },
    request: async url => { calls.push(url); clock += 24; return { status: 302, location, body: "" }; } });
  assert.equal(await reader.resolve("planet", "https://publisher.example/page"), null);
  assert.deepEqual(budgets, [100, 46]); assert.equal(calls.length, 2);
  for (location of ["http://other.example/page", "https://other.example:8443/page", "https://user@other.example/page"]) {
    calls.length = 0;
    assert.equal(await reader.resolve("planet", "https://publisher.example/page"), null);
    assert.deepEqual(calls, ["https://publisher.example/page"]);
  }
});

test("substantial publisher pages favor article evidence and omit animated or conditionally hidden passages", async () => {
  const url = "https://observatory.example/report", sentence = "The largest moon is larger than the planet Mercury.";
  const body = '<html><head><title>Observatory</title><style>@keyframes mask{to{opacity:0}}.animated{animation:mask 2s}.tab:not(.active){display:none}.tool[hidden]{display:none}</style></head>'
    + "<body><!--" + " ".repeat(300_000) + "--><div>Which is the largest moon and planet?</div><main><article>"
    + '<div class="tab"><p>Wrong hidden planet and moon.</p></div><div class="animated">Wrong animated planet and moon.</div>'
    + '<p>' + sentence + '</p></article></main></body></html>';
  const r = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async () => ({ status: 200, body, location: null }) });
  const s = await r.resolve("Which planet is the largest moon larger than?", url);
  assert.deepEqual(s, { title: "Observatory", url, content: sentence });
});

test("redirected publisher DNS lookup is cancelled at the original deadline before a second connection", async () => {
  const calls: string[] = [], budgets: number[] = [];
  let cancelled = false;
  const reader = createPublisherEvidenceReader({ timeoutMs: 160,
    resolve: async (host, opts) => {
      budgets.push(opts!.timeoutMs);
      if (host === "first.example") return ["93.184.216.34"];
      return resolveAll(host, { timeoutMs: opts!.timeoutMs, resolver: {
        resolve4: () => new Promise(() => {}), resolve6: () => new Promise(() => {}),
        cancel: () => { cancelled = true; },
      } });
    },
    request: async url => { calls.push(url); await new Promise(done => setTimeout(done, 35)); return { status: 302, location: "https://second.example/page", body: "" }; } });
  const start = performance.now();
  assert.equal(await reader.resolve("saturn", "https://first.example/page"), null);
  assert.equal(cancelled, true); assert.deepEqual(calls, ["https://first.example/page"]);
  assert.ok(budgets[1]! < budgets[0]! - 15);
  assert.ok(performance.now() - start < 500, "lookup must return after its guard deadline");
});
function fixture() {
  const db = answerTestDb(), quote = { id: "q1", nodeId: "n1", sessionRef: "s1", turnId: "t1", speakerRef: "spk:0", tStart: 10, tEnd: 20,
    charStart: 0, charEnd: text.length, byteStart: 0, byteEnd: Buffer.byteLength(text), turnTextSHA256: sha(text), sliceSHA256: sha(text), quote: text, origin: "speech" };
  db.rows("sessions").push({ _id: "s1", tenantId: "tenant-a", sourceId: "source1" });
  db.rows("sources").push({ _id: "source1", tenantId: "tenant-a", kind: "recording" });
  db.rows("turns").push({ _id: "t1", tenantId: "tenant-a", sessionId: "s1", speakerRef: "spk:0", tStart: 10, tEnd: 20, text });
  const candidate: AskV2Result = { answer: text, verdict: "ambiguous", reason: "partial", scored: [], auditLog: [], web_used: false, insufficient_coverage: true,
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [quote] } }], web: [] } };
  const evidence = answerEvidence(candidate);
  const run: AnswerRun = { id: "run1", tenantId: "tenant-a", actor, createdAt: "2026-10-14T00:00:00.000Z", query: "Fee?", questionClass: "fees", filters: { sessionIds: [], sources: "internal" }, evidenceMode: true,
    state: "review", reason: "insufficient-coverage", candidate, candidateDigest: digest(candidate), evidenceDigest: digest(evidence), evidence, policy: null, feedback: [] };
  return { ...db, run, evidence };
}
test("real Mongo adapter uses tenant-filtered durable identity; restart and review CAS retain immutable candidate", async () => {
  const f = fixture(), first = createMongoAnswerRecordStore(f.db); await first.create("tenant-a", f.run);
  const afterRestart = createMongoAnswerRecordStore(f.db);
  assert.equal((await afterRestart.get("tenant-a", "run1"))!.candidate.answer, text);
  assert.equal(await afterRestart.get("tenant-b", "run1"), null); assert.deepEqual(await afterRestart.list("tenant-b", 100), []);
  const review = { decision: "approved" as const, by: actor, note: "Inspected original evidence", at: "2026-10-14T00:01:00.000Z", candidateDigest: f.run.candidateDigest, evidenceDigest: f.run.evidenceDigest };
  assert.equal(await afterRestart.review("tenant-b", "run1", f.run.candidateDigest, review), false);
  assert.equal(await afterRestart.review("tenant-a", "run1", "forged", review), false);
  assert.equal(await afterRestart.review("tenant-a", "run1", f.run.candidateDigest, { ...review, candidateDigest: "forged" }), false);
  const race = await Promise.all([afterRestart.review("tenant-a", "run1", f.run.candidateDigest, review), afterRestart.review("tenant-a", "run1", f.run.candidateDigest, review)]);
  assert.deepEqual(race.sort(), [false, true]);
  assert.equal((await afterRestart.get("tenant-a", "run1"))!.candidateDigest, f.run.candidateDigest);
  assert.equal(f.rows(ANSWER_RUNS).length, 1); assert.equal(f.calls.every((c) => typeof c.filter.tenantId === "string"), true);
  const bRun = { ...f.run, tenantId: "tenant-b", actor: { actor: "api-key:tenant-b" } };
  await afterRestart.create("tenant-b", bRun); assert.equal(f.rows(ANSWER_RUNS).length, 2, "same wire id in another tenant cannot collide");
  await assert.rejects(afterRestart.create("tenant-b", f.run), /tenant mismatch/);
});
test("Mongo conflict identity deduplicates only same tenant/run/source pair and closes atomically", async () => {
  const f = fixture(), store = createMongoAnswerRecordStore(f.db);
  const conflict: SourceConflict = { id: "c1", tenantId: "tenant-a", runId: "run1", createdAt: f.run.createdAt, by: actor, explanation: "Source disagreement", a: f.evidence[0]!, b: { ...f.evidence[0]!, id: "another-real-source" }, candidateDigest: f.run.candidateDigest, evidenceDigest: f.run.evidenceDigest, status: "open" };
  assert.equal((await store.addConflict("tenant-a", conflict)).id, "c1");
  assert.equal((await store.addConflict("tenant-a", { ...conflict, id: "c2", a: conflict.b, b: conflict.a })).id, "c1");
  assert.equal(await store.getConflict("tenant-b", "c1"), null);
  const resolution = { keepSourceId: conflict.a.id, excludeSourceId: conflict.b.id, note: "Reviewed preference", by: actor, at: "2026-10-14T00:01:00.000Z" };
  assert.equal(await store.resolveConflict("tenant-b", "c1", resolution), false);
  assert.equal(await store.resolveConflict("tenant-a", "c1", resolution), true);
  assert.equal(await store.resolveConflict("tenant-a", "c1", resolution), false);
  assert.equal((await createMongoAnswerRecordStore(f.db).getConflict("tenant-a", "c1"))!.resolution!.note, resolution.note);
});
test("answer-record production guard stays closed by default; feedback cap is enforced in the actual Mongo update filter", async () => {
  for (const name of ["lkb", "lkb_staging", "global_university_db"]) assert.throws(() => createMongoAnswerRecordStore(answerTestDb(name).db), { message: `answer records refuse database "${name}"` });
  assert.doesNotThrow(() => createMongoAnswerRecordStore(answerTestDb("lkb").db, { production: true }));
  const f = fixture(), store = createMongoAnswerRecordStore(f.db); await store.create("tenant-a", f.run);
  const item = { rating: "helpful" as const, note: "Useful", by: actor, at: f.run.createdAt };
  assert.equal(await store.feedback("tenant-b", f.run.id, item), false);
  for (let index = 0; index < 100; index++) assert.equal(await store.feedback("tenant-a", f.run.id, item), true);
  assert.equal(await store.feedback("tenant-a", f.run.id, item), false);
  assert.equal((await store.get("tenant-a", f.run.id))!.feedback.length, 100);
});
test("canonical source verifier checks tenant, exact text/hash/byte/tuple/origin and missing metadata", async () => {
  const f = fixture(), verify = createMongoEvidenceVerifier(f.db);
  assert.equal(await verify("tenant-a", f.evidence), true); assert.equal(await verify("tenant-b", f.evidence), false);
  const reordered = structuredClone(f.evidence); reordered[0]!.source = Object.fromEntries(Object.entries(reordered[0]!.source).reverse());
  assert.equal(await verify("tenant-a", reordered), true, "BSON/property order alone cannot change a source revision");
  const turn = f.rows("turns")[0]!, original = structuredClone(turn);
  for (const patch of [{ text: "Fee is 200." }, { speakerRef: "spk:other" }, { tStart: 11 }, { tEnd: 21 }, { sessionId: "other" }, { tenantId: "tenant-b" }]) {
    Object.assign(turn, patch); assert.equal(await verify("tenant-a", f.evidence), false); Object.assign(turn, original);
  }
  for (const patch of [{ charStart: -1 }, { byteEnd: 999 }, { sliceSHA256: "0".repeat(64) }, { origin: "screen-ocr-unverified" }, { nodeId: "foreign-node" }]) {
    const evidence = structuredClone(f.evidence), source = evidence[0]!.source as { evidence: { sourceQuotes: Record<string, unknown>[] } };
    Object.assign(source.evidence.sourceQuotes[0]!, patch); evidence[0]!.fingerprint = digest(evidence[0]!.source);
    assert.equal(await verify("tenant-a", evidence), false);
  }
  f.rows("sources").length = 0; assert.equal(await verify("tenant-a", f.evidence), false);
});
test("WhatsApp current eligibility and trusted web proof are required; denied approval never falls back to raw turn equality", async () => {
  const f = fixture(); f.rows("sources")[0]!.kind = "whatsapp-batch";
  assert.equal(await createMongoEvidenceVerifier(f.db)("tenant-a", f.evidence), false);
  let eligible = true; const seen: unknown[][] = [];
  const verify = createMongoEvidenceVerifier(f.db, undefined, async (...args) => { seen.push(args); return eligible; });
  assert.equal(await verify("tenant-a", f.evidence), true); assert.deepEqual(seen[0], ["tenant-a", "s1", "t1", text]);
  eligible = false; assert.equal(await verify("tenant-a", f.evidence), false, "current rejected/pending invalidation eligibility overrides matching raw bytes");
  const web = { id: "w", origin: "web" as const, source: { url: "https://example.test", content: text }, excerpt: text, fingerprint: digest({ url: "https://example.test", content: text }) };
  assert.equal(await createMongoEvidenceVerifier(f.db)("tenant-a", [web]), false);
  assert.equal(await createMongoEvidenceVerifier(f.db, async (tenant, evidence) => tenant === "tenant-a" && evidence[0]!.fingerprint === web.fingerprint)("tenant-a", [web]), true);
});

test("current committed effective transcript authorizes corrected evidence and invalidates raw or superseded quote hashes", async () => {
  const f = fixture(), verify = createMongoEvidenceVerifier(f.db);
  const head: ReviewHead = { _id: headId("tenant-a", "s1"), tenantId: "tenant-a", sessionId: "s1", revision: "review-1", parentRevision: "base-1",
    overlay: [{ turnId: "t1", text: "Fee is 200.", speakerRef: "spk:reviewed" }],
    audit: { actorRef: "api-key:tenant-a", reviewedAt: "2026-10-14T00:02:00.000Z", reason: "Reviewed correction", changes: [] },
    refresh: { status: "complete", revision: "review-1", targets: ["claims", "vectors", "tree"], completed: ["claims", "vectors", "tree"] }, committedAt: "2026-10-14T00:02:00.000Z" };
  f.rows("transcript_reviews").push({ ...head });
  assert.equal(await verify("tenant-a", f.evidence), false, "unchanged originals cannot publish evidence superseded by review");
  const corrected = structuredClone(f.evidence);
  const source = corrected[0]!.source as { evidence: { sourceQuotes: Record<string, unknown>[] } };
  Object.assign(source.evidence.sourceQuotes[0]!, { quote: "Fee is 200.", speakerRef: "spk:reviewed", turnTextSHA256: sha("Fee is 200."), sliceSHA256: sha("Fee is 200.") });
  corrected[0]!.excerpt = "Fee is 200."; corrected[0]!.fingerprint = digest(corrected[0]!.source);
  assert.equal(await verify("tenant-a", corrected), true, "actual effective-reader overlay bytes match corrected quote provenance");
  assert.equal(f.rows("turns")[0]!.text, text, "verification never writes the original transcript");
  head.overlay[0]!.text = "Fee is 300.";
  assert.equal(await verify("tenant-a", corrected), false, "next committed overlay invalidates the prior corrected quote");
  head.overlay.push({ turnId: "missing-original", text: "Orphan correction", speakerRef: "spk:reviewed" });
  await assert.rejects(verify("tenant-a", corrected), /source passages disappeared/, "orphan overlay cannot fall back to raw originals");
  f.rows("transcript_reviews").length = 0;
  f.rows("transcript_reviews").push({ ...head, _id: headId("tenant-b", "s1"), tenantId: "tenant-b" });
  assert.equal(await verify("tenant-a", f.evidence), true, "foreign tenant overlay cannot change this tenant's evidence");
});
