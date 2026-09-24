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


---

# INDEPENDENT CONCURRENT CHECK — u2-4-phase3-precision-regate

**Date:** 2026-09-24 · **Cycle checked:** 0 · **Mode:** A (unit check) · **Checker:** second,
fresh, independent Claude subagent — did NOT build this unit and did not participate in the
primary check above.
**Bound root:** `D:/KnowledgeBase`.
**Why this section exists:** a cycle-0 verdict already existed on disk (commit `b1c9d01`) when
this check was dispatched. Per `checker/SKILL.md` "Concurrent verdict on the same slug + cycle",
the primary verdict above is left **byte-intact** and this check is appended below it.
**Disagreement with the primary verdict:** **none on the outcome** — both FAIL. This check adds
the one thing the primary explicitly did not do (it ran the maker's own `05-score.mjs` and took
its output), namely a **full D-015 re-derivation of the five bars with the checker's own script
and its own arithmetic**, plus a gold-label audit, a live-Ollama reproduction leg, and a
byte-fidelity check of the ISS-104 probe corpus against the ledger row. It also files **two
findings the primary did not** (ISS-289, ISS-290).

---

## 1. No-write claim — VERIFIED (the phase-4 blocker is genuinely not leaking writes)

The manifest claims `packages/index/src/**`, `apps/**`, `packages/ai/**`, `config/**`, `schema/**`
are byte-untouched with no Mongo write and no job writer. I proved it four ways:

```
$ git diff HEAD -- packages/index/src apps packages/ai config schema
(empty — zero bytes of output)

$ git diff HEAD --name-only
.goal/goal.json
qa/.last-tick
qa/issues.jsonl
```

