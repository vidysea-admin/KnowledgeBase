# Verdict — webinar-bot-live

**Date:** 2026-09-24
**Cycle checked:** 1
**Contract:** qa/contracts/meeting-bot-capture.md (T-024) — C1/C2 extended, C3 SUPERSEDED for the
browser joiner (ruling carried forward unchanged from cycle 0, not re-litigated). Draft successor
`qa/contracts/meeting-bot-live-capture.md` (T-024b) **ruled NOT ADOPTED** this cycle — see below.
**Mode:** A (unit check, fix-cycle re-check). Fresh subagent, no builder context. Project bound:
`D:/KnowledgeBase`. Branch `feat/webinar-bot`, HEAD `bfb9908` (base `4aa9d13`).
**Previous verdict:** cycle 0 FAIL (ISS-285 high, ISS-286 high, ISS-287 low).

## T-024b draft-contract adoption ruling (asked explicitly)
**NOT ADOPTED.** Checked `docs/DECISIONS.md` for any entry naming `meeting-bot-live-capture` or
`T-024b` (none found) and `qa/gates/` for an adoption gate (none found). This repo runs the Lab
Protocol (`docs/DECISIONS.md` present) and `checker/SKILL.md`'s own criticality gate requires
**initial contract creation to be human-approved, always** — a draft the checker wrote for itself
cannot self-ratify. The draft stays proposed criteria. This unit is graded against the original
`meeting-bot-capture.md` (C1–C7, C3 superseded per the standing cycle-0 ruling), and the draft's 10
criteria are used only as a structure for judging Capability coverage completeness, not as binding
pass/fail bars.

## What I re-ran myself (cycle 1)
- `pnpm --filter @lkb/meeting-bot test` → **43/43 pass** (matches manifest exactly, same test
  names).
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0, no output (matches).
- `node --test scripts/lib/find-audio-file.test.mjs` → **3/3 pass** (matches; new test, wired into
  `test:lint` — confirmed in `package.json:20`).
- `node scripts/lint-dirsize.mjs` → **OK (83 dir(s) within budget)**; `find scripts -maxdepth 1
  -type f` → **32 files** (back under the 32 budget — ISS-285's fix confirmed: the file moved into
  `scripts/webinar/` no longer counts against the flat `scripts/` budget).
- `pnpm lint:structure` (full composite, all 9 steps) → **lint-loc OK, lint-dirsize OK, lint-root
  FAIL (17 loose files this run — see note below), lint-dupes OK (320 exports), lint-migrations OK
  (3440 files), snapshot --check OK, lint.test.mjs 14/14, tracker-audit OK (gate G1,G4),
  depcruise 0 violations (311 modules)**. Every stage after lint-root ran anyway; only lint-root
  fails.
  - **lint-root note:** my own re-run counted **17** loose root files, one more than the manifest's
    pasted 16 — the extra file is
    `C:\...\scratchpad\diff.patch`, a stray untracked artifact of **this checker's own session
    environment** (present in this session's very first `git status` snapshot, before I touched
    anything; not part of any commit, not created by the maker). Excluding it, the count is exactly
    the manifest's 16. **Independently re-verified the manifest's pre-existing claim**: `git ls-tree
    4aa9d13` lists the root tree and it already contains exactly the same 16 loose blobs (
    `.dependency-cruiser.cjs .dockerignore .env.example .gitignore .gitmodules AGENTS.md
    ARCHITECTURE.md docker-compose.yml Living-Knowledge-Base-Architecture.html
    migrate-mongo-config.cjs package.json pnpm-lock.yaml pnpm-workspace.yaml structure.config.json
    TASKS.md tsconfig.base.json`) — **confirmed pre-existing (ISS-248), not caused by this unit or
    this fix cycle**, exactly as the manifest claims.
