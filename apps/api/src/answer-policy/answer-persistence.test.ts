import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AskV2Result } from "@lkb/ask";
import { httpRequest, resolveAll } from "@lkb/ingest";
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
  const body = '<html><head><title>Observatory</title><style>@keyframes mask{to{opacity:0}}p:empty{display:none}.animated{animation:mask 2s}.tab:not(.active){display:none}.tool[hidden]{display:none}</style></head>'
    + "<body><!--" + " ".repeat(300_000) + "--><div>Which is the largest moon and planet?</div><main><article>"
    + '<div class="tab"><p>Wrong hidden planet and moon.</p></div><div class="animated">Wrong animated planet and moon.</div>'
    + '<p>' + sentence + '</p></article></main></body></html>';
  const r = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async () => ({ status: 200, body, location: null }) });
  const s = await r.resolve("Which planet is the largest moon larger than?", url);
  assert.deepEqual(s, { title: "Observatory", url, content: sentence });
});

test("linked and imported publisher styles use their canonical bases and are re-read for verification", async () => {
  const entry = "https://observatory.example/old", page = "https://observatory.example/facts/page";
  const sheet = "https://observatory.example/assets/screen.css", cdn = "https://media.example/css/screen.css";
  const imported = "https://media.example/css/content.css", sentence = "Titan has a dense nitrogen atmosphere.";
  const archive = "Archive: Titan has a dense nitrogen atmosphere.";
  const body = `<html><head><title>Observatory</title><base href="../assets/">
    <link rel="preload STYLESHEET" href="screen.css"><link rel="stylesheet" href="./screen.css">
    <link rel="preload" as="font" href="font.woff2"></head><body><main>
    <div class="drawer"><p data-section="archive-note">${archive}</p></div>
    <div class="drawer"><div><p data-section="archive-note">${sentence}</p></div></div>
    </main></body></html>`;
  const calls: string[] = [];
  let contentCss = '@media (max-width: 600px) { main .drawer > :is(p, span)[data-section^="archive"] { display: none } }';
  const reader = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async (url, opts) => {
    calls.push(url);
    assert.equal(opts.address, "93.184.216.34");
    if (url === entry || url === sheet) return { status: 302, location: url === entry ? page : cdn, body: "" };
    const content = new Map([[page, body], [cdn, '@import url("content.css"); p::before { display: none }'], [imported, contentCss]]).get(url);
    return { status: content === undefined ? 404 : 200, location: null, body: content ?? "" };
  } });
  const source = await reader.resolve(sentence, entry);
  assert.deepEqual(source, { url: page, title: "Observatory", content: sentence });
  assert.deepEqual(calls, [entry, page, sheet, cdn, imported]);
  const bind = (content: string) => {
    const item = { ...source!, content };
    return { id: "web:0", origin: "web" as const, source: item, fingerprint: digest(item), excerpt: content };
  };
  assert.equal(await reader.verify("tenant-a", [bind(sentence)]), true);
  assert.equal(await reader.verify("tenant-a", [bind(archive)]), false);
  contentCss += "\n:root{visibility:hidden}";
  assert.equal(await reader.verify("tenant-a", [bind(sentence)]), false);
  assert.deepEqual(calls.slice(-4), [page, sheet, cdn, imported]);
});

test("publisher root attributes, inline CSS and linked visibility apply to descendant quotations", async () => {
  const sentence = "Titan has a dense nitrogen atmosphere.";
  let root = "", css = "";
  const reader = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async url => ({
    status: 200, location: null, body: url.endsWith(".css") ? css
      : `<html ${root}><head><title>Observatory</title><link rel="stylesheet" href="base.css"></head>
        <body><main><p>${sentence}</p></main></body></html>`,
  }) });
  const page = "https://observatory.example/page";
  assert.equal((await reader.resolve(sentence, page))?.content, sentence);
  for (root of ["hidden", "aria-hidden=true", 'style="visibility: hidden"', 'style="opacity: 0"']) {
    assert.equal(await reader.resolve(sentence, page), null);
  }
  root = "class=unpublished";
  css = ':root.unpublished{visibility:hidden} main {visibility:visible}';
  assert.equal(await reader.resolve(sentence, page), null);
});

