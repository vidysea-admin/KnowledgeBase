# QUEUE — maker tick 2026-09-28 (iss-346 cycle-1 FAIL, HELD; slug collision gated)

> **iss-346-round-cap-mechanical-check is HELD, not stalled.** Cycle-1 verdict `8ac0582`: FAIL,
> 7/9 criteria, 2/3 invariants. The checker ruled that C1 and I2 **cannot be satisfied by disclosure
> at all** — both judge shipped behaviour, and every lawful fix is a `.claude/hooks/*` edit gated
> behind `qa/gates/maker-predicate-canonical-field-and-prose-seam.md` (still OPEN). **No further fix
> cycle from the builder alone can close them**, so cycle 2 was NOT opened; that would burn a cycle
> on work the unit is not permitted to do.
>
> **New, and the reason this tick matters: a THIRD contract-named artifact has the same live defect.**
> `ISS-A035913-011` (high, open) — `.claude/hooks/mc-precommit.ps1:43`'s pending-unit regex does not
> match a manifest carrying only D-042's canonical `**Handshake status:**` field (verified live:
> legacy `True`, canonical-only `False`). The cycle-1 audit had narrowed [C7]'s "every sibling hook
> that shares the pattern" to "every sibling predicate in one file"; the checker extended it to the
> two hooks the contract names, found `mc-sessionstart.ps1` genuinely clean, and found this. The gate
> above is now about three artifacts, not two.
>
> **Second gate opened this tick — `qa/gates/iss-346-slug-collision-two-units.md`.** Merging the
> worktree returned `CONFLICT (add/add)` on **both** the manifest and the verdict: master already
> carries a *different* unit at the same two paths, PASSed and closed out at `97756f5`. Two loops
> claimed one ledger row. I aborted the merge and overwrote nothing — resolving it either way deletes
> a checked verdict. Only the lane ledger shard was landed (no conflict, same git blob
> `45061ef0…`, so verbatim as the checker wrote it).
>
> **Tick state:** `wave=2 · concurrent peak=2 · ` see SERIAL lines below.

| # | unit | tier | why now | cap check |
|---|---|---|---|---|
| 1 | `iss-367-lint-structure-no-shortcircuit` (folds in ISS-371) | 2 (high) | **released** — it was `SERIAL` on the iss-346 check because it re-runs `lint-loc`; that check has returned. **CORRECTION to this tick's first draft: ISS-371 is severity `medium`, not high.** Under this repo's severity gate a medium gets a ledger entry and is "verified inside the next unit that touches the same file" — not its own ceremony. That unit is ISS-367, whose own `fix_direction` says to do the `testPatterns` entry FIRST because it drops `lint-loc` 5→4 and changes the masking picture. So they are one unit, not two | 0 prior PASSes on `package.json` / `structure.config.json` / `scripts/lint-*.mjs` — clear |
| 2 | `iss-368-heartbeat-read-failure-is-not-health` | 2 (high) | a `listHeartbeats` throw is reported as zero silent watchers — byte-identical to "all fresh", contradicting D-048; its standing test pins the wrong answer and passes on the broken implementation | `apps/api/src/routes/health.ts` 1 prior PASS — under the cap |
| 3 | `ledger-duplicate-id-guard` | 2 (high) | `SERIAL` this wave — see below | 0 prior PASSes — clear |
| 4 | `iss-104cc-3-narrow-place-signal` | 2 (high) | D-055 ruling 1; hard prerequisite `speaker-rules-test-file-split` (test file at 392/400) not yet done | measurement pre-specified against BOTH ledger corpora by id |

**SERIAL: `ledger-duplicate-id-guard` waits on a named edge** — D-055 ruling 2 assigns the `ISS-360`
id promotion to **`/checker`**, and it rewrites the same `qa/issues*.jsonl` surface this guard would
validate. Building the guard against a ledger that is about to change under it measures the wrong
corpus. It goes in the next wave, after the promotion lands.

**SERIAL: `iss-346-round-cap-mechanical-check` waits on two OPEN human gates** — named above. Not a
stall: diagnosis is on disk in both gate files, and the checker's own verdict states no builder-only
fix exists.

---

## TODO — narrow the place-vs-person signal (D-055 ruling 1)

| unit | tier | why | files | schema | surface | consumes | runtime |
|---|---|---|---|---|---|---|---|
| `iss-104cc-3-narrow-place-signal` | 2 (high) | D-055 ruling 1 accepted the ~32% false-positive cost **provisionally, not as final**, and requires a narrowing unit. `readsAsAPlaceOrOrg` is candidate-independent, so the refusal is deterministic for ANY name in a locative-self-mention construction. Make a strong naming cue, direct address, or a multi-token name RESCUE the real person, without reopening the fabrications ISS-104 closed. | `packages/index/src/pipeline/speaker-name-rules.ts` (`readsAsAPlaceOrOrg`, `citesNameAsAnIntroduction`), `speaker-name-rules.test.ts` | no | speaker resolution | `speaker-name-data.ts` (`LOCATIVE_GOVERNORS`) | none |

**Measurement is pre-specified, so the unit cannot grade its own homework** (D-013's "Measuring a fix
against the ledger", D-015): it reports BOTH corpora by id — **ISS-104's 20 recorded reproductions**
(must not regress below the current 19/20 refused) and **ISS-104CC-3's recorded false-positive
cases** (must improve on ~32%). A self-authored corpus may be added, never substituted. The 15%-vs-32%
discrepancy is precisely what an author-chosen corpus produced last time.

**Gate constraint, already measured:** `speaker-name-rules.test.ts` is at **392 of testMax 400**. This
unit adds cases to that file, so `speaker-rules-test-file-split` is a hard prerequisite, not a
nice-to-have. Do the split first or the gate reds.

---
## DONE — report unmerged-worktree commits in the sweep (checked-PASS cycle 0, qa/verdicts/sweep-reports-unmerged-worktrees.md)

| unit | tier | why | files | schema | surface | consumes | runtime |
|---|---|---|---|---|---|---|---|
| `sweep-reports-unmerged-worktrees` (DONE) | 4 (medium) | 23 commits across 5 worktrees are invisible to every gate, count and sweep, because all of them read master. `wave/u2-4-phase3-fix` alone is 13 commits behind a **critical open** row (ISS-282). Make the number appear every tick instead of being discovered during unrelated hygiene. | the sweep / session-start reader in `scripts/` | no | sweep report contract | `git worktree list`, `git log master..<branch>` | none |

**Reporting is separable from deciding.** `qa/gates/unmerged-worktree-inventory.md` holds the
per-branch merge/retire decision for the Approver. This unit only makes the debt visible and must
not merge, rebase or delete anything.

---
## TODO — a duplicate-id guard over the ledger union

| unit | tier | why | files | schema | surface | consumes | runtime |
|---|---|---|---|---|---|---|---|
| `ledger-duplicate-id-guard` | 2 (high) | `qa/issues.jsonl` carries **two different issues both id `ISS-360`**, statuses `open` and `fixed` (lines 358-359, predates the iss-104 merge). Every reader silently takes one. D-015's measure-against-the-issue's-own-reproductions rule is only as strong as an id resolving to one row. The guard is separable from the repair and blocks the class recurring. | `scripts/` (the tracker-audit / ledger reader), not the ledger itself | no | ledger read contract | `qa/issues.jsonl` + `qa/issues.*.jsonl` union | none |

**The repair is gated, the guard is not.** `qa/gates/iss-360-duplicate-id-collision.md` holds the
repair for the Approver (it changes what committed citations mean). A reader that fails loudly on a
duplicate id decides nothing and can ship first. Do not resolve the collision inside this unit.

**Update 2026-09-28 (D-055 ruling 2, executed by `/checker`):** the repair landed on disk. Both
rows' `canonical_id` was promoted to a real `id` (`ISS-360-OBSFLAKE` line 358 open,
`ISS-360-HEARTBEAT` line 359 fixed) and the bare `ISS-360` no longer exists as an id anywhere in
the ledger union. Every already-committed bare-`ISS-360` citation this repair found was ANNOTATED,
never rewritten — see `qa/issues.360-citations.md` for the full disambiguation table (39 sites; 1
marked genuinely `AMBIGUOUS`). **Commit deferred**: another loop holds an unresolved merge conflict
in this checkout (`apps/api/src/production.ts`, `UU`) at the time of this repair, so
`qa/issues.jsonl` and `qa/issues.360-citations.md` are on disk, uncommitted, pending that merge
clearing. This TODO row (`ledger-duplicate-id-guard`) still stands — the mechanical duplicate-id
guard is separate work and unaffected by the repair landing.

---
## TODO — speaker-name-rules.test.ts is 8 lines from its gate budget

