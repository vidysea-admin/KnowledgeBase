# Verdict — t022-offline-transfer (Mode A, resume-reconcile dispatch 2026-10-26)

Bound to D:/KnowledgeBase. Judged CURRENT tree bytes (HEAD of docs/devops-golive-2026-10-26). Cycle checked: 1
Contract: no unit-specific file exists; judged against the clauses the manifest/packet cite: `qa/contracts/goal-t022-offline-review.md` cl.4-8 and `qa/contracts/goal-t022.md` C2-C5, C10. Policy-Version: manifest carries no pin, so the current block `proportional-verification/2026-10-19.17` is applied (the pinned-only manifest lints are not enforced). Base 5c4cbade is not an object in this repo, so 4c is a full read of the six owned files (all under 110 lines), not a base diff.

## Check plan
Logic changed in a UI consumer of authenticated writes (tenant epoch, CAS, affirmation) -> affected tests re-run + falsification floor + independent probes. Server path (router.ts, file-store.ts, types.ts, seed.ts, README) read, unchanged. No browser/live check (no new rendered surface beyond the existing form; contract forbids browser calls). Dual check: not required (no `dual-trigger`; client-side display guard only, server tenancy/CAS untouched).

VERDICT: PASS
SCOREBOARD: 6/6 unit criteria met (A strict current-draft staging, B assertion-only no write, C fresh affirmation, D login/reload isolation, E live-CAS submit, G compiler repair); 0 invariants violated
TIER: M (multi-file UI behaviour; tenant guard is client-side only, server enforcement unchanged; no L trigger cited)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no coverage table; unpinned manifest) - floor falsifications below 6/6 red
LIVE-BROWSER: not-applicable (jsdom component tests only; no new route/surface)
ISSUES-WRITTEN: ISS-382, ISS-383 (low, test-gap), ISS-384 (process)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Evidence I produced (copy at scratchpad t022ot; junctioned node_modules; bound tree untouched)
- Pins: LF-normalised SHA-256 of all 6 owned files = request.json pins (git blob == pin). Non-owned dependency `apps/web/src/api/client.ts` drifted since pin (later lane commits 0104801a, 8c46caae); I did not rely on any maker/broker receipt.
- Verify: `vitest run offline-transfer.test.ts CalibrationReviewPage.test.tsx --maxWorkers=1 --no-file-parallelism` in the copy: 2 files, 9/9 pass, exit 0 (3.1s). `tsc --noEmit -p tsconfig.json` over all of apps/web in the copy: exit 0.
- Falsification floor (green-before in copy, red-after, one single-hunk edit each):
  - A delete packet-digest check (offline-transfer.ts `digest !== view.packetSha256`) -> adapter "source drift" test red (8/9).
  - B push `localRevision` into the staged judgment -> adapter "only assertion fields" test red.
  - C drop `setAffirm(false)` in rationale onChange -> page test 5 red at test.tsx:83 ("not disabled" after edit).
  - D remove the post-await generation/request guard in importDraft -> the unit's own 6 page tests STAY GREEN (see ISS-382); my probe red 2/4.
  - E submit `{...item, revision:0}` -> page test 5 red (expected revision 7, got 0).
  - G drop `approvedCount` from the fixture -> tsc TS2741 at offline-transfer.test.ts(10,9); base tsc exit 0.
  - Beyond floor (1 of 3 cap): client.ts `expectedRevision: 0` -> my probe2 red; unit tests do not cover it (mocked, ISS-383).
- Independent probes (checker-authored, real code): P1 valid draft completing after a login change is discarded (no staged notice, no "use assertion" button, no submit); P1b same for a Reload; oversize (5,000,001 B) refused before `file.text()`; control import stages. 4/4 green on real code. P2 real `submitCalibrationItem` posts exactly {expectedRevision: item.revision, inputSha256, score, rationale, affirmIndividualReview:true}, no tenant/actor field. 1/1 green.
- Security path read: `requireScope("compete")`, tenant from `req.auth`, actor = hash of Authorization, strict 5-key body, expectedRevision CAS, inputSha256 equality, source recheck before publish, export needs 30/30. Staged data lives in React state only (no storage/network). Upstream draft format (`scripts/eval/t022-offline-review.mjs:12-17,20,29`) matches the adapter's exact key sets. Page still mounted (App.tsx:62).

## Judgment
Staging cannot save, cannot carry a local revision, identity or time, and a copied assertion needs fresh per-item affirmation that any edit or item change clears; the save uses the live item's revision and input digest, so a stale or foreign draft cannot bypass server CAS or tenancy. Whole-parent T-022 stays HOLD: genuine owner judgments 0/30, authenticated actual transfers, live calibration and U22 server-receipt are untouched by this PASS; it certifies only this scoped offline-to-live seam. The maker's composite/broker receipts were not credited.

## Notes (non-blocking)
- ISS-382: the unit's "discards an in-flight local draft" test finishes with `"{}"`, which is refused anyway, so it cannot detect removal of the stale-import guard (D survived). Behaviour is correct (probe).
- ISS-383: no test pins the real client.ts request body (mocked), and `useStaged`'s own `setAffirm(false)` is unpinned. Behaviour is correct (probes).
- ISS-384 process: wall passed the 10-min S/M checkpoint, almost all in reading the 1200-line protocol plus building isolated copies.
- Manifest has no Policy-Version/Metrics/Pre-check lines and its packet names C:/Users/product/... paths; not format-fixup per the dispatch instruction.

Metrics: start=2026-10-26T16:12:00Z end=2026-10-26T16:33:00Z wall_min=21 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1260 mutants=1 defects_unit=0 defects_6c=0 slow: protocol reading+copy setup 12
