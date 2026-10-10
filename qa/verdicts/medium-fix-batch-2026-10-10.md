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