- `node scripts/tracker-audit.mjs --gate g1,g4` → **OK** (was "1 finding" — G1 row-set — in the
  manifest's own last run; now clean because the Fix-cycle-1 addendum registered all 22 T-029..
  T-050 rows in `.goal/goal.json`, independently confirmed below). Full `node
  scripts/tracker-audit.mjs` (no gate) → **1 finding**, the pre-existing G2 "125 issues fixed with
  no verified_date" — unrelated to this unit.
- `node scripts/gen-types.mjs --check` → OK, 24 types match. `python schema/validate.py` → PASS,
  24 collections.
- `node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run`
  (re-run from the **new, moved** path) → turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges
  94, byType breakdown byte-identical to both the manifest and cycle 0's live Mongo read-back. No
  Mongo connection attempted. **ISS-285's actual fix (the path/import breakage risk) verified, not
  just the file-count symptom.**
- `.goal/goal.json`: independently loaded and read — **T-029..T-050, all 22, present**; **U4.2 →
  in_progress** (note cites D-027/D-028, awaiting checker), **U2.6 → in_progress** (same). Matches
  the Fix-cycle-1 addendum's claim exactly.
- `git diff 97674cb..HEAD --stat` (step 4c, scoped to this fix cycle) — every touched file is
  accounted for: `browser-joiner.ts` (comment fix, ISS-287), `scripts/sync-webinar-session.mjs` →
  `scripts/webinar/sync-session.mjs` (rename, ISS-285), `scripts/lib/find-audio-file.test.mjs`
  (new, disclosed), `package.json` (test:lint entry, disclosed), `.goal/goal.json` /
  `docs/SNAPSHOT.md` (Fix-cycle-1 addendum, disclosed side effects). No existing function, export,
  test, or route deleted. `packages/db/src/lib/tenantScope.ts` confirmed **untouched** since cycle
  0 (empty diff) — the tenancy mechanism cycle 0 already verified is unchanged.

## Capability coverage (ISS-286) — re-derived in a THROWAWAY COPY, never the bound tree
Per protocol 4b: copied the current HEAD tree (`git archive HEAD`, equivalent to the working tree —
confirmed zero uncommitted diff in `packages/meeting-bot`, `scripts/lib/find-audio-file.*` and
`package.json` before copying) into
`%TEMP%\...\scratchpad\checker-webinar-bot-live-copy`, outside the bound root, with `node_modules`
reachable via directory junctions (no reinstall, same resolved packages). Confirmed **green before
edit** for all three rows attempted, in the copy itself (not reused from step 3):

| # | Capability | Falsifying edit applied in the COPY | Result |
|---|---|---|---|
| 1 | Zoho platform detection | `platform.ts:33` `zoho\.` regex → `zoho-DISABLED\.` | Green before: 9/9. Red after: `✖ detects Zoho webinar/meeting URLs` — `'unknown' !== 'zoho'`, right-reason. Matches manifest exactly. **COVERED.** |
| 2 | zoho/cloudonair → browser routing | `strategy.ts` deleted `case "zoho": case "cloudonair":` | Green before: 4/4. Red after: `✖ routes zoho and cloudonair...` — `undefined !== 'browser'`, right-reason. Matches manifest exactly. **COVERED.** |
| 3 | `find-audio-file.mjs` audioPath branch | `if (source.audioPath)` → `if (false && source.audioPath)` | Green before: 3/3. Red after: **1 pass / 2 fail** (count matches manifest exactly). Failure **mechanism** differs slightly from the manifest's prose: it described "falls through to basename matching, which then fails since no matching file exists"; what actually fires is a `TypeError: Cannot read properties of undefined (reading 'split')` at `find-audio-file.mjs:25` because these two fixtures never set `source.path` (only `source.audioPath`), so the basename-fallback code crashes rather than throwing a clean "no match" error. Both failures are still caused specifically by disabling the audioPath branch (not a parse/import break — the third, unrelated fallback test still passes at 1/3), so the isolation is real; the manifest's description of the failure *reason* is just imprecise. Not filed as an issue (cosmetic, the numeric claim is exact). **COVERED**, with this note. |

