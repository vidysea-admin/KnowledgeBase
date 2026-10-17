import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import type { CompleteResult } from "@lkb/ai";
import type { Claims, Sessions, Turns } from "@lkb/core";
import { requireAuth } from "../auth.js";
import { createAnswerPolicyService } from "../answer-policy/service.js";
import { createInMemoryAnswerPolicyStore } from "../answer-policy/store.js";
import { lookupEffectivePolicy } from "../answer-policy/application.js";
import { createOutputRouter } from "./router.js";
import { createOutputService } from "./service.js";
import { createMemoryOutputRepository, createMongoOutputRepository } from "./repository.js";
import { OutputError, sectionDefinitions, type OutputDeps, type OutputInput, type OutputSources } from "./types.js";
import { assertOutputDraft } from "./validator.js";
import { createMongoOutputReader } from "./reader.js";
import { wireMongoFixture } from "../whatsapp/review/wire-fixtures.js";
import { reviewInput, REVIEW_TIME } from "../whatsapp/review/test-fixtures.js";
import { detectWhatsAppReviewCandidates } from "../whatsapp/review/detection.js";
import { createMongoWhatsAppReviewRepository } from "../whatsapp/review/store.js";
import { materializeWhatsAppClaim, revokeWhatsAppClaim } from "../whatsapp/review/materializer.js";
import { WHATSAPP_REVIEW_LOG } from "../whatsapp/review/invalidate.js";
import { headId, type ReviewHead } from "../transcript-review/store.js";
import type { Db } from "mongodb";

/** Add ordinary cursor bounds to the actual T007 transactional fixture; no alternative approval implementation. */
function boundedFixtureDb(db: Db): Db {
  return { ...db, collection(name: string) {
    const raw = db.collection(name);
    return { ...raw, find(filter: object = {}) {
      const found = raw.find(filter as never); let limit = Infinity, sorted = false;
      const cursor = { sort() { sorted = true; return cursor; }, limit(value: number) { limit = value; return cursor; },
        async toArray() { const rows = await found.toArray(); if (sorted) rows.sort((a, b) => String(a._id).localeCompare(String(b._id))); return rows.slice(0, limit); } };
      return cursor;
    } };
  } } as unknown as Db;
}

const turn = (): Turns => ({ _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "speaker:1", speakerLabel: "Admissions expert", tStart: 3, tEnd: 9, text: "Applications open Monday. The board decided to extend the deadline." });
const claim = (): Claims => ({ _id: "c1", tenantId: "a", text: "Applications open Monday.", status: "verified", evidence: [{ turnId: "t1", sessionId: "s1", quote: "Applications open Monday." }] });
const input = (kind: OutputInput["kind"] = "faq"): OutputInput => ({ kind, title: "Application preparation", purpose: "Prepare admissions questions for Monday", sessionIds: ["s1"] });
function fixture() {
  let sources: OutputSources = { sessions: [{ _id: "s1", tenantId: "a" } as Sessions], claims: [claim()], turns: [turn()] };
  let supported = true, invalid = false, calls = 0, fail = false;
  let kind: OutputInput["kind"] = "faq";
  const repository = createMemoryOutputRepository();
  const deps: OutputDeps = { repository, now: () => new Date("2026-10-14T12:00:00.000Z"),
    readSources: async (tenantId) => tenantId === "a" ? structuredClone(sources) : { sessions: [], claims: [], turns: [] },
    policy: async (_tenant, selection) => ({ status: "none", questionClass: selection.questionClass }),
    complete: async (_tenant, job): Promise<CompleteResult> => {
      calls++; if (fail) throw new Error("provider SECRET source content");
      const prompt = JSON.parse(job.messages[1]!.content) as { items?: { id: string; text: string }[]; evidence?: { quote: string }[] };
      const json = prompt.items ? { checks: prompt.items.map((i) => ({ id: i.id, supported: supported && !i.text.includes("free tuition") })) }
        : { sections: sectionDefinitions[kind].map((s) => ({ key: s.key, items: s.key === "decisions" ? [] : [{ text: s.kind === "fact" ? (kind === "faq" ? `Q: What does this source state?\nA: ${prompt.evidence?.[0]?.quote ?? ""}` : `${prompt.evidence?.[0]?.quote ?? ""}`) : s.kind === "question" ? "When should we prepare the application?" : "Suggestion: discuss the Monday application opening.", citationIds: [invalid ? "invented" : "e1"] }] })) };
      return { text: JSON.stringify(json), json, provider: "fixture-provider", model: "fixture-model", usage: { inputTokens: 100, outputTokens: 50 }, costUsd: 0 };
    } };
  return { deps, service: createOutputService(deps), repository,
    setKind: (v: OutputInput["kind"]) => { kind = v; }, setSources: (v: OutputSources) => { sources = v; }, sources: () => sources,
    setSupported: (v: boolean) => { supported = v; }, setInvalid: () => { invalid = true; }, setFailure: () => { fail = true; }, calls: () => calls };
}

