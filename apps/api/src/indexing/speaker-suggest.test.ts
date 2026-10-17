/**
 * U2.4 / D-141 wiring: indexSession -> suggestSpeakersForSession -> extractSpeakersGrounded({suggest:true}) -> speaker_suggestions.
 * Fakes only (in-memory Db, scripted `complete`); no model call, no network.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions/testdb.js";
import { confirmSpeakerSuggestion, rejectSpeakerSuggestion } from "../../../../packages/db/src/collections/speaker-suggestions/index.js";
import { createLogger } from "../composition/logger.js";
import { resolveSuggestSpeakers } from "../composition/production.js";
import { suggestSpeakersForSession, speakerSuggestEnabled, SPEAKER_SUGGEST_TIMEOUT_MS } from "./speaker-suggest.js";
import { indexSession } from "./session.js";
import { fakeDb, completeWith } from "./testutils.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";

async function visibleIndexFixture() {
  const fixture = fakeDb();
  assert.equal(await createKnowledgeVisibility(fixture.db).sessionVisible("t", "s1"), true, "index fixture needs an own-tenant session and linked recording source; eligibility must not be bypassed");
  return fixture;
}

const T = "tenant-A", S = "s1";
const turn = (id: string, speakerRef: string, text: string, tStart = 0): Turns => ({ _id: id, tenantId: T, sessionId: S, speakerRef, tStart, tEnd: tStart, text });
const TURNS = [
  turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?", 0),
  turn("t1", "spk:1", "I think they are slow to apply.", 1),
  turn("t2", "spk:2", "Next topic please.", 2),
];
const QA = "Priya Nair, what do you think about the new rules";
/** Human decisions fence an existing own-tenant session, including non-native recordings. */
function seedDecisionSession(m: ReturnType<typeof memoryDb>): void {
  m.seed("sessions", { _id: S, tenantId: T, sourceId: "provided-recording" });
  m.seed("sources", { _id: "provided-recording", tenantId: T, kind: "recording", consent: { given: true } });
}
const reply = (json: unknown): CompleteResult => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 } as CompleteResult);
/** Scripted model: proposer calls get the proposal, verifier calls get `verdict`. Records every job kind. */
function scripted(verdict: "yes" | "no" | "unsure" = "yes", name = "Priya Nair", quote = QA) {
  const kinds: string[] = [];
  const complete = async (job: Job): Promise<CompleteResult> => {
    kinds.push(job.kind);
    const sys = String(job.messages[0]?.content ?? "");
    if (sys.includes('"verdict"')) return reply({ verdict });
    return reply([{ label: "spk:1", name, evidenceQuote: quote, evidenceKind: "called-on" }]);
  };
  return { complete, kinds };
}

test("flag helper: OFF unless exactly KB_SPEAKER_SUGGEST=1", () => {
  assert.equal(speakerSuggestEnabled({}), false);
  for (const v of ["", "0", "true", "yes", "on"]) assert.equal(speakerSuggestEnabled({ KB_SPEAKER_SUGGEST: v }), false);
  assert.equal(speakerSuggestEnabled({ KB_SPEAKER_SUGGEST: "1" }), true);
});

test("suggest writes a status=suggested row with its quote, and NEVER a speakers row", async () => {
  const m = memoryDb();
  const { complete, kinds } = scripted("yes");
  const r = await suggestSpeakersForSession(T, S, TURNS, complete, m.db, { now: new Date("2026-10-13T00:00:00Z") });
  assert.deepEqual([r.suggested, r.inserted, r.error], [1, 1, undefined]);
  const rows = m.rows("speaker_suggestions");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, "suggested");
  assert.equal(rows[0]!.displayName, "Priya Nair");
  assert.equal(rows[0]!.tenantId, T);
  assert.ok((rows[0]!.provenance as { evidenceQuote: string }[])[0]!.evidenceQuote.includes("Priya Nair"));
  assert.equal(m.rows("speakers").length, 0, "an AI name is never final");
  assert.ok(kinds.every((k) => k === "speakers"), "every model call uses the speakers route (config/ai-routing.yaml)");
});

test("a verifier that does not say yes yields no suggestion", async () => {
  for (const v of ["no", "unsure"] as const) {
    const m = memoryDb();
    const r = await suggestSpeakersForSession(T, S, TURNS, scripted(v).complete, m.db);
    assert.deepEqual([r.suggested, m.rows("speaker_suggestions").length], [0, 0]);
  }
});

test("an ungrounded name (quote not in the transcript) is not suggested", async () => {
  const m = memoryDb();
  const r = await suggestSpeakersForSession(T, S, TURNS, scripted("yes", "Rohan Gupta", "Rohan Gupta is on the call").complete, m.db);
  assert.equal(r.suggested, 0);
  assert.equal(m.rows("speaker_suggestions").length, 0);
});