Only maker/checker bookkeeping files are modified; **not one byte of pipeline, app, AI-provider,
config or schema code**. (`qa/issues.jsonl` is the checkers' own surface — the primary's
ISS-282..284 and this check's ISS-289/290.)

```
$ grep -nE "^import|require\(" packages/index/src/pipeline/speakers-llm.ts packages/index/src/pipeline/speakers.ts
speakers-llm.ts:24: import type { Turns } from "@lkb/core";
speakers-llm.ts:25: import type { CompleteResult, Job } from "@lkb/ai";
speakers-llm.ts:26: import { parseJsonLoose } from "@lkb/ai";
speakers-llm.ts:27: import { personIdFor, resolveSpeakers, type ResolvedSpeaker } from "./speakers.js";
speakers-llm.ts:28: import { looksLikeAName, isDiscourseOnly, citesNameAsAnIntroduction } from "./speaker-name-rules.js";
speakers.ts:30:     import type { Turns } from "@lkb/core";
```

No Mongo client reachable transitively. I read `04-regate-eval.mts` in full: its only I/O is
`fetch` to `http://localhost:11434` and `appendFileSync` to two paths **inside the evidence dir**;
there is no driver import, no job writer, no `turns.speakerRef` rewrite. A grep of every `.mjs`
/`.mts` in the evidence dir for `mongo|updateOne|insert|bulkWrite|upsert|\.save\(` returns **zero
non-comment hits**; every `writeFileSync` in the dir targets the evidence dir itself.

```
$ node scripts/sync-speakers.mjs --dry-run
sessions scanned: 24
positional turns: 496; attributable by deterministic resolution: 42 (8.5%)
speaker documents to write: 2
  person:jubin-thakkar  aliases=["Jubin Thakkar"]  confidence=0.9  evidence=1 turn(s)
  person:ruby  aliases=["Ruby"]  confidence=0.9  evidence=1 turn(s)
no cross-session collisions
No Mongo connection attempted (--dry-run).
```

**Ruling on item 1: the no-write claim holds.** This is the one part of the unit that earns full
credit — phase 3 is no-write by design and it genuinely is. (`positional turns: 496` vs the
manifest's pasted 494 is the corpus-drift issue, see §6 / ISS-290; the floor figure 42 (8.5%),
the 2 speaker documents and the no-collision result reproduce exactly.)

---

## 2. THE D-015 RE-DERIVATION — my own script, my own arithmetic, `05-score.mjs` NOT used

`05-score.mjs` was written by this unit's own author in this same cycle. Scoring a measurement
with the author's own scorer is the exact D-015 failure this repo has been burned by three times,
so I wrote my own scorer reading **only** `run-results.jsonl`, `gold-labels.json` and
`data/toc-migrated/*/turns.json`. I rebuilt the contiguous-block segmentation myself and used a
name matcher **deliberately more generous** than the maker's (any shared token counts as a match,
vs the maker's contiguous-subsequence rule) so that a FAIL could never be blamed on a stricter
comparison. I scored each accepted identity under three readings — strict (gate semantics),
charitable (the gold block containing the cited turn), and most-generous (does the name appear on
that label *anywhere* in the session).

```
=== CHECKER BLOCK REBUILD ===
gold sessions=11 blocks=240 named=144 unnamed=96
block-count agreement per session: ALL MATCH

=== OUTER RUN COMPLETENESS (gate demands 3 full runs over 11 sessions) ===
  outer run 1: 11/11 sessions
  outer run 2: 4/11 sessions
  outer run 3: 0/11 sessions   << NEVER EXECUTED
  total JSONL lines: 15 / 33 expected

  BAR 1 accepted identity precision:
     STRICT (gate semantics)      : 0/8 = 0.0%   [bar: 100%]
     CHARITABLE (cited block)     : 0/8 = 0.0%
     MOST-GENEROUS (name on label): 2/8 = 25.0%
  BAR 2 wrong label/name/citation links (strict): 8   [bar: 0]
     unscoped (blocks:[]) accepted identities: 8/8
     citations pointing at a turn absent from the session: 0

=== BAR 3: deterministic floor preservation ===
  visa|spk:2|ruby          blocks=[{205,245}] turnsCovered=41 goldOfThoseBlocks={Ruby}         floorCorrect=true
  leeds|spk:0|jubin thakkar blocks=[{5,5}]     turnsCovered=1  goldOfThoseBlocks={Jubin Thakkar} floorCorrect=true
  floor turns covered (block-based) = 42

=== BAR 4 ===  sessions with all 3 outer runs: 0/11 ; NOT measurable: 11/11
=== BAR 5 ===  additions: 8 ; CORRECT under STRICT: 0 ; CORRECT under CHARITABLE: 0   [bar: >= 1]

=== CHECKER SUMMARY (independently derived, no 05-score.mjs) ===
  bar1 accepted precision 100%?   FAILS  (0/8 = 0.0%)
  bar2 zero wrong links?          FAILS  (8 wrong)
  bar3 floor preserved?           floor present, 42 turns, 2 entries
  bar4 stable across 3 runs?      FAILS / NOT MEASURABLE (11 sessions lack 3 runs)
  bar5 >=1 correct addition?      FAILS  (0)
```

### My numbers vs the maker's `measurement-summary.json`

| Bar | Maker's `05-score.mjs` | My independent re-derivation | Agree? |
|---|---|---|---|
| 1 accepted identity precision | 0/8 = 0% | 0/8 = 0% strict; **0/8 charitable**; 2/8 most-generous | **yes** |
| 2 wrong label/name/citation links | 8 | 8 (all 8 unscoped `blocks:[]`) | **yes** |
| 3 deterministic floor | 2 entries, 42 block-covered turns, 0 contradictions | 2 entries, 42 turns, both gold-correct, 0 contradictions | **yes** |
| 4 stability across 3 outer runs | `allStable:false` | not measurable at all — **0/11** sessions have 3 runs | **yes** (mine is stricter) |
| 5 ≥1 correct addition | 0 | 0 strict **and** 0 charitable | **yes** |

**The maker's scorer is not inflating its own grade.** Where my reading differs it is *harsher*,
never softer: the maker's bar-4 reports "unstable", mine reports "unmeasurable" (no session has
three runs); and under the charitable cited-block reading the unit still scores **0/8**, not
better. So the scorer's *identity* arithmetic is credible and I credit it as such. Its *citation*
arithmetic is not — see §5 / ISS-289.

**Where the manifest and the data part company.** The manifest's "D-015 measurement" section
narrates ISS-255 case 2 as *"shipped-layer accepted set stable across outer runs 1-3 (the recorded
run 1 vs 2-3 instability at the shipped layer is gone)"*. Outer run 3 does not exist and outer run
2 covers 4 of 11 sessions. The section header is still the unfilled placeholder ``ISS-255: `n/4` ``
and "Actual outputs" still reads *"(runs 2-3 appended below at close of run)"* with nothing
appended. The Capability coverage table's rows 3, 4 and 5 all cite pasted verdicts "(below)" that
**are not in the file**. The unit was submitted `Status: ready-for-check` mid-experiment. The
primary verdict charges this as ISS-283 and I concur without adding a duplicate.