test("independent verifier assesses generation and edits without using the synthesis chain", async () => {
  const f = fixture();
  let checks = 0;
  f.deps.verify = async (tenantId, job) => {
    assert.equal(tenantId, "a");
    const payload = JSON.parse(job.messages[1]!.content) as { items: { id: string; text: string }[]; evidence: { id: string; quote: string }[] };
    assert.equal(payload.evidence[0]!.quote, "Applications open Monday.");
    checks++;
    const json = { checks: payload.items.map((item) => ({ id: item.id, supported: !item.text.includes("free tuition") })) };
    return { text: JSON.stringify(json), json, provider: "independent-fixture", model: "verifier-fixture", usage: { inputTokens: 30, outputTokens: 10 }, costUsd: 0 };
  };
  const created = await f.service.create("a", input());
  assert.equal(f.calls(), 1); assert.equal(checks, 1);
  assert.equal(created.sections[0]!.items[0]!.validation, "ai-supported");
  const edited = await f.service.edit("a", created._id, { revision: 1, title: created.title, edits: [{ id: "faq-1", text: "Q: Is tuition free?\nA: There is free tuition." }] });
  const reviewed = await f.service.revalidate("a", edited._id, edited.revision);
  assert.equal(f.calls(), 1); assert.equal(checks, 2);
  assert.equal(reviewed.sections[0]!.items[0]!.validation, "needs-review");
  await assert.rejects(f.service.export("a", reviewed._id, reviewed.revision));
});

test("independent verifier failure cannot silently fall back to the synthesis chain", async () => {
  const f = fixture();
  f.deps.verify = async () => { throw new Error("Independent verification unavailable"); };
  await assert.rejects(f.service.create("a", input()), /Independent verification unavailable/u);
  assert.equal(f.calls(), 1);
  assert.deepEqual(await f.repository.list("a"), []);
});
const refuses = (code: string) => (e: unknown) => e instanceof OutputError && e.code === code;

