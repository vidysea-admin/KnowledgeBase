/**
 * packages/index/src/pipeline/speakers-grounded.test.ts -- U2.4 model-judged attribution (D-132, pending append).
 *
 * The model proposes {label, name, evidenceQuote, evidenceKind}; the GROUNDING gate decides. The tests are mostly
 * about what is refused: a fabricated quote, a quote without the name, a quote in the wrong place for its kind,
 * a floor contradiction, a vote failure. One accepted fixture per evidenceKind proves the gate is not vacuous.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import { extractSpeakersGrounded, groundSpeakerProposals, GROUNDED_SYSTEM_PROMPT, type EvidenceKind } from "./speakers-grounded.js";
import { extractSpeakers } from "./speakers-llm.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
const completion = (json: unknown): CompleteResult => ({ text: "", json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
const same = (json: unknown) => async (_job: Job) => completion(json);
const prop = (label: string, name: string, evidenceQuote: string, evidenceKind: string) => ({ label, name, evidenceQuote, evidenceKind });
/** Three runs, all returning the same proposals (the vote passes). */
const threeRuns = (...entries: unknown[]) => [entries, entries, entries];

// One fixture per kind. In each, the NAMED person is the label spk:1 and the quote sits where that kind can bind.
// `turns` holds the first quote and its answer; `more` is an independent second grounding (corroboration), after a spk:2 break.
type Fx = { turns: Turns[]; quote: string; more: Turns[]; quote2: string };
const BREAK = turn("t2", "spk:2", "Okay, moving on to the next point now.");
const FIXTURES: Record<EvidenceKind, Fx> = {
  "self-intro": { turns: [turn("t0", "spk:0", "Welcome all."), turn("t1", "spk:1", "Hello, my name is Priya Nair.")], quote: "Hello, my name is Priya Nair", more: [], quote2: "" },
  "handover": { turns: [turn("t0", "spk:0", "That was the visa update. Over to you, Priya Nair, please go ahead."), turn("t1", "spk:1", "Thanks, glad to be here today.")], quote: "Over to you, Priya Nair, please go ahead",
    more: [BREAK, turn("t3", "spk:3", "Handing over to Priya Nair, please go ahead with the budget."), turn("t4", "spk:1", "Sure, the budget is simple.")], quote2: "Handing over to Priya Nair, please go ahead with the budget" },
  "called-on": { turns: [turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"), turn("t1", "spk:1", "I think they are slow to apply.")], quote: "Priya Nair, what do you think about the new rules",
    more: [BREAK, turn("t3", "spk:3", "Priya Nair, how would you handle the budget?"), turn("t4", "spk:1", "I would split it in three.")], quote2: "Priya Nair, how would you handle the budget" },
  "address": { turns: [turn("t0", "spk:0", "Hello, Priya Nair, good to see you here."), turn("t1", "spk:1", "Good to be here.")], quote: "Hello, Priya Nair, good to see you here",
    more: [BREAK, turn("t3", "spk:3", "Welcome back, Priya Nair, glad you stayed."), turn("t4", "spk:1", "Happy to stay on.")], quote2: "Welcome back, Priya Nair, glad you stayed" },
  "thanks": { turns: [turn("t0", "spk:1", "So that is how the process works."), turn("t1", "spk:0", "Thank you, Priya Nair, that was really helpful.")], quote: "Thank you, Priya Nair, that was really helpful",
    more: [BREAK, turn("t3", "spk:1", "And that covers the budget side."), turn("t4", "spk:3", "Thanks so much, Priya Nair, that was very clear.")], quote2: "Thanks so much, Priya Nair, that was very clear" },
  "role-continuity": { turns: [turn("t0", "spk:0", "Our moderator for the day is Priya Nair, who keeps time."), turn("t1", "spk:1", "Next question please.")], quote: "Our moderator for the day is Priya Nair, who keeps time",
    more: [BREAK, turn("t3", "spk:3", "Priya Nair, our moderator, will take it from here."), turn("t4", "spk:1", "Next topic please.")], quote2: "Priya Nair, our moderator, will take it from here" },
};

for (const [kind, fx] of Object.entries(FIXTURES) as [EvidenceKind, Fx][]) {
  test(`accepts evidenceKind ${kind} and stores the quote and kind as provenance`, () => {
    const turns = [...fx.turns, ...fx.more];
    const proposals = [prop("spk:1", "Priya Nair", fx.quote, kind), ...(fx.more.length ? [prop("spk:1", "Priya Nair", fx.quote2, kind)] : [])];
    const { resolved, unresolved } = groundSpeakerProposals(turns, threeRuns(...proposals));
    assert.equal(resolved.length, 1, `${kind} must ship`);
    const s = resolved[0];
    assert.equal(s?.speakerRef, "spk:1");
    assert.equal(s?.displayName, "Priya Nair");
    assert.equal(s?.personId, "person:priya-nair");
    assert.deepEqual(s?.provenance?.map((p) => [p.evidenceQuote, p.evidenceKind]), proposals.map((p) => [p.evidenceQuote, kind]));
    assert.deepEqual(s?.provenance?.map((p) => p.turnId), proposals.map((p) => turns.find((t) => t.text.includes(p.evidenceQuote))!._id));
    assert.equal(s?.evidence.length, proposals.length);
    assert.equal(s?.blocks.length, proposals.length, "scoped to the block(s) the quotes bind, never label-wide");
    assert.ok(unresolved.includes("spk:0"));
  });
}

test("a single non-self-introduction quote is not enough (corroboration), a self-introduction stands alone", () => {
  const fx = FIXTURES["called-on"];
  assert.deepEqual(groundSpeakerProposals(fx.turns, threeRuns(prop("spk:1", "Priya Nair", fx.quote, "called-on"))).resolved, []);
  assert.equal(groundSpeakerProposals([...fx.turns, ...fx.more], threeRuns(prop("spk:1", "Priya Nair", fx.quote, "called-on"), prop("spk:1", "Priya Nair", fx.quote2, "called-on"))).resolved.length, 1);
  const si = FIXTURES["self-intro"];
  assert.equal(groundSpeakerProposals(si.turns, threeRuns(prop("spk:1", "Priya Nair", si.quote, "self-intro"))).resolved.length, 1);
});

// Rejection tests are built so that a wrongly ACCEPTED defective quote would ship: every defective proposal is paired
// with the same GOOD second quote (`good2`, the called-on fixture's), so corroboration (2 distinct quote turns) is met
// exactly when the defective one wrongly grounds. A bare "[]" therefore proves the defect was refused on its own terms.
const CO = FIXTURES["called-on"];
const good2 = prop("spk:1", "Priya Nair", CO.quote2, "called-on");
const refuses = (head: Turns[], defective: unknown, why: string) =>
  assert.deepEqual(groundSpeakerProposals([...head, ...CO.more], threeRuns(defective, good2)).resolved, [], why);
const ships = (head: Turns[], ok: unknown) => assert.equal(groundSpeakerProposals([...head, ...CO.more], threeRuns(ok, good2)).resolved.length, 1);

test("control: the defect-test frame ships when the first quote is good", () => ships(CO.turns, prop("spk:1", "Priya Nair", CO.quote, "called-on")));

test("normalises whitespace and case when matching the quote, and keeps the model's quote as provenance", () => {
  const head = [turn("t0", "spk:0", "Priya Nair,\nwhat do you THINK about the new rules?"), turn("t1", "spk:1", "Slow.")];
  const q = "priya nair,   what do you think about the new rules";
  ships(head, prop("spk:1", "Priya Nair", q, "called-on"));
  const { resolved } = groundSpeakerProposals([...head, ...CO.more], threeRuns(prop("spk:1", "Priya Nair", q, "called-on"), good2));
  assert.equal(resolved[0]?.provenance?.[0]?.evidenceQuote, q);
});

test("REJECTS a fabricated quote the transcript never says", () => {
  refuses(CO.turns, prop("spk:1", "Priya Nair", "Priya Nair, please share your visa experience with us", "called-on"), "invented quote");
});

test("REJECTS a quote assembled from two turns", () => {
  refuses(CO.turns, prop("spk:1", "Priya Nair", "Priya Nair, what do you think about the new rules? I think they are slow to apply.", "called-on"), "joined turns");
});

test("REJECTS a real quote that does not contain the proposed name", () => {
  const head = [turn("t0", "spk:0", "Welcome to the session, everybody here today."), turn("t1", "spk:1", "Priya Nair is my name.")];
  refuses(head, prop("spk:1", "Priya Nair", "Welcome to the session, everybody here today", "address"), "no name in quote");
});

test("REJECTS a name the transcript never spells, even with real quotes", () => {
  const turns = [turn("t0", "spk:0", "Priya, what do you think about the new rules?"), turn("t1", "spk:1", "Slow."), BREAK,
    turn("t3", "spk:3", "Priya, how would you handle the budget?"), turn("t4", "spk:1", "Split.")];
  const run = [prop("spk:1", "Priya Nair", "Priya, what do you think about the new rules", "called-on"), prop("spk:1", "Priya Nair", "Priya, how would you handle the budget", "called-on")];
  assert.deepEqual(groundSpeakerProposals(turns, threeRuns(...run)).resolved, [], "a surname the transcript does not say is invention");
  const withFull = [...turns, turn("t9", "Priya Nair", "Priya Nair is a guest.")];
  assert.equal(groundSpeakerProposals(withFull, threeRuns(...run)).resolved.length, 1, "control: an unambiguous first-name reference ships once the full name is spoken");
});

test("REJECTS a bare first-name reference when two proposed names share that token", () => {
  const turns = [turn("t0", "spk:0", "Priya, what do you think about the new rules?"), turn("t1", "spk:1", "Slow."), BREAK,
    turn("t3", "spk:3", "Priya, how would you handle the budget?"), turn("t4", "spk:1", "Split."), turn("t9", "Priya Nair", "Priya Nair and Priya Rao are here.")];
  const q = ["Priya, what do you think about the new rules", "Priya, how would you handle the budget"];
  const mine = q.map((x) => prop("spk:1", "Priya Nair", x, "called-on"));
  assert.equal(groundSpeakerProposals(turns, threeRuns(...mine)).resolved.length, 1, "control: unambiguous alone");
  const rival = prop("spk:2", "Priya Rao", q[0] ?? "", "called-on");
  assert.deepEqual(groundSpeakerProposals(turns, threeRuns(...mine, rival)).resolved, [], "a rival proposal sharing the token makes the bare reference ambiguous");
});

test("REJECTS a kind that does not match where the quote sits (handover is BEFORE the block, thanks AFTER)", () => {
  const h = FIXTURES["handover"];
  refuses(h.turns, prop("spk:1", "Priya Nair", h.quote, "thanks"), "a before-block quote is not a thanks");
  const t = FIXTURES["thanks"];
  refuses(t.turns, prop("spk:1", "Priya Nair", t.quote, "handover"), "an after-block quote is not a handover");
});

test("REJECTS a self-intro quote spoken by a different label", () => {
  const head = [turn("t0", "spk:0", "Hello, my name is Priya Nair."), turn("t1", "spk:1", "Welcome.")];
  refuses(head, prop("spk:1", "Priya Nair", "my name is Priya Nair", "self-intro"), "that quote names spk:0, not spk:1");
});

test("REJECTS a quote whose name sits inside quoted or reported speech", () => {
  const head = [turn("t0", "spk:0", "People always say, Priya Nair, what do you think about this."), turn("t1", "spk:1", "Slow.")];
  refuses(head, prop("spk:1", "Priya Nair", "People always say, Priya Nair, what do you think about this", "called-on"), "reported speech");
});

test("REJECTS a quote that is not adjacent to any block of the label", () => {
  const head = [turn("t0", "spk:0", "Priya Nair, what do you think about the new rules?"), turn("t1", "spk:2", "Fine."), turn("t7", "spk:1", "Slow.")];
  refuses(head, prop("spk:1", "Priya Nair", CO.quote, "called-on"), "spk:2 answered, so the call-on does not bind spk:1");
});

test("REJECTS a name that contradicts the deterministic floor, and accepts the same proposals without the floor", () => {
  const mk = (selfText: string) => [turn("t0", "spk:1", "Rahul Mehta, what would you add?"), turn("t1", "spk:0", selfText), turn("t2", "spk:1", "Okay."),
    turn("t3", "spk:2", "Rahul Mehta, how would you handle the budget?"), turn("t4", "spk:0", "I would split it in three parts.")];
  const proposals = [prop("spk:0", "Rahul Mehta", "Rahul Mehta, what would you add", "called-on"), prop("spk:0", "Rahul Mehta", "Rahul Mehta, how would you handle the budget", "called-on")];
  assert.deepEqual(groundSpeakerProposals(mk("My name is Jubin Thakkar."), threeRuns(...proposals)).resolved, [], "spk:0 introduced itself as Jubin Thakkar");
  const control = groundSpeakerProposals(mk("I think visas are slow to process these days."), threeRuns(...proposals)).resolved;
  assert.equal(control.length, 1, "control: grounds fine absent the floor fact");
});

test("a proposal that agrees with the floor still ships", () => {
  const turns = [turn("t0", "spk:1", "Jubin, what would you add?"), turn("t1", "spk:0", "My name is Jubin Thakkar.")];
  const { resolved } = groundSpeakerProposals(turns, threeRuns(prop("spk:0", "Jubin Thakkar", "My name is Jubin Thakkar", "self-intro")));
  assert.equal(resolved.length, 1);
});

test("REJECTS a vote failure: grounded in only 1 of 3 runs; 2 of 3 holds", () => {
  const turns = [...CO.turns, ...CO.more];
  const good = [prop("spk:1", "Priya Nair", CO.quote, "called-on"), good2];
  assert.deepEqual(groundSpeakerProposals(turns, [good, [], []]).resolved, []);
  assert.equal(groundSpeakerProposals(turns, [good, [], good]).resolved.length, 1, "2 of 3 holds");
});

test("a run whose quote does not ground does not count as a vote", () => {
  const turns = [...CO.turns, ...CO.more];
  const good = [prop("spk:1", "Priya Nair", CO.quote, "called-on"), good2];
  const fake = [prop("spk:1", "Priya Nair", "Priya Nair is surely the guest of honour today", "called-on"), good2];
  assert.deepEqual(groundSpeakerProposals(turns, [good, fake, fake]).resolved, [], "fake quotes never earn the second vote for the first quote");
});

test("one label proposed with two names across runs is left unresolved", () => {
  const turns = [turn("t0", "spk:0", "Priya Nair, what do you think? Rahul Mehta, you next."), turn("t1", "spk:1", "Slow.")];
  const a = prop("spk:1", "Priya Nair", "Priya Nair, what do you think", "self-intro");
  const b = prop("spk:1", "Rahul Mehta", "Rahul Mehta, you next", "called-on");
  const { resolved, unresolved } = groundSpeakerProposals(turns, [[a, b], [a, b], [a, b]]);
  assert.deepEqual(resolved, []);
  assert.ok(unresolved.includes("spk:1"));
});

test("one quote turn never binds two labels", () => {
  const turns = [turn("t0", "spk:1", "Slow."), turn("t1", "spk:0", "Priya Nair, what do you think about the new rules?"), turn("t2", "spk:2", "Fast."),
    turn("t3", "spk:3", "Priya Nair, how would you handle the budget?"), turn("t4", "spk:1", "Okay.")];
  const [q1, q3] = ["Priya Nair, what do you think about the new rules", "Priya Nair, how would you handle the budget"];
  const { resolved } = groundSpeakerProposals(turns, threeRuns(prop("spk:1", "Priya Nair", q1, "address"), prop("spk:1", "Priya Nair", q3, "address"), prop("spk:2", "Priya Nair", q1, "address"), prop("spk:2", "Priya Nair", q3, "address")));
  assert.deepEqual(resolved, []);
});

test("legacy proposals without evidenceQuote or kind abstain", () => {
  const { turns } = FIXTURES["self-intro"];
  const legacy = [{ speakerRef: "spk:1", displayName: "Priya Nair", turnIds: ["t1"] }, { label: "spk:1", name: "Priya Nair", evidenceKind: "self-intro" }, { label: "spk:1", name: "Priya Nair", evidenceQuote: "my name is Priya Nair and I work", evidenceKind: "vibes" }];
  assert.deepEqual(groundSpeakerProposals(turns, threeRuns(...legacy)).resolved, []);
});

test("refuses non-positional labels and names that are not name-shaped", () => {
  const turns = [turn("t0", "Sapna Goyal", "My name is Sapna Goyal, welcome everyone here."), turn("t1", "spk:1", "Thanks all.")];
  assert.deepEqual(groundSpeakerProposals(turns, threeRuns(prop("Sapna Goyal", "Sapna Goyal", "My name is Sapna Goyal, welcome everyone here", "self-intro"))).resolved, []);
  const all = [...CO.turns, ...CO.more];
  assert.deepEqual(groundSpeakerProposals(all, threeRuns(prop("spk:1", "what do you think", CO.quote, "called-on"), prop("spk:1", "what do you think", CO.quote2, "called-on"))).resolved, []);
});

test("extractSpeakers sends the WHOLE session once per run and ships a grounded identity with provenance", async () => {
  const turns = [...CO.turns, ...CO.more];
  const seen: Job[] = [];
  const out = await extractSpeakers(turns, async (job) => { seen.push(job); return completion([prop("spk:1", "Priya Nair", CO.quote, "called-on"), good2]); });
  assert.equal(out.degraded, null);
  assert.equal(seen.length, 3, "one whole-session call per agreement run");
  assert.equal(seen[0]?.kind, "speakers");
  const user = seen[0]?.messages.find((m) => m.role === "user")?.content as string;
  assert.ok(user.includes("[id:t0] [spk:0] Priya Nair, what do you think") && user.includes("[id:t4] [spk:1] I would split it in three."));
  assert.match(GROUNDED_SYSTEM_PROMPT, /evidenceQuote/);
  for (const k of ["self-intro", "called-on", "address", "handover", "thanks", "role-continuity"]) assert.ok(GROUNDED_SYSTEM_PROMPT.includes(k), k);
  assert.equal(out.resolved[0]?.provenance?.[0]?.evidenceKind, "called-on");
});

test("a provider failure degrades to the deterministic floor, never a silent empty result", async () => {
  const turns = [turn("t1", "spk:0", "My name is Jubin Thakkar."), turn("t2", "spk:1", "Sure.")];
  const out = await extractSpeakersGrounded(turns, async () => { throw new Error("429 rate limited"); });
  assert.ok(out.degraded);
  assert.match(out.degraded.reason, /429/);
  assert.equal(out.resolved[0]?.displayName, "Jubin Thakkar");
});

test("a non-array response degrades rather than throwing", async () => {
  const out = await extractSpeakersGrounded([turn("t1", "spk:0", "Hello there.")], async () => ({ ...completion(undefined), text: "not json" }));
  assert.ok(out.degraded);
  assert.deepEqual(out.resolved, []);
});

test("a session with no positional labels makes no model call", async () => {
  let calls = 0;
  const out = await extractSpeakersGrounded([turn("t1", "Sapna Goyal", "My name is Sapna Goyal.")], async () => { calls++; return completion([]); });
  assert.equal(calls, 0);
  assert.deepEqual(out, { resolved: [], unresolved: [], degraded: null });
});

// ISS-U24SMART-001: the checker's fixture. The host thanks the REAL Rashi (spk:1) right before spk:2 speaks.
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

test("ISS-U24SMART-001: a thank-you naming the previous speaker never names the NEXT block, whatever kind the model claims", () => {
  for (const kind of ["address", "called-on", "handover", "thanks", "role-continuity"]) {
    const { resolved } = groundSpeakerProposals(RASHI, threeRuns(prop("spk:2", "Rashi", RQ1, kind), prop("spk:2", "Rashi", RQ2, kind)));
    assert.deepEqual(resolved, [], `spk:2 must not ship as Rashi via kind ${kind}`);
  }
});

test("ISS-U24SMART-001: the same thank-yous AFTER Rashi's own block name spk:1 (control), and only with independent quotes", () => {
  const ok = groundSpeakerProposals(RASHI, threeRuns(prop("spk:1", "Rashi", RQ1, "thanks"), prop("spk:1", "Rashi", RQ2, "thanks"), prop("spk:1", "Rashi", RQ3, "thanks")));
  assert.deepEqual(ok.resolved.map((r) => [r.speakerRef, r.displayName]), [["spk:1", "Rashi"]]);
  const repeated = groundSpeakerProposals(RASHI, threeRuns(prop("spk:1", "Rashi", RQ1, "thanks"), prop("spk:1", "Rashi", RQ2, "thanks")));
  assert.deepEqual(repeated.resolved, [], "one host repeating one pattern is a single piece of evidence");
});

test("ISS-U24SMART-001: the same name proposed for two labels, or a name already held by another label's floor, abstains", () => {
  const extra = [turn("t8", "spk:0", "Rashi, what do you think about the permits?"), turn("t9", "spk:2", "They are slow."), turn("t10", "spk:3", "Rashi, how would you handle the budget?"), turn("t11", "spk:2", "Split it.")];
  const q = ["Rashi, what do you think about the permits", "Rashi, how would you handle the budget"];
  const mine = [prop("spk:1", "Rashi", RQ1, "thanks"), prop("spk:1", "Rashi", RQ3, "thanks")];
  const rival = q.map((x) => prop("spk:2", "Rashi", x, "called-on"));
  assert.equal(groundSpeakerProposals([...RASHI, ...extra], threeRuns(...mine)).resolved.length, 1, "control: spk:1 alone ships");
  assert.deepEqual(groundSpeakerProposals([...RASHI, ...extra], threeRuns(...mine, ...rival)).resolved, [], "two labels grounded for one name: neither ships");
  const floorHeld = [turn("f0", "spk:1", "My name is Rashi."), ...RASHI.slice(1)];
  const out = groundSpeakerProposals(floorHeld, threeRuns(prop("spk:2", "Rashi", "Good morning, I will talk about study permits", "role-continuity"), prop("spk:2", "Rashi", "Right, so the permits work like this", "role-continuity")));
  assert.deepEqual(out.resolved, []);
});
