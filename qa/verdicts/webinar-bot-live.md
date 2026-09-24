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

---

# Verdict — webinar-bot-live (CYCLE 2)

**Cycle checked:** 2
**Date:** 2026-09-25
**Checker:** orchestrating checker (main session), Mode A + Mode D, bound to `D:/KnowledgeBase`.
**Commit under check:** `0a6be18`, lane `D:/KnowledgeBase-lanes/iss-291-sync-txn`, branch `wave/iss-291-sync-txn`.
**Contract:** `qa/contracts/meeting-bot-capture.md` as extended. **T-024b is NOT adopted** (open HUMAN_GATE `qa/gates/meeting-bot-live-capture-adoption.md`), so its criteria were not treated as binding.
**Independence:** I did not build this unit. Every number below is from a command I ran myself.

VERDICT: PASS
SCOREBOARD: 4/4 addressed issues verified fixed, 2/2 security invariants hold
ISSUES-WRITTEN: none
CAPABILITY-COVERAGE: ISS-294 COVERED (mutation-proven) · ISS-296 COVERED (DB + UI + /ask, with tenant control) · ISS-297 COVERED (rendered text) · ISS-291 COVERED (write-path audit + disclosure)
LIVE-BROWSER: RUN — lane web `:5175` → lane API `:3302`

## Disclosure about my own harness, first

1. **The lane worktree has no `.env`** (gitignored, not carried across worktrees), so its API cannot reach Mongo. I copied the root `.env` into the lane to run it. Nothing tracked was touched.
2. **My first attempt at this browser leg was wrong and would have produced a false verdict.** Because of (1), the API I had been calling "the lane" on `:3301` was in fact **main-tree code on another port**. Corrected before any measurement was taken: the lane is `:5175` → `:3302`, confirmed by CORS preflight and by the API base injected into the served bundle.
3. **A detector of mine misfired**, and I record it rather than its first output: my `stillClaimsNotLive` regex returned TRUE on the rewritten `/meeting-bot` page because it matched the phrase "tested-against-fakes stub" — which is now correctly scoped to the Vexa and system-audio joiners only. Reading the rendered text refuted my own pattern.

## ISS-294 — `pnpm -r test` red. FIXED, and the fix is mutation-proven.

My own full run in the lane, exit 0, no flakes:
`core 7/7 · db 14/14 · ai 74/74 · ask 50/50 · ingest 97/97 · index 215/215 · meeting-bot 43/43 · api 173/173 · web 13/13 files`

**The amendment is non-vacuous, and I proved it rather than accepting the builder's proof.** D-020 posture: `timeout`, restore in a trap firing on EXIT/INT/TERM/ERR, SHA256 + `cmp` verified.

```
sha256 before: b5c7b30ee8598a858876bf25e9568151a09175e92edb435d3ec38e5f66cfdc8f
--- arming mutant: removing session.json ---
X real data: every migrated session dir has session.json + session_page.json ...
  AssertionError: every migrated session dir must have session.json + session_page.json;
  missing: 2026-09-24-zoho-next-european-study-destinations: ENOENT
pass 214 | fail 1
RESTORE: OK (sha256 match)   CMP: identical
```

The assertion fails, fails for the right reason, and **names the offending directory** — which is the whole point of replacing an opaque unhandled ENOENT. My cycle-1 ruling was that `assert.equal(sessions.length, dirCount)` was vacuous by construction, because `loadRealData` pushed one entry per directory unconditionally and threw before returning. That is now repaired at the source: `loadRealData` collects `missing[]` and the test asserts `deepEqual(missing, [])`.

## ISS-296 — session written but never indexed. FIXED, verified at three layers.

| layer | before (my measurement) | now (my measurement) |
|---|---|---|
| chunks linked to this session's turns (`turnRefs`) | 0 | **65** |
| claims linked (`evidence.turnId`) | 0 | **66** |
| `session_pages` | 0 | **1** |
| `tree_index(toc)` mentions the session | false | **true** |
| session page OVERVIEW | `(no summary yet)` | **a real summary** naming Hungary, Greece, IBS, HAU |
| session page claims heading | `CLAIMS (0)` | **`CLAIMS (66)`** |
| `POST /ask` about the webinar | `verdict: incorrect`, "all candidates scored < lower threshold 0.3" | **`verdict: correct`**, "at least one candidate scored >= upper threshold 0.7", top candidate = this session |

**Tenant control on the same route, so the result discriminates:** the same `/ask` query with a `zz-checker-probe` key returns `404 no tree index built for this tenant yet`. A pass with no failing control proves nothing, so both halves are recorded.

**Correction to my own earlier reading, recorded because it nearly became a finding:** I first measured "chunks 0 / claims 0" for this session and almost reported the builder's numbers as unreproducible. My probe used `sessionId`; `chunks` link by `turnRefs` and `claims` carry no session field at all. The builder's numbers were right and my query was wrong.

