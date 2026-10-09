# Manifest — iss-367-lint-structure-no-shortcircuit
**Contract:** qa/contracts/structure-lint.md
**Goal task:** T-051
**Fix cycle:** 2 of max 3
**Issues addressed:** ISS-367, ISS-371
**Date:** 2026-10-05
**Handshake status:** BLOCKED
**Block reason:** D101 reverted generated-barrel regression; lawful shared-domain module and cross-layer test owner require explicit new-file authorization. Full release criteria remain red.

## Plan approval
Fresh read-only plan reviewer APPROVE before implementation: existing lint-loc runner mode; no new code files, all ten original stages retained, budgets unchanged. Queue tier 1; zero prior PASSes reported by queue for this seam.

## What changed
- scripts/lint-loc.mjs — runAll executes ten stages with shell:false and 120-second per-stage timeout; records errors/signals/exits; preserves standalone check.
- package.json — lint:structure invokes existing runner rather than && chain.
- structure.config.json — anchored .test.mjs classification, no budget increase.
- scripts/lint.test.mjs — first/multiple/final failure, launch error/signal, clean path, arguments/root safety and actual LOC boundaries.

## Verify
- node --test --test-name-pattern='aggregate gate|mjs tests use' scripts/lint.test.mjs
- node scripts/lint-loc.mjs --all — expected aggregate failure from existing violations; must report all ten outcomes.
- git diff --check

## Actual outputs
Focused tests: 3 passed, 0 failed, exit 0.
ISS-371 recorded reproduction: lint-loc initially 5 violations including dispatch-state.test.mjs:332/budget300; after classification 4 violations and this test removed, budgets unchanged.
ISS-367: actual aggregate reached loc FAIL4, dirsize FAIL1 (32>31), root FAIL1 (17>15), dupes/migrations/hooks OK, snapshot FAIL96 differences; full lint-test existing ISS245 opener hangs, bounded runner terminal awaited. Prior && command cannot reach these outcomes.
Early-return mutant rejected exit1 by focused aggregate tests; removed-pattern mutant rejected exit1 by actual LOC fixture test. Both restored byte-identically in finally with subprocess timeout20s. First mutation attempt encoding error restored exact bytes before corrected successful run.
Fresh senior reviewer found no changed-code correctness findings; WARNING for existing suite opener and checker-owned contract C7 requiring first failure. Contract reconciliation belongs to checker, not maker.
Remaining ledger reproductions (historical git comparisons/old manifest attribution) identify unchanged provenance; not claimed fixed by this code. Budget/root/snapshot residuals remain open work; no green full-gate claim.

## Live browser evidence
Not UI-touching — changed paths are structure runner/config/package/test only. No product UI behavior changed. Existing suite opener is a pre-existing test side effect, not acceptance evidence.

Historical handshake before D101: ready-for-check

Actual aggregate terminal: node scripts/lint-loc.mjs --all -> exit1; ten stages reached, seven failed. lint-tests bounded120s -> unavailable/SIGTERM/execution-failed; tracker exit1 six prior ambiguity findings; dependencies exit8 (three calendar import cycles and five API test boundary violations), 387 modules/1278 dependencies. This directly proves later stages remain observable after earlier failures. No global gate PASS.

## Cycle 2 — actual-suite timeout repair
Independent plan APPROVE before edits to existing demo-live.mjs:96 openPages and lint.test.mjs ISS245. Production opener gets timeout10000; tests inject callbacks for success/first-second failure/timeout/sync throw and exact URLs, preserving continuation and CLI failure suppression. Maker full suite17/17 exit0; fresh senior independently17/17 exit0 Approve. Actual all10 stages now six fail, lint-tests exit0; dependency stage8 errors remain and fullgate stillFAIL. Changed files scripts/demo-live.mjs and scripts/lint.test.mjs added to manifest scope. No browser product UI change and no external launch from suite.
Historical handshake before D101: ready-for-check

## Current dependency gate baseline and priority-first repair planning
Root actual `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs packages apps workers` session9940 terminalexit1:8errors/0warnings,387modules1286dependencies. Three calendar circular violations: auto-record-policy->calendar-client->auto-record-policy; auto-join->calendar-client->auto-join; auto-join->auto-record-policy->auto-join. Five apps API test-only forbidden imports: routes/calendar.test.ts imports schedule-tick/calendar-client/auto-join, gws-gmail.test.ts imports auto-record-policy/auto-join. No new D099 dependency violation; baseline stillrelease-blocking, never excused as passing.
Tier1 ISS367 prioritized over U2.2 implementation. Existing read-only plan reviewer dispatched concrete in-place dependency repair analysis: canonical sharedtypes/publicsurface and legitimate unchanged cross-layer test relocation to existing integration owner; no dynamic-import masking, config exclusions, threshold increase, duplicate definitions/newfiles or T052 frozen changes. New repaired-scope .3 entitlement is separate from T052 historical protocolgate. Plan approval required before any substantive edits; no application/test changes this checkpoint.

## D100 production-only cycle repair landed (maker verification in progress)
D100 append-only authorization recorded before edits, independent production-only plan APPROVE. Canonical noncollection transport/reconciliation declarations now live once in existing core/src/index.ts; root actual source inspection confirms calendar-client and auto-join retain prior public type reexports, policy imports shared types only from core. Runtime decision/reconciliation functions remain in original files; no tests, rules, schema, budgets or T052Pythonextension changed.
Worker frozen-source selfproof: emitted TypeScript removeComments runtime byte-identical before/after for allfour approved files; LOC core120/client241/auto-join248/policy290. Core/bot/API direct compilers each exit0, duplicate checkerexit0 (510uniqueexports/27schemaIDs). Actual dependency gate now exactly5existingAPItestboundaryerrors, zero circularerrors,387modules1285deps,expectedexit1; this is a3of8structural repair, not green gate or independentfeatureacceptance. Existing affectedcalendar/API tests currentowned session69124 stillrunning atworkerreport, terminalresultpending. Higher-level ISS367/fullrelease remainsunverified.