test("re-run is idempotent, a REJECTED name is not resurrected, a CONFIRMED row is untouched", async () => {
  const m = memoryDb();
  await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m.db);
  const id = m.rows("speaker_suggestions")[0]!._id as string;
  const again = await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m.db);
  assert.deepEqual([again.inserted, m.rows("speaker_suggestions").length], [0, 1], "idempotent: no duplicate row");
  await rejectSpeakerSuggestion(T, S, id, m.db);
  const afterReject = JSON.stringify(m.rows("speaker_suggestions"));
  const r2 = await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m.db);
  assert.equal(r2.inserted, 0);
  assert.equal(r2.suggested, 0, "a rejected (label, person) is filtered out before docs are even built");
  assert.equal(JSON.stringify(m.rows("speaker_suggestions")), afterReject, "rejection tombstone byte-identical");

  const m2 = memoryDb();
  seedDecisionSession(m2);
  await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m2.db);
  assert.equal((await confirmSpeakerSuggestion(T, S, m2.rows("speaker_suggestions")[0]!._id as string, m2.db)).result, "ok");
  const before = JSON.stringify([m2.rows("speakers"), m2.rows("speaker_suggestions")]);
  await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m2.db);
  assert.equal(JSON.stringify([m2.rows("speakers"), m2.rows("speaker_suggestions")]), before, "human-confirmed provenance + row untouched");
  assert.equal(m2.rows("speakers")[0]!.provenance, "human-confirmed");
});

test("a model that throws never throws out of the hook and writes nothing", async () => {
  const m = memoryDb();
  const r = await suggestSpeakersForSession(T, S, TURNS, async () => { throw new Error("ollama down"); }, m.db);
  assert.equal(r.suggested, 0);
  assert.equal(m.rows("speaker_suggestions").length, 0);
  assert.equal(m.rows("speakers").length, 0);
});

test("indexSession with the flag ABSENT/false: no speakers-route call, no speaker collection touched, no result key", async () => {
  for (const deps of [{}, { suggestSpeakers: false }]) {
    const { db, calls } = await visibleIndexFixture();
    const kinds: string[] = [];
    const inner = completeWith();
    const complete = async (job: { kind: string }) => { kinds.push(job.kind); return inner(job); };
    const res = await indexSession("t", "s1", { complete: complete as never, db, ...deps });
    assert.ok(!kinds.includes("speakers"));
    assert.ok(!calls.some((c) => c.coll === "speaker_suggestions" || c.coll === "speakers"));
    assert.equal("speakerSuggestions" in res, false, "result shape identical to before");
  }
});

test("indexSession with suggestSpeakers:true calls the speakers route and reports the outcome; never writes `speakers`", async () => {
  const { db, calls } = await visibleIndexFixture();
  const kinds: string[] = [];
  const inner = completeWith();
  const complete = async (job: { kind: string }) => { kinds.push(job.kind); return inner(job); };
  const res = await indexSession("t", "s1", { complete: complete as never, db, suggestSpeakers: true });
  assert.ok(kinds.includes("speakers"));
  assert.ok(res.speakerSuggestions);
  assert.equal(calls.filter((c) => c.coll === "speakers").length, 0);
  assert.equal(calls.filter((c) => c.coll === "speaker_suggestions" && ["insertOne", "insertMany", "replaceOne", "deleteMany"].includes(c.op)).length, 0);
});

test("a confirmed label is not given a second AI name on re-index (confirmed list is honoured, not just row idempotence)", async () => {
  const m = memoryDb();
  seedDecisionSession(m);
  await suggestSpeakersForSession(T, S, TURNS, scripted().complete, m.db);
  assert.equal((await confirmSpeakerSuggestion(T, S, m.rows("speaker_suggestions")[0]!._id as string, m.db)).result, "ok");
  const turns = [turn("t0", "spk:0", "Rohan Gupta, what do you think about the new rules?", 0), ...TURNS.slice(1)];
  const r = await suggestSpeakersForSession(T, S, turns, scripted("yes", "Rohan Gupta", "Rohan Gupta, what do you think about the new rules").complete, m.db);
  assert.deepEqual([r.suggested, r.inserted, m.rows("speaker_suggestions").length], [0, 0, 1]);
});

const capture = () => { const lines: string[] = []; return { lines, log: createLogger({ level: "warn", write: (l) => lines.push(l) }) }; };

