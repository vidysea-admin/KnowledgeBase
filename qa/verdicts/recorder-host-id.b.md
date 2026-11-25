# Verdict - recorder-host-id (B3), coordinator B (blind, dual check)
Date: 2026-11-25 · Cycle checked: 0 · Policy-Version: proportional-verification/2026-11-22.19 · Head: e32ea0cad598162a5b93993ab7371bf021ac1d0a (base a64cb3ae, ancestor verified) · Contract commit ef054973 · Manifest commit 3357556d
Bound to D:\KnowledgeBase. Own worktree (detached, offline frozen install, no junction): D:\KnowledgeBase\.worktrees\b3-check-b. Own scratch: scratchpad\b3-check-b. I read nothing of coordinator A (verdict, checkpoint, worktree, scratch, commit messages or diffs).

## Check plan (step 0)
Diff = 3 files (readiness.ts +26/-2, two test files, additions only plus import lines). Signals: logic plus security-adjacent id binding (L by the contract's dual-trigger `capture-slot-acceptance.ts:68`). No UI, no data artifact, no LLM output: no browser, no persona walk, no grader. Plan: (1) diff-scope read (4c); (2) re-run the criterion tests and the affected tests; (3) tsc; (4) own probe of validator edge values; (5) own falsification, 1 per changed criterion C1-C8 plus 2 extras (cap 10); (6) rule on facts 1-4. SERIAL: one test process at a time (single module, shared temp dirs).
Floor recompute (.19-2): `tick.mjs --route a64cb3ae..e32ea0ca` printed `{"floor":null,"dual":false,"rules_fired":[]}`. No tier raise by the tool. The contract and manifest (dual-trigger line cited and real) keep it Tier L and dual; I do not lower it.

## Evidence per criterion and invariant (all re-run by me on e32ea0c in b3-check-b)
| Id | Result | Evidence |
|---|---|---|
| B3-C1 | MET | test "B3-C1" green (4 stubbed hostnames, one id equal to an independent sha256(["lkb-capture-host-id",V,platform]), not V, linux differs from win32, Prod-1 differs from prod-1). Falsified: M1 (domain tag dropped), M2 (hostname in id). |
| B3-C2 | MET | "B3-C2 a/b" (real observer, validate and list, host A then B) and "B3-C2 c" (real acceptor and real registry files, this Windows shell, only the ACL probe stubbed as in the 7 existing tests) green. Not NOT-MEASURED. Falsified: M2. |
| B3-C3 | MET | "B3-C3" x2 green with three literal golden ids; the 4+7 existing cases green; the diff shows no existing assertion edited (only import lines added). Falsified: M3 (lowercased hostname, killed by the golden "DESKTOP-X"). |
| B3-C4 | MET | "B3-C4" x2 green (V1, V2, no setting and the hostname id never stand in for each other, both directions). Falsified: M4 (validate accepts override id OR hostname id). |
| B3-C5 | MET | 18-value table incl. every contract value; 64 chars accepted, 65 refused; message exactly `LKB_CAPTURE_HOST_ID refused: <class> (length N)`, no echo, no trim. My own probe, extra values: `"prod\n"`, NBSP, BOM-prefixed, CR-suffixed (whitespace); Arabic-Indic digit, full-width letter, lone surrogate, `-` (bad character); `0`, `A`, `ok.x_Y-9` accepted; a property explicitly `undefined` counts as absent. Child-process test exits non-zero with an empty cwd. Falsified: M5 (slash allowed), M5b (65), M9 (empty treated as absent = silent hostname fallback). |
| B3-C6 | MET as written | C6 asks for ONE exported validator, a `CORE-REQUEST` for files another unit owns, and a lazy check inside `captureSlotHostId()`. All three exist: `assertCaptureHostIdSetting` (:18), lazy call (:29), calls in validate (:72), list (:82), observer (:92); five CORE-REQUEST lines. Real entry points are NOT wired: see fact 1 and P1. Falsified: M6. |
| B3-C7 | MET | "B3-C7" (other deployment's acceptor, replaced issuer key then restored, 8 tampered bindings, both tenants, media origin, newer failure marker; positive controls before the loop and before the marker case) and "B3-C7 d" green. Falsified: M7 (acceptor stops refusing fixture kind, in my copy only; killed by "B3-C7"). |
| B3-C8 | MET | "B3-C8": one line `[capture-host-id] LKB_CAPTURE_HOST_ID=<V> hostId=<64hex>`, once per id; for the whole refusal table all five console methods stay empty and the message is the fixed text. Falsified: M8 (once-guard assignment removed). |
| B3-I1 | HOLDS | "B3-C2 a/b": 15 keys, version 1, 64-hex hostId, raw V absent from the receipt file; `tsc --noEmit -p tsconfig.json` in packages/meeting-bot exit 0. |
| B3-I2 | HOLDS | `git diff a64cb3ae..e32ea0ca --stat`: 3 files, `capture-slot-acceptance.ts` absent; blob a8b66d39 equals the HEAD blob. |
| B3-I3 | HOLDS | I read the full diff: override and validator are inside the one file, no new file, no second id function; the only removed lines are the old signature, the `fs` import line and the two inline comparison expressions replaced by `hostId`. |
| B3-I4 | HOLDS | diff touches nothing under `capture/tiles/`; the file has no `tiles` reference. |
| B3-I5 | HOLDS | no consent file in the 3-file diff. |
| B3-L1 | NOT-MEASURED | live-only (B9, P1). |

Affected tests re-run: readiness plus acceptance 24/24; tab-session-workspace plus caller-failure-readiness 8/8; `scripts/webinar/scheduler/deps-runtime.test.mjs` 13/13. No full suite (unit check; the 6c pre-push check owns it).

## Falsification (own worktree, one mutant at a time, per-mutation byte backup, restore on exit, SIGINT, SIGTERM and error, timeout 300 s; driver and results.json in scratchpad\b3-check-b)
Before every mutant the file blob equalled `git rev-parse HEAD:<file>` (`preHashEqualsHead: true` for all 10); the unmutated 24/24 run was taken on this same tree.
| # | Criterion | Mutant (one hunk) | Killed by (named failing tests, not an import error) | Restored equals HEAD |
|---|---|---|---|---|
| M1 | C1 | id preimage drops `"lkb-capture-host-id"` | B3-C1, B3-C2 a/b, B3-C2 c, B3-C5 | yes |
| M2 | C1, C2 | id hashes `hostname()` instead of platform | B3-C1, C2 a/b, C2 c, C5, C7 | yes |
| M3 | C3 | no-setting formula lowercases hostname | B3-C3 (readiness), B3-C4 (acceptance) | yes |
| M4 | C4 | validate accepts override id OR hostname id | B3-C4 (readiness) | yes |
| M5 | C5 | slash allowed in the pattern | B3-C5, B3-C5/C6 child process | yes |
| M5b | C5 | `length>64` changed to `>65` | B3-C5, B3-C5/C6 child process | yes |
| M6 | C6 | observer validates only when there is NO slot | B3-C5/C6 in-process (capture path, validate, list) | yes |
| M7 | C7 | acceptor `:109` stops refusing `fixture` kind (copy only) | B3-C7 (acceptance) | yes |
| M8 | C8 | once-guard assignment removed (log on every call) | B3-C8 | yes |
| M9 | C5 | empty value treated as absent | B3-C5, B3-C5/C6 child process | yes |
10 mutants (floor 8 plus 2 extras, cap 10), each ended before the next began; final `git hash-object` of both touched files equals the HEAD blobs (8979b772..., a8b66d39...) and the worktree `git status` is clean. The set differs from the builder's 9, so this evidence is independent.

## Rulings on the facts
1. CORE-REQUESTs (deps-runtime, server.ts, tab-session-workspace, API host). Every criterion as written is met without those edits, because C6 itself says a file another unit owns is not edited, a `CORE-REQUEST` is filed, and the validator also runs lazily inside `captureSlotHostId()`; all three are present. It does not yet deliver the purpose of C5/C6, though: the real processes do not refuse at start. I read the call sites. `deps-runtime.mjs:64-65` wraps `listCaptureSlotReadiness` in `catch{capabilities.set(slot,new Set())}`, so a bad setting in the scheduler is swallowed and only surfaces as "Each capture slot requires reviewed real host capability evidence" with no mention of the variable (fails closed, reason lost); the acceptor's `catch{return false}` (`capture-slot-acceptance.ts:124`) does the same; `server.ts:39` computes the id per receipt, so with no receipt it never refuses and with one it throws per request; `tab-session-workspace.ts:88-97` builds the observer after `createRecordConsent`, `claimCaptureSession` and `prepareCaptureConsentControls`. Ruled: not a FAIL of any criterion; filed as P1 (medium) and P6 (low).
2. Needs the Approver. None blocks a criterion: the criteria are built on the default (override accepted, D-244 assumption). If he overrules it the unit is moot, not wrong. The publishing process (item 2) and the production value (item 3) belong to B9, P1 and B5.
3. "Positive control before each". The builder's record shows one baseline (24/24) plus restore checks. The falsification evidence still holds: each mutant restores to the HEAD blob, so the state before every mutant is the one green baseline. I did not rely on it: my mutants carry their own pre-hash check against HEAD and my own 24/24 run. Wording gap only; low (P3).
4. Review inputs, each judged on my own evidence. (a) True but low: B3-C7's variant loop has one positive control before it, not one per binding; C7(c) asks for a test per binding, which exists, and my M7 shows the fixture-kind row does isolate its cause. (b) True and low: `options.hostId` skips the validator at :72 and :82 and the acceptor's `catch` at :124 returns false; no non-test caller passes `hostId` (grep read in this check), and the acceptor at :109 calls `captureSlotHostId()` itself and still fails closed. (c) Confirmed contract-conformant (empty is a listed bad value; M9 shows a test pins it); the container units must not forward an empty value. (d) Same as fact 1.

## Findings (PROPOSED-ISSUE, none blocks)
PROPOSED-ISSUE: {"severity":"medium","feature":"recorder-host-id","title":"B3-C6 call sites outside the unit do not call assertCaptureHostIdSetting: the scheduler swallows the refusal, native-capture and API host never refuse at start","evidence":"scripts/webinar/scheduler/deps-runtime.mjs:64-65 catch{capabilities.set(slot,new Set())}; capture-slot-acceptance.ts:124 catch{return false}; scripts/native-capture/server.ts:39; manifest CORE-REQUEST lines 98-101","found_by":"checker-unit","fix_direction":"owning unit (B4, P1 or B9) calls the validator once at boot in deps-runtime.mjs, server.ts and the API host before first use"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"validate and list skip the validator when a caller passes options.hostId","evidence":"capture-slot-readiness.ts:72,82 (options.hostId??captureSlotHostId()); no non-test caller passes hostId; the acceptor still fails closed at capture-slot-acceptance.ts:109,124","found_by":"checker-unit"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"B3-C7 tests: one positive control for the whole tampered-binding loop, and the manifest says 'positive control before each' (per binding and per mutation) while the record shows one baseline","evidence":"capture-slot-acceptance.test.ts B3-C7 loop; manifest Tests[B3-C7] and Mutation run integrity lines","found_by":"checker-unit"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"An empty LKB_CAPTURE_HOST_ID= (for example compose forwarding an unset variable as empty) stops the recorder at start by design; B4 and P1 must forward only a non-empty value or omit the variable","evidence":"capture-slot-readiness.ts:21 value===\"\" gives reason empty; tests B3-C5 and mutant M9","found_by":"checker-unit"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"Manifest Metrics line carries defects=0 and no end or wall values instead of the .9 fields defects_unit and defects_6c (format wording at pin .19)","evidence":"manifest line 104","found_by":"checker-unit"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"The capture path builds the readiness observer after createRecordConsent, claimCaptureSession and prepareCaptureConsentControls, so a bad setting may refuse after record-directory writes (not measured)","evidence":"packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts:88-97; manifest CORE-REQUEST line 100","found_by":"checker-unit"}

## NOT-MEASURED
B3-L1 (real Cloud Run restart); the claim that Cloud Run changes the hostname per instance (D-233, platform fact); the five CORE-REQUEST entry points started for real; macOS and Linux branches of the physical-path check; NUL in a real process environment (in-process only); whether the capture-path refusal in P6 follows a file write; the full suite and the 6c pre-push set (the maker and 6c own them).

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (L1 is live-only and not counted), 5/5 invariants hold
TIER: L (contract dual-trigger security `capture-slot-acceptance.ts:68`; `tick.mjs --route` floor null, no raise and no lowering)
FAILURES: none
CAPABILITY-COVERAGE: 10/10 own mutants reproduced as killed (C1-C8 each at least once); the builder's table was not relied on
LIVE-BROWSER: not-applicable (library functions, no UI path changed)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines above; the maker writes rows only after both PASS)
EXECUTOR: claude-sonnet-subagent (manifest Executor claude-sonnet-subagent; this checker is a separate fresh agent, no ANTHROPIC_BASE_URL override)
EXPLANATION: The unit does what the contract asks inside its own file: one validator, a domain-separated platform-bound id under the setting, today's formula byte for byte without it, exactly one id per process, bad values refused with a fixed message and no echo, and the signature and binding gate untouched. My 10 independent mutants were each killed by the test named for that criterion. The one thing not to over-read is C6: the real start-time refusal in the scheduler, native-capture host and API host depends on CORE-REQUESTs not yet built, and the scheduler currently swallows the refusal. The operator-asserted override also stays the D-244 assumption, and switching a deployment onto the setting orphans existing slot acceptances once (fail closed, recorded in C4).
Metrics: start=2026-11-25T12:52:38Z end=2026-11-25T13:00:37Z wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=8 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=479 mutants=2 defects_unit=0 defects_6c=0
