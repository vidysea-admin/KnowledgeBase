# Verdict — recorder-host-id (B3), coordinator A, fix cycle 0
Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
Head: e32ea0cad598162a5b93993ab7371bf021ac1d0a (base a64cb3ae, an ancestor of HEAD; branch wave/b3-host-id). Checked in my own detached worktree `D:/KnowledgeBase/.worktrees/b3-check-a` (offline frozen install, no junction, no `.env`). Blobs equal `git rev-parse HEAD:<file>`: capture-slot-readiness.ts 8979b772, capture-slot-acceptance.ts a8b66d39 (unchanged), readiness.test.ts f491cd1c, acceptance.test.ts ed5b6006.
Date: 2026-11-25. Bound to D:\KnowledgeBase. Dual check, coordinator A (blind: I never read `.b.md` verdict, checkpoint or scratch).

## Check plan
Tier L, from the contract and manifest (`dual-trigger: security capture-slot-acceptance.ts:68`, read by me: `receipt.hostId!==captureSlotHostId()` is the provenance gate of the person-signed acceptance). `tick.mjs --route a64cb3ae..e32ea0ca` printed `floor:null dual:false` (the route tool cannot see a contract label, and the acceptance file is not in the diff, B3-I2); no tier gap. No UI, no browser, no persona walk. Checks: scoped runs of the two changed test files and the three affected files; tsc; diff-scope read (4c); own differential probe on 25 values beyond the contract table; 10 own mutants (cap 10), floor is 1 per changed criterion (C1-C8). No full suite (policy .7); `full-suite trigger`: none (no conftest, fixture, lock or config change).

## Evidence (my own runs, node v24.13.1, one test process at a time)
- readiness test file `node --test --import tsx` (cwd packages/meeting-bot): tests 13, pass 13, fail 0. Acceptance test file: tests 11, pass 11, fail 0. `npx tsc --noEmit -p tsconfig.json` exit 0, no output. tab-session-workspace + caller-failure-readiness: 8/8. `scripts/webinar/scheduler/deps-runtime.test.mjs`: 13/13.
- 4c diff scope: `git diff --name-only a64cb3ae..HEAD` = the 3 files named in the manifest. Removed lines in both test files: only the old `node:fs` import line (no assertion removed or edited). Empty diff for capture-slot-acceptance.ts, record-consent/, capture/tiles/. No function, export or key removed; the old `captureSlotHostId` body is replaced in place, the no-setting expression is byte-identical (`JSON.stringify([hostname(),process.platform])`).
- Probe (scratch `probe.mjs`, 25 extra values): `"a\n"`, NBSP and ideographic space padded, `\u0085`, zero-width space, `\u2028`, emoji, 65 and 70 chars, `".a"`, `"-a"`, `"__proto__"`, `"prod\r"` all refused with the fixed message, none echoed, nothing logged (0 log lines for refused values); `"a-"`, `"a."`, `"a_"`, `"0"`, `"constructor"`, 64 `a` accepted and equal `sha256(["lkb-capture-host-id",V,platform])`. A property set to `undefined` counts as absent; an inherited bad value is refused.