---

## 3. GOLD-LABEL AUDIT — is `unnamed` quietly excusing pipeline errors? **No. The opposite.**

This was the single most likely place for a self-serving measurement to hide, so I read the actual
transcript text behind four sampled blocks, including every distinct wrongness class in the
accepted set.

**First, the structural point that settles the direction of any bias.** In both the maker's scorer
and mine, a gold-`unnamed` block **contradicts** a label-wide named claim (`nameMatch(name, null)`
is false). So every extra `unnamed` label makes the pipeline score **worse**, not better. The
feared inflation-by-`unnamed` is arithmetically impossible in this design. What over-labelling
`unnamed` *could* do is unfairly suppress bar 5 (correct additions), so that is the direction I
audited.

**Sample 1 — `2026-05-23-uniaccess-atlas-skilltech` `spk:0`, gold `unnamed`, accepted "Sonal":**
```
3 [spk:0] t004: Hello, Sonal.
4 [spk:0] t005: Sonal, do you have any questions?
5 [spk:1] t006: Uh, but I think Sonal is not having any questions, she's dropped a text.
6 [spk:0] t007: Okay. Perfect. So, thank you so much. Thank you, Sonal, for sticking with us around.
```
`spk:0` **addresses** Sonal three times; `spk:1` confirms Sonal is a silent attendee. Gold
`unnamed` is correct; the pipeline's `spk:0 -> Sonal` is a third-party-address error. **Gold sound.**

**Sample 2 — `2026-08-03-uk-beyond-offer-letters` `spk:4`, gold `Bhakti`, accepted "Bhavya" via t042:**
```
39 [Bhavya]    t040: Right. Right. So, I think, um, we are now moving to the end of our session...
40 [Jasminder] t041: Thank you, Bhavya. Thank you, Bhakti.
41 [spk:4]     t042: Thank you, Bhavya. Thank you, Jasmine, YY, Nick, and Jasminder...
```
Bhavya speaks in her **own named turn** t040, so she cannot also be `spk:4`; t041 thanks exactly two
hosts, Bhavya and Bhakti; `spk:4` is the remaining host thanking Bhavya. Gold `Bhakti` is
well-founded; accepted "Bhavya" is a gratitude-address error. **Gold sound.**

**Sample 3 — `2026-07-30-in-focus-3` `spk:1` block 14, gold `Nikhil`, accepted "Shithij" via t022:**
```
21 [spk:1]   t022: Yeah. Let me first introduce Shithij. Shithij runs Astero Education Services...
22 [Shithij] t023: Thank you, Nikhil, for a very, uh, warm welcome.
```
`spk:1` is the **introducer**, and the very next turn names the introducer as Nikhil. Gold
`Nikhil` is directly evidenced; accepted "Shithij" is an introduction-target inversion. **Gold sound.**

**Sample 4 — `2026-08-24-uniaccess-leeds-arts-university` `spk:1` block 88, gold `unnamed`, accepted "Jubin" via t088:**
```
 5 [spk:0] t006: ...let me quickly introduce myself first. My name is Jubin Thakkar...
87 [spk:1] t088: Hi. Hi. Hi. Hi, Jubin, go now. You're literally holding the school.
```
`spk:0` **self-names** as Jubin Thakkar (this is exactly the deterministic floor entry); `spk:1`
addresses him. Gold `unnamed` for `spk:1` is correct. **Gold sound.**

**Ruling on item 3: the gold labels are honest and are not being used to excuse pipeline errors.**
Every sampled `unnamed` is a block where the transcript genuinely binds no name to the speaker,
matching the stated ground-truth rule, and each sampled named block is directly evidenced in the
text. The gold set is, if anything, the most defensible artifact in this unit. Gold provenance is
recorded per block with an evidence quote and a confidence field, which is what made this audit
cheap.

*One measurement-hygiene note, low severity, recorded here and deliberately NOT filed as an issue
(D-014):* `05-score.mjs:21` carries a hand-written gold override inside the **scorer**
(`TURN_OVERRIDES = { "2026-07-30-in-focus-3-t071": "Shithij" }`) rather than in `gold-labels.json`.
Ground truth belongs in the gold file, not the instrument. It changes nothing here — my scorer has
no overrides and reaches the same 0/8 — but it should move.