test("all three kinds synthesize through provider and independent grounding pass, then editable Markdown consumer", async () => {
  for (const kind of ["faq", "report", "meeting-brief"] as const) {
    const f = fixture(); f.setKind(kind);
    const draft = await f.service.create("a", input(kind));
    assert.equal(f.calls(), 2); assert.equal(draft.provider, "fixture-provider");
    assert.deepEqual(draft.sections.map((s) => s.key), sectionDefinitions[kind].map((s) => s.key));
    assert.ok(draft.sections.every((s) => !s.items.length || s.items[0]?.validation === "ai-supported"));
    const exported = await f.service.export("a", draft._id, 1);
    assert.match(exported.markdown, /AI draft/u); assert.match(exported.markdown, /Applications open Monday/u);
    assert.match(exported.markdown, /\[s1 \/ t1\]\(\/sessions\/s1#turn-t1\)/u);
    assert.match(exported.markdown, /3–9 seconds/u); assert.ok(exported.filename.endsWith(".md"));
  }
});
test("unknown model citations refuse generation without persistence", async () => {
  const f = fixture(); f.setInvalid(); await assert.rejects(f.service.create("a", input()), refuses("unavailable"));
  assert.equal((await f.service.list("a")).length, 0);
});
test("unsupported model interpretations remain withheld and cannot export", async () => {
  const f = fixture(); f.setSupported(false); const draft = await f.service.create("a", input());
  assert.equal(draft.sections[0]!.items[0]!.validation, "needs-review");
  assert.match(draft.sections[0]!.missing, /withheld/u);
  await assert.rejects(f.service.export("a", draft._id, 1), refuses("needs_review"));
});
test("excluded unverified source claims remain visible as partial coverage and refusal policy cannot call them ready", async () => {
  const f = fixture(); f.sources().claims.push({ ...claim(), _id: "c2", status: "needs-review" });
  const draft = await f.service.create("a", input());
  assert.deepEqual(draft.sourceCoverage, { status: "partial", withheldClaims: 1 });
  assert.match((await f.service.export("a", draft._id, 1)).markdown, /Source coverage: partial; 1 claims excluded/u);
  f.sources().withheldVisibleClaims = 1; // Trusted reader count, never a create-body field.
  await assert.rejects(f.service.export("a", draft._id, 1), refuses("source_changed"));
  const readerPartial = await f.service.create("a", input());
  assert.deepEqual(readerPartial.sourceCoverage, { status: "partial", withheldClaims: 2 });
  f.deps.policy = async () => ({ status: "active", policy: { tenantId: "a", policyId: "p1", version: 1, questionClass: "faq", mode: "internal-only", style: "concise", onInsufficient: "refuse", citations: "required", retired: false } as never });
  await assert.rejects(f.service.create("a", input()), refuses("unavailable"));
});
test("draft edits persist and need explicit revalidation; adversarial factual edits remain refused", async () => {
  const f = fixture(), draft = await f.service.create("a", input()), id = draft.sections[0]!.items[0]!.id;
  const edited = await f.service.edit("a", draft._id, { revision: 1, title: "Updated", edits: [{ id, text: "Everyone receives free tuition." }] });
  assert.equal(edited.revision, 2); assert.equal(edited.sections[0]!.items[0]!.validation, "needs-review");
  assert.equal((await createOutputService(f.deps).get("a", draft._id)).title, "Updated");
  await assert.rejects(f.service.export("a", draft._id, 2), refuses("needs_review"));
  const checked = await f.service.revalidate("a", draft._id, 2);
  assert.equal(checked.revision, 3); assert.equal(checked.sections[0]!.items[0]!.validation, "needs-review");
  await assert.rejects(f.service.export("a", draft._id, 3), refuses("needs_review"));
});
test("supported saved edit revalidates then exports; citation replacement/removal and stale concurrent edits refuse", async () => {
  const f = fixture(), draft = await f.service.create("a", input()), id = draft.sections[0]!.items[0]!.id;
  for (const edit of [{ id, text: "Monday", citationIds: [] }, { id: "foreign", text: "Monday" }]) {
    await assert.rejects(f.service.edit("a", draft._id, { revision: 1, title: draft.title, edits: [edit] }), refuses("invalid_request"));
  }
  const results = await Promise.allSettled([1, 2].map(() => f.service.edit("a", draft._id, { revision: 1, title: "Saved", edits: [{ id, text: "Q: When do applications open?\nA: Applications open Monday." }] })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await f.service.revalidate("a", draft._id, 2);
  assert.match((await f.service.export("a", draft._id, 3)).markdown, /Applications open Monday/u);
});
test("foreign tenant cannot read/list/edit/revalidate/export or select another tenant's source", async () => {
  const f = fixture(), draft = await f.service.create("a", input());
  assert.deepEqual(await f.service.list("b"), []);
  await assert.rejects(f.service.get("b", draft._id), refuses("not_found"));
  await assert.rejects(f.service.edit("b", draft._id, { revision: 1, title: "Foreign", edits: [] }), refuses("not_found"));
  await assert.rejects(f.service.revalidate("b", draft._id, 1), refuses("not_found"));
  await assert.rejects(f.service.export("b", draft._id, 1), refuses("not_found"));
  await assert.rejects(f.service.create("b", input()), refuses("not_found"));
});
test("tenant/evidence/provider fields in requests cannot replace server authority", async () => {
  const f = fixture();
  for (const extra of [{ tenantId: "b" }, { citations: [] }, { generatedText: "invented" }, { provider: "fake" }]) await assert.rejects(f.service.create("a", { ...input(), ...extra }), refuses("invalid_request"));
});
test("current source edit/deletion/unverification blocks export and revalidation", async () => {
  for (const mutate of [
    (s: OutputSources) => { s.turns[0]!.text += " Additional qualification."; },
    (s: OutputSources) => { s.turns = []; },
    (s: OutputSources) => { s.claims[0]!.status = "needs-review"; },
  ]) {
    const f = fixture(), draft = await f.service.create("a", input()); mutate(f.sources());
    await assert.rejects(f.service.export("a", draft._id, 1));
    await assert.rejects(f.service.revalidate("a", draft._id, 1));
  }
});
test("protected databases refuse the new write store without borrowing other feature opt-ins", () => {
  for (const databaseName of ["lkb", "global_university_db", " LKB ", ""]) assert.throws(() => createMongoOutputRepository({ databaseName } as never), refuses("unavailable"));
});
test("source snapshot cannot expose mixed tenants or duplicate identities", async () => {
  for (const mutate of [
    (s: OutputSources) => { s.turns[0]!.tenantId = "b"; },
    (s: OutputSources) => { s.claims.push(claim()); },
    (s: OutputSources) => { s.turns.push(turn()); },
  ]) { const f = fixture(); mutate(f.sources()); await assert.rejects(f.service.create("a", input()), refuses("unavailable")); }
});
test("policy dependency forwards tenant/kind, style and insufficiency; conflicts cannot widen grounding", async () => {
  const f = fixture(); let observed: unknown;
  f.deps.policy = async (tenant, selection) => { observed = [tenant, selection]; return { status: "conflict", questionClass: selection.questionClass, conflicts: [] }; };
  await assert.rejects(f.service.create("a", input()), refuses("conflict")); assert.deepEqual(observed, ["a", { questionClass: "faq" }]); assert.equal(f.calls(), 0);
  f.deps.policy = async () => ({ status: "active", policy: { tenantId: "a", policyId: "p1", version: 1, questionClass: "faq", mode: "internal-and-web", style: "detailed", onInsufficient: "refuse", citations: "required", retired: false } as never });
  f.setSupported(false); await assert.rejects(f.service.create("a", input()), refuses("unavailable")); assert.deepEqual(await f.service.list("a"), []);
});
test("policy revision changes and cached citation tampering refuse reopen/export", async () => {
  const f = fixture(); let version = 1;
  f.deps.policy = async () => ({ status: "active", policy: { tenantId: "a", policyId: "p1", version, questionClass: "faq", mode: "internal-only", style: "concise", onInsufficient: "review", citations: "required", retired: false } as never });
  const draft = await f.service.create("a", input());
  version = 2; await assert.rejects(f.service.get("a", draft._id), refuses("source_changed"));
  await assert.rejects(f.service.export("a", draft._id, 1), refuses("source_changed"));
  version = 1;
  await assert.rejects(f.repository.replace("a", { ...draft, revision: 2, citations: draft.citations.map((c) => ({ ...c, href: "javascript:alert(1)" })) }, 1), refuses("unavailable"));
  assert.doesNotMatch((await f.service.export("a", draft._id, 1)).markdown, /javascript:/u);
});
test("actual schema and cross-field validator refuse damaged stored identities, references, ranges and shape", async () => {
  const f = fixture(), draft = await f.service.create("a", input());
  assertOutputDraft(draft);
  const cases: ((copy: typeof draft) => void)[] = [
    (d) => { d.sections[0]!.key = "forged-section"; },
    (d) => { d.sections[0]!.items[0]!.kind = "suggestion"; },
    (d) => { d.sections[0]!.items.push(structuredClone(d.sections[0]!.items[0]!)); },
    (d) => { d.sections[0]!.items[0]!.citationIds = ["foreign"]; },
    (d) => { d.sections[0]!.items[0]!.text = "Q: What is paid?\nA: Everyone receives free tuition."; },
    (d) => { d.citations[0]!.end = -1; },
    (d) => { d.citations[0]!.end = Infinity; },
    (d) => { d.citations[0]!.href = "javascript:alert(1)"; },
    (d) => { d.citations[0]!.sessionId = "foreign"; },
    (d) => { d.sourceCoverage.status = "partial"; },
    (d) => { d.createdAt = "not a timestamp"; },
    (d) => { (d as unknown as { extra: string }).extra = "not allowed by actual schema"; },
  ];
  for (const mutate of cases) { const copy = structuredClone(draft); mutate(copy); assert.throws(() => assertOutputDraft(copy), refuses("unavailable")); }
  const damaged = structuredClone(draft); damaged.sections[0]!.items[0]!.citationIds = ["foreign"];
  const db = { databaseName: "test_t058_fake", collection: () => ({ findOne: async () => damaged,
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [damaged] }) }) }) }) };
  const persisted = createMongoOutputRepository(db as never);
  await assert.rejects(persisted.get("a", draft._id), refuses("unavailable"));
  await assert.rejects(persisted.list("a"), refuses("unavailable"));
});
test("actual T056 service lookup applies saved tenant policy and refuses its changed revision", async () => {
  const f = fixture(), policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore());
  const body = { questionClass: "faq", mode: "internal-only", style: "detailed", onInsufficient: "review", note: "Configure a focused output fixture" };
  await policies.save("a", "faq-policy", body, { actor: "fixture-key:a" });
  await policies.save("b", "faq-policy", { ...body, style: "concise" }, { actor: "fixture-key:b" });
  f.deps.policy = (tenant, selection) => lookupEffectivePolicy(policies, tenant, selection);
  const original = f.deps.complete; let detailed = false;
  f.deps.complete = async (tenant, job) => { if (job.messages[0]!.content.startsWith("Create a useful")) detailed = job.messages[0]!.content.includes("Style: detailed"); return original(tenant, job); };
  const draft = await f.service.create("a", { ...input(), policyId: "faq-policy" });
  assert.equal(draft.policy!.version, 1); assert.equal(draft.policy!.style, "detailed"); assert.equal(detailed, true);
  await policies.save("a", "faq-policy", { ...body, style: "concise", expectedVersion: 1 }, { actor: "fixture-key:a" });
  await assert.rejects(f.service.export("a", draft._id, 1), refuses("source_changed"));
});
test("actual T007 approval capability excludes raw WhatsApp and rechecks current source drift before output/export", async () => {
  const chat = reviewInput("Scholarship applications open Monday."), tenant = chat.source.tenantId;
  // Native publication requires explicit current source consent; this test intends a consented, reviewed source.
  chat.source = { ...chat.source, consent: { given: true, recordedBy: "owner" } } as typeof chat.source;
  const rawTurn = { ...chat.turns[0]!, _id: "turn-unreviewed", text: "Private personal message", speakerLabel: "Private participant" };
  const fx = wireMongoFixture({ sources: [chat.source], sessions: [{ ...chat.session, title: "Private group title", date: "2026-10-14T10:00:00.000Z", status: { transcribe: "done", index: "done" } }],
    turns: [...chat.turns, rawTurn], claims: [{ _id: "unapproved-legacy", tenantId: tenant, source: "whatsapp", status: "verified", text: rawTurn.text,
      evidence: [{ turnId: rawTurn._id, sessionId: chat.session._id, quote: rawTurn.text }] }] });
  const db = boundedFixtureDb(fx.db), f = fixture(); f.deps.readSources = createMongoOutputReader(db);
  const request = { ...input(), sessionIds: [chat.session._id] };
  await assert.rejects(f.service.create(tenant, request), refuses("not_found")); assert.equal(f.calls(), 0);
  const candidates = detectWhatsAppReviewCandidates(tenant, chat, REVIEW_TIME); assert.equal(candidates.length, 1);
  const review = createMongoWhatsAppReviewRepository(db, { materialize: materializeWhatsAppClaim, now: () => REVIEW_TIME });
  await review.insert(tenant, candidates);
  const approved = await review.decide(tenant, candidates[0]!._id, "approved", "fixture-key:tenant-a");
  assert.equal(approved.result, "ok"); // An actual app transition in a fixture, never a genuine human approval.
  const visible = await f.deps.readSources(tenant, request.sessionIds);
  assert.equal(visible.sessions[0]!.title, "Reviewed expert guidance"); assert.equal(visible.claims.length, 1);
  assert.equal(visible.turns.length, 1); assert.equal(visible.turns[0]!._id, chat.turns[0]!._id);
  const draft = await f.service.create(tenant, request); assert.equal(draft.citations[0]!.quote, chat.turns[0]!.text);
  assert.equal(draft.citations[0]!.occurredAt, chat.turns[0]!.occurredAt);
  assert.doesNotMatch((await f.service.export(tenant, draft._id, 1)).markdown, /Private personal|Private group|Private participant/u);
  fx.put(WHATSAPP_REVIEW_LOG, { _id: "fixture-invalidation", tenantId: tenant, kind: "pending-invalidation", groupJid: chat.source.path });
  await assert.rejects(f.service.export(tenant, draft._id, 1), refuses("source_changed"));
  await db.collection(WHATSAPP_REVIEW_LOG).deleteOne({ _id: "fixture-invalidation", tenantId: tenant } as never);
  assert.ok((await f.service.export(tenant, draft._id, 1)).markdown.includes("Occurred at 2026\\-10\\-14T10:00:00\\.000Z"));
  await db.collection("turns").updateOne({ _id: chat.turns[0]!._id, tenantId: tenant } as never, { $set: { text: "Source changed after approval." } });
  await assert.rejects(f.service.get(tenant, draft._id), refuses("source_changed"));
  await assert.rejects(f.service.export(tenant, draft._id, 1), refuses("source_changed"));
  await db.collection("turns").updateOne({ _id: chat.turns[0]!._id, tenantId: tenant } as never, { $set: { text: chat.turns[0]!.text } });
  const transaction = db.client.startSession();
  try { await transaction.withTransaction(() => revokeWhatsAppClaim(db, tenant, candidates[0]!, transaction)); }
  finally { await transaction.endSession(); }
  await assert.rejects(f.service.get(tenant, draft._id), refuses("source_changed"));
  await assert.rejects(f.service.export(tenant, draft._id, 1), refuses("source_changed"));
});
test("actual T054 reader consumes corrected source projection and invalidates the prior draft without raw mutation", async () => {
  const original = turn(), fx = wireMongoFixture({ sources: [{ _id: "source-a", tenantId: "a", kind: "recording", path: "fixture-only" }],
    sessions: [{ _id: "s1", tenantId: "a", sourceId: "source-a", title: "Reviewed source" }], turns: [{ ...original }], claims: [{ ...claim() }] });
  const db = boundedFixtureDb(fx.db), f = fixture(); f.deps.readSources = createMongoOutputReader(db);
  const before = JSON.stringify(fx.rows("turns")), prior = await f.service.create("a", input());
  // A synthetic persisted head exercises the actual T054 projection; this is not a live review or refresh receipt.
  const head: ReviewHead = { _id: headId("a", "s1"), tenantId: "a", sessionId: "s1", revision: "fixture-reviewed", parentRevision: "fixture-original",
    overlay: [{ turnId: "t1", text: `${original.text} Reviewed context is for this intake only.`, speakerRef: "speaker:reviewed", speakerLabel: "Reviewed admissions expert" }],
    audit: { actorRef: "fixture-reviewer", reviewedAt: REVIEW_TIME, reason: "Fixture correction projection", changes: [] },
    refresh: { status: "complete", revision: "fixture-reviewed", targets: [], completed: [] }, committedAt: REVIEW_TIME };
  fx.put("transcript_reviews", { ...head });
  const current = await f.deps.readSources("a", ["s1"]);
  assert.equal(current.turns[0]!.text, head.overlay[0]!.text);
  assert.equal(current.turns[0]!.speakerLabel, "Reviewed admissions expert");
  await assert.rejects(f.service.export("a", prior._id, 1), refuses("source_changed"));
  const regenerated = await f.service.create("a", input());
  assert.notEqual(regenerated.sourceDigest, prior.sourceDigest);
  assert.equal(regenerated.citations[0]!.speakerRef, "speaker:reviewed");
  assert.match((await f.service.export("a", regenerated._id, 1)).markdown, /Reviewed admissions expert/u);
  assert.equal(JSON.stringify(fx.rows("turns")), before);
});