## D100 terminal affected closure and source identity
Worker authoritative same handle69124 polled to terminal chunk688d6f exit0; exact `node --test --import tsx "packages/meeting-bot/src/calendar/*.test.ts" apps/api/src/routes/calendar.test.ts apps/api/src/gws-gmail.test.ts` reports tests154/pass154/fail0/cancelled0/skipped0/todo0/duration10898.1518ms. Root caller-context Unknown process id was not terminal evidence and caused no duplicate test launch. All handles nowclosed. Root SHA256 comparison exit0 confirms4/4currentfiles match these frozen hashes: corec2c7e6ac9329c811bb93393ee44fa53cde37b525b0962166e1b7b920b6525f9c; clientb0acf6c12198b17cc4b5d76e9f7e04cf6e9d5d02ddbf3d094f314fb1fa92ac57; autojoindb3c7bde5909a8eebbf9a3d17b77e236a8c7113d5cb296ed4cad4411e577cebc; policy77226215fd7163d680a039e33e9acd849b35658edc9ad5a982f00e300a7b4006. Type shape11/11 and runtime byteidentity are makerproof, not freshindependent featureacceptance.
Five forbidden integration-test imports remain genuinecontract failures. Reviewed appropriate cohesive owner scripts/webinar/source-discovery.test.mjs would require explicit newfile authorization and exactwholecase relocation with suiteinvocation; existing runpipeline integrationtestalready434/400, unrelated sessionrow/input ownersnotendorsed. No such file/testedit created, no ruleexclusion/dynamicmask/budgetincrease. Higher fullgate/sourcequality/mail/config/protocol/Ubuntu gates retained; no wholeISS367orT051PASS.

## D100 regression detected and scoped rollback required
Root actual aggregate80220 terminalexit1:10stages/5failed. LOC5,dirsize1,root1,tracker6ambiguities,dependencies5;dupes/migrations/codexhookparity/snapshot/linttests18of18passed. Separate root mandatory generator `node scripts/gen-types.mjs --check` exit1 reports ONLY core/src/index.ts drift. Existing generator52-53/71 declares entire barrel generated; D100 handwrittentypes disappear on regeneration. Earlier3cyclefixed/154tests remain historical measurements, not current lawfulcompletion. Regression rule requires exactpreD100fourfilebackuprestore, not generatorfixstack or criteriondowngrade; D101 supersedesD100. Worker instructed hashmatchbeforewrite/bytecmp afterward; terminalrestorationpending. No sourcegenerator/test/contract/threshold weakening.


## D101 exact rollback terminal evidence
Worker restoredonlyfourfiles after frozenhash validation and allbackupbytescompared equal. Actual generatorcheckexit0:27generatedtypefiles+indexmatchschema. Actual dependencyexit1 returnsoriginal8errors/0warnings/387modules1286deps, threecalendarcycles+fiveAPItestedgeboundaries. No tests repeated/no unrelatedchanges. Rootmetadata now hasonecanonicalBLOCKEDfield and preservesolderreadyflagsashistoricalprose; no conflicting readiness or completefeatureverdict inferred. Completegroupedgoal remainsactive.

## D105 canonical webinar types and source-discovery relocation maker evidence

Priority tier 1. Independently approved corrected plan after D101; D104/D105 authorize new files. Exact existing seams: calendar-client.ts CalendarEvent/CalendarClient/ReconciliationCalendarEvent/WebinarReconciliationState/WebinarReconciliationResult and Snapshot/Alias/Occurrence; auto-join.ts six transport declarations; auto-record-policy.ts TrustedSenderConfig and type imports. Canonical definitions now live once in core/domain/webinar-types.ts; original public type exports retained, generator alone rebuilt core index. No runtime function, generator, dependency rule, schema, contract or budget changed.

Seven complete cross-layer tests moved from gws-gmail.test.ts starts89/108 and calendar.test.ts starts47/98/143/213/249 to scripts/webinar/source-discovery.test.mjs, with direct fixtures and actual adapter/reconciler/selector imports. Five forbidden import edges removed. TypeScript transpilation only strips types; exact emitted seven-body parity true, 44 assertion calls, titles/fixtures/loops preserved. Before/after application runtime emitted-byte parity 3/3. New domain122 physical lines, test199.

Commands and terminal output: `node --test --import tsx "packages/meeting-bot/src/calendar/*.test.ts" apps/api/src/routes/calendar.test.ts apps/api/src/gws-gmail.test.ts scripts/webinar/source-discovery.test.mjs` exit0 tests154/pass154/fail0/cancelled0/skipped0/todo0 duration10606.7643ms. Original combined154 count retained. `node scripts/gen-types.mjs --check` exit0 OK27 generated files+index. `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs packages apps workers` exit0 no violations388modules1281dependencies (original8errors removed). Direct installed `tsc --noEmit -p` core/bot/API each exit0. All serial subprocesses bounded120seconds.

`node scripts/lint-loc.mjs` exit1 seven current violations: speakers-llm313, sb_join1058, test_sb_join_iframe404, test_sb_join435, obs-windows359, run-watch558, run-pipeline.test434. `node scripts/lint-dirsize.mjs` exit1 apps/api/src32files budget31. These remain actual global gates; no threshold exemption. Checker feature handoff/full release remains BLOCKED; this is maker evidence only, no independent PASS or live acceptance.
