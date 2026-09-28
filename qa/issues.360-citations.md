# ISS-360 bare-citation disambiguation table

**Written by:** `/checker`, executing D-055 ruling 2 (`docs/DECISIONS.md`, Approved-by: Umesh).
**Date:** 2026-09-28
**Why this file exists:** `qa/issues.jsonl` lines 358 and 359 both carried `id: "ISS-360"` for two
unrelated issues. D-055 ruling 2 promotes each row's existing `canonical_id` to its real `id`
(`ISS-360-OBSFLAKE` = line 358, `open`, obs-windows load flake; `ISS-360-HEARTBEAT` = line 359,
`fixed`, u4b heartbeat regression-test debt) and retires the bare `ISS-360`. D-019's permanence
argument forbids silently rewriting already-committed citations, so every bare `ISS-360` found in
already-committed artifacts is ANNOTATED here with which row it meant — never edited in place.

**Method:** `grep -rn "ISS-360"` over `qa/manifests/`, `qa/verdicts/`, `qa/gates/`, `qa/QUEUE.md`,
`qa/.last-tick`, `qa/.last-sweep`, `docs/DECISIONS.md`, source files the ledger rows themselves
cite, and `git log --all --grep='ISS-360'` commit messages (subject + body). Occurrences already
qualified as `ISS-360-OBSFLAKE` or `ISS-360-HEARTBEAT` are not listed — they need no
disambiguation. Occurrences that refer to *the collision itself* (both rows, as a named defect)
rather than to one row's content are marked "refers to the collision" — that is what the
surrounding text settles, not a guess.

## Table