---

## 4. ISS-104 BY ID (D-015) — corpus is byte-faithful to the ledger row; 17/20 reproduced

```
$ node_modules/.bin/tsx qa/probes/iss104-rederive.mts
refused | Everyone | Hello Everyone, thanks for joining.
refused | Everyone | Welcome Everyone to the session.
refused | Everyone | Hey Everyone welcome aboard.
refused | All      | Thanks All for being here.
refused | Guys     | Hi Guys, let us start.
refused | There    | Hi There, can you hear me?
refused | Back     | Welcome Back to the second session.
refused | To       | Welcome To the annual conference.
refused | So       | Thank you So much everyone.
refused | Sorry    | I'm Sorry about the delay.
refused | Not      | I am Not sure about that.
refused | Great    | That's Great news for us.
refused | Important| This is Important for all of you.
refused | Monday   | Thank you Monday for the slot.
refused | Monday   | Monday with us marks the deadline.
refused | Diwali   | Welcome Diwali celebrations this week.
SHIPS   | India    | This is India speaking on the panel.
SHIPS   | Mumbai   | Coming up next, Mumbai from the west zone.
SHIPS   | Google   | Google here has an announcement.
refused | English  | English speaking students may apply.
--- refused 17/20
```

**The D-015 substitution check — is this the issue's OWN recorded corpus?** I read ISS-104's row in
`qa/issues.jsonl` and compared its `evidence` field string-by-string against the 20 cases the probe
executes. **All 20 match verbatim, in the same order**, from "Hello Everyone, thanks for joining."
through "English speaking students may apply." **This is not a substituted corpus** — it is the
ledger's own 20 reproductions. The manifest's `17/20 refused` reproduces **exactly**.

**The 3 deliberately-open reproductions, named with their reason (D-015 requires naming, not omission):**

| # | Reproduction | Fabricated person | Why it is left open |
|---|---|---|---|
| 1 | `This is India speaking on the panel.` | `person:india` | Gazetteer class (place name). It has a person-valid twin of **identical syntax** — "This is Rahul speaking on the panel." — so no syntactic gate separates them; refusing it requires world knowledge the local rule layer does not have. Pinned by a standing test asserting it STILL SHIPS, so the number cannot rot in either direction. |
| 2 | `Coming up next, Mumbai from the west zone.` | `person:mumbai` | Same class; twin "Nilesh from the west zone." |
| 3 | `Google here has an announcement.` | `person:google` | Same class (organisation name); twin "Nilesh here has an announcement." |

The fourth historical residue, `English speaking students may apply.`, is now **refused** — closed
by ISS-097 on the syntactic ground that `speaking` there is a participial modifier of a following
noun, not the self-identification idiom the cue encodes. ISS-104 correctly **remains OPEN** on the
three gazetteer cases and is **not this unit's seam**; the manifest says exactly that and I confirm
it. **ISS-104 is the one D-015 measurement in this manifest that is done properly**, and it deserves
saying so plainly.

---

## 5. THE FINDING THE PRIMARY CHECK DID NOT MAKE — the scorer's citation test is circular (ISS-289)

This is what re-deriving the bars without `05-score.mjs` bought. The gate's bar 2 is *"zero wrong
**label/name/citation** links"* — three halves. The maker's scorer reports the citation half as
perfect:

```
iss255.cases[3] = { name: "every accepted evidence pair carries the name verbatim in a
                            cue-shaped turn",
                    pass: true, evidencePairs: 8, invalidCount: 0, invalid: [] }
```

`05-score.mjs:258-274` computes that by importing the **production** rules module and testing:

```js
const rules = await import(pathToFileURL("packages/index/src/pipeline/speaker-name-rules.ts").href);
...
const okVerbatim = rules.containsNameVerbatim(t.text ?? "", c.displayName);
const okCue      = rules.citesNameAsAnIntroduction(t.text ?? "", c.displayName);
if (!okVerbatim || !okCue) invalidPairs.push(...);
```

`citesNameAsAnIntroduction` is **the same predicate `extractSpeakers` used to accept the identity**
(`speakers-llm.ts:28` imports it). The scorer therefore asks the acceptor whether the acceptor
accepts. `invalidCount: 0` is guaranteed for every identity the pipeline admitted through that
rule — it cannot report anything else. And the test never checks that the cited turn **belongs to,
or is spoken by, the label being identified**.