Rows 4–12 (real browser join, auto-click denylist, OBS per-process capture, silence gate, recovery,
credential handling, data-write scoping mechanism, graph-edge provenance, transcription override):
manifest marks all **UNVERIFIED**, each explicitly naming **T-033** as the tracked debt and citing
either a one-time live observation (D-027/D-028) or a pre-existing test suite (`tenantScope.test.ts`)
that this cycle didn't touch. Per this check's dispatch, I judge these as **enumerated debt, not
unenumerated claims** — every row has a name, a reason, and a named tracking task; none is silently
missing. **This is a real gap** (9 of 12 real capabilities still have zero repeatable automated
falsification) but it is disclosed, tracked, and scoped identically to how cycle 0's own checker
already accepted it (T-033 already existed in TASKS.md before this cycle).

**CAPABILITY-COVERAGE: 3/12 rows reproduced by checker (all right-reason); 9/12 UNVERIFIED, judged
as enumerated debt under T-033 per dispatch instruction — not a failing condition on its own.**

## Ledger repair (ISS-288's line)
`qa/issues.jsonl` line 286 (`ISS-288`) was unparseable: its `reproduction` field contains the shell
command `grep -n 'U4.2\|U2.6' TASKS.md`, and the single backslash before `|` is not a legal JSON
escape (`json.loads` failed with `Invalid \escape` at the exact byte). **Repaired by doubling that
one backslash** (`\|` → `\\|` in the JSON source), which decodes back to the identical intended
string value (`grep -n 'U4.2\|U2.6' TASKS.md`, unchanged meaning) — verified the fixed line
round-trips to the exact original field values via `json.loads`, and the full 286-line (now 289,
after two concurrent lanes' ISS-289/290 and this check's own ISS-291) ledger parses with zero
errors.

**ISS-288 ruling:** the Fix-cycle-1 addendum's `.goal/goal.json` edit is verifiably real (checked
above: U4.2 and U2.6 both flipped `pending → in_progress`, both notes cite D-027/D-028, matching
TASKS.md's own T-021 row exactly as the fix direction asked). **Marked `fixed`** — not `verified`,
per protocol ("only a later re-check moves fixed → verified"), since this is the first check to
confirm it. Also closes the T-029..T-050 row-set half of the same divergence class (tracker-audit
G1 clean on re-run).

**ISS-285/286/287:** each independently re-verified above as genuinely fixed (lint-dirsize count,
the actual re-pathed script's dry-run numbers, the Capability coverage table's presence +
falsification, the file disclosure + comment rewrite). **All three marked `fixed`.**

