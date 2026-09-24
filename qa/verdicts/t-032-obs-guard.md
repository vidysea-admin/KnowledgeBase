# Verdict — t-032-obs-guard

**Date:** 2026-09-25
**Cycle checked:** 0
**Checker:** fresh Claude subagent (claude-sonnet-subagent), Mode A unit check
**Bound worktree:** `D:/KnowledgeBase-lanes/t-032-obs-guard`, branch `wave/t-032-obs-guard`, base `784df67`, unit commits `47b1b4d` + manifest `f56b8d8`

## Governing criteria

The manifest binds this unit to `docs/meeting-bot-roadmap.md:47` (T-032), not to
`qa/contracts/meeting-bot-live-capture.md` (T-024b). I checked this myself rather than taking the
manifest's word:

- Read `master`'s current `qa/contracts/meeting-bot-live-capture.md` — its Status line now reads
  **ADOPTED 2026-09-25** (commit `5ddd8df`, Umesh as Approver, conditional on checker validation
  recorded in the same amendment log).
- Read T-024b's own **"Non-goals for T-024b"** section: *"Auto-reconnect on a dropped connection
  (T-029), proactive status alerts (T-030), an OBS Safe-Mode/websocket-down guard (T-032), and
  running the controller detached (T-047) are explicitly out of scope for this contract — they are
  reliability follow-ups, not preconditions for T-024b's own criteria above."*
- **Ruling:** adoption does not retroactively make T-024b govern T-032. T-024b's own text places
  T-032 outside its scope by name. The roadmap row is the correct binding criterion, as the
  manifest states — this is not a self-serving scope choice by the maker, it is what the adopted
  contract itself says. I additionally checked T-024b's still-relevant criteria that touch the same
  file (`obs-windows.ts`) for collateral regression — **C3** (per-process capture matching), **C6**
  (credential never logged) — and confirmed via diff that this unit's edits to `obs-windows.ts` are
  confined to `connectObs`'s OBS-launch/recovery path; `windowSpec`, `prepareScene`, mute
  restoration, and the `StartRecord` sequencing that C3 governs are byte-for-byte untouched. C6:
  `cfg.obsPassword` flows only into `obs.connect(...)`, unchanged, no new log call added. No
  collateral regression against T-024b's surviving criteria.

## Re-run verify commands (my own runs, not pasted)

- `pnpm --filter @lkb/meeting-bot test` → **88/88 pass**, matches manifest.
- `pnpm -r --no-bail test` (full monorepo) → **exit 0**, every package's count matches the
  manifest's table exactly: core 7/7, db 14/14, ai 74/74, ask 50/50, index 228/228, ingest 97/97,
  apps/api 175/175, meeting-bot 88/88.
