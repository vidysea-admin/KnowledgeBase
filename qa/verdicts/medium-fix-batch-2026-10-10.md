# Verdict: medium-fix-batch-2026-10-10

VERDICT: FAIL
**Cycle checked:** 0

Checker: independent, worktree `lane/medfix`, HEAD 5fdd9e7 (base 8c8429d). No DB, network, browser, full suite or build.

## Per-issue result

| Issue | Commit | Result | D-015 count (by issue id) |
|---|---|---|---|
| ISS-155 | de0154c | PASS (dry-run id half); tagClaims half carried by ISS-MEDFIX-001 | ISS-155: 1/1 recorded reproduction (bare `uk` previewed vs `toc:uk` written) now prints `topic toc:uk <- 2 session(s)`. The row's other two items are named: no-tagClaims is open (ISS-MEDFIX-001); the `entities` branch itself still has no test (only `topicPreviewLine` and live-write id agreement are pinned). |
| ISS-171 | d27f0ba | PASS | ISS-171: 1/1 (3 turns, same session -> node once); reddens when `seen` is removed (M2). |
| ISS-145 | 31a081c | PASS | ISS-145: 1/1 (gate-table drift); corrupted copy detected; dropping a parsed row reddens (M4). |
| ISS-146 | 31a081c | PASS | ISS-146: 1/1 (non-speaker lane invisible); empty `--grep` sweep; pinning the pattern to speaker reddens (M3). |
| ISS-369 | 5e7b1c0 | FAIL | ISS-369: 0/1 correct. Both file/line pairs are now self-consistent, but the stamp value is wrong under the approved contract. |
| ISS-T057-B8-KNOWLEDGE-EXPLORER-004 | (skipped) | not applicable | not touched |

Safe to merge on their own: de0154c, d27f0ba, 31a081c. NOT safe: 5e7b1c0.

## A. ISS-155 (tenancy-adjacent)

1. Replay: `topicPreviewLine("toc",{_id:"uk",sessionRefs:["s1","s2"]})` equals `topic toc:uk <- 2 session(s)` (test asserts it and rejects the bare form). Read the backfill.mjs `entities` branch (about lines 87-130) end to end without running it: tree_index root via `treeIndexRootFilter(TENANT)` (filters tenantId), counts via `scopedCollection`, preview via `topicPreviewLine(TENANT, t)`, live loop `promoteAndPersistEntities(TENANT, sess._id, root, db)` over `sessionsColl(TENANT)` sessions. Every read is tenant-filtered.
2. Live path, line by line (apps/api/src/indexing/promote-entities.ts), the maker's claim is CONFIRMED:
   - topics upsert (about :76-80): filter `{_id: entityId(tenant, slug)}` merged with `{tenantId}` by `scopedCollection.updateOne` (packages/db/src/lib/tenantScope.ts `withTenant`); `$set` carries tenantId, name, sessionRefs.
   - orgs upsert (about :83-87): same shape, namespaced `_id`, tenant filter.
   - claims: `find({"evidence.sessionId"})` and per-claim `updateOne({_id})` both go through the scoped accessor (tenant merged); `topicRefs` are mapped through `entityId(tenantId, slug)` (tagClaimsForSession).
   - Two tenants with the same slug get different `_id`s (`a:uk` vs `b:uk`) and tenant-filtered filters: no collision, no overwrite. Existing tests pin it (C6, ISS-154, ISS-C-TARGETING all green).
   - No un-namespaced id or unfiltered query found. Only theoretical edge: a tenantId containing `:` could alias an `entityId`; slugs are `[a-z0-9-]` so no slug can, and the tenant filter still prevents cross-tenant writes. Not filed.