| Item | Result | Evidence |
|---|---|---|
| B3-C1 | met | test "B3-C1": four hostnames, one id, independent preimage, platform-bound, case-sensitive; M1 red |
| B3-C2 a, b | met | real observer, validate and list agree across hostname A then B; refused under B with no setting; M2 red |
| B3-C2 c | met (measured, real acceptor and registry files in this Windows shell) | "B3-C2 c" green; M7 red on it |
| B3-C3 | met | golden ids for 3 pairs (captured from unmodified code per manifest, and recomputed in test), pre-change receipt accepted by validate, list and acceptor; 11 pre-existing cases green, no assertion edited; M3 red |
| B3-C4 | met (security class) | V1/V2/no-setting/hostname-id never stand in for each other, both layers; M4 and M7 red |
| B3-C5 | met | all 16 table values and 2 more refused; 64 accepted, 65 refused; no trim/fold; message = name + class + length; real child process exits non-zero with an empty cwd for 8 values; M5, M10 red |
| B3-C6 | met as the contract words it (see fact 1) | validator exported once; also run lazily in `captureSlotHostId` (:29), at validate/list top (:72, :82) and in the observer constructor (:92); M6 red; five call sites are CORE-REQUESTs |
| B3-C7 a-d | met | acceptor under same V: other registry false, other issuer key false, restored true; 8 tampered bindings, both tenants, media origin, newer failure marker refuse; raw/non-64-hex hostId rejected; M7, M8 red |
| B3-C8 | met | one stderr line (name, value, id) per distinct id, none for no setting; console spy empty for the refusal table; M9 red |
| I1 | holds | 15 keys, version 1, 64-hex hostId, raw V absent from the receipt file (test), tsc 0 |
| I2 | holds | `capture-slot-acceptance.ts` has zero diff lines |
| I3 | holds | edited in place, one new exported validator in the same file, no new file |
| I4 | holds | tiles module not referenced (grep of the diff) |
| I5 | holds | no consent file in the diff |

## Falsification (my own mutants, in my worktree; per-mutation byte backup; restore in finally and on SIGINT/SIGTERM; 300 s timeout; green before 24/24 on this tree; one process at a time)
| Mutant | Edit | Red after, killed by | Hash |
|---|---|---|---|
| M1 C1 | `["lkb-capture-host-id",value,platform]` -> `[value,platform]` | C1, C2 a/b, C2 c, C5 (4 fail) | restored, == HEAD |
| M2 C2 | validate computes the hostname id inline | C2 a/b, C4, C5/C6 (3) | same |
| M3 C3 | no-setting preimage reordered `[platform,hostname]` | both C3, acceptance C4 (3) | same |
| M4 C4 | validate accepts override id OR hostname id | readiness C4 (1) | same |
| M5 C5 | regex admits `/` | C5, C5/C6 child process (2) | same |
| M6 C5/C6 | lazy validator removed from `captureSlotHostId` | C5, C5/C6 in-process (2) | same |
| M7 C4/C7 | acceptor `:109` host id comparison removed | C2 c, acceptance C3, C4 (3) | same |
| M8 C7 c | acceptor `:109` evidenceKind check removed (unchanged binding) | "B3-C7" (1) | same |
| M9 C8 | refusal path `console.error(value)` | C5, C5/C6 child (2) | same |
| M10 C5 | length bound `>64` -> `>65` | C5, C5/C6 child (2) | same |
10 mutants, none survived; all 8 changed criteria covered. After the batch `git hash-object` == `git rev-parse HEAD:<file>` for both source and both test files, `git status --porcelain` empty. The builder's 9 mutants were not counted.

## Rulings on the four facts
1. CORE-REQUESTs: every criterion is met as written without those edits. C6 itself says a start-code file owned by another unit is not edited, a `CORE-REQUEST` is filed, and the validator also runs lazily so a missed call site fails on first use; the unit did exactly that and also added eager calls at validate, list and the observer. What this leaves, by my own read: `deps-runtime.mjs:77-79` wraps `listCaptureSlotReadiness` in `catch{capabilities.set(slot,new Set())}`, so a bad setting there is swallowed and surfaces only as "Each capture slot requires reviewed real host capability evidence" (fail closed, cause hidden); `server.ts:39` checks per receipt (no receipt, no refusal; with a receipt it throws); the acceptor `:109` returns false on a throw (`:124`, fail closed). So B3-C5's "process exits non-zero at start" is measured at the validator and in a real child process, not at any real entry point: that is NOT-MEASURED and the CORE-REQUESTs (PROPOSED-ISSUE P1) must land before B5 sets a value.
2. Approver items: none blocks a criterion. Item 1 is an [ASSUMPTION] default (D-244) the criteria were written under; item 2 and 3 belong to B9/P2/B5. Recorded so the operator-asserted trust level stays visible.
3. One positive control: the falsification evidence still holds. My 10 mutants are independent and cover C1-C8; M8 shows the evidenceKind variant of C7 c is isolated. The manifest wording "positive control before each" overstates the test (one at the top, one before the newer-marker step); wording, low.
4. a. Partly true. M8 isolates one binding; the other C7 c variants (tenant, slot, dirs, platform) are refused by the pre-existing file reads as well, so their individual isolation was not mutated by me. They are unchanged bindings; no criterion breaks. P2 (low). b. Confirmed by reading `:72`, `:82`: `options.hostId??captureSlotHostId()` skips the validator when a hostId is passed; no non-test caller passes one (grep), and the acceptor calls `captureSlotHostId()` itself inside a try that returns false, so it fails closed. P3 (low). c. Confirmed by probe: `LKB_CAPTURE_HOST_ID=` refuses (`empty`), as C5 requires; a compose `${VAR:-}` forward in B4/P1 would stop the recorder. P4 (low, carry-over). d. Same as fact 1.

