import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sessions } from "@lkb/core";
import type { OutputSources } from "./types.js";
import { assertOutputDraft } from "./validator.js";
import { claim, fixture, input, refuses, turn } from "./workbench-fixture.js";

const refusePolicy = async () => ({ status: "active" as const, policy: { tenantId: "a", policyId: "p1", version: 1, questionClass: "faq", mode: "internal-only", style: "concise", onInsufficient: "refuse", citations: "required", retired: false } as never });
const unverifiedOnly = (): OutputSources => ({ sessions: [{ _id: "s1", tenantId: "a" } as Sessions], claims: [{ ...claim(), status: "needs-review" }], turns: [turn()] });

// D-200/D-201 [C1][C2][C5]: a draft built only on needs-review claims succeeds (no policy) and every citation carries claimStatus.
test("needs-review-only evidence yields a draft with claimStatus citations and non-ready coverage (D-201)", async () => {
  const f = fixture(); f.setSources(unverifiedOnly());
  const draft = await f.service.create("a", input());
  assert.deepEqual(draft.citations.map((c) => c.claimStatus), ["needs-review"]);
  assert.deepEqual(draft.sourceCoverage, { status: "partial", withheldClaims: 0 });
  assertOutputDraft(JSON.parse(JSON.stringify(draft)));
  const exported = await f.service.export("a", draft._id, 1);
  assert.match(exported.markdown, /Unverified \(needs review\)/u);
});
// [C2] verified citations carry claimStatus "verified", show no marker, and a verified<->needs-review flip makes the draft stale.
test("verified citation is labelled verified without marker; verified<->needs-review flip is source_changed (D-201)", async () => {
  const f = fixture(); const draft = await f.service.create("a", input());
  assert.deepEqual(draft.citations.map((c) => c.claimStatus), ["verified"]);
  assert.equal(draft.sourceCoverage.status, "ready");
  assert.doesNotMatch((await f.service.export("a", draft._id, 1)).markdown, /Unverified/u);
  f.sources().claims[0]!.status = "needs-review";
  await assert.rejects(f.service.export("a", draft._id, 1), refuses("source_changed"));
  const unv = fixture(); unv.setSources(unverifiedOnly()); const d2 = await unv.service.create("a", input());
  unv.sources().claims[0]!.status = "verified";
  await assert.rejects(unv.service.export("a", d2._id, 1), refuses("source_changed"));
});
// [C2] old stored documents (no claimStatus) stay schema-valid and are treated as verified.
test("stored citations without claimStatus remain valid and current (additive field)", async () => {
  const f = fixture(); const draft = await f.service.create("a", input());
  const legacy = structuredClone(draft); for (const c of legacy.citations) delete (c as { claimStatus?: string }).claimStatus;
  assertOutputDraft(legacy);
  await f.repository.insert("a", { ...legacy, _id: "11111111-1111-4111-8111-111111111111" });
  assert.match((await f.service.export("a", "11111111-1111-4111-8111-111111111111", 1)).markdown, /AI draft/u);
});
// [C4] verified citations are numbered before needs-review ones.
test("verified claims rank before needs-review claims in output citations (D-201)", async () => {
  const f = fixture(); f.sources().claims.unshift({ ...claim(), _id: "a0", status: "needs-review", evidence: [{ turnId: "t1", sessionId: "s1", quote: "The board decided to extend the deadline." }] });
  const draft = await f.service.create("a", input());
  assert.deepEqual(draft.citations.map((c) => [c.claimId, c.claimStatus]), [["c1", "verified"], ["a0", "needs-review"]]);
});
// [C5] strict refuse policy refuses a needs-review citation at create (before any provider call) and at export.
test("refuse policy refuses needs-review citations on create and export; without policy a needs-review-only draft succeeds (D-201)", async () => {
  const f = fixture(); f.setSources(unverifiedOnly()); f.deps.policy = refusePolicy;
  await assert.rejects(f.service.create("a", input()), refuses("unavailable"));
  assert.equal(f.calls(), 0);
  f.deps.policy = async (_t, s) => ({ status: "none", questionClass: s.questionClass });
  const draft = await f.service.create("a", input());
  f.deps.policy = refusePolicy;
  await assert.rejects(f.service.export("a", draft._id, 1));
  // A refuse policy with verified-only evidence is unchanged.
  const ok = fixture(); ok.deps.policy = refusePolicy;
  assert.equal((await ok.service.create("a", input())).sourceCoverage.status, "ready");
});