test("the publisher read withholds evidence when a linked stylesheet is missing or unassessable", async () => {
  const sentence = "Titan has a dense nitrogen atmosphere.";
  const page = "https://observatory.example/page", sheet = "https://observatory.example/base.css";
  const body = `<title>Observatory</title><link rel="stylesheet" href="${sheet}"><main><p>${sentence}</p></main>`;
  const missing = { status: 404, location: null, body: "" };
  let fetched = missing;
  const reader = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async url => {
    if (url === page) return { status: 200, location: null, body };
    return url === sheet ? fetched : missing;
  } });
  assert.equal(await reader.resolve(sentence, page), null);
  for (const invalid of ["<html><p>Stylesheet unavailable</p></html>", "svg|a {display:none}", '@import "missing.css";']) {
    fetched = { status: 200, location: null, body: invalid };
    assert.equal(await reader.resolve(sentence, page), null);
  }
});

test("stylesheets share the document's byte and time limits and the stylesheet count is bounded", async () => {
  const page = "https://observatory.example/page", css = "p { color: rebeccapurple }", sentence = "Titan has a dense nitrogen atmosphere.";
  const html = (hrefs: string[]) => `<title>Observatory</title>${hrefs.map(href => `<link rel="stylesheet" href="${href}">`).join("")}`
    + `<main><p>${sentence}</p></main>`;
  let clock = 0, step = 60, body = html(["base.css"]);
  const budgets: Array<[number, number]> = [];
  const reader = createPublisherEvidenceReader({ now: () => clock, timeoutMs: 100, maxBytes: Buffer.byteLength(body) + 8,
    resolve: async () => ["93.184.216.34"], request: async (url, opts) => {
      budgets.push([opts.maxBytes, opts.timeoutMs]);
      clock += step;
      return { status: 200, location: null, body: url === page ? body : css };
    } });
  assert.equal(await reader.resolve(sentence, page), null);
  assert.deepEqual(budgets, [[Buffer.byteLength(body) + 8, 100], [8, 40]]);
  clock = 0; step = 0;
  assert.equal(await reader.resolve(sentence, page), null);
  assert.deepEqual(budgets.at(-1), [8, 100]);
  body = html(Array.from({ length: 17 }, (_, i) => `style-${i}.css`));
  const requests: string[] = [];
  const countLimited = createPublisherEvidenceReader({ resolve: async () => ["93.184.216.34"], request: async url => {
    requests.push(url);
    return { status: 200, location: null, body: url === page ? body : css };
  } });
  assert.equal(await countLimited.resolve(sentence, page), null);
  assert.deepEqual(requests, [page]);
});

test("a linked stylesheet holds the same publisher concurrency slot as its document", async () => {
  const first = "https://observatory.example/first", second = "https://observatory.example/second";
  const sheet = "https://observatory.example/base.css", sentence = "Titan has a dense nitrogen atmosphere.";
  let markStarted!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const reader = createPublisherEvidenceReader({ concurrency: 1, resolve: async () => ["93.184.216.34"], request: async url => {
    calls.push(url);
    if (url === sheet) { markStarted(); await held; }
    const link = url === first ? '<link rel="stylesheet" href="base.css">' : "";
    const body = url === sheet ? "p { color: black }" : `<title>Observatory</title>${link}<p>${sentence}</p>`;
    return { status: 200, location: null, body };
  } });
  const a = reader.resolve(sentence, first);
  await Promise.race([started, a]);
  const b = reader.resolve(sentence, second);
  await Promise.resolve();
  const during = calls.slice();
  release();
  assert.deepEqual(during, [first, sheet]);
  assert.deepEqual((await Promise.all([a, b])).map(item => item?.url), [first, second]);
  assert.deepEqual(calls, [first, sheet, second]);
});

test("NASA's Titan facts reference resolves the visible Mercury paragraph with linked CSS", {
  skip: process.env.LKB_TEST_LIVE_NASA !== "1",
}, async () => {
  const url = "https://science.nasa.gov/saturn/moons/titan/facts/", requests: string[] = [];
  let acquisitionFailure = "";
  const recordFailure = (error: unknown): never => { acquisitionFailure = String(error); throw error; };
  const reader = createPublisherEvidenceReader({
    resolve: (host, opts) => resolveAll(host, opts).catch(recordFailure),
    request: (href, opts) => { requests.push(href); return httpRequest(href, opts).catch(recordFailure); },
  });
  const source = await reader.resolve("According to NASA, what is Saturn's largest moon, and which planet is it larger than? Please cite the web source.", url);
  assert.ok(requests.some(href => href !== url), acquisitionFailure || "the guarded reader must acquire the live linked styles");
  assert.ok(source);
  assert.equal(source.url, url);
  assert.match(source.content, /larger than even the planet Mercury/);
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
