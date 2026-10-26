# Manifest - w27-labelreview

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-labelreview.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-labelreview (lane/w27-labelreview)
Base: a9b202b4 (origin/master). Unit A commit: the D-183 entry commit after the merge of w27-onairexpiry. Unit B candidate: the commit following it on the lane (SHA reported in the handback; a manifest cannot contain its own commit id).
Issues: none filed or flipped. Roadmap tier: T-022 / U2.2 labelling (Approver instruction 2026-10-19).

## Decision numbering
This lane merged lane/w27-onairexpiry (D-182) and appended the label ruling afterwards, so it is D-183. docs/DECISIONS.md is additions-only against 4264418c (0 removed lines).

## Unit A - D-183
Records the verbatim Approver quote and three rulings: AI-consensus working labels with `labelSource: "ai-consensus"` and confidence; optional human review (Accept keeps ai-consensus, Override makes `human`); AI labels never humanGold and every metric must say "AI-consensus". Confidence: agree and no flags = high; majority = medium; disagree, no majority, a failed vote or no label = low. `**Approved-by:** Umesh`. D-163 is not superseded.

### Contract clauses that require human gold (qa/contracts NOT edited; need /graduate or an approved PIVOT)
- goal-t022.md C4: "No batch `approve all`, background/model action, fixture import or forged local assertion creates human gold."
- goal-t022.md C6: "Exactly all 30 distinct current items must have valid individually authenticated review submissions and provenance".
- goal-t022.md C7: "Umesh actually reviews and individually approves all 30 displayed items. Machine-generated drafts, derived 0/1 labels, test fixtures, a typed reviewer name or approval of the overall implementation are not individual human judgments."
- goal-t022.md C8: "Only after C7, score all 30 approved current pairs through the real production evaluator LLM seam."
- t022-calibration-human-review.md clause 1: "Every human score, rationale, reviewer and approval time starts null"; clause 3: "reviewer assertion exactly `Umesh`".
- goal-t022-offline-review.md clause 3: "There is no approve-all, inferred score, batch affirmation or automatic human-gold promotion."
- goal-u22.md P3: "D-163 requires actual individual Umesh review/approval before a draft becomes human gold."; S4 (humanGold stays false until item-specific human authorization).
- goal-u23.md full-parent item 8: "U2.2 must supply genuine item-by-item Umesh-approved, source-bound human topic gold and approved binding quality thresholds. AI drafts are never humanGold."
- goal-u25.md P3: "Actual individual Umesh approval is required before decision labels become human gold under D-163; AI-drafted or JSON-declared labels are not proof of approval."; P4 (independently reviewed, hash-bound decision gold).

## Unit B - Label review screen
New files
- apps/api/src/label-review/{types,source,store,router,fixture}.ts, store.test.ts, router.test.ts
- apps/web/src/pages/label-review/{client.ts,LabelReviewPage.tsx,client.test.ts,LabelReviewPage.test.tsx}
Edited (central wiring, minimal)
- apps/api/src/composition/integrations/reviews.ts (labelReview store, enabled only when `LKB_LABEL_REVIEW_DIR` is set), routes.ts (type and mount)
- apps/web/src/App.tsx (route `/label-review`), layout/NavSidebar.tsx (nav item), App.wiring.test.tsx (route list)
- docs/DECISIONS.md only via the append script (Unit A).

Behaviour
- GET /label-review: both sets from data/eval/derived-drafts (t022 sidecar joined to calibration-human-review.json; U2.2 anchored sidecar joined to extraction-adjudication-packet.json, cited passage = archived-original text whose textSha256 matches the judged citation). Read-only; sidecars and packets are never written.
- POST /label-review/items/:id/accept {expectedRevision, inputSha256}: record is `labelSource: "ai-consensus"`, `reviewedBy` = server-bound actor. Refused for an item with no AI label.
- POST /label-review/items/:id/override {expectedRevision, inputSha256, label, note?}: only path to `labelSource: "human"`. T-022 label is a finite number in [0,1]; U2.2 label is supported, partially_supported or unsupported. Note at most 2000 chars.
- POST /label-review/accept-high-confidence {set?}: accepts only never-reviewed high-confidence items; never overwrites an existing review or override.
- Auth: requireAuth, scope `compete`, trusted human review identity (same gate as extraction review). Tenant, actor, time, labelSource and confidence are server-derived; body fields named labelSource, reviewedBy, humanGold, tenantId or reviewedAt are ignored. Tenant scoping: items filtered by packet tenant, state file per tenant. Store file under `LKB_LABEL_REVIEW_DIR` (atomic fsynced publish, mkdir lock, CAS revision, fail-closed validation: an accept record claiming human, or any extra field such as humanGold, makes the store refuse with 503).
- The view is `humanGold: false`, `metricLabel: "AI-consensus"` always.
- Page: Low confidence first (default), All, Reviewed; set filter; confidence badge; per-model votes; Accept AI, Override (label and optional note), bulk "Accept all high-confidence (N)". T-022 rows show question, answer excerpt, AI score; U2.2 rows show claim, cited passage, AI label, model agreement and tally.

Consumers: Express app via mountIntegratedWorkflows; web App routes and NavSidebar. No pipeline stage reads these reviews yet, so nothing depends on a human.

## Real data (read-only run of loadLabelItems on the repo)
30 T-022 items and 72 U2.2 items load; the test asserts every item has prompt, passage and a confidence band, T-022 labels are numbers, items without an AI label are low, and the four source files hash identically before and after.

## Checks run (from lane)
- apps/api: `node --test --import tsx src/label-review/store.test.ts src/label-review/router.test.ts`: tests 11, pass 11, fail 0.
- apps/web: `vitest run src/pages/label-review`: 2 files, 14 tests pass. Earlier combined run with src/App.wiring.test.tsx, src/App.routes.test.tsx and src/layout: 45 tests, 43 pass, the 2 failures were wrong assertions in the new page test (fixed and re-run, 14/14).
- tsc --noEmit: apps/web exit 0, apps/api exit 0.
- `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed), includes tracker-audit gate g1,g4,g5 and dependency-cruiser.

## D-020 mutations (script outside repo: scratchpad w27-mutate.sh; per-mutation byte backup, trap EXIT/INT/TERM/ERR scoped to that mutation, timeout, hash-object compared before and after)
- M1 store.ts accept record `labelSource: 'ai-consensus'` -> `'human'`: KILLED (4 api tests fail incl. "accept keeps labelSource ai-consensus" and the HTTP accept test).
- M2 store.ts bulk accept drops the "not already reviewed" guard: KILLED (bulk accept test).
- M3 source.ts majority counted as high: KILLED (3 tests).
- M4 web client.ts accept body adds `labelSource: "human"`: KILLED (client.test.ts accept test). First M4 attempt was cut by the outer 590 s timeout (exit 143, restored, hash matched) and was re-run alone.
- Post-run hashes equal pre-run hashes for all four files; a HEAD-fidelity check is done after the commit.

## Not done / limits
- Nothing consumes the stored reviews yet (no metric or export). Any consumer must label them "AI-consensus".
- LKB_LABEL_REVIEW_DIR is documented in .env.example; the route answers 503 until it is set.
- No browser run of the screen (no browsers allowed on this machine); jsdom tests only.
