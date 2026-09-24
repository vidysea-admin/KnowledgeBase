# Verdict — u2-4-phase3-precision-regate

**Date:** 2026-09-25 · **Cycle checked:** 1 · **Mode:** A (unit check)
**Judged against:** `qa/gates/speaker-segment-identity.md` (Answered A, phase-3 bars) and
`qa/contracts/speaker-resolution-llm.md` (I2, I3, I4, C1/C2/C12; **C14 added by this verdict**).
**Manifest:** `qa/manifests/u2-4-phase3-precision-regate.md`, Fix cycle 1 (internally documents a
sub-episode "Fix cycle 1b" — two rounds of fixing landed under one cycle number; both are covered).
**Bound root:** `D:/KnowledgeBase-lanes/u2-4-phase3-fix` (worktree, branch `wave/u2-4-phase3-fix`).
Base for diff scope: `4aa9d13` (merge-base with master). Prior verdict (cycle 0, FAIL,
ISS-282/283/284) is preserved below this section, unmodified.

## Summary

The code fix is real, correctly scoped, and independently re-verified by me at every layer I could
reach without a live LLM call: unit tests (25/25 in the touched file, 234/234 for the whole
`@lkb/index` package — up from the manifest's own last-pasted 226–233, i.e. more tests pass, not
fewer), typecheck (clean), lint-loc (clean), the ISS-104 probe (17/20 refused, exact match), the
diff scope (no unauthorized deletions/renames, no file touched outside `packages/index/src/
pipeline/{speaker-name-rules,speakers-llm}.{ts,test.ts}` + `speakers-windows.test.ts` + this cycle's
`qa/evidence/**`), the two invariants I2 (`speakers.ts`: 0 diff lines) and I3 (no db/mongo import,
confirmed by grep), and — most substantively — the offline replay itself, which I reproduced
byte-for-byte from the manifest's own recorded raw data (see below) and additionally stress-tested
with **four of my own single-hunk falsifying edits** in throwaway copies (not the manifest's own six
mutants), each of which reddened exactly the test that names the capability it claims, and only
that test's assertion.

Two judgment calls were explicitly handed to me. I decided both, below, and the second one is why
this cycle is a FAIL rather than a PASS.

## 1. Bar-2 reading: legacy `wrongEvidencePairs` vs the relational check — RULED: relational check

`qa/gates/speaker-segment-identity.md` bar 2 reads "zero wrong label/name/citation links."
`qa/contracts/speaker-resolution-llm.md`'s own "Why this is a separate contract" section — written
2026-09-08, **before** the gate was answered (2026-09-21) — already commits this path to admitting
greeting/handover/thanks evidence, not only self-naming, as its defining difference from the
deterministic path. The legacy `wrongEvidencePairs` counter in `05-score.mjs` accepts an evidence
turn only when it lies inside a gold block **of the named person themself** — which by construction
only a self-naming turn can satisfy. Every one of the 18 flagged pairs (6 evidence turns × 3 outer
runs) is a greeting/handover/thanks turn spoken by someone else — exactly the class this path exists
to admit — so the legacy counter reads "wrong" on 100% of the admitted evidence class regardless of
whether the citation actually supports the claim. A metric that cannot discriminate a correct
citation from a fabricated one carries no information for this path; it is measuring compliance with
a design (self-naming only) this contract already rejected. The relational check
(`wrongEvidencePairsRelational`) asks the question that matters — is the cited turn inside, or
immediately adjacent to, in the required direction, a block whose gold person is the accepted name —
and reads 0, matching `wrongIdentities: 0` (the block-level correctness check, independent of either
counter).

**Ruling: bar 2 is read via the relational check for this path.** I recorded this as **[C14]**, a
routine clarifying amendment to `qa/contracts/speaker-resolution-llm.md` (amendment log, 2026-09-25)
— it does not relax C2/C2a/C2b/C12, all of which I independently re-verified this cycle (see
Capability coverage). If a future unit wants the legacy counter reinstated as bar 2's measure, that
is a criterion tightening against an admitted evidence class and needs the human (CRITICAL gate),
not a routine amendment — I said so explicitly in the amendment log so this doesn't get silently
re-decided.