What that conceals, which my own re-derivation surfaced:

```
  [run 1] 2026-08-24-uniaccess-leeds-arts-university
    accepted: spk:3 -> "Jubin"  blocks=[]  (UNSCOPED = label-wide claim)
    cited: ...-t088 -> block 88 [spk:1] gold=unnamed speakerRef=spk:1
    label spk:3 spans 22 gold blocks; gold persons on that label = {Sheetal, Bhakti, Supriya, unnamed}
```

A `spk:3` identity whose **sole** evidence is a turn spoken by `spk:1`, scored as a valid citation.
And t088 is *"Hi, Jubin, go now"* — address evidence pointing **away** from the speaker, while t006
has `spk:0` self-naming "My name is Jubin Thakkar". All **8/8** accepted identities are this shape
(address or gratitude), and **8/8 carry `blocks: []`** — unscoped, session-wide claims, which is
precisely the "a single session-wide label can cover multiple people" false-merge risk the gate was
opened to prevent.

**Why this is filed separately from ISS-282 and matters beyond this cycle:** ISS-282 charges the
*results*; this charges the *instrument*. It **survives the ISS-282 fix** — if a future cycle lifts
identity precision, this half of bar 2 would still certify wrong citations as valid, and a PASS
could be minted on them. Filed **ISS-289 (high)**.

---

## 6. CORPUS ARITHMETIC (item 5) — does NOT reproduce; harness has no corpus pin (ISS-290)

```
$ node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/01-block-stats.mjs
affected sessions: 12
  ...
  2026-09-24-zoho-next-european-study-destinations | turns 80 | positional 2 | blocks 2 | label-pairs 1
TOTAL positional: 496 | blocks: 242 | session/label pairs: 30
```

Expected `494 / 240 / 29` over **11** sessions; measured `496 / 242 / 30` over **12**. The manifest's
claim *"The gate's own evidence numbers reproduce exactly"* is **no longer true**. The cause is a new
session ingested by unrelated concurrent webinar-bot work on this same branch — environmental, not
a defect in this unit's logic, and the primary verdict records it as ISS-284.

I add the **mechanism**, which is a defect and which ISS-284 does not cover: `01-block-stats.mjs:9`
and `04-regate-eval.mts:41-46` both derive their session set by globbing `data/toc-migrated` live,
with **no frozen corpus manifest**. `gold-labels.json` pins 11 sessions / 240 blocks, and
`05-score.mjs` iterates `gold.sessions` only — so it **silently excludes** the 12th session rather
than failing loudly. A cycle-1 re-measure would burn provider calls on an ungolded session and score
nothing for it, with no error raised. Since ISS-282's fix *requires* a full re-measure, this blocks
the remedy. Filed **ISS-290 (medium)**.

Gold-side arithmetic **does** reconcile: my independent block rebuild agrees with
`gold-labels.json` on **all 11** sessions (`block-count agreement: ALL MATCH`), totalling **240
blocks = 144 named + 96 unnamed**, matching the manifest.

---

## 7. Live-Ollama leg — what I re-ran, and what I did NOT

Ollama **is** running and serving the frozen digest (`qwen3:8b`, digest
`500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41` — confirmed via
`/api/tags`), so no leg was blocked by a missing runtime.

**I did NOT re-run the full `04-regate-eval.mts --run 1/2/3`.** Outer run 1 alone consumed
~2,667,000 ms (~44 min) of live provider time across 11 sessions, and the full three-run design is
2,340 calls / several hours. I say this plainly rather than implying the model outputs were
re-verified wholesale. Also, re-running it in place would **append to the maker's
`run-results.jsonl`/`raw-proposals.jsonl`**, which a read-only checker must not do.

**What I did instead, to avoid simply trusting the persisted JSONL:** I wrote **my own** harness
(in scratch, writing nothing anywhere) that calls the shipped `extractSpeakers` against live Ollama
on the two cheapest corpus sessions, and compared its output to the maker's recorded lines:

```
[CHECKER LIVE] 2026-05-23-uniaccess-atlas-skilltech: 49090ms windows=3 calls=9 degraded=no
  accepted (1): [{"ref":"spk:0","name":"Sonal","ev":["...-t007"],"blocks":[]}]
  unresolved: ["spk:1"]
[CHECKER LIVE] 2026-07-22-uniaccess-cept-university: 12584ms windows=1 calls=3 degraded=no
  accepted (0): []
  unresolved: ["spk:2"]
```