- `pnpm -r typecheck` → all 9 packages report `Done`, 0 errors.
- `pnpm lint:structure` → exit 1, fails **only** at the pre-existing `lint-root` 16>15
  (same file list the manifest quotes — `.codex`/`AGENTS.md` runtime projection, ISS-248,
  confirmed present in `qa/issues.jsonl`, unrelated to this unit's diff). `lint-loc` and
  `lint-dirsize` both OK before that short-circuit.
- T-024b's C10 also names `pnpm gen:types --check` and `python schema/validate.py`; not re-run —
  this unit's diff touches no schema/type-generation surface (confirmed via `git diff --stat`),
  so they are out of scope for this check, not silently skipped.

## Capability coverage — independently reproduced (step 4b)

Built two throwaway copies **outside** the bound worktree (scratch `t-032-row1`, `t-032-row2`:
`obs-guard.ts` + `obs-guard.test.ts` + a minimal `node_modules/tsx`+`esbuild` lifted read-only from
the worktree's own `.pnpm` store — no dependency on the bound tree's mutable state). Both copies
ran the named check **green before any edit** (6/6 `obs-guard.test.ts` tests pass in each copy) —
that is the proof the copies are real, per the hard rule.

| row | falsifying edit (single-hunk, in the copy only) | before | after | matches manifest's package-level claim? |
|---|---|---|---|---|
| 1 | removed `probes.launchObs();` in `ensureObsReady` | 6/6 pass | **2 pass / 4 fail** | yes — manifest's 84/88 monorepo-wide is exactly 88−4 |
| 2 | `await probes.requestGracefulClose();` → `probes.forceKillObs();` | 6/6 pass | **3 pass / 3 fail** | yes — manifest's 85/88 is exactly 88−3 |

Rows 3–5 are not separately mutated in the manifest (structural coverage by rows 1–2 / by the
early-return fast path already exercised by every other test's call counts). I read the reasoning
and it holds: row 3's "never force-kills… never-comes-up" test is one of the four that failed under
row 1's mutation (its own `launchCalls` assertion), and row 4's fast-path claim is falsified by
construction — every other test requires the *first* `connectWebsocket` call to fail before
reaching any recovery branch, so an edit removing the early return would break all of them. No
`UNVERIFIED` rows; capability coverage is 2/2 directly reproduced + 3/3 structurally justified.

## Diff scope (step 4c)

`git diff 784df67..HEAD --stat`: `obs-guard.ts` (new), `obs-guard.test.ts` (new),
`obs-windows.ts` (edited), manifest. Nothing else. Read the full `obs-windows.ts` diff: the only
removal is the old inline `connectObs` retry loop (replaced by delegation to `ensureObsReady`,
which is the unit's entire stated purpose) — no existing export, test, route, or config key was
deleted outside that. No file outside the manifest's "What changed" list was touched.

## Peer pre-review concerns — checked against the code (and one live search), not accepted at face value

**(A) "'Verified' heading overclaims web research, plus unknown-arg-rejection risk."**
Ran a live web search against the two GitHub issues and the OBS forum thread the manifest cites
(obsproject/obs-studio#12650, #12674, and the "OBS Version 32.0.0 removed --disable-shutdown-check"
forum thread). All three are real and say what the manifest says: OBS 32 stopped honoring
`--disable-shutdown-check`, and the documented community workaround is deleting `.sentinel` before
relaunch — exactly what `clearObsShutdownSentinel` does. The "Verified, not assumed" heading means
verified-via-primary-source-research, not verified-on-this-machine, and the manifest's own Known
Gaps section says so explicitly two paragraphs later ("not via a local OBS 32 install's actual
`--help` output"). Not overclaiming to a failing degree.
On the unknown-arg-rejection risk: read the diff — `--disable-shutdown-check` is **not new**. The
pre-unit code (`obs-windows.ts` old `connectObs`) already passed the identical flag in its spawn
call; this unit moved that exact line into `launchObsNormally` unchanged. Whatever risk an
unrecognized flag poses, it predates this unit and this unit does not add to it. The search results
also describe the flag as silently ignored (Safe Mode dialog still appears), never as OBS refusing
to launch over it. Not a finding.

**(B) "recursive rmSync path is untested and should be pinned to a literal path."**
Read `clearObsShutdownSentinel` (`obs-windows.ts:96-99`): the path is already literal —
`path.join(process.env.APPDATA, "obs-studio", ".sentinel")`, not a glob or a derived/variable
directory — and it is guarded (`if (!process.env.APPDATA) return`). `recursive: true` targets one
named leaf entry that can be either a file or a directory depending on OBS version (per the forum
thread), not a broad tree. "Untested" is correct for real-filesystem behavior (no real OBS machine
was touched, per the unit's own boundary and the roadmap's brief) but the manifest already
discloses exactly this in Known Gaps. Already-disclosed, correctly-scoped — not a new finding.

## Live-browser (5b)

Changed paths are `packages/meeting-bot/src/capture/{obs-guard.ts,obs-guard.test.ts,obs-windows.ts}`
— backend OS-process/websocket orchestration, no frontend/UI route, no rendered output. **Not a UI
surface** (also confirmed indirectly: no ranking/retrieval change that affects what any page
renders). `LIVE-BROWSER: not-applicable`.

## Known gaps (from the manifest) — judged, not re-litigated

All four disclosed gaps (no real-machine proof; `.sentinel` path unverified on this machine;
`CloseMainWindow` may no-op on a minimized-to-tray window; round-trip timing unmeasured) are
honestly stated, already tracked as T-033 debt (same class as `t-047-controller`'s disclosed gap),
and degrade safely (worst case: waits out the bounded timeout and proceeds, never force-kills). Not
elevated to ledger issues — this is what "disclosed, not fixed" is for.

## Ledger

No new issues meet the >80%-confidence bar. `ISSUES-WRITTEN: none` — per the project's verdict
rule, this is a complete and creditable check on a correct implementation, not a lapse.

---

```
VERDICT: PASS
SCOREBOARD: 3/3 roadmap-row acceptance clauses met (not-running→launch, Safe-Mode→graceful-close-never-force-kill, never-comes-up→clear-error-never-force-kill), 0/0 invariants (roadmap row states no separate [I*] list; the "never force-kill" hard rule is folded into the criteria above and structurally enforced via forceKillObsNeverCall's throw)
CAPABILITY-COVERAGE: 2/2 rows directly reproduced in throwaway copies (row1: 6/6→2/6, row2: 6/6→3/6, both matching the manifest's monorepo-level counts exactly) + 3/3 rows structurally justified, none UNVERIFIED
LIVE-BROWSER: not-applicable (changed paths: packages/meeting-bot/src/capture/obs-guard.ts, obs-guard.test.ts, obs-windows.ts — backend only, no UI surface)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Re-ran every verify command myself (package test, full monorepo test, typecheck, lint:structure) and every number matches the manifest exactly, including the pre-existing lint-root failure. Independently reproduced both capability-coverage mutations in throwaway copies outside the bound worktree with a real green-before line; both reds match the manifest's proportions precisely. Diff scope is clean (3 capture files + manifest only, no undisclosed deletions). T-024b is ADOPTED but its own Non-goals section names T-032 as out of scope, so the roadmap row is correctly the binding criterion; checked T-024b's C3/C6 for collateral regression on the shared obs-windows.ts file and found none. Both peer-review concerns investigated against the code (and one against a live web search) and neither holds up as a defensible finding — both are either pre-existing behavior this unit didn't touch, or already disclosed in the manifest's own Known Gaps.
```