| unit | tier | why | files | schema | surface | consumes | runtime |
|---|---|---|---|---|---|---|---|
| `speaker-rules-test-file-split` | 5 (contract gap / gate budget) | `packages/index/src/pipeline/speaker-name-rules.test.ts` sits at **392 of testMax 400** after iss-104-place-vs-person-signal. The NEXT corpus added on this seam breaks the `lint-loc` gate, and this seam takes a corpus nearly every unit (D-015 requires each fix to carry its issue's recorded reproductions, which only grows the file). Split by concern before that happens, not after a red gate forces it. | `packages/index/src/pipeline/speaker-name-rules.test.ts` (+ the new sibling test files) | no | none — test-only | `speaker-name-rules.ts`, `speaker-name-data.ts` | none |

Surfaced by the iss-104 build, not by a checker — recorded here rather than in the ledger because
the maker is not the ledger's writer. **Depends on ISS-371** (`loc.testPatterns` omits `.test.mjs`)
only in spirit, not mechanically: this file is `.test.ts` and is already correctly judged against
`testMax` 400, so ISS-371 does not move this number.

---
# QUEUE — checker Mode B sweep 2026-09-28T23:5x+05:30 (consolidated, single agent)

> **Terminal state: `FINDINGS: 5 new` (2 high, 3 medium) + `3 checker_note`s appended.** Range
> `2a0d5f7..9219d96`, **72 commits**. The sweep ran consolidated rather than 3-sharded because it
> was ~15 h overdue and the previous 3-shard attempt died with its session having written nothing.
> **The tree moved mid-sweep** (64 commits at start, HEAD `b44a3a2`; the other loop added 8 more);
> every check was re-derived and completed at `9219d96`, and the range above is the one actually
> used — stated explicitly because a previous shard silently ran a superseded range and every one of
> its findings had to be re-verified by hand.
>
> **Filed: ISS-367 (high), ISS-368 (high), ISS-369, ISS-370, ISS-371 (medium).**
> **Appended: ISS-358, ISS-267, ISS-248.**
>
> **ISS-367 — `pnpm lint:structure` is an `&&` chain, and four of its ten stages have never been
> observed.** This is the finding of the sweep. The chain short-circuits on `lint-loc`, which has
> been red for a long time, so `lint-dirsize`, `lint-root`, `snapshot --check` and `tracker-audit`
> have been dark. Run separately, **five** stages are red: `lint-loc` (5), `lint-dirsize` (1 —
> `apps/api/src` 32 files against a budget of 31), `lint-root` (1 — 17 loose root files against 15),
> `snapshot --check` (**`docs/SNAPSHOT.md` stale, 95 lines differ from a fresh regeneration**), and
> `tracker-audit --gate G1,G4` (6 findings). The dirsize breach is *in range and attributable*:
> `apps/api/src` went 31→32 via the sole added file `apps/api/src/ask-web-fallback.ts` in `d23d464`
> (ISS-274) — a unit whose manifest is literally headed *"pre-existing failure, NOT a regression from
> this unit"*, pasting only `lint-loc`'s output, and whose **verdict re-ran the command and
> concurred**. Both conclusions rest on output that never reached stage 2. That is not a lapse by
> either party: the command genuinely cannot show them stage 2.
>
> Filed as the **shared root cause** of a class, not another instance of it. ISS-058, ISS-100,
> ISS-136 and ISS-222 are each a closed instance of "a manifest claimed `lint:structure` green or
> mis-attributed its red"; all four are `fixed`/`verified`, and **none names this mechanism** — which
> is exactly why the class kept recurring. It also bears directly on this project's own Definition of
> done items 1 and 2.
>
> **`docs/SNAPSHOT.md` deserves its own line.** The user-level memory records it as the read-first
> digest whose staleness is supposed to be gated by `pnpm lint:structure`. It was last regenerated at
> `7616beb`, *before* this range. The gate that was meant to catch that is the one behind the
> short-circuit.
>
> **ISS-371 is the cheap prerequisite and is ranked first for that reason.** `loc.testPatterns`
> covers `.test.ts` and `^test_*.py` but **not** `.test.mjs`, while `.mjs` *is* in `loc.extensions` —
> so all 12 `.mjs` test files are judged against the 300-line **source** budget instead of `testMax`
> 400. `scripts/lib/dispatch-state.test.mjs` sits at 332 counted lines: over 300, comfortably under
> 400. One pattern entry drops `lint-loc` from 5 violations to 4 **without touching a single source
> file**, which materially changes ISS-367's masking picture. Fix it first, then re-measure.
>
> **ISS-368 — a read failure is being reported as health.** `detectSilentWatchers`
> (`apps/api/src/routes/health.ts:102-106`) catches a `listHeartbeats` throw and `continue`s, so a
> tenant whose heartbeat collection is unreadable contributes **zero** silent watchers — an output
> byte-identical to "all watchers fresh". This contradicts D-048 as restated in that unit's own
> header comment (*a missing row is treated as maximally stale, not as healthy*). The unit's standing
> test **pins the wrong answer**: it asserts `detectSilentWatchers(deps) === 0` for a tenant that
> under D-048 owes 3 stale alerts, so it passes on both the correct and the broken implementation.
> This is the "a check asserting a state the bug also produces" trap, caught in the wild.
>
> **Two corrections recorded against this session's own earlier reporting, not buried:**
> 1. I told the user `lint-loc` stood at **3** violations "down from 4". **It was 4.**
>    `packages/index/src/pipeline/speakers-llm.ts:313` is a real violation my post-merge gate output
>    dropped — I read a truncated tail and lost both the `FAIL — N violation(s)` header and the first
>    file line. Re-derived directly: `node scripts/lint-loc.mjs` at HEAD prints **5**. The one thing
>    that was right is that `speaker-name-rules.ts` did leave the list.
> 2. The dispatch brief handed the sweep that same wrong baseline of 3. The sweep caught it and said
>    so. Recorded here because a brief that ships a wrong baseline can launder it into a finding.
>
> **Not ranked, and why — `ISS-267` is the highest-value governance item on the board and is still
> going to a HUMAN_GATE.** Its only fix site is `.claude/hooks/mc-sessionstart.ps1`, a non-security
> seam now at **4** PASSed touching units against D-014's cap of 2, and D-052 ruling 1 sequences
> ISS-346 ahead of any cap decision on that file. Per D-013's round cap that is a gate, not a unit —
> `qa/gates/mc-sessionstart-handshake-reader-round-cap.md`. ISS-370's hook half is held for the same
> reason; its `dispatch-state.mjs` half may be separable.
>
> **Verified clean and worth stating, since a sweep that only reports problems misleads:** zero
> bypasses (every code-bearing commit in range traces to a manifest *and* a verdict); zero untracked
> verdicts, manifests or ledger shards; all 12 hooks across `.claude/hooks/` and `.codex/hooks/`
> wired, with no orphan, no dead entry and no double-wiring; **every** enforcement-path change in
> range carries an authorizing entry with `Approved-by`, read from commit **bodies** not subjects
> (`1f263e0`→D-043, `ca86e53`+`0cf1b17`→D-050-SPEAKER, `f8fc81e`+`398dfff`→D-050-CODEX,
> `bdc755b`→comment-only under D-051); no checker touched code, a manifest or a contract outside
> checker-owned paths; both `STALLED` units have their `qa/debug/` diagnosis on disk; and the ledger
> reader and the disk agree at **17 shards**.
>
> **Tier-3 reachability, measured rather than asserted:** of the units PASSed in range, roughly half
> (u4a, u4b, u4c, u4b-heartbeat, iss-274) are roadmap-derived and half are the loop's own machinery.
> `.goal/goal.json`: **51 done, 2 in progress, 31 pending**. That is no longer the structurally
> unreachable tier 3 of 2026-09-08, so no goal-coverage row was filed.
>
> **Honest gaps, named rather than implied:** `pnpm -r test` and `depcruise` were **not run** (the
> suite is long and `packages/meeting-bot` carries the ISS-360 load flake, so no honest single-run
> claim was available; `depcruise` is stage 10 and unreachable behind ISS-367 anyway) — **no
> test-count or dependency-boundary claim is made anywhere in this sweep**. Contract staleness was
> **sampled, not swept** (only the one contract amended in range was verified). Whether
> `lint:structure`'s later stages were also red at `2a0d5f7` was not measured; only the
> `apps/api/src` 31→32 breach is attributed in range.

## Top 3 next units — strict D-013 tier order

| # | unit | tier | why now | cap check |
|---|---|---|---|---|
| 1 | `iss-371-loc-testpatterns-mjs` then `iss-367-lint-structure-no-shortcircuit` | 2 (high) | ISS-371 is one config entry and drops `lint-loc` 5→4, changing ISS-367's picture; ISS-367 then un-masks four gate stages that back this project's own Definition of done | 0 prior PASSes on `package.json` / `scripts/lint-*.mjs` / `structure.config.json` — clear |
| 2 | `iss-368-heartbeat-read-failure-is-not-health` | 2 (high) | the seam the last three units were built to deliver, and the defect makes R2's own guarantee unfalsifiable; its standing test currently passes on the broken implementation | `apps/api/src/routes/health.ts` has 1 prior PASS — under the cap of 2 |
| 3 | `ISS-282` / U2.4 phase-3 precision re-gate | 2 (critical) → 3 | a critical row over a manifest at `ready-for-check` with two cycle-0 FAILs; U2.4 is the single roadmap item before the Phase-1 exit clause, so closing it turns a tier-2 critical into tier-3 progress | paused at `qa/.paused.u2-4-phase3-precision-regate` — resolve the pause first |

**In flight at this stamp (not queue rows):** `iss-346-round-cap-mechanical-check` and
`iss-104-place-vs-person-signal`, both dispatched this tick to worktrees, both authorized
(D-043 item 2 / D-052 rulings 1–2).

---

# QUEUE — checker Mode B sweep 2026-09-28T02:xx+05:30 (shard-3 re-run against the correct range, consolidated)

> **Correction to the 2026-09-28T00:0x pass below: shard 3 had run against the WRONG, already-
> superseded range (`213d2ac..3869c83`) and its findings were folded as stale duplicates in that
> pass.** Shard 3 has now returned against this consolidation's own range (`8669919..3c4d0d5`) with
> three fresh claims. All three verified independently against HEAD (`3c4d0d5`) before filing —
> none accepted on say-so. **Terminal state: 1 new id (ISS-355, high); 2 `checker_note`s appended
> (ISS-268, ISS-350); 1 claim's headline fact CONFIRMED but its cited live instance REJECTED
> (not reproduced) and corrected in place, not filed as a new row.**
>
> **Finding 1 — `.codex/hooks/*` (high, filed ISS-355).** CONFIRMED and escalated to its own row,
> not folded into ISS-268 (different fact pattern: that row describes an UNTRACKED, byte-identical
> shadow awaiting a disposition decision; this is a now-COMMITTED, tracked mirror, born already
> diverged). `git ls-tree -r 8669919 -- .codex/hooks` is empty; `git show eff401b --stat` (inside
> this range) adds `.codex/hooks.json` + 6 `.ps1` files. Direct diffs at HEAD confirm three real
> regressions in `.codex/hooks/mc-sessionstart.ps1` against `.claude/hooks/mc-sessionstart.ps1`:
> the pre-D-041 single-file `$LEDGER` (reintroducing the union undercount), the pre-D-034 naive
> `Status: ready-for-check` substring match, and a `Select-Object -First 1` on `Cycle checked`
> instead of the max-across-cycles fix (the ISS-350-repro-3 trap). `mc-precommit.ps1` carries the
> same regex regression. **One correction to the brief:** `features-snapshot-session-end.ps1`
> differs only by CRLF-vs-LF (`diff --strip-trailing-cr` shows zero content difference) — not a
> real divergence. `decisions-append-guard.ps1` and both `lab-session-*.ps1` confirmed
> byte-identical. `grep -rn codex docs/DECISIONS.md` — zero hits, no Approver decision covers this
> commit. Whether anything currently invokes `.codex/hooks/*` remains unresolved either way (a
> Codex-CLI-side question, outside this repo's own files) — recorded as open, not assumed either
> direction.
>
> **Finding 2 — verdict-form census (ISS-350 reproduction 4, CONFIRMED and undercounted).**
> Independently re-derived across all 161 `qa/verdicts/*.md` at HEAD (one more file than the
> dispatch's 160 — `ledger-shard-union-reader.md` landed after that count was taken). Confirms at
> least 8 distinct first-line forms, including a wholly different field name (`**Result: PASS**`,
> 10+ files, spot-read to confirm) and a bare `**PASS**`/`**FAIL**` with no field label at all in
> at least 9 files (`T-020-ingestion-source-seam.md:82` spot-read to confirm). 29 of 161 files
> carry `Cycle checked` more than once (worst: `delivery-gate-manifest-blindness.md`, 40
> occurrences — re-confirmed by direct count). Filed as a `checker_note` on ISS-350, not a new row
> (this is that row's own reproduction 4, now measured rather than named). **One correction folded
> in:** the session-start hook's `Select-String -Pattern 'VERDICT:\s*PASS'` IS case-insensitive by
> PowerShell default and DOES catch `Verdict: PASS` — what it structurally cannot catch is the
> `**Result:**` and bare-`**PASS**` forms, which contain no "VERDICT" substring in any case. The
> dispatch's framing of this sub-point was corrected, not repeated.
>
> **Finding 3 — Handshake-status-only manifest blind spot: headline fact TRUE, cited instance
> REJECTED (does not reproduce).** `grep -l Handshake .claude/hooks/mc-sessionstart.ps1
> scripts/lib/dispatch-state.mjs` returns nothing — neither reader parses the canonical field,
> confirming ISS-350's own fix_direction (d) is still fully undone, exactly as D-042 already
> disclosed. But the cited live instance, `qa/manifests/u2-4-phase3-precision-regate.md`, does
> **not** reproduce: direct read shows `## Status: ready-for-check` at line 159, a legacy heading
> form the CURRENT D-034 regex matches (re-run live, confirmed). Running
> `.claude/hooks/mc-sessionstart.ps1` at HEAD reports `Checks pending: 0` — the two remaining
> Handshake-ready-for-check manifests both carry a FAIL verdict at their current cycle, which is
> the separate, already-known ISS-267 gap, not this one. A full scan of all 161 manifests found
> **zero** currently in a canonical-field-only, no-legacy-field state — structurally expected,
> since the ISS-350 backfill only ever derives the canonical field FROM an existing legacy
> statement (D-042: purely additive). The theoretical risk (a future manifest authored with only
> the canonical field) is real but not live today, and is already the exact concern fix_direction
> (d) names. Corrected in place via a `checker_note` on ISS-350, not filed as a new row, and not
> presented as a live reproduced bug — a finding that does not reproduce at HEAD is not a finding.
>
> **Also corrected, not a ledger matter:** this range is NOT prose-only — `git diff --stat
> 8669919..3c4d0d5` is 226 files, `+4560/-168`, independently re-confirmed, with real application
> code among it (`packages/meeting-bot/src/calendar/{schedule-state,schedule-tick,task-scheduler}.ts`
> + tests, `capture/{obs-guard,obs-windows}.ts` + test, `promote-entities.test.ts`,
> `scripts/eval-recall.mjs` rewritten + `scripts/lib/eval-recall.test.mjs`,
> `qa/probes/golden-set-sibling-semantic.mjs`, plus all of `.codex/hooks/*`).
>
> **Verified clean by shard 3 this pass, not re-filed:** `lint-loc` at exactly its 4 known
> pre-existing violations (no new ones); `lint-dirsize` clean, `scripts/` at its 32/32 cap;
> `qa/debug/` naming consistent; token ledger appended (`opus_sub_share` 0.0); code-graph correctly
> SKIPped (no `graph.json`, a sweep never builds one).
>
> **HEAD moved during this addendum**, per the coordinator: `fa32181` (Umesh answers D-043..D-046)
> and `36909f1` (checker PASS `ledger-shard-union-reader` cycle 0 — closes ISS-129, files
> ISS-353/354) both landed on top of this consolidation's own `96048e4`. Neither touches this
> file's owned surfaces. `qa/manifests/ledger-shard-union-reader.md` is being closed out by that
> other session — not touched here, per instruction.
>
> **Open-issue counts, union of `qa/issues.jsonl` + `qa/issues.*.jsonl`, re-derived after this
> addendum:** 400 rows total, **156 open — 2 critical / 31 high / 77 medium / 46 low** (ISS-355 new
> high; ISS-129 closed out by the concurrent session, -1 high; ISS-353 medium / ISS-354 low filed
> by that same session).

## Ranked top 3 (this addendum, D-013 tier order)

**Tier 1** empty (0 TODO rows). **Tier 2** governs picks 1–2 — both open criticals stay
not-pullable, unchanged (ISS-104 round-capped file-don't-fix; ISS-282 deliberately paused).
**Tier 3** stays at #3, per D-013's "not optional, not last."

1. **ISS-346 (high)** — the D-014 round-cap mechanical check, authorized D-043 item 2, still
   explicitly sequenced FIRST (D-044's waiver depends on it landing before that exception repeats).
2. **ISS-355 (high, new this addendum)** — `.codex/hooks/*` committed with no Approver decision,
   already reintroducing three separately-fixed defect classes (union undercount, pre-D-034 regex,
   first-match-not-max cycle read). Umesh's own framing of this tick's most significant finding;
   the disposition question (sanction-with-a-parity-rule vs remove/gitignore) may need a
   HUMAN_GATE, but the maker should raise it rather than let it sit — it is the second time this
   exact surface has gone unanswered (ISS-268 first asked in 2026-09-22).
3. **U4.1 (tier 3, roadmap — TASKS.md:112 / goal.json, unblocked, no deps)** — Recording/file
   upload wired to a real transcribe worker. Unchanged from the prior pick.

**Also still queued:** `delivery-gate-stamp-adoption` fix cycle 2 (D-043 item 1) and the
`mc-sessionstart.ps1` Handshake-status reader (D-043 item 3) — both authorized, both behind #1–#2
above in this addendum's ordering, not dropped.

---

## Prior consolidation (2026-09-28T00:0x+05:30, 3-shard wave — superseded by the addendum above)

> Bound to `D:/KnowledgeBase`, range `8669919..3c4d0d5` for shards 1-2; shard 3 ran against an
> **older, already-superseded range** (`213d2ac..3869c83`) because it was dispatched in a prior
> tick and only just returned. Invoked directly by Umesh, 3 read-only shards + this consolidation
> as single writer. **Terminal state: 1 new id (ISS-352, medium); 1 `checker_note` appended
> (ISS-348); 3 shard-3 findings REJECTED as stale duplicates of already-filed/already-fixed work;
> 1 shard ruling CONFIRMED (handshake-canonical-field's [C7]-by-extension citation); shard 1's one
> flagged-unverified item (the 577-vs-320 additivity trace) independently RE-VERIFIED and found
> already reconciled.**
>
> **Shard 1 (pair-state/bypass/enforcement liveness) — CLEAN, re-confirmed.** All four unresolved
> units (`delivery-gate-stamp-adoption` owing fix cycle 2, `u2-4-phase3-precision-regate` paused,
> `delivery-gate-manifest-blindness` + `write-guard-enforcement-gaps` STALLED 3/3 with debug
> reports) are legitimately disclosed, not new findings. The one thing shard 1 did NOT
> independently re-execute — the cycle-1 checker's "577 vs the manifest's claimed 320" additivity
> line-count trace on the handshake backfill — **was re-executed here**: `git show -S"Handshake
> status" --all -- qa/manifests` finds exactly one commit that ever introduced the field,
> `1fe83d7`, at `160 files changed, 577 insertions(+), 2 deletions(-)`. `qa/verdicts/
> handshake-canonical-field.md:25-28` already traces this: the manifest's own pre-commit `320 2`
> measurement excluded its own not-yet-`git add`ed 257-line self (untracked files are invisible to
> `git diff`), and `257 + 320 = 577` exactly. D-042's "159 files, +320, -2" is therefore CORRECT —
> 159 pre-existing manifests, excluding the handshake unit's own manifest file, which is the 160th.
> No discrepancy; nothing to file.
>
> **Shard 2 (adapter/loop-spec/gates/GRILL) — two findings, both verified independently.**
> - **Finding A (gate-status staleness) CONFIRMED, but folded into existing ISS-348, not a new id.**
>   Read `qa/gates/ledger-shard-union-hook.md:48` directly: `**Gate status:** OPEN` sits above a
>   real, dated `Answered:` line (50) backed by **D-041**. Two MORE live instances of the identical
>   disease were found while checking Umesh's four gate answers this tick: `qa/gates/
>   enforcement-hooks-unauthorized-and-live-regressed.md:166` still reads OPEN though **D-043**
>   states it "is answered and closed by this entry", and `qa/gates/
>   iss-122-round-cap-breach.md:78` still reads OPEN though **D-044** states it "is answered by
>   this entry and closes". This is exactly ISS-348's own fix_direction (c)/(d) — a static field
>   where a computed one is needed — recurring three times with today's own decisions. Filed as a
>   `checker_note` on ISS-348, not a new row (same defect, same fix; the gate FILES themselves are
>   being re-stamped by the Approver's session this tick, so no re-stamp requested here). **Count
>   these three as ANSWERED/CLOSED for this tick's queue ranking below, not OPEN.**
> - **Finding B (loop.md BACKLOG_EMPTY unqualified) CONFIRMED NEW — filed ISS-352 (medium).**
>   `qa/loop.md:45-47`'s Stop line defines `BACKLOG_EMPTY` by unqualified "no open issues";
>   project `.claude/CLAUDE.md`'s D-013 override reads "no open critical/high/medium issues ...
>   open low issues do not keep the loop alive". Verified distinct from ISS-249 (fixed 2026-09-10 —
>   that row was the missing-roadmap-tier clause, which the current text still has correctly).
>   `.claude/CLAUDE.md` wins on conflict per its own header, so this is not currently a live
>   mis-stop, but it is the same documentation-drift class as ISS-348/350, and 45 open low rows
>   make the divergence a live, non-hypothetical state right now.
> - **Handshake-canonical-field's "[C7] applies by extension" contract citation — shard 2's ruling
>   CONFIRMED, not overturned.** Read `qa/manifests/handshake-canonical-field.md:3-4` directly: the
>   citation is disclosed reasoning, not a blank field, and is legitimately different from
>   ISS-328/329/341 (those units had NO contract anywhere for their domain per a `grep -rl` across
>   all 71 `qa/contracts/*.md`; this unit's format is explicitly named as future work in **ISS-350's
>   own fix_direction (a)**: "record the vocabulary in qa/contracts/ so it is checker-owned rather
>   than convention"). No new `contract-not-cited` row opened; cite ISS-350 if this resurfaces.
> - **Unverified, flagged rather than assumed:** the 22 gates carrying an inline `Answered:` line
>   were NOT each cross-checked against a matching DECISIONS entry this tick (budget) — shard 2's
>   own caveat, re-stated, not cleared.
>
> **Shard 3 (sibling-defect hunt) — ALL THREE findings REJECTED as stale duplicates.** Shard 3 ran
> against an older range and did not see later work. Independently verified against HEAD:
> - **"Finding C" (obs-windows.ts `launchObsNormally` unhandled spawn error) is ALREADY FILED AND
>   ALREADY FIXED.** It is **ISS-337** (high, filed 2026-09-27, status `fixed`), built and merged as
>   `wave/obs-launch-error` (`fed722b`, checked-PASS cycle 0, verdict `9a0174f`). Read
>   `packages/meeting-bot/src/capture/obs-windows.ts:115-127` at HEAD: `launchObsNormally` now
>   takes an `onError` callback and calls `child.on("error", (err) => onError?.(err))` before
>   `.unref()`, with an inline comment citing ISS-337 by id. Shard 3's own `grep -rn
>   launchObsNormally qa/issues*.jsonl` returning nothing was against its stale range's tree, not
>   HEAD's. Two follow-on rows already track the residue of that same fix: **ISS-343** (medium,
>   `obs-windows.ts` grew past its lint-loc budget, 352->359, disclosed) and **ISS-344** (low, an
>   inert `setImmediate` yield in `obs-guard.ts`, filed by the maker on its own PASS report).
> - **"Finding D" (demo-live.mjs spawn, no error handling) is ALREADY FILED** as **ISS-338** (low,
>   file-don't-fix), verbatim.
> - **"Finding E" (record-commands.ts `runLogin` spawn, no error handling) is ALREADY FILED** as
>   **ISS-339** (low, file-don't-fix), verbatim.
> - Shard 3's "not siblings" rulings (`task-scheduler.ts:131`, `gws-calendar.ts:53-60`,
>   `ai-transport.ts:62-71`, `controller-state.ts:86-90`) and its ISS-334 mechanism confirmation
>   (`delivery-gate-stop.ps1:376` independent-predicate co-firing) match the ledger's existing
>   record — re-confirmed, not re-filed.
> - Churn ratio (4.39->4.40, "flat") is informational only, not independently re-derived this tick;
>   carried forward as shard 3's own reading, unverified-but-plausible per the prior sweep's own
>   caveat on this exact metric.
>
> **This session's four Approver rulings (D-041, D-043, D-044, D-045) change what counts as
> buildable.** D-043 authorizes (Approved-by Umesh) three named fixes to
> `delivery-gate-stop.ps1`/`mc-sessionstart.ps1` and retro-ratifies `4a71633`/`e5402d6`; its own
> Result explicitly sequences ISS-346's mechanical round-cap check FIRST, because it is what
> D-044's waiver depends on existing before the exception it supervises repeats. D-044 waives the
> D-014 round cap once, narrowly, for `wave/vector-gap-durability`/ISS-122, conditioned on ISS-346
> landing first and a fresh checker PASS before merge. D-045 consents to the new file
> `scripts/watch/install-tasks.ps1` and Windows Scheduled Task registration for U6, dry-run-first
> and idempotent. None of these are self-executing — each still owes its own manifest -> checker ->
> verdict handshake; the decisions remove blockers, not ceremony.

## Ranked top 3 (this consolidation, D-013 tier order)

**Tier 1** (`QUEUE.md` TODO rows): still empty. **Tier 2** (open critical/high): both open
criticals stay not-pullable, unchanged (ISS-104 round-capped file-don't-fix; ISS-282 deliberately
paused) — but this session's Approver rulings put fresh, unblocked HIGH-severity enforcement work
at the top, ahead of everything else open at that severity. **Tier 3** (next unblocked roadmap
task) is still "not optional, not last" per D-013 — named at #3 below, not omitted.

1. **ISS-346 (high) — the D-014 round-cap mechanical check, authorized D-043 item 2, explicitly
   sequenced FIRST.** No pull-selection step today counts prior PASSed verdicts per seam; D-044's
   waiver for `wave/vector-gap-durability` is conditioned on this landing before that exception is
   exercised again. Freely buildable now: `.claude/hooks/delivery-gate-stop.ps1` change is
   Approved-by Umesh under D-043.
2. **`delivery-gate-stamp-adoption` fix cycle 2 (D-043 item 1) — the Fix-cycle predicate + ISS-205
   stripper clause.** Owed since the cycle-1 FAIL; ISS-267 raised this class of gap to high on
   measured consequence (a fix-gapped unit invisible to the session-start hook for 3 days). Same
   enforcement path, same Approved-by authorization as #1 — sequence together or immediately after.
3. **U4.1 (tier 3, roadmap — TASKS.md:112 / goal.json, `open`/`pending`, no deps) — Recording/file
   upload wired to a real transcribe worker.** Still genuinely unblocked: `workers/transcribe` is a
   3-line placeholder; the real `packages/ingest` recording adapter exists and is unwired. Named
   per D-013's rule that this tier is never skipped in favor of continuing tier 2 alone.

**Also newly unblocked, not in the top 3:** (a) `mc-sessionstart.ps1` reading `**Handshake
status:**` (D-043 item 3 / ISS-350 repro 2) — third in the D-043 sequence, after #1-#2 above; (b)
`wave/vector-gap-durability`/ISS-122 merge sequence (D-044) — file the manifest citing D-044 once
#1 lands, dispatch a fresh checker, merge only on PASS; (c) U6
(`scripts/watch/install-tasks.ps1`, D-045) — still gated on U4's own plan/spec gates per the
feature rule, D-045 only clears the new-file and machine-state blockers.

**Open-issue counts, union of `qa/issues.jsonl` + `qa/issues.*.jsonl`, re-derived this tick:** 397
rows total, 153 open — **2 critical / 30 high / 76 medium / 45 low**. (Both open criticals remain
gated per above, not pullable.)

- GRILL: web-fallback vs Phase-1 exit — still open, no ruling this tick, carried forward unchanged
  (ISS-274).

## Prior sweep (2026-09-27T17:1x+05:30, 3-shard wave, consolidated — superseded by the list above)

> Bound to `D:/KnowledgeBase`, range `213d2ac..3869c83` (HEAD moved on to `dcf2b47`/`a99140f` by a
> live maker session during this sweep; not this range's concern). Invoked directly by Umesh
> ("you are /checker running the CONSOLIDATION pass"), 3 read-only shards + this consolidation as
> single writer, ids starting at ISS-337 per dispatch (maker had already taken ISS-335/336). Mode A
> not run: no manifest sat at `ready-for-check` with a missing/lower-cycle verdict at dispatch time
> (a live maker session was concurrently writing `qa/gates/*.md`, `docs/features/u4-watch-dashboard/*`
> and `qa/.last-tick` — none of those paths were touched by this sweep). **Terminal state: FINDINGS: 6
> new (ISS-337 high `spawn-error-unhandled`; ISS-338 low file-don't-fix; ISS-339 low file-don't-fix;
> ISS-340 high `gate-bypassed-and-untracked`; ISS-341 medium `contract-not-cited`; ISS-342 medium
> `pause-violation`, closed-self-corrected) + evidence appended to ISS-214 (one half now stale, one
> half still open) + ISS-326 flipped open→fixed (its manifest is now tracked).**
>
> **The finding worth reading first — ISS-337.** `packages/meeting-bot/src/capture/obs-windows.ts:112-120`
> `launchObsNormally` spawns OBS with `{detached:true, stdio:"ignore"}).unref()` and registers no
> `.on("error", ...)`; its only caller, `obs-guard.ts:87-114` `ensureObsReady`, calls it at line 103
> with no surrounding try/catch. Node emits spawn `'error'` asynchronously, so a synchronous
> try/catch could not have caught it anyway, and an unhandled `'error'` event crashes the process.
> Verified independently (not accepted on the shard's say-so): `git diff 3368454^1 3368454^2 --
> packages/meeting-bot/src/capture/obs-windows.ts` shows the merge that just fixed ISS-324 added
> exactly this handler (`child.on("error", ...)` at line 253) to the SIBLING `launch()` function and
> left `launchObsNormally` completely untouched. `grep -rn launchObsNormally qa/issues*.jsonl`
> returns nothing pre-sweep. Filed **HIGH**, not medium, on the shard's own reasoning: it is the
> unattended cold-start/reinstall path a scheduled recording depends on, same defect family as the
> bug that already cost the Ashoka recording, surviving the very unit that hardened its sibling.
>
> **ISS-340 — a gate breach the maker's own DECISIONS entry disclosed but never ledgered.**
> `qa/gates/obs-windows-loc-split.md` states plainly it **blocks** merging `wave/live-record-repair`
> with a green `lint:structure`; the merge (`3368454`) happened anyway (D-039), the gate still has
> no `Answered:` line (`grep -n Answered` — no match), and `node scripts/lint-loc.mjs` at HEAD
> confirms 4 violations, the new one being `obs-windows.ts:352` (budget 300) — exactly what the gate
> predicted (300→352). D-039 discloses the lint-loc failure in prose ("still fails with exactly the
> 4 declared C1 violations") but no ledger row existed for it. This is the mirror of "gate answered
> off-disk" (check 6): a gate left OPEN while the state it blocks landed anyway, narrated where no
> ledger reader looks.
>
> **ISS-341 — adjudicating shard 1 vs shard 2's disagreement, explicitly, per the dispatch's ask.**
> Shard 2 proposed folding `live-record-repair`'s missing-contract gap into the same pattern as
> ISS-328/ISS-329 (both "no contract exists anywhere for this domain"). Shard 1 disagreed: fix-only
> work under an existing contract's domain. **Ruled for shard 1.** `qa/contracts/meeting-bot-live-capture.md`
> is STATUS: ADOPTED (2026-09-25) and its C3/C9/C10 already cover exactly the surface this unit
> touched (`obs-windows.ts`, `obs-windows.test.ts`, `lint:structure`) — unlike ISS-328/329, where
> `grep -rl` across all 71 `qa/contracts/*.md` for the relevant domain terms returned nothing at all.
> The real, narrower defect: the manifest never cites the contract or maps its changes to C3/C9/C10,
> so a PASS ships without a reader being able to tell what it was actually graded against. Filed
> medium, type `contract-not-cited`, distinct from the `contract-gap` type ISS-328/329 use.
>
> **ISS-342 — adjudicating shard 1's punted question ("is a pause violation a ledger class here?").**
> Ruled **yes**. D-038 fully self-documents the maker launching a paused eval (`qa/.paused.u2-4-phase3-precision-regate`,
> "free RAM >= 8 GB", actual 1.71→0.52 GB) and its own clean self-correction (killed within ~35 min,
> no contamination, unit left paused) — but a DECISIONS narrative is not what Mode B's own
> bypass/liveness checks read, and D-038 itself names the failure mode ("writing the clause is
> mistaken for making the call"). Filed **closed-self-corrected**: the point is a baseline for a
> future recurrence, not chasing a defect that's already fixed.
>
> **ISS-214 evidence corrected, not duplicated.** Its `ledger-shard-union-hook.md` half is still
> genuinely unanswered (19 days). Its `mc-hooks-manifest-blindness.md` half is now stale — that gate
> carries `Answered: 2026-09-26T23:54:34+05:30 — APPROVED` — appended as a `checker_note`, row stays
> open on the remaining half.
>
> **ISS-326 flipped open→fixed.** `qa/manifests/u2-4-phase3-precision-regate.md` is now tracked
> (`git ls-files` confirms; landed in `72c212f`) — no longer one `git clean` from deletion. The
> manifest legitimately stays paused; that is unrelated and unchanged.
>
> **Verified-safe from Shard 3, not filed:** `task-scheduler.ts:131` (already ISS-317, jobKey
> regex-validated), `gws-calendar.ts:53-60` (array args, internal values), `ai-transport.ts:62-71`
> (shell:false + error handler), `controller-state.ts:86-90` (documented intentional fallback).
> `demo-live.mjs`'s `--up` path and `record-commands.ts`'s `runLogin` are real but LOW, filed
> file-don't-fix (ISS-338/339) per D-013 — never pulled as units on their own.
>
> **Gate ages re-confirmed, nothing new filed:** `d015-generalisation-scope.md` 18d,
> `handshake-liveness-contract-start.md` 18d, `ledger-shard-union-hook.md` 19d,
> `obs-windows-loc-split.md` 0d (now ledgered as ISS-340), `iss-322-multifile-shape.md` 0d (fresh
> HUMAN_GATE on the ISS-322/333 fix shape, status `pending`). `.goal/goal.json`'s uncommitted diff
> is `updated`/`last_deterministic_tick` timestamps only — confirmed by `git diff`, north_star
> unchanged since `9841ec9` — **not** goal drift. `qa/.regrill-due` confirmed absent.
> `qa/gates/plan-approved-u4-watch-dashboard.md` — the live-recording... no, the **U4 plan** gate the
> maker opened this turn for `u4-watch-dashboard` — confirmed **exists** (was mid-write by the
> concurrent maker session; not touched or judged by this sweep).
>
> **Token line + qa-prose ratio.** Re-ran `token_scan.py` myself rather than trusting the pasted
> figure (checker discipline: re-derive, don't trust): **main 226.4M / sub 347.0M / opus_sub_share
> 0.0 / 40 sub_agents / 8 auto-compactions / 0 classifier outages** at 2026-09-27T17:07:16 (appended
> to `qa/token-ledger.jsonl`), a few minutes later than shard 3's own 219.6M/337.8M/39 reading and
> consistent with continued session activity in between — not a discrepancy. The qa-prose-to-source
> ratio ("flat 4.39→4.40") was **not** independently reproduced with shard 3's exact method (a quick
> re-derivation using a different file-glob got 2.69, almost certainly a denominator-set difference,
> not a contradiction) — reported here as **unverified-but-plausible**, not re-derived fact. Code-graph
> check confirmed **SKIP**, not zero: `python -c "import graphify"` → `ModuleNotFoundError`.

- GRILL: web-fallback vs Phase-1 exit — ask-web-fallback-tavily records the unwired seam as production
  default while the north star's Phase-1 exit requires off-corpus web fallback; wire-it-or-sign-the-honest-limit
  is an Approver amendment (ISS-274). **Still open, 5+ days, no ruling** — carried forward unchanged.

## Prior top 3 (backlog-priority order, refreshed 2026-09-27T17:1x sweep; superseded by the 2026-09-28 list above)

Tier stated per this repo's rule. **Tier 1** (top clear `QUEUE.md` TODO row): empty — 0 TODO rows.
**Tier 2** (open critical/high) has live, freely-buildable material this time, so it governs picks
1–2. Both open **criticals** remain not-pullable, unchanged from last sweep: **ISS-104**
(round-capped at ≥6 PASSes on a non-security seam, file-don't-fix per D-014) and **ISS-282**
(deliberately paused). **Tier 3 (next unblocked roadmap task) is stated per D-013's "not optional,
not last"** — pick 3 below.

1. **ISS-337 (high, new this sweep) — `launchObsNormally` (obs-windows.ts:112-120) can crash the
   controller on an unattended cold start.** No `.on("error", ...)` on the spawned OBS process, no
   try/catch at its only call site (`obs-guard.ts:103`). Freely buildable now — no gate blocks it.
   Same defect family as ISS-323/324, in the same file the unit that fixed those just hardened, on
   the sibling function nobody touched.
2. **HUMAN_GATE: `obs-windows-loc-split.md` (ISS-340, high, new this sweep).** Blocks resolving the
   live structural-lint regression (`obs-windows.ts:352` vs budget 300) the `live-record-repair`
   merge left on master. Umesh's answer (a/b/c) is the only way to close it; option (a), the file
   split, is the maker's own recommendation.
3. **U4.1 (tier 3, roadmap — TASKS.md:112, goal.json, status `open`/`pending`, no deps) — Recording/
   file upload wired to a real transcribe worker.** Genuinely unblocked: `workers/transcribe` is a
   3-line placeholder, the real `packages/ingest` recording adapter already exists and is unwired.
   Named per D-013's rule that this tier is never skipped in favor of only continuing tier 2.

**Also gated, not neglected:** ISS-333/ISS-322 (the sender-spoofing fix) sits behind a *fresh*
(0-day) HUMAN_GATE `qa/gates/iss-322-multifile-shape.md` — Umesh already answered the policy
question; this second gate asks where in the code to enforce it (a 3-file, edit-in-place shape).
Not yet answered; not stale enough to be a governance problem the way the 18–19-day gates are.

**Footnote, not filed:** `.goal/goal.json` U0.10 reads `status: pending` while `TASKS.md:93` reads
`in_progress` — the same tracker-divergence shape ISS-276 already tracks; left for that row's next
refresh rather than minting a duplicate, since this sweep's dispatch did not ask for a fresh
tracker audit.

## Superseded top block (2026-09-27T13:4x+05:30 sweep — kept for its own findings below)

> Bound to `D:/KnowledgeBase`, range `97674cb..213d2ac` (HEAD `213d2ac`, 45 commits), sweep due on
> both triggers (`.last-sweep` 351 min old AND HEAD moved off its recorded SHA). Invoked directly by
> Umesh ("you are the /checker"), 3 read-only shards + this consolidation as single writer. Mode A
> not run: **no manifest sits at `ready-for-check` with a missing or lower-cycle verdict**, so there
> was no unit to check. **Terminal state: FINDINGS: 6 new (ISS-325 high `close-out-skipped`; ISS-326
> medium `untracked-manifest`; ISS-327 medium `verified-stagnant`; ISS-328 medium `contract-gap` U5;
> ISS-329 medium `contract-gap` notify-channels; ISS-330 low file-don't-fix delegation row) + evidence
> appended to 8 existing open rows (ISS-129, ISS-274, ISS-275, ISS-276, ISS-301, ISS-307, ISS-310,
> ISS-311) rather than minting new ids.**
>
> **The finding worth reading first — ISS-325.** `mc-hooks-bolded-status` is PASS cycle 1 and merged
> (`86ba98d`), but its close-out commit `6558508` is a ONE-LINE diff that edited a **prose example at
> line 22** instead of the manifest's real `**Status:**` line at **line 198**, which still reads
> `ready-for-check`. So the session-start hook's "PASS not closed out: 1" is **correct**. The irony is
> load-bearing, not decorative: this unit's whole subject was Status-line parsing, and line 22 was its
> record of which forms used to be invisible to the hooks — that record is now false. Likely root
> cause: a close-out that string-replaces `ready-for-check` hits the FIRST occurrence, which in a
> manifest *about status strings* is a fixture. The fix is the same anchoring D-034 gave the hooks.
>
> **ISS-307 mechanism corrected mid-sweep.** The dispatch brief asserted the hook reads line 1 =
> `MISSED_WAKEUP`. Shard 2 disproved that: `qa/.last-tick` is append-only **oldest-first**, so
> `mc-sessionstart.ps1:47`'s `-TotalCount 1` reads the 2026-09-24 tick, whose prose embeds the
> substring `... STALLED (HUMAN_GATE)`; line 49's regex fires on that substring and line 48's
> `($lt -split '\s+')[2]` yields `ADVANCED`. So it is **two** compounding bugs (oldest-line read +
> substring match inside prose), and the row's title captures only the first. `STALL UNDIAGNOSED:
> ADVANCED` is a **false positive** — no `/agent-debugger` run is owed, and the one genuinely STALLED
> unit already has its report at `qa/debug/delivery-gate-manifest-blindness-cycle3.md`.
>
> **Verified, not filed.** Pair-state clean across all 18–19 units in range, reading every verdict's
> FULL cycle history rather than its first `VERDICT:` line (u5 FAIL-c1→PASS-c2, u0-zoom-iframe
> FAIL-c1→FAIL-c2→PASS-c3, t-047-controller FAIL-c0→PASS-c1 all match their manifests): no
> check-pending, no fix-gap, no bypass, no unmanifested code merge. Maker **not** asleep (ticks
> ADVANCED/HUMAN_GATE through 12:47 today; the 09:44 `MISSED_WAKEUP` self-recovered by 09:57) — no
> ISS-054 recurrence. Enforcement liveness **CLEAN**, including the one thing that looks broken and
> is not: the project-level DECISIONS guard is deliberately absent per **D-023** (Approved-by Umesh,
> latency), and the user-level `aios-write-guard.ps1` was independently confirmed registered and
> emitting the identical `deny` — a documented consolidation, not a dead gate, so **no
> `approval-required` finding** under the Lab Protocol clause. `qa/adapter.json` absent → data-boundary
> check **out of scope by design**, no PII scan run. Delegation: 6 rows, every `(task_class, executor)`
> at n=1, far below the 10-unit floor → **no QUARANTINE**; the one `ollama/*` manifest
> (`speakers-degraded-scope`) has a real `run` dispatch row → **no delegation-bypass**. `qa/loop.md`
> lists all seven terminal states verbatim. Checks 7 and 9 both returned **zero** new rows:
> `task-scheduler.ts`/`schedule-tick.ts`/`sync-session.mjs`/`run-watch.mjs` all propagate or surface
> failures (no sibling of ISS-323's exit-0 mask), and this window's `BrainPage.tsx`/`CalendarPage.tsx`
> churn is **convergent extraction into newly-tested modules**, which is the opposite of erosion.
> ISS-310's precondition is now RESOLVED (`qa/gates/plan-approved.md` exists, 3 `Answered:` lines,
> 149-slug `Backfilled:`; 0 `built-before-plan`, 0 `feature-without-plan`) but the row is **left open
> on purpose** — closing it needs a `regression_check`, the only honest one is a file-existence
> assertion, and that is in neither allowed form, so inventing one is exactly the D-015 substitution.
>
> **Three gates genuinely unanswered, searched for an off-disk answer and found none** (so no
> `gate-answered-off-disk` finding, which requires an actual answer): `d015-generalisation-scope.md`
> **18d**, `handshake-liveness-contract-start.md` **18d**, `ledger-shard-union-hook.md` **19d** — the
> last of which is the direct blocker on ISS-129, since `mc-sessionstart.ps1:5` still hardcodes
> `$LEDGER = 'qa/issues.jsonl'` and therefore undercounts by exactly **20 open rows** (union: 366 rows
> / 138 open at dispatch vs the hook's 118).
>
> **`.goal/goal.json` deliberately NOT touched this sweep.** U5 PASSed and merged while `TASKS.md:126-128`
> and `goal.json` both still read T-036/T-037/T-038 open/pending. Prior sweeps closed a goal task only
> where `TASKS.md` **already** agreed; closing `goal.json` alone here would manufacture the mirror
> divergence, so it is recorded as ISS-276 evidence and left to the maker to close in both trackers.
> Token line appended verbatim from shard 3 (`opus_sub_share` **0.0**, 31 sub_agents, 0 classifier
> outages, 6 auto-compactions).

- GRILL: web-fallback vs Phase-1 exit — ask-web-fallback-tavily records the unwired seam as production
  default while the north star's Phase-1 exit requires off-corpus web fallback; wire-it-or-sign-the-honest-limit
  is an Approver amendment (ISS-274). **Re-confirmed live this sweep, 5 days open, no ruling.**

## Prior top 3 (backlog-priority order, refreshed 2026-09-27T13:4x sweep; superseded by the 2026-09-27T17:1x list above)

Derivation, stated per this repo's rule that every tick names its tier. **Tier 1** (top clear
`QUEUE.md` TODO row): empty — 0 TODO rows. **Tier 2** (open critical/high) therefore governs, and
Umesh chose strict severity order over a live-failure override this sweep. Both open **criticals**
resolve to *not pullable*, which is why the list below is all high:

- **ISS-282** (critical, phase-3 precision re-gate) — its unit is deliberately paused
  (`qa/.paused.u2-4-phase3-precision-regate`), i.e. gated, not neglected. See ISS-326 for the real
  defect there (the manifest is untracked).
- **ISS-104** (critical, naming-cue fabrication, `speaker-resolution-llm`) — **round-capped**. It is
  a correctness/fabrication finding, not D-014 security class, and that seam already carries ≥6
  PASSed verdicts (`speaker-resolution-llm`, `-deterministic`, `-whitespace-guard`, `speaker-apply-write`,
  `speaker-denylist-ledger-corpus`, `speakers-degraded-scope`) against a cap of 2. Per D-014 it is
  `file-don't-fix`; if it is judged unsafe to ship at 5/20 attacks still resolving, the route is a
  **HUMAN_GATE**, never round N+1.

1. **ISS-323 (high, today) — `start-record-detached.ps1` fails silently and exits 0.**
   `Start-Process -FilePath pnpm` (line 38) resolves the pnpm **sh shim** ("%1 is not a valid Win32
   application"), still prints `started detached record: pid <empty>`, and exits 0; separately any
   `.cmd` shim re-parses argv through `cmd.exe`, so an unquoted `&` in a Zoom join URL splits the
   command. First in the chain — nothing downstream can run until the launcher reports honestly.
   Security-adjacent only in the argv sense; the **exit-0 mask** is the defect. Shard 3 swept for
   siblings of this pattern across the record path and found **none**, so it is contained to this file.
2. **ISS-324 (high, today) — `lkb record` dies with "bot browser did not open the page (timeout)".**
   On the live Ashoka run, with correct argv, 5 GB RAM free and no leftover bot-profile Chrome —
   while the *same* `data/bot-profile` opened `zoom.us/myhome` fine under `SB(uc=True, headed=True)`
   at 08:30. Suspect the page-open wait in the record controller or `sb_join.py`'s startup handshake.
   **This is the one that cost a real recording**: the Ashoka Educator Dialogues webinar of
   2026-09-27 was NOT captured.
3. **ISS-322 (high, today) — no sender authentication upstream of the trusted-sender policy.**
   `gws-gmail.ts`'s `extractEmail(header(headers,'From'))` carries **all four** default trusted
   entries with no SPF/DKIM/DMARC check, so any spoofed `From` delivered to the scanned inbox is
   fully trusted. Umesh already answered its gate (a) *email authentication*. Couples directly to
   **ISS-328** (filed this sweep): U5 shipped with no contract at all, so this invariant is currently
   written down nowhere.

**Cheap maker chore, not a unit:** ISS-325 is a two-line manifest repair (flip line 198 to
`checked-PASS`, restore line 22's prose example). It clears the "PASS not closed out: 1" banner and
should ride along with whatever tick runs next — the checker cannot do it (never edits a manifest).

**Contracts owed, both human-gated as initial creations:** ISS-328 (U5 auto-record — cite Umesh's
2026-09-26T23:54:34 "go on i approve" rather than re-asking the policy; what needs sign-off is
whether ISS-322's sender authentication is a hard `[I*]`) and ISS-329 (notify-channels — D-035 says
it was owed *before* U3 was re-checked, and U3 has already PASSed and merged).

## Prior sweep header (2026-09-26T23:0x+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Bound to `D:/KnowledgeBase`, range `c9959bf..802c52c` (HEAD `802c52c`) at dispatch; sweep writer
> runs solo (a parallel `/maker` session may be live in the same tree — this consolidation re-read
> every writable surface immediately before each edit and touched only checker surfaces + a narrow
> commit). **Terminal state: FINDINGS: 3 new (ISS-308 medium ledger-schema: 210 fixed/verified
> ledger rows across the union — 137 fixed + 73 verified, re-derived by direct grep — carry no
> `regression_check` field at all; ISS-309 medium delegation-health: `qa/delegation-ledger.jsonl`
> absent while `qa/manifests/` has had 9 units built since 2026-09-22; ISS-310 medium
> plan-gate-uninitialised: `qa/gates/plan-approved.md` absent, one finding per SKILL 1d rather than
> a per-manifest check) + evidence appended to 2 existing open rows rather than minting new ids
> (ISS-054 RECURRENCE: the maker heartbeat went silent ~33h after the u2-live-repair HUMAN_GATE
> with ZERO `MISSED_WAKEUP` lines — vs 5 for the prior gate — though re-derived that every
> reachable unit is currently gated, so this reads closer to correctly-idle than asleep-with-work-
> waiting; ISS-276 NEW INSTANCE: the vivid-donut plan's U0-U3 units shipped+merged
> (e6f0b72/9c52a27/0b8c3cf/a21bc16, all confirmed present) with no TASKS.md/goal.json id at all —
> a different divergence shape than ISS-276's original status-mismatch — and U4-U6 remain equally
> untracked) + 2 `.goal/goal.json` tasks closed via `goal_cli.py done` (T-031, T-033 — re-derived
> against PASS/merge commits `4c87be0`/`bf653fe` and `f0b9c91`/`5262deb`, both already `done` in
> TASKS.md at :121/:123 before this sweep touched goal.json) + 1 feedback-inbox entry marked
> folded (the 2026-09-25T11:3x Umesh source-watcher request — addressed by the U0-U3 build; U4-U6
> remain open per the ISS-276 note above; the fresh 2026-09-26 /rlcd suggestion is left unfolded,
> a maker-owned decision, not a build item yet).**
>
> **Verified, not filed:** no new bypass in `c9959bf..802c52c`; `qa/adapter.json` still absent
> (data-boundary check out of scope by design); no fix-cycle reached 3 in this window; no new
> silent-failure/erosion finding beyond what shard 3 already had on file (`ingest-chain.mjs:87`
> unchecked indexer return = ISS-305's root cause, fix `87df8e8` unmerged pending u2-live-repair;
> `notify-channels` fire-and-forget is documented design, not a defect). ISS-301 (opus share)
> gets a fresh evidence note only: `opus_sub_share` 0.0 this window, improved from 0.409 — not
> closed, its criteria don't ask for a single-window read. Gates confirmed still unanswered:
> `d023-supersede` (17d), `mc-hooks-manifest-blindness` (17d), `u2-live-repair` (1.5d),
> `zoom-bot-signin` (URGENT — Ashoka Educator Dialogues webinar, deadline Sun 2026-09-27 ~10:00
> IST). `qa/gates/ram-for-t-031.md` and `qa/gates/meeting-bot-phase-2-start.md` both already carry
> `Answered:` lines — no off-disk-answer action needed there. Token line appended verbatim from
> shard 3 (`opus_sub_share` 0.0, `sub_agents` 3, 0 classifier outages, 2 auto-compactions).

## Prior sweep header (2026-09-25T04:4x+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Bound to `D:/KnowledgeBase`, master @ `7eb55f7` at dispatch; sweep writer runs solo (a parallel
> `/maker` session, knowledgebase-b6, is live in the same tree, and a Mode A checker for t-030 may
> run goal_cli.py on `.goal/goal.json` concurrently — this consolidation touched only checker
> surfaces + a narrow commit). **Terminal state: FINDINGS: 2 new (ISS-302 medium: u2-4 live-eval
> pause has no durable per-unit marker; ISS-303 low, file-dont-fix: `reconnect-gaps.ts` bare
> `Number()` coercion, dormant) + evidence added to 3 existing rows (ISS-178 recurrence on
> t-030-telegram-alerts; ISS-300 worsening with an in-progress fix; ISS-301 refreshed
> `opus_sub_share` 0.409, down from 0.53) + 1 row moved `open → verified`** (ISS-299 — T-047 now
> reads `done` in both `TASKS.md:137` and `.goal/goal.json`) + `.goal/goal.json` **T-029 closed**
> via `goal_cli.py done` (re-derived: PASS `9eb5307`, merge `dd07aa2`, close-out `2299de5`, TASKS.md
> flip `7eb55f7` — all four already on disk before this sweep touched anything).
>
> **Concurrency note, RESOLVED while writing this sweep:** `.goal/goal.json` picked up a
> **T-030 → done** close (`completed: 2026-09-25T04:41:17`) mid-sweep that this sweep did **not**
> make. At first observation `qa/verdicts/` had no `t-030-telegram-alerts.md` and `TASKS.md:120`
> still read `open`, so this sweep correctly declined to reopen it (a live Mode A checker
> mid-committing is not a bypass, and the setup note explicitly anticipated the race) rather than
> risk a write-collision. HEAD then moved `7eb55f7 → c9959bf` before this sweep's own commit:
> `d3cefbf` (checker PASS t-030-telegram-alerts cycle 0, 9/9 capability rows re-verified, C6/C10
> held), `1649da9` (merge), `c9959bf` (close-out, TASKS.md:120 now `done`). The earlier flag is
> now moot — the close was earned, not premature. **The dead-checker evidence added to ISS-178
> still stands on its own facts** (a real checker attempt on this unit did die with no verdict and
> no dispatch marker, per the shard's own re-derivation before this later checker was dispatched
> to replace it) and is left as a recurrence record, not retracted.
>
> **Verified and closed, re-derived from disk:**
> - **T-029** — cycle-0 PASS (`9eb5307`), merge (`dd07aa2`), close-out (`2299de5`), TASKS.md flip
>   (`7eb55f7`) all present at HEAD. `.goal/goal.json` T-029 still read `pending`. Closed by this
>   sweep via `goal_cli.py done --task-id T-029`.
> - **ISS-299** — T-047's tracker gap (the prior sweep's own finding) is now fully closed:
>   `TASKS.md:137` reads `done` (maker commit `5842d1f`) and `.goal/goal.json` T-047 already read
>   `done` (closed by the prior sweep). Moved `open → verified`.
>
> **Shard findings verified and folded (not filed as new ids):**
> - **(a) t-030-telegram-alerts dispatch gap** — real: manifest committed to
>   `wave/t-030-telegram-alerts` (`883c7b2`, Fix cycle 0, `Status: ready-for-check`), no verdict
>   file at any cycle, no `qa/dispatch/` marker (only `golden-set-sibling-ambiguity.json` present),
>   `TASKS.md:120` still `open`. Added as a `RECURRENCE` note directly on **ISS-178** (the row this
>   defect class already owns), not a new id.
> - **(b) u2-4 fix-cycle-2 live-eval pause durability** — real: `qa/.last-tick` records the pause
>   in prose only (lines 31/33/35), no `qa/.paused.<unit>` marker exists (the only pause-shaped file
>   on disk, `qa/.paused.lifted-2026-09-24`, is unrelated — 0 bytes, a different already-lifted
>   repo-wide pause). Filed as **new medium ISS-302**, not appended to ISS-250: ISS-250 is
>   specifically a HUMAN_GATE-decision durability defect (needs an `Answered` field); this is
>   operational pause-state durability (needs a resume-condition marker) — same class, different
>   fix shape, and this ledger's own precedent (ISS-276/288/299) is to file same-class instances
>   as separate ids rather than conflate them.
> - **Clean, verified:** bypass — none in `aa220b4..7eb55f7` (9 commits, all covered by
>   PASS/merge/close-out or the prior sweep's own consolidation commit); t-029/t-032 cycle stamps
>   consistent; feedback-inbox has 0 fresh unfolded entries (last folded 2026-09-25, the D-030
>   c4-heading-form note); contracts unchanged in range; `qa/.last-tick` liveness current (last
>   line 2026-09-25T04:33:39, ADVANCED).
> - **135 fixed vs 72 verified, judged NOT worsening** — re-derived at `aa220b4` (prior sweep) the
>   union was 136 fixed / 64 verified (gap 72); at `7eb55f7` (this sweep, before its own edits) it
>   was 135 fixed / 72 verified (gap 63). The gap shrank by 9 as this sweep's own re-verifications
>   (ISS-288 and 7 others → `verified` at the prior sweep, ISS-299 → `verified` at this one) moved
>   through it. No low row filed.
>
> **Structural + spend signals (never a blocker):**
> - **ISS-300 (medium, structural-erosion), WORSENING** — `record-commands.ts` gained two more
>   touching units since the prior sweep (t-029 `+6/-1`, t-030 `+20/-2`, both untested) but a fix is
>   now in flight: the t-033 lane (uncommitted, `wave/t-033-bot-tests`) has added a 147-line
>   `record-commands.test.ts` naming ISS-300 in its own header.
> - **ISS-301 (low, token-spend)** — `opus_sub_share` improved to 0.409 (from 0.53), still over the
>   25% signal threshold; `sub_agents` up to 50.
> - **ISS-303 (low, file-dont-fix)** — `reconnect-gaps.ts` `collectGapEvent`'s bare `Number()`
>   coercion on a gap event's start/end silently produces `NaN`, which later throws inside
>   `finalizeRecording` rather than failing at the source. Dormant today: the only emitter
>   (`sb_join.py`) always sets both fields.
>
> Token line appended 04:35:20 (main 564.6M / sub 526.4M, `opus_sub_share` 0.409, `sub_agents` 50,
> compactions 2, outages 0). `.last-sweep` stamped at HEAD `c9959bf` (the true tip at write time,
> after the concurrent t-030-telegram-alerts PASS/merge/close-out landed — this sweep's own commit
> touched only checker surfaces + `.goal/goal.json`'s T-029 close, no code).

## Prior top 3 (backlog-priority order, refreshed 2026-09-26T23:0x sweep; superseded by the 2026-09-27T13:4x list above)

1. **[HUMAN_GATE, URGENT]** `zoom-bot-signin` — the Ashoka Educator Dialogues Zoom webinar
   (2026-09-27 ~10:00 IST) requires an authenticated Zoom account to join past the web-client wall
   (ISS-U0-2); the bot has no Zoom credentials anywhere. Only Umesh can resolve (sign the bot's
   profile in, or ask the host to disable the auth requirement) — deadline is tomorrow morning.
2. **[HUMAN_GATE]** `u2-live-repair` — classifier refused live repair on the u2-4-phase3-fix seam;
   root causes of ISS-304/305/306 (source-watcher truncated-transcript, unindexed-session,
   session-id derivation bugs) are already found and a fix (`87df8e8`) exists unmerged. This gate
   also blocks the U4 dashboard and U6 units of the vivid-donut plan. Unanswered 1.5 days.
3. **[tier 2 — open critical ledger issue] ISS-104** — speaker-resolution-llm, critical, still
   `open`, HELD behind the paused `u2-4-phase3-fix` (needs ≥8 GB RAM per the user's standing
   request) — same seam as the U5 auto-record classifier block, also awaiting Umesh.

**Also open, not in the top 3:** two long-standing Approver gates remain unanswered —
`d023-supersede` (17 days) and `mc-hooks-manifest-blindness` (17 days) — both pre-date this
sweep's window and are re-confirmed still open, not re-filed. `u2-4-phase3-fix` cycle 2's live
eval remains **paused by the user** (RAM ceiling; durability tracked as **ISS-302**) — resume is
a maker/human call, not a checker action. Tier-3 roadmap (`T-031`/`T-033`) is now closed —
see the goal.json closes above; next roadmap item is whatever `qa/QUEUE.md`'s maker-owned
TODO rows or the T-047→T-029→T-030→T-032→T-033 sequence's successor names.

## Prior sweep header (2026-09-25T02:xx+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Bound to `D:/KnowledgeBase`, master @ `b60b9fc` at dispatch; sweep writer runs solo (a parallel
> `/maker` session, knowledgebase-ef, is live in the same tree — this consolidation touched only
> checker surfaces + a narrow commit). **Terminal state: FINDINGS: 5 new (ISS-299 medium, ISS-300
> medium, ISS-301 low) + 8 ledger rows moved to `verified` on re-derived evidence** (ISS-288,
> ISS-291, ISS-292, ISS-293, ISS-294, ISS-295, ISS-296, ISS-297) + 3 `.goal/goal.json` tasks closed
> (T-047, U4.2, U2.6) via `goal_cli.py done`.
>
> **Verified and closed, re-derived from disk (not from the shard reports' say-so):**
> - **T-047** — cycle 1 PASSed (`8c1cfc1`) and merged (`784df67`) 2026-09-25T00:31; `.goal/goal.json`
>   still read `pending`. Closed. **ISS-299 (medium, tracker-integrity)** filed for the tracker gap
>   itself, since goal.json and TASKS.md do not self-update on merge.
> - **U4.2** — "ONE real meeting-bot joiner; quarantine the other two." `webinar-bot-live` cycle 2
>   PASS (`c21355e`, merged `856d31b`) confirms one live browser joiner (Zoho webinar, OBS-recorded)
>   and the Vexa/system-audio stub language correctly re-scoped to those two only. Closed. ISS-294/
>   296/297/291 (all COVERED per the cycle-2 verdict's own capability table) moved `open → verified`.
> - **U2.6** — "Real graph_edges rows + merge at the route boundary." Re-derived independently
>   against `qa/contracts/brain-knowledge-graph.md` [C1] and the U-BRAIN verdict (`a264c49`): `/graph`
>   now unions `tree_index` + `graph_edges`, and `apps/api/src/routes/graph.ts`'s stale "ZERO real
>   rows" disclosure is corrected in the same change. Closed. ISS-295 moved `open → verified`; ISS-292
>   (brain-knowledge-graph, 7/8 criteria MET) and ISS-293 (calendar-grid-ui, 8/9 MET) also moved
>   `open → verified` — both manifests read `checked-PASS`, closed out by the maker 2026-09-25, and
>   neither had been reflected in the ledger yet.
> - **ISS-288** (the prior sweep's tracker-divergence finding for U4.2/U2.6) moved `fixed → verified`
>   — its fix_direction asked only for `pending → in_progress`; this sweep verified the underlying
>   work and closed both tasks outright, which is a strict superset.
>
> **Shard findings NOT filed, verified against disk:**
> - **t-029-reconnect stale-builder state** — real (`sb_join.py`/`test_sb_join.py` modified,
>   uncommitted, mtimes 01:02/02:11), but `qa/.last-tick`'s own most recent line already documents
>   "t-029 dead amendment builder re-dispatched" — known and in hand, not filed.
> - **u2-4-phase3-fix cycle 1** — `ready-for-check` (`6256e94`) with the maker's own checker already
>   dispatched. Not a gap.
> - **Untracked `qa/manifests/u2-4-phase3-precision-regate.md`** — confirmed a stale cycle-0 copy
>   (`Status: ready-for-check` at Fix cycle 0, superseded by the cycle-1 rework on
>   `u2-4-phase3-fix`). Low-severity leftover, not an issue; left untouched (not a checker-owned
>   surface to clean up).
> - **Six standing HUMAN_GATE files remain unanswered** (only Umesh can close these — not filed,
>   per dispatch): `enforcement-hooks-unauthorized-and-live-regressed.md`,
>   `d015-generalisation-scope.md`, `d023-supersede.md`, `ledger-shard-union-hook.md`,
>   `mc-hooks-manifest-blindness.md`, `ui-surfaces-test-file-exclusion.md`.
> - **`lane-data-isolation` contract** — status `proposed` (encodes Umesh's option-D answer on
>   `qa/gates/lane-writes-shared-database.md`); the maker has not yet built to it. Not a sweep
>   finding — noted for the maker's own backlog.
>
> **Structural + spend signals (never a blocker):**
> - **ISS-300 (medium, structural-erosion)** — `packages/meeting-bot/src/capture/record-commands.ts`
>   (270 lines) rewritten across 5 units (`21a2efe`, `fd74864`, `cfaf464`, `1e1a84e`, `b303a5f`); its
>   siblings `controller-state.ts`/`watchdog.ts` each got a dedicated `.test.ts`, it did not.
> - **ISS-301 (low, token-spend)** — 2026-09-24 `opus_sub_share` 0.53 (38 subagents, 11 Opus),
>   driven by wave concurrency (peak 5), not any single fix-cycle-3 manifest.
>
> **Top-3 recommended next units** (project tier order — tier 3 roadmap is not optional):
> 1. **[tier 3 — roadmap, mandatory]** `T-033` — "Tests (fake OBS client failure paths, audioPath) +
>    /checker PASS for the phase-0 bot." Unblocked: its stated dependency `T-032` now reads `done` in
>    goal.json (peer-checker PASSed since the last sweep). Continues the user's standing P1 sequence
>    (T-047 → T-029 → T-030 → T-032 → **T-033**). TASKS.md:123 already notes "closes U4.2" — verify
>    that framing still holds now that U4.2 closed via the webinar-bot-live route instead; if T-033's
>    own scope is already subsumed, say so in its manifest rather than silently dropping it.
> 2. **[tier 2 — open critical ledger issue]** `ISS-104` — speaker-resolution-llm, critical,
>    2026-09-08, still `open`: the cycle-2 naming-cue rule does not close C2b (a cue phrase adjacent
>    to any capitalised non-name still ships a fabricated person). Related to but distinct from the
>    in-flight `u2-4-phase3-fix` cycle (that unit targets the phase-3 precision re-gate bars; ISS-104
>    targets the underlying cue-rule false-positive class). Pick up once `u2-4-phase3-fix` cycle 1's
>    verdict lands, on the same files, to avoid a collision.
> 3. **[tier 3 — roadmap]** `T-031` — "Live audio watchdog via OBS meters (>2 min silence → alert +
>    reconnect)." Unblocked (no deps in goal.json), not yet started, next in the meeting-bot roadmap
>    sequence after the T-029/T-030/T-032/T-033 SERIAL chain clears.
> 4. **[maker-owned, not a checker surface]** Flip `TASKS.md` trackers to match the goal.json closes
>    this sweep made: `T-047` (line 137, open → done, cite `784df67`/`8c1cfc1`), `U2.6` (line 110,
>    open → done, cite `a264c49`), `U4.2` (line 113, in_progress → done, cite `c21355e`/`856d31b`).
>    Per project CLAUDE.md, TASKS.md is not checker-writable — queued for the maker.
>
> Token line appended 02:06:45 (main 520.2M / sub 405.9M, opus_sub_share 0.53, sub_agents 38,
> compactions 2, outages 0). `.last-sweep` stamped at HEAD `b60b9fc` (unchanged by this sweep — no
> code commit made; ledger/inbox/queue/goal changes only).

---

## Prior sweep header (2026-09-24T22:1x+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Range: `3ca44fb..HEAD` (HEAD `b1c9d01`) + working tree. **Terminal state: FINDINGS: 1 new (ISS-288,
> medium)** — everything else this sweep's shards proposed either duplicated live checker output
> that landed mid-sweep, was already authorized/disclosed, or did not hold up on verification.
> Concurrency note: this sweep ran WHILE two Mode A checkers were active on the same tree —
> `u2-4-phase3-precision-regate` (FAILed cycle 0 at `b1c9d01`, minted ISS-282..284, fix cycle 1
> since dispatched) and `webinar-bot-live` (FAILed cycle 0, committed `97674cb` during this sweep,
> minted ISS-285..287, drafted `qa/contracts/meeting-bot-live-capture.md` T-024b DRAFT). Both are
> folded in below rather than re-derived. HEAD moved `b1c9d01`→`97674cb` mid-sweep; `.last-sweep`
> is stamped at the true tip.
>
> **Shard findings, verified against disk:**
> - **(a) bypass, disclosed** — `fd74864`/`cfaf464` (feature commits) landed before the
>   `webinar-bot-live` manifest (`2657bee`). This is D-027's explicit fast-track ("Umesh chose
>   build + live run today, manifest and /checker afterwards"), stated in the manifest's own Queue
>   tier line. Not a process violation; no ISS.
> - **(b) pair-state, resolved live** — both units flagged as ready-for-check with no verdict are
>   now answered: `u2-4-phase3-precision-regate` FAIL (`b1c9d01`) and `webinar-bot-live` FAIL
>   (verdict landed mid-sweep, `qa/verdicts/webinar-bot-live.md`, cycle 0, ISSUES-WRITTEN ISS-285,
>   ISS-286, ISS-287). No dispatch gap remains.
> - **(c) maker-liveness, NOT an ISS-054 recurrence** — `qa/.last-tick`'s prior history
>   (2026-09-10..09-21 entries) was replaced by a single 2026-09-24T21:56 line, and shard 1 read
>   this as a possible asleep-loop gap. Checked against `git log`: **zero commits exist between
>   `4aa9d13` (2026-09-22T16:28) and `fd74864` (2026-09-24T18:26)** — a ~50h gap with no maker
>   activity at all, not a live-but-unstamped session (ISS-054's defining trait is "real maker work
>   HAS happened since" the stale stamp). No work happened, so there is nothing for the tick file to
>   have missed; ruled EXPLAINED, no ISS. The `.last-tick` history truncation itself is cosmetic —
>   every prior tick's content survives in its own commit message.
> - **(d)** `.codex/` = ISS-268 (already tracked). No new.
> - **(e) inbox fold** — both named entries folded in `qa/feedback-inbox.md` this sweep (Gemini-vs-
>   qwen tracked via ISS-215 refresh; the 21:56 "/maker only" role reminder is process-only). ISS-215
>   refreshed: 0 fresh unfolded entries remain; its own open reason (6 unanswered Approver gates)
>   stands.
> - **(f) contract staleness, resolved live** — `qa/contracts/meeting-bot-capture.md` C3 vs the
>   shipped browser joiner: the `webinar-bot-live` Mode A checker drafted
>   `qa/contracts/meeting-bot-live-capture.md` (T-024b, DRAFT, supersedes C3 for the browser joiner)
>   during this sweep's window. No duplicate drafted; nothing further to file.
> - **shard 2(a) tracker-divergence, CONFIRMED, minted** — `.goal/goal.json` U4.2 and U2.6 both still
>   `pending` despite D-027/D-028 recording live, verified progress on both (U4.2 already reads
>   `in_progress` in TASKS.md — one status ahead of goal.json). Same class as ISS-276. **ISS-288,
>   medium** (tracker bookkeeping only, no auth/data-write surface, so not full-ceremony).
> - **shard 2(c) gate staleness** — `qa/gates/mongo-host-unreachable.md` appended: the `lkb` scope
>   answered per D-028's live write-and-read round trip; WhatsApp/T-007 persistence kept explicitly
>   open (endpoint reachable, database empty on 2026-09-24 — no linked account, a different blocker
>   than host reachability). `delivery-gate-manifest-blindness` remains STALLED (HUMAN_GATE), has its
>   own `qa/debug` report; enforcement liveness CLEAN.
> - **shard 3, check 7** — no scope (no PASSed units in range `3ca44fb..HEAD`). Informational:
>   `scripts/sync-webinar-session.mjs:167,178` (deleteMany-then-insert, no transaction) is left to
>   the `webinar-bot-live` Mode A checker's own fix-cycle scope, not filed here — none of its three
>   issued findings (ISS-285/286/287: lint-dirsize budget, missing capability-coverage table, undis-
>   closed touched files) cover it, so it is still open for that unit's next cycle to pick up or a
>   future sweep to file if it does not land.
>
> Token line appended 21:59:51 (main 188.6M / sub 24.6M, opus_sub_share 0.108, sub_agents 10,
> compactions 1, outages 0). `.last-sweep` restamped HEAD=`b1c9d01`.

---

## Prior sweep header (2026-09-22T16:05+05:30, superseded as routing; kept for its own findings below)

> Range: `5fab76e..HEAD` (4 commits; prior sweep stopped at HEAD `5fab76e`). **Terminal state: FINDINGS: 10**
> — ISS-266/267/268 (pair-state + mirror) · ISS-269..272 (silent-failure, high, filed-don't-fix under the D-014
> class cap) · ISS-273 (erosion signals) · ISS-274 (goal-drift → GRILL row) · ISS-275 (loop-design).
> Bypass: **none** (4 commits in range, all covered or process-surface).
> Pair-state: the SessionStart hook's "Checks pending: 1 [delivery-gate-manifest-blindness]" is ruled a
> **FALSE POSITIVE of the gated ISS-183 defect** (unanchored prose match at manifest :35/:47/:208 +
> `Select-Object -First 1` reading the 3-cycle verdict's first stamp as 1). True state: **pend=0 dispatch
> gaps; 1 fix-gap** (delivery-gate-stamp-adoption, 13 days — ISS-266). PASS-not-closed 0 and Queue-TODO 0
> are disk-true.
> Maker liveness: the maker-checker loop is **asleep ~15.5 h** (last tick 2026-09-22T00:30 HEARTBEAT-ARMED;
> no `qa/.paused`; ISS-054 recurrence, deduped). The /goal monitor ticks (last_deterministic_tick
> 2026-09-22T15:31) — the maker's ScheduleWakeup chain died with its session. Resume = `/maker continue`.
> **Correction 16:10:** the maker WOKE mid-sweep — `qa/gates/write-guard-contract-contradiction.md`
> (15:45, STALL reconciliation for write-guard-enforcement-gaps, options A/B/C) and
> `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/` (15:45–15:53, QUEUE item 2 in progress) appeared
> during this sweep. The 00:30→15:45 asleep gap is real; the loop is running again. No manifest at
> ready-for-check yet — no check raced.
>
> **2nd consolidation pass 16:19 (duplicate dispatch resolved):** a second consolidation landed over the
> same range and DEDUPED against the minted ten. Dropped as already minted/remedied: the "two manifests
> without Status" residue (both now carry `## Status: superseded-by …` from this sweep's marker-only
> folds), the asleep-gap row (deduped to the ISS-054-class record + correction above), and the .codex/
> row (= ISS-268). preflight.json mtime anomaly ruled EXPLAINED (last commit 16af160 is the ISS-256
> restore itself; content matches HEAD; index-stat noise). **6 new ids minted: ISS-276/281 (medium) ·
> ISS-277/278/279/280 (low)** — tracker-integrity residue (goal.json vs TASKS.md on T-021/U0.10, stale
> completed ts, stale T-008 dep, T-021/U0.10 dual-scope), superseded-contract markers, and client.ts
> churn-erosion with the auth-repair gate still unanswered. ISS-215 refreshed (the 16:05 Umesh
> Gemini-vs-qwen entry is the one fresh unfolded inbox item). Consolidation hint (extends ISS-214):
> three pending asks resolve to edits of `.claude/hooks/mc-sessionstart.ps1` — ledger-shard-union-hook,
> mc-hooks-manifest-blindness, and ISS-267's fix-gap branch — ONE combined Approver ask could settle all
> three. Gate count now 20 with the maker's new `write-guard-contract-contradiction.md` (Answered:
> \<pending\>). Token line re-scanned 16:19:22 (outages 10, Agent blocked 8; opus share 0.0).

- GRILL: web-fallback vs Phase-1 exit — ask-web-fallback-tavily records the unwired seam as production
  default while the north star's Phase-1 exit requires off-corpus web fallback; wire-it-or-sign-the-honest-limit
  is an Approver amendment (ISS-274)

## Prior top 3 (backlog-priority order, refreshed 2026-09-24 sweep; superseded by the 2026-09-25T04:4x list above)

1. **Maker duty — handshake, u2-4-phase3-precision-regate FAIL (cycle 0, same day)** — respond to
   ISS-282 (critical: gate's own precision/wrong-link/addition bars all fail on re-run), ISS-283
   (high: D-015 stability claim false, outer run 3 never executed), ISS-284 (medium: undisclosed
   evidence files + no-longer-reproducing corpus numbers). A FAIL verdict outranks every backlog
   tier. *(In progress: fix cycle 1 already dispatched per `qa/.last-tick` 22:04 — opus, lane
   `a-speakers`, experiment detached.)*
2. **Maker duty — handshake, webinar-bot-live FAIL (cycle 0, landed mid-this-sweep)** — respond to
   ISS-285 (high: `scripts/` dirsize budget breach, 32→33 files, the manifest's verify subset never
   ran the full `pnpm lint:structure`), ISS-286 (high: no Capability coverage table on a full-
   ceremony data-write unit), ISS-287 (low: untracked touched files + a stale STUB comment in
   `browser-joiner.ts`). Also closes T-033 once it PASSes. *(Not yet dispatched as of this sweep —
   verdict just landed; next maker tick should pick this up alongside #1.)*
3. **Tier 3 (roadmap, user's standing choice 2026-09-24) — webinar-bot P1 reliability**: T-047
   (record controller must survive console close + finalize-on-restart watchdog — today's own
   16:30:56 controller-death incident), then T-029 (auto-reconnect on connection-interrupted), T-030
   (Telegram status alerts), T-032 (OBS Safe-Mode/websocket-down guard), T-033 (folds into #2 above
   once that FAIL is answered). Both FAILs in #1/#2 are same-seam prerequisites for this tier, not a
   substitute for it — pull #3 once #1/#2 are answered, per the user's explicit ordering.

**Filed-don't-fix (D-014 class cap — non-security seam with ≥2 PASSes):** ISS-269/270 (speaker seam:
speaker-llm-windows, iss-255-handover-direction, speaker-run-agreement) · ISS-271/272 (golden-set/eval seam:
golden-set-semantic-leg, golden-set-regeneration, eval-baseline-control). A human may still pull them;
ISS-269/270 fold naturally into any future unit touching `speakers-llm.ts`. **ISS-104** (critical,
speaker naming-cue) is the only open critical besides today's ISS-282 and sits on the same capped
speaker seam per this repo's own precedent — pull decision belongs to a human; the u2-4-phase3 fix
cycle 1 already in flight is the natural venue if pulled alongside it.

## Umesh live requests, 2026-09-24 — product UI epic (checker-authored contracts, added by /checker)

Two direct user instructions this session, both grounded in a visible-browser validation run by the
checker the same evening. **These are independent of the two open FAILs above** — they touch
`apps/web/src/pages/BrainPage.tsx`, `CalendarPage.tsx` and `apps/api/src/routes/graph.ts`, no file
shared with the speaker seam or the webinar-bot seam, so they may run concurrently rather than
waiting on #1/#2.

4. **U-BRAIN — rebuild /brain as a real, drill-down, self-refreshing knowledge graph.**
   Contract `qa/contracts/brain-knowledge-graph.md` (proposed, checker-authored). Issue **ISS-292**
   (high). Umesh: *"it should look like a knowledgegraph aur like click krne mai we should get
   further details like drill down ... isko update bhi krte rhna hai along with new sessions."*
   Measured now: **0 rendered node labels** against 13 node shapes; `GET /graph` = 164 nodes/526
   edges from `tree_index` only; the 94 real `graph_edges` rows are read by **no route**; the
   2026-09-24 session has `chunks=0`, `session_pages=0` and is absent from `tree_index`, so it never
   reaches the graph. Full ceremony: it changes a read path, so [I1] requires the cross-tenant probe
   set to still pass.

5. **U-CAL — rebuild /calendar as a Google-Calendar-shaped grid with filters.**
   Contract `qa/contracts/calendar-grid-ui.md` (proposed, checker-authored). Issue **ISS-293**
   (high). Umesh: *"this calendar should and must look like google calendar along with filters and
   all."* Measured now: `CalendarPage.tsx` (191 LOC) renders `groupByMonth()` as stacked cards —
   no month/week/day grid, no hour axis, no overlap handling, no filter control, and past sessions
   and upcoming meetings sit in two disjoint lists. Renders the existing API only ([I1]); the
   timezone criterion [C9] is an automatic FAIL if a row shifts.

**Checker note on sequencing.** These are UI-surface units, so D-024 applies: each needs live
visible-browser evidence, and per the standing rule the live check is run by a CHECKER writing its
own script, never by the maker re-running its own. Both contracts name their verification probes.

## Checker note, 2026-09-24 — id-citation defect across concurrent lanes (NOT yet a ledger row, deliberately)

Two orchestrator sessions and several worktree lanes were appending to `qa/issues.jsonl` at once
this evening. Measured state at the time of writing: **zero duplicate ids, no row lost or altered**
— the ledger itself is intact. But `qa/verdicts/webinar-bot-live.md` carries
`ISSUES-WRITTEN: ISS-289, ISS-290, ISS-291, ISS-292`, and against the ledger union three of those
four resolve to **other units' rows**:

| cited | actually resolves to |
|---|---|
| ISS-289 | `speaker-resolution-llm` — circular citation-validity in `05-score.mjs` |
| ISS-290 | `speaker-resolution-llm` — no corpus pin |
| ISS-291 | `meeting-bot-live-capture` — correct, genuinely that unit's |
| ISS-292 | `brain-knowledge-graph` — filed by the checker for Umesh's /brain request |

**Why this is worse than a miscount.** D-015 requires a fix to be measured against its issue's OWN
recorded reproductions. webinar-bot-live fix cycle 2 is about to perform exactly that measurement;
if it resolves ISS-289 it will read the phase-3 scorer's row and measure the wrong thing. D-019
already named this: *"an audit trail whose references silently repoint is worse than an incomplete
one, because it still looks correct."*

**Root cause, stated for whoever builds the fix:** ids are chosen at READ time and written at APPEND
time, and everything bad happens in that window. The durable fix is to compute max-id over the union
and append in the SAME operation. Renumbering existing rows is forbidden (D-019).

**Why no ISS row yet, on purpose:** filing one now means allocating from the very counter that is
being contested by two live agents — the defect reproducing itself inside its own bug report. Both
owning sessions have been notified in writing and told to re-allocate from the current max and to
record their old→new mapping rather than hide it. **This row gets filed once the lanes settle**, and
until then this note is the record.

## State summary

- **2026-09-24 sweep update:** ids now run through ISS-288 (main ledger only in this repo; no
  `qa/issues.*.jsonl` lane shards exist — single-tree work). This sweep minted 1 (ISS-288, medium,
  tracker-divergence); the two concurrent Mode A checkers minted 6 more independently (ISS-282..284,
  ISS-285..287) — both folded above, not re-derived. Token-ledger line appended 21:59:51.
- Union ledger: 295 rows (273 main + 22 c-unrun-writers), ids ISS-001..ISS-275 + ISS-C-* 1..22, 0 duplicate
  ids. Open: 93 canonical / 99 union (10 new this sweep: 5 high, 3 medium, 2 low). Token-ledger line appended
  (opus_sub_share 0.0; no unit at fix cycle 3). [figures below this line are from the 2026-09-22 sweep;
  not recomputed this pass — see the 2026-09-24 update above for the delta]
- Mode A this session: **no new verdict** — delivery-gate-manifest-blindness is STALLED-closed at cycle 3 of 3
  (verdict d171d0c FAIL 5/9; disposition "do not open a cycle 4"). Residue: ISS-205 (regex fix for the next
  unit touching that hook block) + two Approver gates (mc-hooks-manifest-blindness, delivery-gate-c4-heading-form).
- Contract maintenance: 8 inbox entries folded into 6 contracts (ai-provider-seam; loop-safety ×4 lessons;
  golden-set-recall; schema-v2; ledger-shard-union-readers; tracker-integrity); 2 marker-only folds; 1 deferred
  (Umesh write-guard shape → write-guard.md is status `proposed`, applies on ratification). All additions;
  nothing weakened.
- Enforcement: wired+alive (5 project hooks registered + 2 user-level; D-006 carries `Approved-by: Umesh` and
  covers the wiring). Loop spec `qa/loop.md` present and consistent (seven terminal states; no adapter.json →
  no contradiction). `qa/adapter.json` absent → data-boundary check out of scope by design. Known gated hook
  defects live verbatim: ISS-183 (blindness/First-1), union-blind open-issue count (open ISS-129), and the new
  no-fix-gap-branch (ISS-267).
- Gates needing the Approver (pre-existing unless noted): d015-generalisation-scope · d023-supersede ·
  delivery-gate-c4-heading-form · mc-hooks-manifest-blindness · handshake-liveness-contract-start ·
  ledger-shard-union-hook · ui-surfaces-test-file-exclusion (Answered line empty) · loop-safety-contract-ratification ·
  enforcement-hooks-unauthorized-and-live-regressed (`(pending)`; absent from the prior list — folded into
  ISS-215 triage) · ISS-215 gate-queue triage · ISS-221 (atomic issue-id allocation) · **new: ISS-267** needs a
  gate file (enforcement path) — raise on the next maker tick · **new: ISS-268** .codex/ mirror disposition ·
  **new: ISS-274** web-fallback GRILL.
- Goal: north star unchanged since 2026-09-03; the uncommitted `.goal/goal.json` diff is tracker metadata only
  (updated ts/velocity/eta/last_deterministic_tick 2026-09-22T15:31). Coverage: Phase-1 surfaces covered
  (ingestion · tree+vector index · router · citations · tenancy/write-guard · Developer API); partial: meeting-bot
  capture, speaker attribution (phase-4 write blocked on the precision re-gate), live web fallback (ISS-274),
  head-to-head championship tier; missing: AI counsellor client contract (T-013 pending, no contract in
  qa/contracts/).
- Bypass: none — 7da0a41's source diff is exactly the two test files its manifest names (105→301 lint-loc claim
  misstatement already filed as ISS-265); 31e8534/baeb66f are process close-outs. Bookkeeping (covered by open
  ISS-C-UNRUN-WRITERS-013): iss-262-lint-loc-split's ready-for-check state never entered git history (verdict
  baeb66f cited an uncommitted manifest).
- `.last-tick` note: content is 2026-09-22T00:30 (HEARTBEAT-ARMED; two units landed) — age is the defect, ruled
  maker-asleep above (ISS-054 recurrence), not a hygiene gap.

## Historical sweeps (superseded as routing; read in git)
- 2026-09-21T23:50 sweep (FINDINGS:5, ISS-260..264; ISS-245 verified fixed; cycle-number anomaly closed-at-6):
  `git show 5fab76e:qa/QUEUE.md`.
- Earlier sweeps: `git show d142628~1:qa/QUEUE.md` and prior history.
> **ID correction 2026-09-27T07:29:29+05:30 (/checker):** the 2026-09-26 sweep's ISS-308 (ledger-schema) and ISS-309 (delegation-health) collided with maker-minted ISS-308/309 (22b6eb6). They are now **ISS-311** and **ISS-312**. ISS-310 is unchanged. The maker's ISS-308/309 (lane module instances, reingest orphan tree_index) keep their ids.