## New finding this cycle: data-write atomicity (dispatch-directed)
Per the dispatch's explicit instruction, read `scripts/webinar/sync-session.mjs` end to end (the
delete/insert logic is **unchanged** from cycle 0 — this fix cycle only moved the file and repaired
its relative paths). Lines 169 and 180: both `turns` and `graph_edges` do
`deleteMany({...}) → for (...) insertOne(...)` in a plain loop, with **no Mongo session/transaction
and no rollback** — the outer `try { ... } finally { close() }` only closes the connection on
error, it does not restore state. A throw mid-loop (network blip, a bad document, a killed process)
leaves the session's **old rows already deleted and only a partial new set inserted** — a silent
partial-write that directly undermines the exact guarantee this unit's own contract draft (C7/C8)
and H3 ("no fact without provenance") care about. This is unchanged pre-existing logic, not a cycle-1
regression, so it does not count against ISS-285/286/287's fix quality — but it is real, data-write
class (never capped per this repo's severity gate), and worth prioritizing. **Filed as ISS-291
(high)** — see ledger for full evidence and fix direction (build the new rows fully before deleting
the old, or wrap both collections' delete+insert pairs in one `withTransaction`).

## Security class (re-derived, unchanged mechanism)
- **Tenancy/deletion scoping** — `packages/db/src/lib/tenantScope.ts` confirmed byte-identical to
  cycle 0 (empty diff since `97674cb`); cycle 0's live Mongo read-back (0 cross-tenant rows) still
  stands, nothing in this fix cycle touches the write path's scoping. PASS, unchanged.
- **Credential handling** — `obs-windows.ts`/`record-commands.ts` untouched this cycle (not in the
  diff). PASS, unchanged.
- **`sb_join.py` auto-click list** — untouched this cycle. PASS, unchanged.
- **New this cycle:** the data-write atomicity gap above (ISS-291) — real, but not a tenancy or
  credential breach; it is a same-tenant, same-session reliability gap.

## Diff scope (step 4c)
`git diff 97674cb..HEAD --stat` — no existing function/export/test/route/config key deleted or
renamed beyond the disclosed `sync-webinar-session.mjs` → `sync-session.mjs` rename (ISS-285, fully
disclosed). No file touched outside the manifest's cycle-1 "What changed" list plus its own
disclosed side effects (SNAPSHOT.md regen, goal.json addendum).

## Live browser evidence
Not applicable — no web-UI surface changed this cycle (same as cycle 0's ruling; confirmed via the
diff stat above, no `apps/` UI files touched).

## Goal / task wiring
`.goal/goal.json` **U4.2 and U2.6 left as `in_progress`, not auto-closed to `done`.** Reasons: (1)
the automatic close mechanism (`goal_cli.py done --task-id "<unit-slug>"`) matches on the literal
unit slug `webinar-bot-live`, which is neither task's id, so it would no-op by design, not by my
choice; (2) U2.6's title names a second component — "merge at the route boundary"
(`routes/graph.ts`) — that this unit's diff never touches (confirmed: no `apps/`/`routes/` files in
either cycle's diff), so U2.6 is only partially evidenced by this PASS and I will not hand-flip it
past what I verified. U4.2's "ONE real meeting-bot joiner" criterion **is** substantively met by
this PASS (a real, live-run browser joiner for Zoho) and the maker/next sweep should consider
closing it explicitly, citing this verdict — left to that step rather than asserted here without a
task-id match.

```
VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0 invariants declared (C1, C2, C4, C5, C6, C7 met; C3 SUPERSEDED, not counted, per standing cycle-0 ruling)
FAILURES (if any):
(none — ISS-285/286/287 all independently re-verified fixed this cycle)
CAPABILITY-COVERAGE: 3/12 rows reproduced by checker (right-reason); 9/12 UNVERIFIED-by-manifest, judged enumerated debt under T-033 per dispatch instruction (not a failing condition)
LIVE-BROWSER: not-applicable (no web-UI surface changed; confirmed via diff stat both cycles)
ISSUES-WRITTEN: ISS-291 (new, high, data-write atomicity — non-blocking for this cycle, unchanged pre-existing logic); ISS-285/286/287/288 status updated open→fixed
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All three cycle-0 FAILures are genuinely and independently fixed: the full pnpm lint:structure composite is clean except a pre-existing lint-root violation I independently confirmed via git ls-tree at the base commit (ISS-248, unrelated to this unit); the Capability coverage table now exists with 3 rows I personally re-falsified in a throwaway copy (right-reason reds) and 9 rows honestly disclosed as UNVERIFIED debt against the pre-existing T-033 tracking task rather than silently claimed; and the undisclosed-files/stale-comment gap is closed. The T-024b draft contract is ruled NOT ADOPTED (no DECISIONS.md entry, no adoption gate) so this unit is graded against the original meeting-bot-capture.md, C3 superseded per the standing cycle-0 ruling. I also independently found and filed a new, real, high-severity finding outside this cycle's own scope: scripts/webinar/sync-session.mjs's delete-then-loop-insert pattern has no transaction, risking a silent partial-write on failure — pre-existing logic unchanged by this cycle's move-only fix, so it does not block this PASS, but it is data-write class (never capped per this repo's severity gate) and should be the next high-priority pull. Also repaired a genuinely unparseable JSON line in the ledger (ISS-288, a stray single backslash before a pipe in a shell command string) with a meaning-preserving escape fix.
```