| # | Location | Quoted context | Resolved to | Basis |
|---|---|---|---|---|
| 1 | `docs/DECISIONS.md:901` | "...ISS-357 on U4a, and ISS-360 on U4b's five pure heartbeat functions, which shipped verified only by an uncommitted throwaway script." | **ISS-360-HEARTBEAT** | Explicit: names "U4b's five pure heartbeat functions" directly. |
| 2 | `docs/DECISIONS.md:915` | "**Links:** ISS-360 (medium, uncommitted test), ISS-361 (low), ISS-357, ..." | **ISS-360-HEARTBEAT** | Same D-048 entry as #1; the parenthetical "(medium, uncommitted test)" matches only the heartbeat-test-debt row. |
| 3 | `docs/DECISIONS.md:1027` | D-050 (speaker-seam / ISS-307 hook / D-020 mutation-safety entry) — "**Links:** ISS-104, ISS-104CC-1, ISS-104CC-2, ISS-307, ISS-355, ISS-360; D-013, D-014, D-019, D-020, D-041; ..." | **AMBIGUOUS — unresolvable from context** | The entry body (speaker-seam loc ceiling, ISS-307 false-STALL hook fix, D-020 mutation-safety amendment) never mentions heartbeat functions, obs-windows, or a load flake. `ISS-360` appears only in a generic Links list alongside unrelated issue ids, with no textual content tying it to either row. Guessing would violate the "a wrong disambiguation is worse than a marked-ambiguous one" instruction. |
| 4 | `docs/DECISIONS.md:1336` (D-055 `Changes-authorized`) | "qa/issues.jsonl and qa/issues.*.jsonl (ISS-360 id promotion, by /checker only...)" | Refers to the collision itself (both rows) | This is the authorizing entry for the present repair; it names the defect class, not one row. |
| 5 | `docs/DECISIONS.md:1337, 1342, 1350, 1357, 1380–1384` (D-055 body) | "the duplicate `ISS-360` is resolved by promoting each row's existing `canonical_id`..." etc. | Refers to the collision itself (both rows) | Same D-055 entry; explicitly discusses and resolves both rows by name in the same breath (`ISS-360-OBSFLAKE`, `ISS-360-HEARTBEAT`). Self-disambiguating. |
| 6 | `qa/gates/iss-360-duplicate-id-collision.md` (whole file, incl. title) | "`ISS-360` is two different issues in one file, with opposite statuses" | Refers to the collision itself (both rows) | The gate's entire subject is the duplicate; it names both rows explicitly throughout (lines 14–15 table). Self-disambiguating. Not edited (checker never writes to a HUMAN_GATE file's resolved content beyond this annotation pass; the gate stays as the historical record). |
| 7 | `qa/.last-tick:469` | "...filed ISS-360 medium (load-flaky obs-windows ISS-324 bring-up assertion makes `pnpm -r test` an unreliable post-merge gate repo-wide)..." | **ISS-360-OBSFLAKE** | Explicit: "load-flaky obs-windows". |
| 8 | `qa/.last-tick:470` | "post-merge gate run PER-PACKAGE not `pnpm -r` because of ISS-360" | **ISS-360-OBSFLAKE** | Same tick line, immediately follows #7's filing; refers to the load-flake making `pnpm -r test` unreliable. |
| 9 | `qa/.last-tick:544` | "NEW HUMAN_GATE FILED, qa/gates/iss-360-duplicate-id-collision.md: qa/issues.jsonl holds TWO DIFFERENT ISSUES both id ISS-360 (lines 358-359) with opposite statuses..." | Refers to the collision itself (both rows) | Explicitly names both rows and both statuses in the same sentence. |
| 10 | `qa/.last-tick:545` | "D-055 RULING 2: the duplicate ISS-360 is resolved by promoting each row's canonical_id to a real distinct id (ISS-360-OBSFLAKE open / ISS-360-HEARTBEAT fixed)..." | Refers to the collision itself (both rows) | Self-disambiguating in the same line. |
| 11 | `qa/QUEUE.md:33` | "`qa/issues.jsonl` carries **two different issues both id `ISS-360`**, statuses `open` and `fixed` (lines 358-359...)" | Refers to the collision itself (both rows) | Self-disambiguating; names both statuses and both line numbers. |
| 12 | `qa/QUEUE.md:137` | "...packages/meeting-bot carries the ISS-360 load flake, so no honest single-run..." | **ISS-360-OBSFLAKE** | Explicit: "load flake" + "packages/meeting-bot". |
| 13 | `qa/manifests/iss-104-place-vs-person-signal.md:128` | "(the ISS-360 load flake makes `packages/meeting-bot` report `Failed` spuriously)" | **ISS-360-OBSFLAKE** | Explicit: "load flake" + "packages/meeting-bot". |
| 14 | `qa/manifests/u4b-heartbeat-collection.md:8` | "**Closes:** ...that U4b PASSed cycle 0 with explicitly **unmet at 0/1** (verdict `af6037a`, merged `e74e7dd`); ledger issue **ISS-360**." | **ISS-360-HEARTBEAT** | Context is the R2/heartbeat-test debt this exact unit closes. |
| 15 | `qa/manifests/u4b-heartbeat-collection.md:96` | "A detector with no test is the exact debt ISS-360 records." | **ISS-360-HEARTBEAT** | "no test" = the heartbeat regression-test debt. |
| 16 | `qa/manifests/u4b-heartbeat-collection.md:97` | "`package.json` (`test:lint`) — ISS-360's complaint is literally 'not re-runnable by CI'." | **ISS-360-HEARTBEAT** | The row's own `title`/`checker_note` use exactly this phrase ("not re-runnable by CI"). |
| 17 | `qa/manifests/u4b-heartbeat-collection.md:191` | "...that row is *also* numbered ISS-360)." referring to `qa/issues.jsonl` line 358, the obs-windows flake | **ISS-360-OBSFLAKE** | Line explicitly says "recorded at `qa/issues.jsonl` line 358" two clauses earlier — already self-qualified by line number. |
| 18 | `qa/manifests/u4b-heartbeat-collection.md:283–284, 324, 341, 344, 356` | `[ISS-360 repro]` test-tag comments and "ISS-360 reproductions[0]: 9/9 pass" etc. | **ISS-360-HEARTBEAT** | These are the heartbeat function falsification/reproduction rows; `ISS-360-OBSFLAKE`'s row carries no `reproductions` field at all. |
| 19 | `qa/manifests/u4b-heartbeat-collection.md:431, 433` | "`qa/issues.jsonl` contains TWO rows both numbered `ISS-360`" / "a naive `find(o => o.id === 'ISS-360')` returned the *wrong* row" | Refers to the collision itself (both rows) | Explicitly discusses both line 358 and line 359 by number in the same paragraph. |
| 20 | `qa/manifests/u4b-heartbeat-collection.md:491` | "Checker closed ISS-360 (line 359)." | **ISS-360-HEARTBEAT** | Explicit line number given. |
| 21 | `qa/manifests/u4b-watch-heartbeat-alert.md:453` | "**ISS-360 (medium)** -- the five pure functions have no committed test, only an uncommitted script." | **ISS-360-HEARTBEAT** | Explicit: "five pure functions... no committed test" — this is also the ORIGINAL filing context (this id did not yet collide with anything when this verdict/manifest was written). |
| 22 | `qa/verdicts/u4b-heartbeat-collection.md` (all bare-form occurrences: lines 39, 236–271, 338, 394, 406, 493–521, 595, 597) | Full disambiguation discussion, e.g. "**ISS-360 at `qa/issues.jsonl` line 359** → `fixed`" | Already self-qualified per-occurrence (mix of `ISS-360-HEARTBEAT` explicit and `(line 358/359)` explicit) | This verdict is the origin of the canonical_id split (via commit `b71da0f`) and states which row every time it uses the bare form. No new disambiguation needed. |
| 23 | `qa/verdicts/u4b-watch-heartbeat-alert.md:85, 96, 98` | "**ISS-360** (medium), not blocking, per the ISS-357 precedent..." / "ISSUES-WRITTEN: ISS-360, ISS-361" / "**ISS-360** (medium) — the 5 new pure functions..." | **ISS-360-HEARTBEAT** | This verdict is the ORIGINAL FILING commit (`af6037a`) for this id — written before the obs-windows row existed, for the u4b-watch-heartbeat-alert unit specifically. |
| 24 | `scripts/watch/run-watch.mjs:110` | `// ISS-360: they shipped with no committed test because a test file was itself an unauthorized new...` | **ISS-360-HEARTBEAT** | Code comment inside the file holding the heartbeat functions the row is about. |
| 25 | `scripts/watch/lib/heartbeat.mjs:14` | `* creep was blocking their test (ISS-360), which inverted its purpose.` | **ISS-360-HEARTBEAT** | Same file/feature as #24. |
| 26 | `scripts/watch/lib/heartbeat.test.mjs:3–4, 8, 10, 42, 53, 57, 64, 69, 92` | `[ISS-360 repro]` / `[ISS-360 evidence]` test tags; header comment explicitly says "the row at qa/issues.jsonl line 359" | **ISS-360-HEARTBEAT** | Already self-qualified with the line number in the file's own header comment (lines 3–4). |
| 27 | `qa/issues.u4bhb.jsonl` (ISS-U4BHB-002, ISS-U4BHB-004 rows) | Full prior disambiguation record, e.g. "qa/issues.jsonl has TWO rows both numbered ISS-360 (lines 358 and 359)..." | Already self-qualified / is itself the prior disambiguation record | These rows are the checker's own earlier canonical-naming record (see commit `b71da0f`); they already state both canonical names and both line numbers wherever the bare form appears. No new annotation needed. |
| 28 | Commit `955f16a` subject: "D-055: Umesh's 3 batched rulings -- recall cost provisional, ISS-360 ids promoted, worktrees audited read-only" | — | Refers to the collision itself (both rows) | This is the D-055 commit itself; "ids promoted" (plural) already implies both. |
| 29 | Commit `5d927a5` subject: "tick: iss-104 checked-PASS + merged; ISS-360 duplicate-id gate raised" | — | Refers to the collision itself (both rows) | "duplicate-id gate" names the collision, not a single row. |
| 30 | Commit `11695b9` subject + body: "gate: ISS-360 is two different issues in one file, statuses open and fixed" | — | Refers to the collision itself (both rows) | Explicitly says "two different issues... statuses open and fixed." |
| 31 | Commit `2801ec6` body: "Checker closed ISS-360 at qa/issues.jsonl line 359 and disambiguated it from the different issue at line 358." | — | **ISS-360-HEARTBEAT** (closed); explicitly also names line 358 as "the different issue" | Explicit line numbers given for both. |
| 32 | Commit `b71da0f` subject + body: "checker(ledger): disambiguate the duplicate ISS-360; close ISS-360-HEARTBEAT" | — | Subject's bare mention refers to the collision itself; body is fully self-qualified (`ISS-360-OBSFLAKE (line 358)`, `ISS-360-HEARTBEAT (line 359)`) | This is the commit that first introduced the `canonical_id`/`disambiguation` fields. |
| 33 | Commit `28ff897` body: "ISS-U4BHB-002 (medium, duplicate ISS-360 disambiguation)" | — | Refers to the collision itself (both rows) | Names the disambiguation issue, not one row. |
| 34 | Commit `90897a3` body: "the C1-C11 falsification matrix with control rows, ISS-360's recorded reproductions re-run verbatim (9/9)..." | — | **ISS-360-HEARTBEAT** | "reproductions re-run" — only the heartbeat row (`reproductions[0]`, 9 cases) has a `reproductions` field; the obs-windows row has none. |
| 35 | Commit `70611ac` body: "scripts/watch/lib/heartbeat.test.mjs their FIRST committed test (ISS-360), 16 cases" and "test:lint now runs heartbeat.test.mjs, so ISS-360's 'not re-runnable by CI' closes." | — | **ISS-360-HEARTBEAT** | Explicit: names the heartbeat test file and quotes the row's own "not re-runnable by CI" phrase. |
| 36 | Commit `e74e7dd` body: "ISS-360 (medium) the five pure functions ship with no committed test, only an uncommitted script..." | — | **ISS-360-HEARTBEAT** | Explicit: "five pure functions... no committed test" — this is also the ORIGINAL filing commit for this id. |
| 37 | Commit `7d5d59a` subject + body: "ledger: ISS-360 load-flaky obs-windows bring-up test (post-merge gate finding)" | — | **ISS-360-OBSFLAKE** | Explicit: "load-flaky obs-windows bring-up test" — this is the ORIGINAL filing commit for this id. |
| 38 | Commit `af6037a` subject + body: "R2 unmet pending gate, ISS-360/361 filed" / "ISS-360 (medium): 5 new pure functions have no committed regression test." | — | **ISS-360-HEARTBEAT** | Explicit; this is the commit that first created this id (predates the collision entirely). |
| 39 | `qa/.last-sweep:1` | "pnpm -r test and depcruise NOT run (long suite + ISS-360 load flake meant no honest single-run claim; depcruise is stage 10, unreachable behind ISS-367)" | **ISS-360-OBSFLAKE** | Explicit: "load flake". |