## ISS-297 — `/meeting-bot` factually false. FIXED, and better than required.

Rendered text from the lane at `:5175/meeting-bot`:

> "One real joiner is live (a local browser on Windows, recorded with OBS)"
> Platform detection: "Meet / Teams / Zoom / Webex / **Zoho (webinar & meeting) / Google Cloud OnAir**"
> "LIVE SINCE 2026-09-24 … First live run: a Zoho webinar on 2026-09-24, transcribed into 80 turns"
> "no auto-reconnect yet (T-029) … **the first live run lost roughly 5–8 minutes this way, so its capture is not complete**"

That last line is the caveat I told the maker this unit could not claim away. Putting it in the product UI, unprompted, is the honest outcome, and it satisfies the `claims-degradation-honesty` pattern rather than merely deleting the old false statement. The residual "tested-against-fakes" language is now correctly scoped to Vexa and system-audio, which remain stubs.

## ISS-291 — non-atomic swap. FIXED as far as a standalone Mongo allows, and honestly disclosed.

The write path CHANGED in this cycle, so I re-audited it rather than relying on cycle 1's audit of the old delete. `replaceSessionRows` (`scripts/webinar/session-rows.mjs:24-29`) upserts every new row with `syncGen: gen`, then deletes with:

```js
await scoped.deleteMany({ ...scope, syncGen: { $ne: gen } });
```

`scoped` is a `coll(tenantId)` accessor (tenant injected by the accessor, spread last so a caller cannot override it); `scope` is `{ sessionId }` or `{ sessionRef: sessionId }`. That is **triple-scoped — tenant + session + not-this-generation — and strictly tighter than the delete it replaces.** Every other write in `sync-session.mjs` goes through `sessions(tenantId)`, `turnsColl(tenantId)`, `topics(tenantId)`, `graphEdges(tenantId)` or `coll(tenantId)`; no `getDb`, no `.raw`, no unscoped handle.

The manifest states plainly that the swap is **not atomic**, names the exact crash window, and works through which rows can duplicate (only those whose deterministic id changes between generations). Correct call absent a replica set, and correctly disclosed rather than implied to be transactional.

## Shared-data disclosure — present, and traced to source

The manifest's addendum states the writes are live on shared `lkb`/`toc` and do not roll back with the branch, and traces the topics 15→158 jump to `promoteAndPersistEntities` (`apps/api/src/indexing/session.ts:262`) receiving the FULL tenant `rootDoc`, so the first-ever `indexSession` run for the tenant back-filled promotion across the whole seeded corpus. Upsert-only, additive. That is a better answer than the disclosure I asked for. The governing policy question is open for the Approver at `qa/gates/lane-writes-shared-database.md`.

## `lint:structure` — RED, and verified NOT this unit's

```
lint-loc: OK (298 files) | lint-dirsize: OK (80 dirs)
lint-root: FAIL — root has 16 loose files (budget 15)
```

I re-ran `scripts/lint-root.mjs` on **master** and it fails with the **identical 16 files**, and `git diff master...HEAD` adds no root-level file. The offender is the runtime-created untracked `AGENTS.md`, recorded as **ISS-248 (open, medium)**. Pre-existing, not a regression of this cycle. This is the opposite of cycle 1's ISS-285, where the dirsize breach WAS the unit's own doing — which is why that FAILed and this does not.

## Not this unit's, deliberately excluded

**ISS-295** (the 94 `graph_edges` are read by no API route; `apps/api/src/routes/graph.ts:5-11` still asserts the collection is empty) is assigned to U-BRAIN under `qa/contracts/brain-knowledge-graph.md` [C1]. Excluding it here is a scope decision, not an oversight.

## Notes (EXPLANATION only — not backlog, per the D-014 verdict rule)

- The builder reported two flakes under load (AskPage vitest timeout, tsc OOM). **Neither reproduced in my run**; all packages were green first time.
- A sampled claim is the recording-notice boilerplate with `status: needs-review`. That status is correct for it and the manifest discloses it; not a defect.
- 2 of the 80 turns remain unresolved `spk:0`, and turn 1 is truncated mid-word by the 230s trim. Both were disclosed at cycle 0 and are unchanged.

## Why PASS

All four issues this cycle exists to answer are verified fixed by commands I ran; the one non-vacuous question I raised at cycle 1 is now mutation-proven rather than asserted; the changed write path is tighter than the one it replaced and still tenant-scoped; and the single red gate is a pre-existing failure reproduced identically on master. `ISSUES-WRITTEN: none` is a complete check here, not a lapse — I went looking for a fifth finding in the changed write path specifically, and did not find one.