## 2. Offline replay vs a fresh live run — RULED: a fresh live run is required to PASS this gate

This is the reason for the FAIL. `qa/gates/speaker-segment-identity.md` step 3 names a specific,
human-approved empirical protocol: **"run the frozen local qwen3:8b digest three times ... and
require"** the five bars. That protocol has been run exactly once under this fix cycle — against the
code as it stood after the FIRST round of fixing (commit 6497719..b40327f) — and it **FAILED
cleanly**: `{"accepted":0,"correct":0,"precision":null,"additions":0}`. I independently re-verified
the underlying data is what the manifest says it is (`run-results.c1.jsonl`: 33 lines, sum of
`providerCalls` = 2340, 0 degraded, 11 sessions × 3 outer runs — computed fresh from the file, not
copied from the manifest).

After that failure, a SECOND round of fixing (`namingTurns`, commits 9098546 onward) changed the
acceptance logic again. This second round has **never been run live**. The reported PASS numbers
(precision 1 (12/12), 0 wrong identities, 0 wrong relational links, 4 additions, stable across all 3
outer runs) come entirely from `08-replay.mts`, which feeds **c1's already-recorded raw model text**
(collected under the FIRST-round code) through the NEW acceptance code, with no new provider call. I
reproduced this myself end-to-end (`08-replay.mts --from c1 --tag c1-replay-checker` then
`05-score.mjs --tag c1-replay-checker --raw-tag c1`) and got **byte-identical** output to the
manifest's, including the JSON-formatted score block below.

I verified the manifest's supporting claim that makes this replay meaningful at all —
`buildSpeakerWindows` (the only function that shapes what is sent to the model) is byte-unchanged
since the c1 raw data was collected (`git diff b40327f..HEAD -- packages/index/src/pipeline/
speakers-llm.ts` shows only the `extractSpeakers`/`namingTurns` region changed; `buildSpeakerWindows`
itself has zero body diff). So the replay is not a fabrication or a cherry-pick — it is a real,
reproducible re-scoring of genuine historical live output, and it is credible evidence the fix is
correct.

It is not, however, the thing the gate asked for, and I do not think this checker should treat it as
an equivalent substitute on its own authority:

- The gate names a live, repeated-sampling protocol for a reason directly on point here: this
  system's own recorded defect (ISS-255) is that identical settings do **not** reliably reproduce the
  same live output run to run. An offline replay of one historical run's raw text cannot rule out
  that a **fresh** live run — same digest, same prompt, same code — produces a materially different
  raw-output distribution than the specific one that happened to get recorded under the old code.
  Everything downstream of the provider call is deterministic and well-tested; the provider call
  itself, live, is exactly the part no amount of downstream code review or replay can stand in for.