## Summary

- **39 bare-`ISS-360` citation sites** found across the searched surfaces (manifests, verdicts,
  gates, QUEUE, `.last-tick`, `.last-sweep`, `docs/DECISIONS.md`, source files, and commit
  messages).
- **Resolved to ISS-360-OBSFLAKE:** 8 (#7, #8, #12, #13, #17, #31-partial, #37, #39)
- **Resolved to ISS-360-HEARTBEAT:** 18 (#1, #2, #14–16, #18, #20–21, #23–26, #31-partial, #34–36, #38, plus per-occurrence self-qualified sites in #22, #26)
- **Refers to the collision itself (both rows, needs no per-row resolution):** 12 (#4–6, #9–11, #19, #28–30, #32-subject, #33)
- **Already self-qualified (no new annotation needed):** #22, #26, #27
- **AMBIGUOUS — unresolvable from context:** **1** (#3, `docs/DECISIONS.md:1027`, the D-050
  speaker-seam entry's generic Links line)

## Notes

- Nothing in this file was silently rewritten. `docs/DECISIONS.md`, every manifest, every verdict,
  every gate file, and git history are untouched by this repair — this table is the sole record of
  disambiguation for citations that predate the id promotion.
- The one `AMBIGUOUS` row (#3) is not blocking: D-055 ruling 2 already accepted that some
  already-committed citations would need annotation rather than resolution, and an honest
  "unresolvable" is what that ruling asked for over a guess.