3. Drift: preview and live id both go through `entityId` (preview via `topicPreviewLine`, live inline), over the same `promoteTreeEntities` plan; the new test pairs the preview id with the id a fake-db live write uses (`toc:visa-rules`). Residual: the live `_id` is built inline rather than by `topicPreviewLine`, so the shared helper, not one function, prevents drift. The dry run previews topics only, not orgs (as before).
4. ISS-MEDFIX-001 (no tagClaims in backfill): it reads tenant-scoped claims by `evidence.sessionId` and `$set`s `topicRefs` only. The flag exists to avoid tagging stale claims after a degraded extraction run, which a manual backfill (no extraction, no health signal) cannot detect. Not a tenancy matter, no cross-tenant effect, non-destructive and re-runnable. True severity: low. Corrected in qa/issues.medfix.jsonl (severity field only).

## B. ISS-171
Tests the real `createAskArmsFor` path (imports `./ask-arms.js`, real `lexicalSearchTurns`, fake Mongo). Pins exactly the row's case. Mutation M2 deleting both `seen` lines: pass 11 / fail 1 (the new test).

## C. ISS-145 / ISS-146
- `parseGateMapping`: no section gives `[]` (the comparison test requires 12 rows, so never a silent pass); stops at the next heading; skips header, separator and non-ISS rows; rows with fewer than 4 cells skipped; empty string gives `[]`; duplicate rows are kept (they change the shape and fail the length==12 / deepEqual check). Unknown gate ids pass through unvalidated and are caught by the comparison. Lanes with no ledger file: `unionRows` is already tolerant (existing tests).
- `deriveAllDivergence`: empty `--grep=` matches all; filtered to `checker:` subjects by existing code. M3 reddens the injected test.
- The 16 real rows, checked against history: the 12 speaker rows are real (gate table). ISS-308->ISS-311 and ISS-309->ISS-312 are real collisions already resolved by checker commit 66ac88f. ISS-360->ISS-360-HEARTBEAT is real, resolved by b71da0f. ISS-113 "absent" is a false positive: the row was retitled IN PLACE later (original title "schema-v2 C8's three row-level checks are UNVERIFIED..." became the superseding title) and still exists on master under ISS-113. Nothing new to file. The all-lane sweep has a retitle false-positive class (low observation, not filed).
- Fragility: the real-repo ISS-146 test took 106.3 s (whole file 122.8 s), under the 300 s timeout. It uses `git log --all` on cwd `.`, so it needs full history (a shallow clone or other cwd breaks it) and its time grows with history. It cannot go red merely from growth (it asserts `all.length > speaker.length`, monotone) but it can time out in CI. Recommend a fixture or cache in a later unit. Observation only.

## D. ISS-369 (FAIL)
Contract qa/contracts/handshake-liveness.md (read only, main checkout): section 4.2 value aliases map `reset-awaiting-rebuild` to **`building`**, not `paused`. Section 2.1: `paused` means deliberately set aside; `building` means the maker is working. A unit reset by D-041 ruling 5 to be REBUILT owes work; `paused` drops it from the backlog consequence (3.6/3.7 list paused only in a summary), hiding the owed rebuild. Section 2.3: `STALLED -> building` is Approver only, and D-041 ruling 5 was that Approver act; the contract's stamp is `building`, which is not yet in this base's HANDSHAKE_VOCAB (scripts/lib/dispatch-state.mjs:48), so writing it needs the reader implementation first. `paused` is permitted for a maker with a stated reason, but here it is the wrong state, and the new text asserting the two status lines "now agree in meaning" is contradicted by the contract. The edit changed only the stamp line (and the false "which agree" clause); no claim about the units' work changed. Decision: do not merge 5e7b1c0. ISS-369 stays open until the contract's reader unit lands (then stamp `building`) or the Approver rules otherwise.

## E. Scope and hygiene
`git diff --stat 8c8429d HEAD`: each commit touches only its issue's files; nothing under apps/api/src/routes, enforcement paths, qa/contracts or TASKS.md; qa/issues.jsonl untouched. `node scripts/lint-dirsize.mjs`: `OK (109 dir(s) within budget)`. Non-blank LOC: ask-arms.test.ts 272, promote-entities.test.ts 381 (limit 400), promote-entities.ts 122, backfill.mjs 171, id-divergence.mjs 121, id-divergence.test.mjs 137: all within budget (lint-loc reports only pre-existing violations in other files).

