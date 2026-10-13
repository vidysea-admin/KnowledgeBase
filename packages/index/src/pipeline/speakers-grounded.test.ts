/**
 * packages/index/src/pipeline/speakers-grounded.test.ts -- U2.4 model-judged attribution, cycle 2 (D-132, pending append).
 *
 * Two layers. The DETERMINISTIC layer (verbatim quote, the name in it, no second person, not the speaker's own words,
 * adjacency, independence, floor, collisions) must stand on its own: the attack fixtures from the checker's cycles 0 and 1
 * run with a verifier that answers an adversarial "yes" to everything, and must still ship nothing. The VERIFIER layer is
 * exercised with fakes (yes / no / unsure / mixed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import {
  extractSpeakersGrounded, groundSpeakerProposals, groundCandidates, otherNamesIn, normalizeLabel, independent,
  GROUNDED_SYSTEM_PROMPT, type EvidenceKind,
} from "./speakers-grounded.js";
import { buildVerifierWindow, llmVerifier, type SpeakerVerifier, type SpeakerVerdict } from "./speakers-verifier.js";
import { extractSpeakers } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
const completion = (json: unknown, text = ""): CompleteResult => ({ text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const prop = (label: string, name: string, evidenceQuote: string, evidenceKind: string) => ({ label, name, evidenceQuote, evidenceKind });
const threeRuns = (...entries: unknown[]) => [entries, entries, entries];
const always = (verdict: SpeakerVerdict): SpeakerVerifier => async () => ({ verdict });
const YES = always("yes");   // the adversary
const NO = always("no");

// BASE: spk:1 is called on by spk:0 right before its block and thanked by spk:3 right after it.
const BASE = [
  turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"),
  turn("t1", "spk:1", "I think they are slow to apply."),
  turn("t2", "spk:3", "Thank you, Priya Nair, that was really helpful."),
  turn("t3", "spk:2", "Next topic please."),
];
const QA = "Priya Nair, what do you think about the new rules";
const QB = "Thank you, Priya Nair, that was really helpful";
const pair = (ka: string, kb: string) => [prop("spk:1", "Priya Nair", QA, ka), prop("spk:1", "Priya Nair", QB, kb)];
const shipped = async (turns: Turns[], entries: unknown[], v: SpeakerVerifier | undefined = YES) => (await groundSpeakerProposals(turns, threeRuns(...entries), v)).resolved;

for (const kind of ["called-on", "address", "handover", "role-continuity"] as EvidenceKind[]) {
  test(`accepts evidenceKind ${kind} (verified, with an independent thanks from the other side) and stores quote and kind`, async () => {
    const out = await groundSpeakerProposals(BASE, threeRuns(...pair(kind, "thanks")), YES);
    assert.equal(out.resolved.length, 1);
    const s = out.resolved[0];
    assert.deepEqual([s?.speakerRef, s?.displayName, s?.personId], ["spk:1", "Priya Nair", "person:priya-nair"]);
    assert.deepEqual(s?.provenance?.map((p) => [p.turnId, p.evidenceQuote, p.evidenceKind]), [["t0", QA, kind], ["t2", QB, "thanks"]]);
    assert.deepEqual(s?.blocks, [{ startTurnIndex: 1, endTurnIndex: 1 }], "scoped to the one block, never label-wide");
    assert.deepEqual(out.unresolved, ["spk:0", "spk:2", "spk:3"]);
  });
}

test("accepts evidenceKind thanks (the other side may be the call-on)", async () => {
  assert.equal((await shipped(BASE, pair("called-on", "thanks"))).length, 1);
});

test("a clean self-introduction stands alone and needs no verifier", async () => {
  const turns = [turn("t0", "spk:0", "Welcome all."), turn("t1", "spk:1", "Hello, my name is Priya Nair.")];
  const out = await groundSpeakerProposals(turns, threeRuns(prop("spk:1", "Priya Nair", "Hello, my name is Priya Nair", "self-intro")));
  assert.equal(out.resolved.length, 1);
  assert.equal(out.resolved[0]?.provenance?.[0]?.evidenceKind, "self-intro");
});

test("a self-intro exempts the quote from the second-name rule (the speaker names themselves)", async () => {
  const turns = [turn("t0", "spk:0", "Welcome all."), turn("t1", "spk:1", "My name is Ruby. I work at Campus France with Shagun.")];
  const out = await groundSpeakerProposals(turns, threeRuns(prop("spk:1", "Ruby", "My name is Ruby. I work at Campus France with Shagun", "self-intro")));
  assert.equal(out.resolved.length, 1);
});

test("without a verifier, only self-introductions ship", async () => {
  assert.deepEqual((await groundSpeakerProposals(BASE, threeRuns(...pair("called-on", "thanks")))).resolved, []);
});

test("verifier path: a 'no', an 'unsure', or a single 'yes' of three all abstain; two yes and no 'no' ships", async () => {
  assert.deepEqual(await shipped(BASE, pair("called-on", "thanks"), NO), []);
  assert.deepEqual(await shipped(BASE, pair("called-on", "thanks"), always("unsure")), []);
  const seq = (verdicts: SpeakerVerdict[]): SpeakerVerifier => { const n = new Map<string, number>(); return async (q) => { const i = n.get(q.quoteTurnId) ?? 0; n.set(q.quoteTurnId, i + 1); return { verdict: verdicts[i % verdicts.length] ?? "unsure" }; }; };
  assert.deepEqual(await shipped(BASE, pair("called-on", "thanks"), seq(["yes", "unsure", "unsure"])), []);
  assert.deepEqual(await shipped(BASE, pair("called-on", "thanks"), seq(["yes", "yes", "no"])), []);
  assert.equal((await shipped(BASE, pair("called-on", "thanks"), seq(["yes", "yes", "unsure"]))).length, 1);
});

test("the verifier is asked with three DIFFERENT framings and a window with the block opening and the quote turn", async () => {
  const seen: { framing: number; window: string }[] = [];
  const spy: SpeakerVerifier = async (q) => { seen.push({ framing: q.framing, window: q.window }); return { verdict: "yes" }; };
  await shipped(BASE, pair("called-on", "thanks"), spy);
  assert.deepEqual([...new Set(seen.map((s) => s.framing))].sort(), [0, 1, 2]);
  assert.ok(seen.every((s) => s.window.includes("[id:t1] [spk:1]")), "the block opening is in the window");
  assert.ok(seen.some((s) => s.window.includes("[id:t2] [spk:3]")) && seen.some((s) => s.window.includes("[id:t0] [spk:0]")));
});

test("buildVerifierWindow: N turns before the block, its opening, and a far quote turn once", () => {
  const turns = Array.from({ length: 12 }, (_, i) => turn(`t${i}`, i % 2 ? "spk:1" : "spk:0", `line ${i}`));
  const w = buildVerifierWindow(turns, 8, 9, 11).split("\n");
  assert.deepEqual(w.map((l) => l.match(/\[id:(t\d+)\]/)?.[1]), ["t4", "t5", "t6", "t7", "t8", "t9", "t11"]);
});

test("llmVerifier parses yes/no and treats anything else as unsure", async () => {
  const q = { label: "spk:1", name: "Priya Nair", quote: "x y z", quoteTurnId: "t0", blockStart: 1, blockEnd: 1, window: "w", framing: 0 };
  assert.equal((await llmVerifier(async () => completion({ verdict: "YES", turnId: "t0" }))(q)).verdict, "yes");
  assert.equal((await llmVerifier(async () => completion(undefined, '```json\n{"verdict":"no"}\n```'))(q)).verdict, "no");
  assert.equal((await llmVerifier(async () => completion(undefined, "I think so"))(q)).verdict, "unsure");
  assert.equal((await llmVerifier(async () => { throw new Error("429"); })(q)).verdict, "unsure");
});

// ---------- deterministic refusals (an adversarial verifier says yes to every one of these) ----------

test("REJECTS a fabricated quote the transcript never says", async () => {
  assert.deepEqual(await shipped(BASE, [prop("spk:1", "Priya Nair", "Priya Nair, please share your visa experience with us", "called-on"), prop("spk:1", "Priya Nair", QB, "thanks")]), []);
});

test("REJECTS a quote assembled from two turns", async () => {
  assert.deepEqual(await shipped(BASE, [prop("spk:1", "Priya Nair", `${QA}? I think they are slow to apply.`, "called-on"), prop("spk:1", "Priya Nair", QB, "thanks")]), []);
});

test("REJECTS a real quote that does not contain the proposed name", async () => {
  const turns = [turn("t0", "spk:0", "Welcome to the session, everybody here today."), turn("t1", "spk:1", "Priya Nair is my name."), turn("t2", "spk:3", "Thank you, Priya Nair, that was really helpful.")];
  assert.deepEqual(await shipped(turns, [prop("spk:1", "Priya Nair", "Welcome to the session, everybody here today", "address"), prop("spk:1", "Priya Nair", QB, "thanks")]), []);
});

test("REJECTS a name the transcript never spells in full; accepts a first-name quote once the full name is spoken", async () => {
  const first = BASE.map((t) => ({ ...t, text: t.text.replaceAll("Priya Nair", "Priya") }));
  const entries = [prop("spk:1", "Priya Nair", "Priya, what do you think about the new rules", "called-on"), prop("spk:1", "Priya Nair", "Thank you, Priya, that was really helpful", "thanks")];
  assert.deepEqual(await shipped(first, entries), [], "a surname the transcript does not say is invention");
  assert.equal((await shipped([...first, turn("t9", "Priya Nair", "Priya Nair is a guest here today.")], entries)).length, 1);
});

test("REJECTS a bare first name when a rival proposal shares the token", async () => {
  const first = [...BASE.map((t) => ({ ...t, text: t.text.replaceAll("Priya Nair", "Priya") })), turn("t9", "Priya Nair", "Priya Nair and Priya Rao are here.")];
  const mine = [prop("spk:1", "Priya Nair", "Priya, what do you think about the new rules", "called-on"), prop("spk:1", "Priya Nair", "Thank you, Priya, that was really helpful", "thanks")];
  assert.equal((await shipped(first, mine)).length, 1, "control: unambiguous alone");
  assert.deepEqual(await shipped(first, [...mine, prop("spk:2", "Priya Rao", "Priya, what do you think about the new rules", "called-on")]), []);
});

test("REJECTS a quote whose name sits inside quoted or reported speech", async () => {
  const turns = [turn("t0", "spk:0", "People always say, Priya Nair, what do you think about this."), turn("t1", "spk:1", "Slow."), turn("t2", "spk:3", QB + ".")];
  assert.deepEqual(await shipped(turns, [prop("spk:1", "Priya Nair", "People always say, Priya Nair, what do you think about this", "called-on"), prop("spk:1", "Priya Nair", QB, "thanks")]), []);
});

test("REJECTS a quote spoken by the label itself unless it is a clean self-introduction", async () => {
  const turns = [turn("t0", "spk:0", "Welcome."), turn("t1", "spk:1", "As Priya Nair told me yesterday, visas are slow to process."), turn("t2", "spk:3", QB + ".")];
  assert.deepEqual(await shipped(turns, [prop("spk:1", "Priya Nair", "As Priya Nair told me yesterday, visas are slow to process", "role-continuity"), prop("spk:1", "Priya Nair", QB, "thanks")]), []);
});

test("REJECTS a quote that is not adjacent to a block of the label", async () => {
  const turns = [turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"), turn("t1", "spk:2", "Fine."), turn("t2", "spk:1", "Slow."), turn("t3", "spk:3", QB + ".")];
  assert.deepEqual(await shipped(turns, pair("called-on", "thanks")), [], "spk:2 answered, so the call-on does not reach spk:1");
});

test("REJECTS a name that contradicts the deterministic floor, and ships the same proposals without the floor fact", async () => {
  const mk = (selfText: string) => [turn("t0", "spk:1", "Rahul Mehta, what would you add?"), turn("t1", "spk:0", selfText), turn("t2", "spk:3", "Thank you, Rahul Mehta, that was helpful.")];
  const entries = [prop("spk:0", "Rahul Mehta", "Rahul Mehta, what would you add", "called-on"), prop("spk:0", "Rahul Mehta", "Thank you, Rahul Mehta, that was helpful", "thanks")];
  assert.deepEqual(await shipped(mk("My name is Jubin Thakkar."), entries), [], "spk:0 introduced itself as Jubin Thakkar");
  assert.equal((await shipped(mk("I think visas are slow to process these days."), entries)).length, 1, "control");
});

test("REJECTS a name already held by another label's floor identity", async () => {
  const turns = [...BASE.slice(0, 3), turn("t3", "spk:2", "My name is Priya Nair.")];
  assert.deepEqual(await shipped(turns, pair("called-on", "thanks")), []);
});

test("a proposal that agrees with the floor still ships", async () => {
  const turns = [turn("t0", "spk:1", "Jubin, what would you add?"), turn("t1", "spk:0", "My name is Jubin Thakkar.")];
  assert.equal((await shipped(turns, [prop("spk:0", "Jubin Thakkar", "My name is Jubin Thakkar", "self-intro")])).length, 1);
});

test("the vote is keyed on (label, name), not the quote: 2 of 3 runs hold, 1 does not, different quotes per run still count", async () => {
  const [a, b] = pair("called-on", "thanks");
  assert.deepEqual((await groundSpeakerProposals(BASE, [[a, b], [], []], YES)).resolved, []);
  assert.equal((await groundSpeakerProposals(BASE, [[a, b], [], [a, b]], YES)).resolved.length, 1);
  assert.equal((await groundSpeakerProposals(BASE, [[a], [b], [a, b]], YES)).resolved.length, 1, "run 1 quoted only A, run 2 only B, run 3 both");
});

test("one label proposed with two names is left unresolved", async () => {
  const turns = [...BASE, turn("t4", "spk:0", "Rahul Mehta, how would you handle the budget?"), turn("t5", "spk:1", "Split it."), turn("t6", "spk:3", "Thank you, Rahul Mehta, very clear.")];
  const entries = [...pair("called-on", "thanks"), prop("spk:1", "Rahul Mehta", "Rahul Mehta, how would you handle the budget", "called-on"), prop("spk:1", "Rahul Mehta", "Thank you, Rahul Mehta, very clear", "thanks")];
  const out = await groundSpeakerProposals(turns, threeRuns(...entries), YES);
  assert.deepEqual(out.resolved, []);
  assert.ok(out.unresolved.includes("spk:1"));
});

test("one name grounded on two labels ships on neither", async () => {
  const turns = [...BASE, turn("t4", "spk:5", "Priya Nair, how would you handle the budget?"), turn("t5", "spk:4", "Split it."), turn("t6", "spk:6", "Thank you, Priya Nair, very clear."), turn("t7", "spk:7", "Okay.")];
  const rival = [prop("spk:4", "Priya Nair", "Priya Nair, how would you handle the budget", "called-on"), prop("spk:4", "Priya Nair", "Thank you, Priya Nair, very clear", "thanks")];
  assert.equal((await shipped(turns, pair("called-on", "thanks"))).length, 1, "control: spk:1 alone ships");
  assert.deepEqual(await shipped(turns, [...pair("called-on", "thanks"), ...rival]), []);
});

test("legacy-shaped and malformed proposals abstain", async () => {
  const legacy = [{ speakerRef: "spk:1", displayName: "Priya Nair", turnIds: ["t1"] }, { label: "spk:1", name: "Priya Nair", evidenceKind: "called-on" }, { label: "spk:1", name: "Priya Nair", evidenceQuote: QA, evidenceKind: "vibes" }];
  assert.deepEqual(await shipped(BASE, legacy), []);
});

// ---------- the checker's attack fixtures (cycles 0 and 1) against an ADVERSARIAL "yes" verifier ----------

const RASHI = [
  turn("t0", "spk:1", "Hello everyone, I will cover the visa part now."),
  turn("t1", "spk:0", "Thanks Rashi, that was clear. Now over to our next speaker."),
  turn("t2", "spk:2", "Good morning, I will talk about study permits."),
  turn("t3", "spk:1", "One more point on visas."),
  turn("t4", "spk:0", "Thank you Rashi, great point. Next up we have a speaker on visas."),
  turn("t5", "spk:2", "Right, so the permits work like this."),
  turn("t6", "spk:1", "Last remark on visas."),
  turn("t7", "spk:3", "Thanks, Rashi, for the clear answer."),
];
const [RQ1, RQ2, RQ3] = ["Thanks Rashi, that was clear", "Thank you Rashi, great point", "Thanks, Rashi, for the clear answer"];

test("cycle 0 (ISS-U24SMART-001): a thank-you before another speaker's block never makes that speaker Rashi, any kind", async () => {
  for (const kind of ["address", "called-on", "handover", "thanks", "role-continuity"]) {
    assert.deepEqual(await shipped(RASHI, [prop("spk:2", "Rashi", RQ1, kind), prop("spk:2", "Rashi", RQ2, kind)]), [], `spk:2 via ${kind}`);
    assert.deepEqual(await shipped(RASHI, [prop("spk:2", "Rashi", RQ1, kind), prop("spk:2", "Rashi", RQ3, kind)]), [], `spk:2 via ${kind}, third thanker two turns after its block`);
  }
});

test("cycle 0 control: thank-yous naming the speaker they follow ship spk:1 only with a witness from the other side", async () => {
  const ext = [...RASHI, turn("t8", "spk:4", "Rashi, what do you think about the visas?"), turn("t9", "spk:1", "They are fine.")];
  const call = prop("spk:1", "Rashi", "Rashi, what do you think about the visas", "called-on");
  const ok = await shipped(ext, [prop("spk:1", "Rashi", RQ1, "thanks"), call]);
  assert.deepEqual(ok.map((r) => [r.speakerRef, r.displayName]), [["spk:1", "Rashi"]], "a thank-you after the block and a call-on before it");
  assert.deepEqual(await shipped(RASHI, [prop("spk:1", "Rashi", RQ1, "thanks"), prop("spk:1", "Rashi", RQ3, "thanks")]), [], "host and cohost thanking after the block are one pattern");
  assert.deepEqual(await shipped(RASHI, [prop("spk:1", "Rashi", RQ1, "thanks"), prop("spk:1", "Rashi", RQ2, "thanks")]), [], "one host repeating one pattern is one witness");
});

test("cycle 1 attack (a): a second name in the quote ('hand over to Ruby') never makes the next speaker Ruby", async () => {
  const turns = [
    turn("t0", "spk:0", "Rashi, can you hand over to Ruby for the next part?"), turn("t1", "spk:1", "Sure, here we go with the fees."),
    turn("t2", "spk:3", "Rashi, could you hand over to Ruby after fees?"), turn("t3", "spk:1", "Yes, that is the plan."),
    turn("t4", "spk:2", "Hello, Ruby here, glad to be on the panel."),
  ];
  for (const kind of ["handover", "address"]) {
    assert.deepEqual(await shipped(turns, [prop("spk:1", "Ruby", "Rashi, can you hand over to Ruby for the next part", kind), prop("spk:1", "Ruby", "Rashi, could you hand over to Ruby after fees", kind)]), [], kind);
  }
});

test("cycle 1 attack (b): 'Welcome Ruby, and Rashi will go first' never makes the next speaker Ruby", async () => {
  const turns = [
    turn("t0", "spk:0", "Welcome Ruby, and Rashi will go first today."), turn("t1", "spk:1", "Thanks, I will start with visas."),
    turn("t2", "spk:3", "Hello Ruby, Rashi will now present."), turn("t3", "spk:1", "Right, visas first."),
    turn("t4", "spk:2", "My name is Ruby."),
  ];
  assert.deepEqual(await shipped(turns, [prop("spk:1", "Ruby", "Welcome Ruby, and Rashi will go first today", "address"), prop("spk:1", "Ruby", "Hello Ruby, Rashi will now present", "address")]), []);
});

test("cycle 1 attack (c): a one-turn backchannel between quote and answer; a host and a cohost are one handover, not two witnesses", async () => {
  const turns = [
    turn("t0", "spk:0", "Priya Nair, what do you think about the rules?"), turn("t1", "spk:2", "Yes please."), turn("t2", "spk:1", "I think the rules are slow."),
    turn("t3", "spk:3", "Priya Nair, what do you think about the fees?"), turn("t4", "spk:2", "Go ahead."), turn("t5", "spk:1", "Fees are fine."),
    turn("t6", "spk:4", "Closing remarks now."),
  ];
  const wrong = [prop("spk:2", "Priya Nair", "Priya Nair, what do you think about the rules", "called-on"), prop("spk:2", "Priya Nair", "Priya Nair, what do you think about the fees", "called-on")];
  assert.deepEqual(await shipped(turns, wrong), [], "spk:2 is the backchannel, not Priya");
  const { candidates } = groundCandidates(turns, [wrong]);
  const [a, b] = candidates[0] ?? [];
  assert.ok(a && b && !independent(a, b), "both quotes lead into spk:2 from the same side");
});

test("independence: different speakers on opposite sides count; same side, same speaker or inside do not", () => {
  const base = { label: "spk:1", name: "N", kind: "address" as EvidenceKind, quote: "q", turnId: "t", sessionId: "s", block: { startTurnIndex: 1, endTurnIndex: 1 }, run: 0 };
  const c = (turnIdx: number, speaker: string, side: "before" | "after" | "inside") => ({ ...base, turnIdx, speaker, side });
  assert.ok(independent(c(0, "spk:0", "before"), c(2, "spk:3", "after")));
  assert.ok(!independent(c(0, "spk:0", "before"), c(5, "spk:3", "before")), "host + cohost, same side");
  assert.ok(!independent(c(0, "spk:0", "before"), c(2, "spk:0", "after")), "one speaker twice");
  assert.ok(!independent(c(0, "spk:0", "before"), c(1, "spk:1", "inside")));
});

test("single-verified mode (the alternative corroboration) ships one verified piece; independent-pair does not", async () => {
  const one = [prop("spk:1", "Priya Nair", QA, "called-on")];
  assert.deepEqual((await groundSpeakerProposals(BASE, threeRuns(...one), YES)).resolved, []);
  assert.equal((await groundSpeakerProposals(BASE, threeRuns(...one), YES, { corroboration: "single-verified" })).resolved.length, 1);
  assert.deepEqual((await groundSpeakerProposals(BASE, threeRuns(...one), NO, { corroboration: "single-verified" })).resolved, []);
});

// ---------- label normalisation and the second-name rule ----------

test("normalizeLabel maps [spk:N], spk:N and Speaker N to the positional label", () => {
  for (const raw of ["spk:2", "[spk:2]", " [SPK:2] ", "Speaker 2", "speaker_2", "(spk:2)"]) assert.equal(normalizeLabel(raw), "spk:2", raw);
  assert.equal(normalizeLabel("Shagun"), "Shagun");
});

test("proposals labelled [spk:1] or Speaker 1 ship; a bare-name label is mapped to the quote speaker only for a self-intro", async () => {
  for (const label of ["[spk:1]", "Speaker 1"]) assert.equal((await shipped(BASE, [prop(label, "Priya Nair", QA, "called-on"), prop(label, "Priya Nair", QB, "thanks")])).length, 1, label);
  const turns = [turn("t0", "spk:0", "Welcome all."), turn("t1", "spk:2", "My name is Shagun. I manage Campus France in Delhi.")];
  for (const label of ["Shagun", "[Shagun]"]) {
    const out = await shipped(turns, [prop(label, "Shagun", "My name is Shagun", "self-intro")]);
    assert.deepEqual(out.map((r) => [r.speakerRef, r.displayName]), [["spk:2", "Shagun"]], label);
  }
  assert.deepEqual(await shipped(BASE, [prop("Priya Nair", "Priya Nair", QA, "called-on"), prop("Priya Nair", "Priya Nair", QB, "thanks")]), [], "a bare-name label on a call-on is not the quote's speaker");
});

test("otherNamesIn finds a second person: vocative, mid-sentence, or a known name; ignores discourse words and the name itself", () => {
  const known = new Set<string>(["rashi", "ruby"]);
  assert.deepEqual(otherNamesIn("Rashi, can you hand over to Ruby for the next part?", "Ruby", known), ["rashi"]);
  assert.deepEqual(otherNamesIn("Welcome Ruby, and Rashi will go first today.", "Ruby", known), ["rashi"]);
  assert.deepEqual(otherNamesIn("Thank you, Ruby, and I think Ruby did well.", "Ruby", known), []);
  assert.deepEqual(otherNamesIn("Okay, so Ruby will take the next question.", "Ruby", known), []);
});

// ---------- extractSpeakers end to end ----------

test("extractSpeakers sends the WHOLE session once per proposer run, verifies with the same provider, and ships with provenance", async () => {
  const seen: Job[] = [];
  const out = await extractSpeakers(BASE, async (job) => {
    seen.push(job);
    const sys = String(job.messages[0]?.content ?? "");
    return sys.includes('"verdict"') ? completion({ verdict: "yes" }) : completion(pair("called-on", "thanks"));
  });
  assert.equal(out.degraded, null);
  const proposer = seen.filter((j) => !String(j.messages[0]?.content).includes('"verdict"'));
  assert.equal(proposer.length, 3);
  assert.equal(proposer[0]?.kind, "speakers");
  assert.ok(String(proposer[0]?.messages[1]?.content).includes("[id:t0] [spk:0] Priya Nair, what do you think") && String(proposer[0]?.messages[1]?.content).includes("[id:t3] [spk:2]"));
  assert.equal(seen.length - proposer.length, 6, "two pieces x three framings, verified once each");
  for (const k of ["self-intro", "called-on", "address", "handover", "thanks", "role-continuity"]) assert.ok(GROUNDED_SYSTEM_PROMPT.includes(k), k);
  assert.equal(out.resolved[0]?.provenance?.length, 2);
});

test("a verifier that fails (throws) abstains", async () => {
  const boom: SpeakerVerifier = async () => { throw new Error("verifier down"); };
  assert.deepEqual(await shipped(BASE, pair("called-on", "thanks"), boom), []);
});

test("a provider failure degrades to the deterministic floor, never a silent empty result", async () => {
  const turns = [turn("t1", "spk:0", "My name is Jubin Thakkar."), turn("t2", "spk:1", "Sure.")];
  const out = await extractSpeakersGrounded(turns, async () => { throw new Error("429 rate limited"); });
  assert.ok(out.degraded);
  assert.match(out.degraded.reason, /429/);
  assert.equal(out.resolved[0]?.displayName, "Jubin Thakkar");
});

test("a non-array response degrades rather than throwing", async () => {
  const out = await extractSpeakersGrounded([turn("t1", "spk:0", "Hello there.")], async () => completion(undefined, "not json"));
  assert.ok(out.degraded);
  assert.deepEqual(out.resolved, []);
});

test("a session with no positional labels makes no model call", async () => {
  let calls = 0;
  const out = await extractSpeakersGrounded([turn("t1", "Sapna Goyal", "My name is Sapna Goyal.")], async () => { calls++; return completion([]); });
  assert.equal(calls, 0);
  assert.deepEqual(out, { resolved: [], unresolved: [], degraded: null });
});
