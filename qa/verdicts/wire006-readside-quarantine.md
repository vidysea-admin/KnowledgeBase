# Verdict: wire006-readside-quarantine

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 306228cb2c3de6b9d96164d327f539188cc1a032
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Unit: ISS-WA-REVIEW-WIRE-006 (T-007), the read-side WhatsApp quarantine. Privacy/tenancy class, full ceremony.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md criterion 9.
ISSUES-WRITTEN: none. The checker did not write to the ledger. Two re-grades and one new row are requested from the maker below.
Ledger flip: ISS-WA-REVIEW-WIRE-006 may flip open -> verified, in the same close-out commit as the ledger actions under "Required close-out ledger actions".

## Identity
The lane HEAD is 306228cb, and the diff is 9e55b642..306228cb, 11 files, all test, testsupport, evidence, manifest or ledger. No production source changed (`git diff --stat` verified). The candidate bytes were rechecked before the verdict was written.

## 1. Reader survey (independent)
I grepped apps/api/src (excluding tests) for every collection literal: turns, chunks, claims, session_pages, tree_index, entities, graph_edges and edges. I then classified each non-writer read.
- **Guarded, served:** search-store.ts (filterTurns + safeCitationSession), semantic-search/current-corpus.ts (feeds semantic-search-store.ts, which is dormant in production: `semanticSearch: undefined`), ask/ask-arms.ts, ask/source-context.ts, ask/graph-context.ts, claims/store.ts, knowledge-outputs/reader.ts, knowledge/catalog-store.ts (metadata-visibility), indexing/eligible-tree.ts, speaker-profiles/store.ts (sessionVisible + claimVisible; the maker did not list this one), session-decisions/reader.ts, and store.ts brain/citations/tree/graph via composition/integrations/trusted-readers.ts. server.ts:137 builds grounded content from `deps.brain`, which is `trustedBrainReads` (store.ts:85).
- **Not served or boolean-only:** answer-policy/answer-evidence.ts refuses WhatsApp unless eligibleTurn is bound, and answers.ts:62 binds it. connector-workflow/mongo-store.ts serves recording-source receipts as booleans. transcript-review/search-reader.ts is consumed only by search-store, after filterTurns. whatsapp/review/* is the review and audit surface. evaluation-flywheel is ISS-W17WIRE006-002.
- **UNGUARDED READER THE MAKER MISSED (latent):** `apps/api/src/grounded-content/reader.ts:58-68` `createMongoGroundedContentDeps` reads raw sessions, session_pages, claims and turns with no visibility gate. It has no production consumer (only reader.test.ts and qa/evidence/t040 import it), so nothing leaks today. However, it sits in a file the row names, and it contradicts the manifest's claim that "every apps/api reader already goes through createKnowledgeVisibility". Fix: wrap it with `trustedBrainReads`, or delete the export. Severity: medium, security class (see below).
- **Not found:** no other unguarded served reader.

## 2. "No DB reads" claims
- packages/index/src and packages/ask/src (non-test) have no getDb, scopedCollection, `.collection(` or mongodb import. The only DB-shaped symbols are a comment and a findOne interface in pipeline/speaker-docs.ts:117, which is on the index-time write path and not a reader.
- transcript-review/planner.ts imports only node:crypto.

All three claims are confirmed.

## 3. Non-vacuity
- **Controls:** every unapproved test asserts a public control (search, citations, brain detail, outputs, eligible tree, hydrator, graph-context). A probe confirmed that the planted text really is retrievable: `readSearchCandidateTurns` returns wa-turn-1 for a pending session, and only filterTurns removes it (`qa/evidence/w17-wire006/checker/probe1.log`).
- **Approved:** the trusted test asserts that brain detail serves wa-turn-1 (approved) and withholds wa-turn-2. The baseline probe shows approved search returns wa-turn-1 with the "Reviewed expert guidance" title, and the corpus includes it (base.probe.log).
- **Weak spots (low, notes only):**
  - The topic-catalog test (`.catch(() => [])` / `.catch(() => null)`) has no public control, so a throwing catalog passes.
  - The semantic-search test `.catch`es into `{error}`.
  - The approved search, citation and hydrator paths are asserted only negatively (no sibling leak). There is no positive "approved text is returned" assertion.

## 4. Checker mutations (single guard, two-guard readers)
Harness: `qa/evidence/w17-wire006/checker/mut.sh` (output in mut.out). It uses a per-mutation byte backup, a subshell trap on EXIT/INT/TERM/ERR, `timeout 600`, a marker check, a `cmp` restore, and `git -c core.autocrlf=true hash-object` equal to HEAD.
- **CA:** search-store.ts:137 drops filterTurns and keeps safeCitationSession. KILLED, 3 failures: pending search, rejected search and the approved test.
- **CB:** current-corpus.ts:22 drops filterTurns and keeps safeCitationSession. KILLED, 1 failure: only the approved test catches wa-turn-2 entering the corpus. The pending and rejected tests pass, because safeCitationSession alone masks the drop there.
- **Run 1 was invalid and is preserved as `*.run1-invalid.*`:** my own `diff` exited 1, which fired the ERR trap and restored the source before the test ran, so both mutants looked like survivors. The probe re-run (mut2.out) and run 2 confirm the kills.
- **Restore:** HEAD-OK for both files. The probe dir was removed. A CRLF-only stat-dirty state was cleared with `git -c core.autocrlf=true update-index --refresh`.

## 5. Commands (cwd apps/api, node v24.19.0 codex runtime, `timeout 600`, run one at a time)
| check | exit | result | log |
|---|---|---|---|
| read-side-quarantine.test.ts | 0 | 17/17 | checker/t1-main.log |
| read-side-quarantine-trusted.test.ts | 0 | 9/9 | checker/t2-trusted.log |
| ask/graph-context.test.ts | 0 | 10/10 | checker/t3-graphctx.log |
| ask/source-context-quarantine.test.ts | 0 | 3/3 | checker/t4-srcctx.log |
| tsc --noEmit -p tsconfig.json | 0 | clean (37 s) | checker/t5-tsc.log |
All of this evidence was produced independently. The maker's mutation logs were read but not relied on.

## 6. Filed issues: judgement
- **ISS-W17WIRE006-001** (optional `authorizeSession` fails open, transcript-review/router.ts:24,66): re-grade from **low to MEDIUM**, security class (never round-capped). It is not high:
  - The only production composition (composition/integrations/transcripts.ts:48) binds it.
  - grounded-postprocessing/transcripts.test.ts:52 and visibility.test.ts:26 assert that the binding exists.
  - There is no live leak.

  It is not low either: a fail-open auth hook on raw chat transcripts is one composition edit away from a privacy leak. Fix: make the field required, with fixtures passing an explicit allow-all.
- **ISS-W17WIRE006-002** (flywheel): low is agreed. store.ts:9 refuses any database not matching `lkb_t059_*`, and the output is digests.
- **New, for the maker to file:** the `createMongoGroundedContentDeps` unguarded export (section 1). MEDIUM, security class, latent.

## 7. D-015 replay (ISS-WA-REVIEW-WIRE-006 repro = 12 reader paths; no literal inputs recorded)
| status | count | paths |
|---|---|---|
| Guarded and covered by a planted-text test | 9 | ask-arms lexical/tree/vector, source-context, search-store, semantic-search-store (via the corpus), grounded-content via trustedBrainReads, store.ts detail/claims/citations, claims/router via the store, routes/graph via trustedGraphReads |
| No DB reader | 3 | planner.ts, packages/index build-graph, packages/ask |
| Deliberately open, named with a reason | 2 | the row's purge of already-indexed rows (a human data-deletion action; `auditWhatsAppQuarantine` reports them); the latent `createMongoGroundedContentDeps` export inside the named grounded-content file (no consumer) |

**Total: 12/12.**

## Not verified
- A real MongoDB replica set: all of this used the in-memory fake DB.
- An end-to-end `/ask` HTTP response: the arms, tree and hydrator are covered, but the full route is not.
- Entity promotion: the indexing write path was not probed.
- apps/web.
- Per-method survivors in the other multi-guard readers. Only CA and CB were run.

## Required close-out ledger actions (bookkeeping, no code)
1. Re-grade ISS-W17WIRE006-001 to medium.
2. File the grounded-content export finding as a medium, security-class row in qa/issues.W17WIRE006.jsonl.

## Budget record (never waived)
- The maker's usage is unknown, so this ran as BOOTSTRAP_REVIEW (180 s / 6,000 tokens) with the ratio unverified.
- The checker's actual active time was about 570 s, including command time. Its tokens are unknown, with a debit of 140k allocated.
- `review_budget.py assess` returned exit 2, NEEDS_EXTRA_REVIEW, exceeded active_s and tokens (`checker/metrics.finalization.result.json`). The overrun is recorded for ORCH. The required privacy-class checks were not narrowed.
- Evidence dir `qa/evidence/w17-wire006/checker/` is untracked in the lane. Only this verdict is committed.