test("ISS-WU24-001: a failing generation is logged as a structured warning with ids only, and does not throw", async () => {
  const { lines, log } = capture();
  const secret = "SECRET-TRANSCRIPT-TEXT";
  const bad = [turn("t0", "spk:0", secret, 0), turn("t1", "spk:1", "hi", 1)];
  const brokenDb = { collection: () => { throw new Error(`db down ${secret}`); } } as never;
  const r2 = await suggestSpeakersForSession(T, S, bad, scripted().complete, brokenDb, { log });
  assert.equal(r2.suggested, 0);
  assert.ok(r2.error);
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]!);
  assert.equal(rec.level, "warn");
  assert.equal(rec.tenantId, T);
  assert.equal(rec.sessionId, S);
  assert.ok(!lines[0]!.includes(secret), "no transcript text or provider message in the log");
});

test("ISS-WU24-002: a hung hook times out, logs, and returns so indexing continues", async () => {
  const m = memoryDb();
  const { lines, log } = capture();
  const t0 = Date.now();
  const r = await suggestSpeakersForSession(T, S, TURNS, () => new Promise<CompleteResult>(() => {}), m.db, { log, timeoutMs: 50 });
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(r.error, "timeout");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]!).timeoutMs, 50);
  assert.equal(m.rows("speaker_suggestions").length, 0);
});

test("indexSession still completes when the suggestion hook fails", async () => {
  const { db } = await visibleIndexFixture();
  const inner = completeWith();
  const complete = async (job: { kind: string }) => { if (job.kind === "speakers") throw new Error("ollama down"); return inner(job); };
  const res = await indexSession("t", "s1", { complete: complete as never, db, suggestSpeakers: true });
  assert.ok(res.completion);
});

test("production default: suggestions OFF unless KB_SPEAKER_SUGGEST=1; an explicit caller option wins", () => {
  assert.equal(resolveSuggestSpeakers(undefined, {}), false);
  assert.equal(resolveSuggestSpeakers(undefined, { KB_SPEAKER_SUGGEST: "0" }), false);
  assert.equal(resolveSuggestSpeakers(undefined, { KB_SPEAKER_SUGGEST: "1" }), true);
  assert.equal(resolveSuggestSpeakers(false, { KB_SPEAKER_SUGGEST: "1" }), false);
  assert.equal(resolveSuggestSpeakers(true, {}), true);
});

test("ISS-WU24-001: a Db whose find() throws is logged once with the class only, and the result carries a sanitized error", async () => {
  const { lines, log } = capture();
  const secret = "SECRET-DB-MESSAGE";
  const m = memoryDb();
  const findThrows = { collection: () => ({ find: () => { throw new TypeError(secret); } }) } as never;
  const r = await suggestSpeakersForSession(T, S, TURNS, scripted().complete, findThrows, { log });
  assert.deepEqual([r.suggested, r.inserted, r.error], [0, 0, "TypeError"]);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]!).errorName, "TypeError");
  assert.ok(!lines[0]!.includes(secret) && !JSON.stringify(r).includes(secret), "no message in log or result");
  assert.equal(m.rows("speaker_suggestions").length, 0);
});

test("ISS-WU24-001: a degraded run is logged once with the reason, success path unchanged", async () => {
  const { lines, log } = capture();
  const r = await suggestSpeakersForSession(T, S, TURNS, async () => { throw new Error("ollama down"); }, memoryDb().db, { log });
  if (r.degraded) {
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).reason, r.degraded);
  } else assert.equal(lines.length, 0);
  const ok = capture();
  const good = await suggestSpeakersForSession(T, S, TURNS, scripted().complete, memoryDb().db, { log: ok.log });
  assert.deepEqual([good.suggested, good.error, ok.lines.length], [1, undefined, 0], "no log on the success path");
});

test("ISS-WU24-003: the default timeout constant is 300000 ms", () => {
  assert.equal(SPEAKER_SUGGEST_TIMEOUT_MS, 300_000);
});

test("ISS-WU24-003: with the DEFAULT timeout (fake timers) a hung run is abandoned, and a late run writes nothing", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const m = memoryDb();
    const { lines, log } = capture();
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const inner = scripted("yes").complete;
    const p = suggestSpeakersForSession(T, S, TURNS, async (job) => { await gate; return inner(job); }, m.db, { log });
    mock.timers.tick(SPEAKER_SUGGEST_TIMEOUT_MS - 1);
    let settled = false; void p.then(() => { settled = true; });
    await new Promise<void>((res) => setImmediate(res));
    assert.equal(settled, false, "not timed out one tick early");
    mock.timers.tick(1);
    const r = await p;
    assert.equal(r.error, "timeout");
    assert.equal(JSON.parse(lines[0]!).timeoutMs, 300_000);
    release();
    for (let i = 0; i < 20; i++) await new Promise<void>((res) => setImmediate(res));
    assert.equal(m.rows("speaker_suggestions").length, 0, "abandoned run must not insert suggested-only rows");
  } finally { mock.timers.reset(); }
});