test("document offsets and hostile user text stay safe in source-linked Markdown", async () => {
  const f = fixture(); f.sources().turns[0]!.speakerRef = "document";
  const draft = await f.service.create("a", { ...input(), title: "<script>\n# forged" });
  const output = await f.service.export("a", draft._id, 1);
  assert.match(output.markdown, /3–9 characters/u); assert.doesNotMatch(output.markdown, /<script>|\n# forged/u);
});
test("removing a withheld item preserves other verified mappings and truthful coverage", async () => {
  const f = fixture(), draft = await f.service.create("a", input());
  const added = { ...draft, revision: 2, sections: draft.sections.map((s) => ({ ...s, items: [...s.items, { ...s.items[0]!, id: "faq-2", text: "Unsupported text", validation: "needs-review" as const, assessmentDigest: "" }] })) };
  await f.repository.replace("a", added, 1);
  const removed = await f.service.edit("a", draft._id, { revision: 2, title: draft.title, edits: [{ id: "faq-2", text: "" }] });
  assert.equal(removed.sections[0]!.items.length, 1); assert.equal(removed.sections[0]!.items[0]!.validation, "ai-supported");
  assert.doesNotMatch((await f.service.export("a", draft._id, 3)).markdown, /Unsupported text/u);
});
test("actual TOC unreviewed sample refuses; a clearly synthetic verified copy demonstrates downstream consumption without raw mutation", async () => {
  // Resolved from this file (repo-root data/), not the cwd: `pnpm -r test` runs with apps/api as cwd.
  const sample = new URL("../../../../data/toc-migrated/2026-08-27-in-focus-4/", import.meta.url);
  const path = new URL("turns.json", sample), claimsPath = new URL("claims.json", sample);
  const before = readFileSync(path), claimsBefore = readFileSync(claimsPath);
  const turns = JSON.parse(before.toString()) as Turns[], claims = JSON.parse(claimsBefore.toString()) as Claims[];
  const f = fixture();
  f.deps.readSources = async () => ({ sessions: [{ _id: "2026-08-27-in-focus-4", tenantId: "toc" } as Sessions], claims, turns });
  await assert.rejects(f.service.create("toc", { ...input(), sessionIds: ["2026-08-27-in-focus-4"] }), refuses("unavailable"));
  assert.equal(f.calls(), 0);
  const first = turns.find((t) => t.text.trim()); assert.ok(first);
  const synthetic = fixture(); synthetic.sources().turns[0]!.text = first.text; synthetic.sources().claims[0]!.evidence[0]!.quote = first.text;
  const draft = await synthetic.service.create("a", input()); assert.equal(draft.citations[0]!.quote, first.text);
  assert.ok((await synthetic.service.export("a", draft._id, 1)).markdown.includes("AI draft"));
  assert.deepEqual(readFileSync(path), before); assert.deepEqual(readFileSync(claimsPath), claimsBefore);
});
test("mounted router enforces authentication/scopes; provider error secrets remain private", async () => {
  const f = fixture(), app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async (key) => key === "full" ? { tenantId: "a", scopes: ["sessions", "ask"] } : key === "other" ? { tenantId: "b", scopes: ["sessions", "ask"] } : key === "read" ? { tenantId: "a", scopes: ["sessions"] } : null }));
  app.use(createOutputRouter(f.service));
  const server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/knowledge-outputs`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer invalid" } })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { authorization: "Bearer read", "content-type": "application/json" }, body: JSON.stringify(input()) })).status, 403);
    const headers = { authorization: "Bearer full", "content-type": "application/json" };
    const created = await fetch(url, { method: "POST", headers, body: JSON.stringify(input()) }); assert.equal(created.status, 201);
    const draft = await created.json() as { _id: string; revision: number };
    assert.equal((await fetch(`${url}/${draft._id}`, { headers })).status, 200);
    assert.equal((await fetch(`${url}/${draft._id}`, { headers: { authorization: "Bearer other" } })).status, 404);
    const exported = await fetch(`${url}/${draft._id}/export`, { method: "POST", headers: { authorization: "Bearer read", "content-type": "application/json" }, body: JSON.stringify({ revision: 1 }) });
    assert.equal(exported.status, 200); assert.match((await exported.json() as { markdown: string }).markdown, /AI draft/u);
    assert.equal((await fetch(`${url}/${draft._id}/export`, { method: "POST", headers: { authorization: "Bearer other", "content-type": "application/json" }, body: JSON.stringify({ revision: 1 }) })).status, 404);
    assert.equal((await fetch(`${url}/${draft._id}`, { method: "PUT", headers: { authorization: "Bearer read", "content-type": "application/json" }, body: JSON.stringify({ revision: 1, title: "Edit", edits: [] }) })).status, 403);
    assert.equal((await fetch(`${url}/${draft._id}`, { method: "PUT", headers: { authorization: "Bearer other", "content-type": "application/json" }, body: JSON.stringify({ revision: 1, title: "Edit", edits: [] }) })).status, 404);
    f.setFailure(); const response = await fetch(url, { method: "POST", headers: { authorization: "Bearer full", "content-type": "application/json" }, body: JSON.stringify(input()) });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET|source content/u);
  } finally { await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
});