- This gate is the sole named precondition before U2.4 phase-4 persists model-derived identities to
  `schema/`/`turns.speakerRef` (`qa/gates/speaker-segment-identity.md` item 4). This repo's own
  history (`ISS-078`, cited in `.claude/CLAUDE.md`'s backlog-priority override) is a direct warning
  against crediting a safety/identity-linkage gate on accumulated-but-indirect evidence when a
  cheaper, more direct check is available and has simply not been run yet — here, that check is a
  single `04-regate-eval.mts --tag c1b-live` pass (~2.2h, the same harness already used once).
  Skipping it because the fix "should" reproduce is the exact shape of reasoning that gate exists to
  route around.
- This is not a code defect and not a softened criterion — the fix itself passes every check I could
  run. It is a plain reading of "PASS requires every criterion evidenced... default to FAIL when
  proof is absent" (checker/SKILL.md): the specific evidence the gate's own text asks for has not yet
  been produced for the code that would actually ship.

**Fix direction (only remaining step):** run `04-regate-eval.mts --runs 1,2,3 --tag c1b-live` against
the current (post-1b) code, then `05-score.mjs --tag c1b-live`, and resubmit. Given the replay's
numbers and my own re-derivation of them, I expect this to pass, but "expect" is not "evidenced" —
that is precisely the gap this rule exists to close.

## What I re-ran myself (not trusted from the manifest)

1. `node --test --test-reporter=spec --import tsx packages/index/src/pipeline/speakers-windows.test.ts`
   → **25/25 pass** (11 ISS-282-era tests + 8 c1b tests + 6 pre-existing), exact match to manifest.
2. `pnpm -C packages/index test` → **234/234 pass** (manifest's own numbers drifted 226→233 across
   its own commits; my count is the current HEAD and is higher, i.e. strictly more coverage, not
   less — flagged as a low evidence-freshness note, not a defect).
3. `pnpm -C packages/index typecheck` → clean, exit 0.
4. `node scripts/lint-loc.mjs` → `lint-loc: OK (291 file(s) within budget)`, exact match.
5. `node_modules/.bin/tsx qa/probes/iss104-rederive.mts` → `--- refused 17/20`, exact match.
6. `node_modules/.bin/tsx qa/evidence/.../08-replay.mts --from c1 --tag c1-replay-checker` then
   `05-score.mjs --tag c1-replay-checker --raw-tag c1` → byte-identical to the manifest's pasted
   block: `{accepted:12, correct:12, precision:1, wrongIdentities:0, wrongPairs:18,
   wrongPairsRelational:0, floorTurns:2, floorCoveredTurns:42, floorLabels:2, contradicted:0,
   stableAll:true, additions:4, ISS255:"3/4"}`.
7. `git diff b40327f..HEAD -- packages/index/src/pipeline/speakers-llm.ts` → confirmed
   `buildSpeakerWindows` has zero body diff (the replay's load-bearing precondition).
8. `git diff 4aa9d13..HEAD --stat` and full diff for the touched source/test files → no removed
   `export`, no removed `test(...)` block, no file touched outside the claimed surface.
9. `git diff 4aa9d13..HEAD -- packages/index/src/pipeline/speakers.ts` → 0 lines (I2 holds).
   `grep` for db/mongo imports in `speakers-llm.ts` → none (I3 holds, corroborating the manifest).
10. Independent raw-data completeness check on `run-results.c1.jsonl` / `raw-proposals.c1.jsonl`:
    33 lines, sum(`providerCalls`) = 2340, 0 degraded, 11 sessions × outer runs {1,2,3} — computed
    fresh in node, not copied from the manifest.

## Capability coverage — re-run in a THROWAWAY copy (git-archive of HEAD + symlinked node_modules,
outside the bound root; the copy ran GREEN (25/25) before any edit)

I constructed my own single-hunk falsifying edits rather than re-running the manifest's six named
mutants verbatim (those already carry `cmp`-verified restore evidence in the manifest and D-020's
`mutate.mjs` exists in this repo, `scripts/lib/mutate.mjs`) — my edits are independent proof the same
claims hold, using different mutations than the builder chose:

| # | Claim (manifest's numbering) | My falsifying edit (single file, single hunk) | Result |
|---|---|---|---|
| 1 | Own-turn third-party address no longer binds the speaking label | `speaker-name-rules.ts`: `opensClause` forced to always return `true` | Copy green 25/25 before → **exactly 1 test red after**, the Ankit test named for this guard |
| 3 | Accepted blocks derive from evidence, not label-wide | *(covered by #7 below — same mutation reddens both)* | see row 7 |
| 4 | One evidence turn never binds two labels | `speakers-llm.ts`: removed the `labelsByTurn` dual-bind guard (one line) | Copy green → **exactly 1 test red**, "one evidence turn never binds two labels" |
| 7 | c1b: a real uncited adjacent naming binds the right block | `speakers-llm.ts`: `namingTurns` body replaced with `return [];` | Copy green → **8 tests red**, all and only the tests whose claim depends on `namingTurns` producing evidence (own-block binding, handover-binds-following-label, dual-bind, both c1b true-positive tests, the two-thanks/quoted test, both ISS-255 agreement tests) — no unrelated test broke, so the reddening isolates the right mechanism even though it is central and many claims route through it |
| 8 | c1b guard: third-person-block ("talks about the name") refusal | `speakers-llm.ts`: removed the third-person-block early-return in `namingTurns` (one line) | Copy green → **exactly 1 test red**, "a block that talks ABOUT the name is not that person" |

Rows 2, 5, 6, 9 are covered by re-runs already listed above (row 2's isolating test — "a handover by
ANOTHER speaker binds the label whose block immediately FOLLOWS it" — is also one of the 8 tests my
row-7 mutation reddened, cross-validating it). Row 5 = my full-suite re-run (234/234). Row 6 = my
independent re-derivation of the c1 live FAIL from raw data. Row 9 = my byte-identical replay
re-derivation.

**CAPABILITY-COVERAGE: 9/9 rows reproduced** (5 via my own new falsifying edits in throwaway copies,
4 via direct re-run of the designated command). No falsifying-edit cell in the manifest's own table
was executed by me verbatim; I judged the same claims with my own constructions instead, which is a
stronger check, not a weaker one.

## Diff scope (step 4c)

`git diff 4aa9d13..HEAD --stat`: 40 files changed, all either (a) the four claimed source/test files
in `packages/index/src/pipeline/`, (b) new files under this cycle's `qa/evidence/
u2-4-phase3-precision-regate-2026-09-22/`, or (c) the manifest/verdict themselves. No `export`, no
`test(...)` block, and no existing function was removed or renamed in the touched source files
(checked via targeted grep against the diff, not just the stat). Nothing outside the claimed surface
was touched. No structural-erosion signal on this diff.

## Issues addressed (ISS-282 critical / ISS-283 high / ISS-284 medium)

These were minted on a **different clone** (`D:/KnowledgeBase`, master/`feat/webinar-bot`, commit
`b1c9d01`) and were never copied into this worktree's `qa/issues.jsonl` by the cycle-0 import commit
(`c527207` touches 0 ledger lines — verified via `git show c527207 -- qa/issues.jsonl`). I cannot
write to that other clone's ledger from this bound root (`CONTRACT_MISMATCH` risk), so I recorded a
lane-local note (`ISS-U2-4-2`, low) and judge fixed-status here for cross-reference only:

- **ISS-282** (the concrete defect: third-party mentions credited as the speaking label; label-wide
  scoping) — **fixed, verified.** All 8 recorded reproductions (t007 Sonal, t022 Shithij, t094
  Anisha, t042 Bhavya, t088 Jubin ×2, t267 Priyanka) pass as refused, re-run by me against the real
  `extractSpeakers` (not mocked away). Blocks now come from evidence, not a label-wide `[]` — also
  independently falsified (row 7 above).
- **ISS-283** (premature/false stability narration before the experiment finished) — **fixed,
  verified.** This cycle's manifest plainly reports the c1 live FAIL first, with no narrated
  conclusion ahead of the data; the outstanding item is explicitly flagged as a checker call rather
  than asserted as settled. The process defect ISS-283 named does not recur here.
- **ISS-284** (undisclosed evidence files, stale corpus numbers) — **fixed, verified.** The corpus is
  pinned to `gold-labels.json`'s session list (I did not independently re-verify the pin logic beyond
  reading it — low-cost, non-blocking gap); the evidence-dir listing I ran matches the manifest's
  "What changed" modulo `*.log` files, which the manifest correctly notes are gitignored and
  re-derivable.

New finding this cycle: **ISS-U2-4-1** (high) — see "2. Offline replay vs a fresh live run" above;
filed to `qa/issues.u2-4.jsonl` (this lane's ledger, D-019; did not exist before this check).
**ISS-U2-4-2** (low) — the ledger-continuity gap itself, same file.

## Live browser evidence

Not-applicable. Changed paths are `packages/index/src/pipeline/{speaker-name-rules,speakers-llm}.
{ts,test.ts}`, `packages/index/src/pipeline/speakers-windows.test.ts`, and
`qa/evidence/u2-4-phase3-precision-regate-2026-09-22/**` — no `apps/**`, no UI-adjacent path, and
this module contacts no live surface a person would render (pure function over turns + an injected
`complete`).

```
VERDICT: FAIL
SCOREBOARD: 4/4 re-run gates met (tests 234/234, typecheck, lint-loc, ISS-104 probe), 2/2 invariants held (I2, I3), 9/9 capability-coverage rows reproduced, 0/5 phase-3 gate bars evidenced by a LIVE run of the shipping code (all 5 evidenced only by offline replay of pre-fix-round raw data)
FAILURES:
- [phase-3-gate-live-evidence] sev: high · the gate's own protocol ("run the frozen local qwen3:8b digest three times") has been executed once this cycle, against the FIRST-round fix, and it FAILED cleanly (0 accepted, 0 additions); the SECOND-round fix (namingTurns) that produces the claimed passing numbers has only been offline-replayed against the first round's recorded raw text, never run live · fix direction: run 04-regate-eval.mts --runs 1,2,3 --tag c1b-live against current HEAD, then 05-score.mjs --tag c1b-live, and resubmit; the replay's numbers (independently reproduced by the checker) make a pass likely but "likely" is not "evidenced" · issue: ISS-U2-4-1
CAPABILITY-COVERAGE: 9/9 rows reproduced (5 via checker's own new falsifying edits in a throwaway copy outside the bound root; 4 via direct command re-run)
LIVE-BROWSER: not-applicable (packages/index/src/pipeline/** + qa/evidence/** only, no apps/** or UI-adjacent path touched)
ISSUES-WRITTEN: ISS-U2-4-1, ISS-U2-4-2
EXECUTOR: claude-opus subagent (maker build) (checker: claude-sonnet-subagent)
EXPLANATION: The c1b code fix is real and I independently re-verified it at every layer reachable without a live LLM call — tests, typecheck, lint, diff scope, invariants, and 9/9 capability-coverage rows including four of my own new falsifying edits, all of which isolate correctly. I ruled the bar-2 wording ("citation link") means the relational check, not the legacy self-naming-only counter, and recorded that as a routine contract amendment (C14) since the contract already commits this path to admitting relational evidence. But the phase-3 gate's own named protocol is a LIVE three-run measurement, and the only completed live run this cycle tested the code BEFORE the second (namingTurns) fix and failed outright; the passing numbers come from an offline replay of that same pre-fix run's raw text through the new code. The replay is credible, byte-reproduced by me, and makes a live pass likely — but this gate is the sole precondition before a schema-persistence unit, and this repo's own ISS-078 history is a direct argument against crediting indirect evidence here when the direct check is cheap and has simply not been run. FAIL pending one fresh live 3-run measurement of the shipping code.
```

---


**Judged against:** `qa/gates/speaker-segment-identity.md` (Answered A, phase-3 step verbatim —
the precision-gate criteria: 100% accepted identity precision, zero wrong label/name/citation
links, deterministic-floor preservation, stable accepted facts, at least one correct addition),
read together with `qa/contracts/speaker-resolution-llm.md` (the contract governing the LLM
speaker-resolution path this measurement exercises — invariants I2 `speakers.ts` byte-unmodified
and I3 no persistence).
**Manifest:** `qa/manifests/u2-4-phase3-precision-regate.md`, Status `ready-for-check`, Fix cycle 0.
**Bound root:** `D:/KnowledgeBase`. Working tree on `feat/webinar-bot`; confirmed via
`git diff HEAD --stat -- packages/ apps/ config/ schema/` (empty) that no pipeline code is
touched by this branch's outstanding changes, consistent with the manifest's I2/I3 claims.

## What I re-ran myself (not trusted from the manifest)

1. `node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/01-block-stats.mjs` — ran fresh.
   Now returns **12 sessions / 496 positional / 242 blocks / 30 session-label pairs**, not the
   manifest's pasted 11/494/240/29. Traced the delta to a new session
   `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations`, added by commit
   `fd74864` ("live webinar bot (Zoho)...") — unrelated webinar-bot work on this same branch,
   not caused by this unit. Recorded as ISS-284 (medium): the pasted step-1 numbers are no
   longer literally re-derivable, even though the cause is environmental, not a defect in this
   unit's own code.
2. `node_modules/.bin/tsx qa/probes/iss104-rederive.mts` — ran fresh. Output `--- refused 17/20`,
   **exact match** to the manifest's claim.
3. `node scripts/sync-speakers.mjs --dry-run` — ran fresh. `positional turns: 496` (vs manifest's
   494, same corpus-drift cause as #1), `attributable by deterministic resolution: 42 (8.5%)`,
   2 speaker documents (`person:jubin-thakkar`, `person:ruby`), no collisions, no Mongo connection
   — this substantively matches the manifest's claim.
4. `node_modules/.bin/tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs` — ran
   fresh against the manifest's **own persisted** `run-results.jsonl` / `raw-proposals.jsonl` /
   `gold-labels.json` (I did not re-run step 2, `04-regate-eval.mts --run 1/2/3`, myself — each
   outer run takes ~30–40 min per session across 11 sessions via a live Ollama call, multiple
   hours per full pass, and the manifest's own capability-coverage table names step 3's re-run as
   the discriminator for step 2's claims, so I used exactly that mechanism). Result:
   ```
   { accepted: 8, correct: 0, precision: 0, wrongIdentities: 8, wrongPairs: 8,
     floorTurns: 2, floorCoveredTurns: 42, floorLabels: 2, contradicted: 0,
     stableAll: false, additions: 0, ISS255: "3/4" }
   ```
   This **regenerated `measurement-summary.json` in place** (the manifest's own designated output
   path for this command) — a legitimate re-run of the manifest's own verify command, not an edit
   to source or to the module under test.

## The decisive finding

`run-results.jsonl` / `raw-proposals.jsonl` (mtime 2026-09-22 17:00, unchanged as of this check on
2026-09-24 — no live process found: `tasklist` shows no eval-shaped node/ollama process running)
show the manifest's stated design — "three OUTER runs (1→3) sequential... Total: 2,340 provider
calls" — was **never completed**: outer run 1 is complete for 11/11 sessions, outer run 2 is
complete for only 4/11 sessions, and outer run 3 does not exist at all. That is 957 of the claimed
2,340 provider calls (41%).

Scored against what actually ran, the phase-3 gate's own mandatory bars **fail**:

| Gate requirement | Measured | Holds? |
|---|---|---|
| 100% accepted identity precision | 0/8 correct = **0%** | **FAIL** |
| Zero wrong label/name/citation links | **8** wrong identities, 8 wrong evidence pairs | **FAIL** |
| Deterministic-floor preservation | 0 contradictions (no floor identity is contradicted by an accepted one) | holds, narrowly |
| Stable accepted facts | outer run 3 never ran; `bar4_stability.allStable: false`; ISS-255 case 2 ("stable across outer runs 1-3") re-derives **pass:false** | **FAIL** |
| At least one correct addition | **0** | **FAIL** |

Four of five mandatory bars fail outright on the maker's own data, reproduced by the maker's own
script. This is not a marginal or disputable reading — `precision: 0` and `additions: 0` are exact.

Compounding this: the manifest's own "D-015 measurement" section narrates ISS-255 case 2 as
*"the recorded run 1 vs 2-3 instability at the shipped layer is gone"* — stated as settled,
positive fact — while the run that claim depends on (outer runs 2 and 3, corpus-wide) never
finished. The header for that section is literally `**ISS-255: `n/4`**` — an unfilled placeholder,
never replaced with the actual number (3/4, which I re-derived). The manifest's "Actual outputs"
section itself trails off after run 1 with *"(runs 2-3 appended below at close of run)"* and
nothing is appended — the unit was written and submitted `ready-for-check` mid-run, before the
experiment it describes had finished, and the prose narrates conclusions the finished data does
not support. Filed as ISS-283 (high).

The core failure — 0% precision, 8 wrong links, 0 additions — is filed as ISS-282 (critical): this
gate is the sole stated precondition before U2.4 phase-4 persists model-derived speaker identities
to `schema/`/`turns.speakerRef` (per `qa/gates/speaker-segment-identity.md` item 4, "Keep
persistence separate... until an independent checker PASSes that precision gate"). Crediting this
manifest would wrongly signal that precondition met, when the LLM candidate-generation path is
currently producing garbage identities at the label-wide/third-party-mention failure class the
gate was created to catch (e.g. `spk:1 -> "Shithij"` credited across 17 blocks whose gold person is
Nikhil/Kshitij; `spk:4 -> "Bhavya"` across gold-Bhakti blocks) — exactly the false-merge risk
`speaker-segment-identity.md` opened to prevent.

## Diff scope (step 4c)

`git diff HEAD --stat` for `packages/`, `apps/`, `config/`, `schema/` is empty; the only tracked
changes on the branch (`.goal/goal.json`, `qa/.last-tick`, `qa/feedback-inbox.md`) are outside this
unit's claimed surface and outside this unit's scope to judge. The evidence directory is untracked
in git so no meaningful `git diff` applies to it; I instead diffed its file listing against the
manifest's "What changed" section directly (see ISS-284: two undisclosed files,
`07-per-block.mjs` / `per-block-results.json`).

## Capability coverage

Not applicable in the falsifying-edit sense — the manifest correctly states this is a **measurement
artifact** with **no isolating falsification**; its own stated discriminator is re-running the named
commands, which I did (rows 1, 3, 4, 5 of its coverage table directly; row 2's full 3-outer-run
re-execution was not repeated live — multi-hour real-Ollama job — its **already-persisted** output
was used instead, which is what row 3 of the manifest's own table designates as the reproducing
mechanism for row 2's claims). Row 6 (raw-layer instability) not independently re-inspected beyond
what 05-score.mjs's ISS-255 case 3 already re-derives (pass:true, matches manifest).

## Live browser evidence

Not-applicable — no UI surface exists in or near this unit (confirmed via the diff-scope check
above: no `apps/**` or UI-adjacent path touched).

## Issues addressed

None claimed by the manifest (states "Issues addressed: none (gate precondition)") — nothing to
verify closed.

```
VERDICT: FAIL
SCOREBOARD: 1/5 gate bars met (floor non-contradiction only), 2/2 contract invariants held (I2 speakers.ts byte-unmodified, I3 no persistence)
FAILURES:
- [gate-precision/wrong-links/additions] sev: critical · re-running the manifest's own 05-score.mjs against its own run-results.jsonl gives precision=0% (0/8 correct), 8 wrong identity/evidence links, 0 correct additions — three of the gate's five mandatory phase-3 bars fail outright, not marginally · fix direction: fix the label-wide/third-party-mention over-acceptance in extractSpeakers' candidate generation (the exact failure class speaker-segment-identity.md exists to catch), then re-measure with all three outer runs complete before resubmitting · issue: ISS-282
- [stability-claim-unsupported] sev: high · manifest narrates "the recorded run 1 vs 2-3 instability ... is gone" as settled fact and leaves the ISS-255 case header as an unfilled "n/4" placeholder, but outer run 3 never executed and run 2 covers only 4/11 sessions — the re-derived stability bar is pass:false, not "gone" · fix direction: never narrate a stability conclusion before all three outer runs finish corpus-wide; paste the actual score-script JSON verbatim instead of a hand-written summary · issue: ISS-283
- [evidence-completeness] sev: medium · two files in the evidence dir (07-per-block.mjs, per-block-results.json) are not listed in "What changed"; step-1 corpus numbers no longer reproduce exactly (496/242/30 measured vs 494/240/29 claimed) due to an unrelated concurrent webinar-bot commit adding new session data on the same branch · fix direction: list every generated file in "What changed", and note known environmental drift explicitly rather than leaving stale pasted numbers · issue: ISS-284
CAPABILITY-COVERAGE: not-applicable (measurement artifact per manifest's own framing; commands 1/3/4/5 re-run live, command 2 judged on its own already-persisted output per the manifest's designated mechanism)
LIVE-BROWSER: not-applicable (no UI surface touched — packages/apps/config/schema confirmed untouched via git diff)
ISSUES-WRITTEN: ISS-282, ISS-283, ISS-284
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The manifest's own re-runnable measurement script, run against the manifest's own persisted data, shows the phase-3 precision gate failing on 4 of 5 mandatory bars (0% precision, 8 wrong links, unproven stability, 0 additions) because the described three-outer-run experiment was submitted ready-for-check after only 41% of its provider calls had actually executed. This gate is U2.4's sole stated precondition for the phase-4 write unit, so a PASS here would be the wrong signal at exactly the point the human-approved plan built this gate to prevent.
```