Both **reproduce the maker's recorded results exactly** (atlas: `spk:0 -> "Sonal"`, ev t007,
`blocks:[]`, unresolved `spk:1` — identical in the maker's run 1 *and* run 2; cept: 0 accepted,
unresolved `spk:2`). So the persisted JSONL is **genuine, not fabricated**, and the wrong-link
defect reproduces in a **third** independent execution. That is a point in the maker's favour on
honesty and against the unit on substance.

**Disclosed gap:** the remaining 9 sessions of run 1, and the unfinished runs 2–3, were judged from
the maker's persisted output rather than re-executed.

---

## 8. Diff scope (step 4c)

`git diff HEAD` touches no code under this unit's claimed surface (§1). The evidence dir is
untracked, so I diffed its listing against the manifest's "What changed": `07-per-block.mjs` and
`per-block-results.json` are present but unlisted — already charged as ISS-284 by the primary; I do
not duplicate it. **No function, class, export, route, test or config key is deleted or renamed by
this unit** — it removes nothing.

## 9. Live browser — not applicable, and here is the reason (D-024 requires stating it)

**LIVE-BROWSER: not-applicable.** D-024 gates Mode D on the **changed file paths**, and this unit's
changed paths are exclusively `qa/evidence/.../*.mjs|*.mts|*.json|*.txt` plus one manifest — data
files and measurement scripts. `git diff HEAD -- apps packages/index/src packages/ai config schema`
is **empty** (§1), so nothing this unit touched can alter what any page renders, directly or
indirectly (the indirect case D-024 names — a retrieval or ranking change altering a rendered
answer — does not arise, because the ranking code is byte-untouched and nothing was persisted).
The unit produces no surface a browser could drive: its entire output is JSONL and JSON on disk.
Stating this explicitly rather than omitting it, as the project requires.

## 10. Issues addressed

The manifest claims `Issues addressed: none (gate precondition)`. Nothing to verify closed. ISS-104
is correctly reported as **still open** on its three gazetteer residues rather than claimed fixed —
accurate reporting, credited.

---

## THE RULING THAT MATTERS — is phase 4 unblocked?

**No. Phase 4 stays BLOCKED.**

`qa/gates/speaker-segment-identity.md` item 4 is explicit: *"Do not change `schema/`, rewrite
`turns.speakerRef`, or persist model-derived identities until an independent checker PASSes that
precision gate."* I am that independent checker, and on my own arithmetic the gate's headline bar —
**100% accepted identity precision** — measures **0%**. Not marginally short: **zero of eight**
accepted identities is correct, under the strict reading *and* under the charitable cited-block
reading, with the most generous reading conceivable reaching only 2/8.

Being conservative here is not caution for its own sake. Every one of the 8 accepted identities
carries `blocks: []` — a session-wide claim over a recurring label — which is **the exact
false-merge hazard the gate was opened to prevent**, and the wrongness class is uniform and
verified against transcript text: the model credits the speaker with the name of the person they
are *addressing* (`spk:0`→Sonal, `spk:4`→Bhavya, `spk:1`→Shithij, `spk:1`/`spk:3`→Jubin). Phase 4
writes these to real data. Persisting `spk:1 -> Shithij` across 18 blocks whose gold person is
Nikhil, or `spk:3 -> Jubin` across blocks belonging to Sheetal, Bhakti and Supriya, would corrupt
identity attribution on production transcripts — and corrupted identity data is far more expensive
to detect and unwind than an unshipped feature.

The gate also demands three complete runs; **run 3 never executed and run 2 is 4/11 complete**, so
bar 4 is not merely failing but **unmeasurable**. And ISS-289 means the citation half of bar 2 is
currently scored by an instrument that cannot fail.

What the unit genuinely earned: the no-write discipline is real and verified; the gold labels are
honest, well-evidenced, and audit clean; the ISS-104 D-015 measurement is done correctly against
the ledger's own corpus; the deterministic floor is preserved intact (42 block-scoped turns, 2
speakers, both gold-correct, zero contradictions from accepted identities); and the measurement is
reproducible enough that a live third run reproduced it. **The measurement is trustworthy. Its
result is a failure.** That is a useful unit — it told the truth about a pipeline that is not ready
— and the correct disposition of a truthful negative result is FAIL-the-gate, not PASS-the-unit,
because the manifest asks to be scored against bars the data does not meet.

