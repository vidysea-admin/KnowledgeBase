# Verdict — u2-4-phase3-precision-regate

**Date:** 2026-09-24 · **Cycle checked:** 0 · **Mode:** A (unit check)
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