## F. Commands (real output)
- apps/api `node --test --import tsx src/indexing/promote-entities.test.ts src/ask-arms.test.ts`: tests 32, pass 32, fail 0.
- `node --test scripts/lib/id-divergence.test.mjs`: tests 13, pass 13, fail 0 (duration 122.8 s).
- `node --check scripts/backfill.mjs`: CHECK_OK.
- apps/api `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: exit 0 (35 s).

## Mutations (byte backup per mutation, restore verified, hash equals HEAD blob)
| # | File | Mutation | Result | Restored hash |
|---|---|---|---|---|
| M1 | promote-entities.ts | preview prints bare `t._id` | ISS-155 test red (pass 19, fail 1) | 6fdea50 equals HEAD |
| M2 | ask-arms.ts | delete both `seen` lines | ISS-171 test red (pass 11, fail 1) | 542cf75 equals HEAD |
| M3 | id-divergence.mjs | `deriveAllDivergence` greps "speaker" | ISS-146 test red | e8c799f equals HEAD |
| M4 | id-divergence.mjs | `parseGateMapping` drops the ISS-093 row | ISS-145 test red | e8c799f equals HEAD |

Note: a first M2 attempt hit a transient "No space left on device" on the shared disk and left ask-arms.ts empty; it was restored from `git show HEAD:` and hashes to the HEAD blob; M2 above is the clean rerun. `git status` still shows ask-arms.ts as M with no diff (line-ending stat noise from that restore).

## Ledger status recommendations (orchestrator applies on merge)
- ISS-171 -> fixed (this verdict, d27f0ba).
- ISS-145 -> fixed; ISS-146 -> fixed (31a081c).
- ISS-155 -> fixed for the dry-run id half (de0154c); the tagClaims item is carried by ISS-MEDFIX-001 (now low).
- ISS-369 -> stays open (5e7b1c0 rejected).
- ISS-T057-B8-KNOWLEDGE-EXPLORER-004 -> unchanged (skipped).

ISSUES-WRITTEN: none (ISS-MEDFIX-001 severity corrected medium -> low in qa/issues.medfix.jsonl)

EXPLANATION: Three of four commits are correct, independently reproduced and mutation-checked. 5e7b1c0 maps a reset-for-rebuild unit to `paused`; the approved handshake-liveness contract (4.2) maps `reset-awaiting-rebuild` to `building`, and `paused` would hide an owed rebuild. The maker correctly flagged the vocabulary question, but the chosen value is wrong, so the batch is FAIL with 5e7b1c0 excluded from merge. Observations (not backlog): the real-repo ISS-146 test is slow and history-dependent; the all-lane sweep reports in-place retitles (ISS-113) as `absent`; the `entities` backfill branch has no direct test.

---

# Cycle 1 (re-check after revert 4bd9bd8 and manifest update 987b466)

VERDICT: FAIL
Cycle checked: 1
Checked HEAD: 987b466

## Checks
1. `git diff 29f0eb3 987b466 --stat`: 3 files (delivery-gate-manifest-blindness.md, write-guard-enforcement-gaps.md, this unit's manifest), 9 insertions, 3 deletions. `git diff 29f0eb3 987b466 -- apps scripts packages`: 0 bytes. HOLDS.
2. `git diff 5e7b1c0^ 987b466 -- qa/manifests/write-guard-enforcement-gaps.md qa/manifests/delivery-gate-manifest-blindness.md`: 0 bytes. Revert exact. HOLDS.
3. Manifest truthfulness: FAILS. Handshake lines read `Status: ready-for-check` / `Fix cycle: 1` and the D-015 lines for ISS-155, ISS-171, ISS-145, ISS-146 are unchanged from cycle 0 (the only diff vs 29f0eb3 is the Fix-cycle line and the new "Fix cycle 1" section). But the body still claims ISS-369: line 5 lists "ISS-369 5e7b1c0" among the unit's commits; lines 34-39 still carry the section "## ISS-369 - FIXED (documentation only)", describing the `paused` mapping as applied, the "VOCABULARY DECISION TAKEN" paragraph, "D-015: ISS-369: 4/4" and "Verified: ... returns paused". 5e7b1c0 no longer exists in effect (reverted), so those statements are now false, and the new section's "NOT claimed by this unit any more" contradicts them.
4. Smoke (all at HEAD 987b466): apps/api `node --test --import tsx src/indexing/promote-entities.test.ts src/ask-arms.test.ts`: tests 32, pass 32, fail 0. `node --check scripts/backfill.mjs`: CHECK_OK. Not run: scripts/lib/id-divergence.test.mjs (slow real-repo history test; scripts/ is byte-identical to cycle 0, which passed 13/13).

ISSUES-WRITTEN: none

EXPLANATION: The code, tests and revert are correct and unchanged from what cycle 0 passed for ISS-155 (dry-run id half), ISS-171, ISS-145, ISS-146. The sole defect is documentary: the manifest's header line and the "ISS-369 - FIXED" section were left in place, so the manifest still asserts a fix that was reverted. Required fix (maker, manifest only): remove ISS-369 5e7b1c0 from the Commits line, and delete or rewrite the "## ISS-369" section as "WITHDRAWN, reverted by 4bd9bd8, ISS-369 stays open" (drop the FIXED claim, the vocabulary-decision paragraph, the 4/4 D-015 line and the "Verified" line); bump to Fix cycle 2. No source or test change is needed. Recommended ledger changes when the unit later passes: ISS-171, ISS-145, ISS-146 fixed and verified; ISS-155 verified for the id half with a pointer to ISS-MEDFIX-001; ISS-369 stays open (withdrawn from the unit). qa/issues.jsonl and shards not edited by this checker.

---

# Cycle 2 (manifest-only re-check after c407167)

VERDICT: PASS
Cycle checked: 2
Checked HEAD: c407167

## Checks
1. `git diff 37fad30 c407167 --stat`: 1 file changed (qa/manifests/medium-fix-batch-2026-10-10.md), 10 insertions, 8 deletions. HOLDS.
2. `grep -n "ISS-369\|5e7b1c0"` on the manifest. Line 5: "The ISS-369 commit 5e7b1c0 was reverted in 4bd9bd8 and is not part of this unit." Line 34: "## ISS-369 - WITHDRAWN, still open (commit 5e7b1c0 reverted in 4bd9bd8)". Line 36: "...Nothing in this unit fixes ISS-369 and no D-015 count is claimed for it." Line 37: "...ISS-369 stays open in the ledger." Line 49: "ISS-369 stays open and is NOT claimed by this unit any more." Line 47 (cycle 0 history) refers to the ISS-369 commit as failed. No line claims it fixed; Commits line does not list 5e7b1c0 as part of the unit. HOLDS.
3. Exact handshake text: `**Status:** ready-for-check` and `**Fix cycle:** 2`. `git diff 29f0eb3 c407167` hunks: Commits line, the ISS-369 section, the Fix-cycle line, and the two appended fix-cycle sections only; ISS-155, ISS-171, ISS-145, ISS-146 D-015 lines untouched. HOLDS.
4. `grep -i "five|four|5 issues|4 issues"`: no matches; no count or summary line made untrue. HOLDS.

## Ledger status recommendations (orchestrator applies on merge)
- ISS-171, ISS-145, ISS-146 -> verified.
- ISS-155 -> verified for the dry-run id half; tagClaims item carried by ISS-MEDFIX-001.
- ISS-369 -> stays open (withdrawn from the unit, commit reverted).

ISSUES-WRITTEN: none

EXPLANATION: PASS covers ISS-155 (dry-run id half), ISS-171, ISS-145 and ISS-146 only. ISS-369 was withdrawn from the unit and stays open. Code, tests and revert were verified at cycles 0 and 1 and are unchanged; this cycle only confirmed the manifest no longer asserts the reverted fix. qa/issues.jsonl and shards not edited by this checker.