```
VERDICT: FAIL
SCOREBOARD: 1/5 gate bars met, 2/2 invariants hold
FAILURES:
- [bar1 precision + bar2 wrong links + bar5 additions] sev: critical · independently re-derived WITHOUT 05-score.mjs: accepted identity precision 0/8 = 0% (strict AND charitable readings), 8 wrong label/name links, 0 correct additions; all 8 accepted identities are unscoped `blocks:[]` session-wide claims of the third-party-address class the gate exists to prevent · fix direction: constrain extractSpeakers to emit block-scoped identities only and reject address/gratitude-adjacent names as self-identification, then re-measure with all three outer runs complete · issue: ISS-282 (primary check; concurred, re-derived independently)
- [bar4 stability] sev: high · outer run 3 never executed and run 2 covers 4/11 sessions (15/33 JSONL lines, 957/2340 provider calls); bar 4 is not "unstable" but UNMEASURABLE — 0/11 sessions have three runs — while the manifest narrates "stable across outer runs 1-3 ... instability is gone" as settled fact and leaves `ISS-255: n/4` unfilled · fix direction: never submit ready-for-check mid-experiment; paste the scorer JSON verbatim · issue: ISS-283 (primary check; concurred)
- [bar2 citation half — scoring instrument] sev: high · 05-score.mjs:258-274 validates citations with `rules.citesNameAsAnIntroduction`, the SAME production predicate extractSpeakers used to accept the identity, so invalidCount:0 is guaranteed by construction; it never checks the cited turn belongs to the identified label, and reports 0 wrong citations while `spk:3 -> "Jubin"` is evidenced solely by turn t088 whose own speakerRef is spk:1 · fix direction: score citations with an instrument independent of the acceptance rule (assert cited-turn speakerRef == identity speakerRef for self-naming; apply the ISS-255 handover-direction rule at scoring time for address evidence) · issue: ISS-289 (NEW — not found by the primary check)
- [corpus reproducibility] sev: medium · 01-block-stats.mjs and 04-regate-eval.mts glob data/toc-migrated live with no corpus pin; re-run now yields 12 sessions / 496 / 242 / 30 vs the claimed 11 / 494 / 240 / 29, and 05-score.mjs silently excludes the ungolded 12th session rather than failing loudly — this blocks the re-measure ISS-282's own fix requires · fix direction: freeze the 11 session ids in gold-labels.json._meta and have all three scripts read that list, failing loudly on drift · issue: ISS-290 (NEW — mechanism behind the primary's ISS-284 observation)
CAPABILITY-COVERAGE: not-applicable (measurement artifact; the manifest correctly declares "NO ISOLATING FALSIFICATION — the re-run is the discriminator". Rows 1, 4, 5 re-run live and reproduced/failed as reported above; row 3 re-derived from scratch WITHOUT the maker's scorer per D-015; row 2 partially re-executed live on 2 of 11 sessions with my own harness — both reproduced exactly — with the remaining 9 sessions judged on persisted output, disclosed in §7)
LIVE-BROWSER: not-applicable (no UI surface exists in or near this unit; changed paths are qa/evidence/**.mjs|.mts|.json|.txt plus one manifest, and `git diff HEAD -- apps packages/index/src packages/ai config schema` is empty, so no direct or indirect rendering path is touched — stated explicitly per D-024 rather than omitted)
ISSUES-WRITTEN: ISS-289, ISS-290
EXECUTOR: claude-sonnet-subagent (checker: claude-opus-subagent, second independent checker; self != executor)
EXPLANATION: I re-derived all five gate bars with my own script from the raw run-results.jsonl and gold-labels.json, never calling the author's 05-score.mjs, and reached the same numbers it reports — 0/8 precision, 8 wrong links, 0 additions — which credits that scorer's identity arithmetic as honest while its citation arithmetic turns out to be circular (ISS-289). I audited four gold blocks against transcript text and found the labels sound, with gold-`unnamed` working against the pipeline rather than excusing it, so the suspected self-serving measurement is not present. ISS-104 reproduces at 17/20 against the ledger row's own verbatim 20 cases, with the three residues named as the gazetteer class. Phase 4 stays blocked: the gate's 100%-precision bar measures 0%, every accepted identity is an unscoped session-wide claim of the exact false-merge class the gate was opened to prevent, and run 3 never executed.
```