## Findings (none blocking)
PROPOSED-ISSUE: {"severity":"medium","feature":"recorder-host-id","title":"No real entry point calls assertCaptureHostIdSetting at start; the scheduler swallows the lazy refusal","evidence":"scripts/webinar/scheduler/deps-runtime.mjs:77-79 (catch -> empty capability set), scripts/native-capture/server.ts:39 (per receipt only), tab-session-workspace.ts:95 (after consent/session claim), API host; manifest CORE-REQUEST lines","fix_direction":"land the CORE-REQUEST calls (owners of those files) before B5 sets the value","type":"correctness"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"B3-C7 c variants other than evidenceKind are not shown to be isolated; manifest says positive control before each","evidence":"capture-slot-acceptance.test.ts B3-C7: one control at the top, variants refused also by missing files","fix_direction":"positive control per binding, or mutate each binding","type":"test-gap"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"validate/list skip the setting check when options.hostId is passed","evidence":"capture-slot-readiness.ts:72,82; no caller passes hostId today","fix_direction":"call the validator unconditionally","type":"hardening"}
PROPOSED-ISSUE: {"severity":"low","feature":"recorder-host-id","title":"An empty LKB_CAPTURE_HOST_ID= refuses start; container units must not forward an unset variable as empty","evidence":"capture-slot-readiness.ts:21 (empty class); contract C5","fix_direction":"B4/P1 forward only when set","type":"carry-over"}

## NOT-MEASURED
B3-L1 (live restart on Cloud Run, units B9/P1); that Cloud Run changes hostname per instance (taken from D-233); the real start of the scheduler, native-capture host, capture path and API host (CORE-REQUESTs not landed); the Windows ACL probe (the acceptance harness mocks it); the macOS/Linux physical-path branch; a NUL byte in a real process environment (OS refuses it, shown in-process). `.env` files and `sessions/` folders never opened; no network.

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (C1-C8), 5/5 invariants hold (I1-I5); B3-L1 live-only, not claimed
TIER: L (security: the host id inside the person-signed acceptance comparison, capture-slot-acceptance.ts:68; contract-set dual check; route floor null)
FAILURES: none
CAPABILITY-COVERAGE: 10/10 own mutants reproduced red from green (builder rows not counted)
LIVE-BROWSER: not-applicable (no UI path in the diff)
ISSUES-WRITTEN: none (dual coordinator: 4 PROPOSED-ISSUE lines above, P1 to P4 in order; maker writes rows after both PASS)
EXECUTOR: claude-sonnet-subagent (manifest Executor: claude-sonnet-subagent; checker is a fresh subagent, no ANTHROPIC_BASE_URL override)
EXPLANATION: The override is a domain-separated, platform-bound hash with exactly one id per process; the no-setting formula is byte-identical and the acceptance gate file is untouched. Low observations: the manifest Metrics line carries `defects=0` where a .19 pin names `defects_unit`/`defects_6c` (maker side, not a FAIL); the log line is once per distinct id, constant in a real process; the P4 empty-value note goes to B4/P1.
Metrics: start=2026-11-25T12:41:48Z end=2026-11-25T12:56:00Z wall_min=14 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=852 mutants=10 defects_unit=0 defects_6c=0 slow=mutation batch 2 min, offline install 1 min
