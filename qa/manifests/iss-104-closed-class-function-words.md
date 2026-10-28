# Manifest — iss-104-closed-class-function-words
**Contract:** qa/contracts/speaker-resolution-llm.md (criterion **[C2b]**; **[C12]** is why refusal is the safe error)
**Goal task:** U2.4 (catalogue B3 — speaker identity resolution)
**Date:** 2026-09-28
**Fix cycle:** 1 of max 3
**Dual check:** required (ISS-104 is severity `critical`)
**Persona walk:** skip (no user-facing surface exists in the diff — cycle 0's two changed files are
`packages/index/src/pipeline/*.ts`: one a pure predicate module exporting `looksLikeAName`,
`containsNameVerbatim`, `isDiscourseOnly` and `citesNameAsAnIntroduction`, the other its test file.
Cycle 1 adds two more non-runtime files — a probe script (`scripts/lib/audit-closed-class.mjs`) and
its data file (`packages/index/src/pipeline/closed-class-audit-words.json`) — neither imported by
any shipped code path. No route, view, template, API handler or persisted document is touched by
either cycle, so no user type can observe a difference. Checkable against the diff: `git show --stat`
on this unit's commits.)
**Issues addressed:** ISS-104 (partially — see "What ISS-104 still has open"); ISS-104CC-1 (cycle 1,
closed — see "Cycle 1" section below; no other id is claimed)
**Executor:** claude-sonnet-subagent
**Executor rationale:** a single-file predicate change plus its regression corpus; the hard part was
the enumeration and the measurement discipline, neither of which needed a larger model or an
external tool.

---

## Cycle 1 — C13 closed: the audit is now a committed, re-runnable artifact

Cycle 0's checker verdict (`qa/verdicts/iss-104-closed-class-function-words.md`) FAILed on exactly one
finding, C13, severity medium:

> The manifest's headline closed-class audit ("406 words enumerated; 277 absent from
> `NEVER_A_PERSON`, all 277 shipped a fabricated person; after: 0/406") is not independently
> re-derivable — no script or word-list artifact is committed ... Fix direction: commit the probing
> script + word-enumeration data file ... used to produce these numbers, to the same standard already
> met by the other two corpora.

Fixed by committing both artifacts, colocated with this seam's other scripts/tests per repo
convention (`scripts/tracker-audit.mjs` + `scripts/lib/tracker-audit.mjs` is the existing pattern
for a probe-script-plus-data-file pair):

- `packages/index/src/pipeline/closed-class-audit-words.json` — the enumeration data, with its own
  method + exclusion rationale in its header fields.
- `scripts/lib/audit-closed-class.mjs` — the probe. Runs the real module (`extractSpeakers`, the
  same `"I am <Word> sure about that."` shape and offline `replies()` fake-completion pattern the
  test suite already uses — no network, no LLM) over every enumerated word and reports the live
  bypass count. Run it yourself: `node scripts/lib/audit-closed-class.mjs --base 2bda2f4`.

**Re-deriving the audit from scratch — rather than reusing cycle 0's uncommitted numbers, which no
longer exist anywhere to check against — gives a corrected headline.** Cycle 0's own script was never
committed, so there is no way to know exactly what it enumerated; this cycle's enumeration is
independently built by parsing `NEVER_A_PERSON` itself and excluding the 12 collective-address words
(`guys`, `folks`, `team`, `people`, `friends`, `members`, `gentlemen`, `ladies`, `audience`,
`participants`, `attendees`, `colleagues` — open-class nouns, not part of either SET A's closed
grammar or SET B's four role sets; see the data file's `excludedCollectiveAddress` field). Per this
cycle's own brief: *"a corrected number is a fine outcome; a fabricated match is not."* The real,
re-run numbers:

| | cycle 0 claimed (uncommitted, unverifiable) | cycle 1 re-derived (committed, `node scripts/lib/audit-closed-class.mjs --base 2bda2f4`) |
|---|---|---|
| words enumerated | 406 | **409** (SET A 299 + SET B 110) |
| missing from `NEVER_A_PERSON` at base, all shipping a fabricated person | 277 | **276** |
| already present at base | 129 | **133** |
| live bypasses now | 0 / 406 | **0 / 409** |

The base-commit run in the table above (`--base 2bda2f4`) doesn't just diff word lists — it actually
swaps in the base-commit `speaker-name-rules.ts` behind the unchanged `speakers-llm.ts` harness and
re-runs `extractSpeakers` for real, so "all 276 shipped a fabricated person at base" is a measured
fact, not an inference. The **0/409 now** figure is the operative claim this unit stands on; the
before/after gap (276) is closer to the original 277 than the total (409 vs 406) is to 406, which is
consistent with cycle 0 having enumerated almost the same set but through a different, unrecorded
method. The three occurrences of "406/277" and one of "147" further down this document are cycle 0's
original, uncorrected prose, left as the historical record of what was claimed at the time; this
table is the corrected, re-derivable figure.

Also corrected (verdict, low severity): the base-commit `NEVER_A_PERSON` size below is stated as
"147 entries" — the actual count at `2bda2f4` is **146** (145 unique + 1 pre-existing duplicate,
`everyone`, which predates this cycle). The "+276 words" delta in "What changed" below is now
**+276** exactly matching (422 − 146 = 276), so that arithmetic still holds; only the stated
absolute baseline was off by one, as the checker found.

**Issues addressed (cycle 1):** ISS-104CC-1 (closed — the audit is now committed and re-derivable).
Not addressed and not claimed: ISS-104 itself remains at 17/20 (unchanged, see "What ISS-104 still
has open"); no words were added, no behaviour changed, per this cycle's brief.

---

## The finding that comes first: the brief's premise was stale

The dispatch brief said 15/20 of ISS-104's recorded attacks are refused and that `person:not` still
ships, naming `not` as this unit's chargeable target. **Measured at 2bda4f4 before any edit: 17/20,
and `Not` is already refused.** `not` was closed by ISS-095 and `English` by ISS-097 in later
cycles, and the ledger row's own `checker_note` records both — "[cycle 2] Re-derived 17/20 refused
against 9b0fdce". The scoped "chargeable one" therefore did not exist any more, and adding `not`
would have been a no-op dressed as a fix.

That is exactly why this unit did the other half of its brief instead, and it is the substance of
the cycle: **enumerate the class rather than add the word you were shown.**

## The real defect, measured

`NEVER_A_PERSON` held 147 entries [corrected in cycle 1: the actual base-commit count is **146**,
see "Cycle 1" above], and every one of them was there because some issue had named it —
`not` from ISS-095, `to`/`so`/`back` from ISS-093. The list was never *wrong*; it was never
*finished*, and nothing in it said which words were still missing. Six rounds on this seam each
added the word they were shown.

So the missing words were enumerated from the grammar and then probed. Method, stated so it is
reproducible and auditable rather than a dump:

- **SET A — the grammatically CLOSED classes of English**, enumerated class by class: pronouns
  (personal, possessive, reflexive, indefinite, interrogative/relative), articles and determiners,
  conjunctions (coordinating, subordinating, conjunctive adverbs), prepositions, auxiliary and modal
  verbs, adverbial particles, negators, degree/focusing adverbs, numerals and ordinals, deictic and
  temporal adverbs. **A class is closed when its membership does not grow with the language** —
  English gains nouns and adjectives weekly and has not gained a preposition in centuries. That
  property, not diligence, is what makes SET A completable, and it is the whole difference between
  this list and "every word that is not a name", which is the objection cycle 1 correctly raised
  against having a denylist at all.
- **SET B — the four sets [C2b] names by ROLE rather than by grammar**: greetings and farewells,
  interjections and fillers, acknowledgement responses, calendar terms, plus the standalone
  evaluative responses that `good` and `great` already stood for. These are **bounded by enumeration
  only, not closed by grammar**: a new interjection can be coined. The asymmetry is recorded
  deliberately — a later gap in SET B is a genuine finding, while a later gap in SET A would mean the
  enumeration above was done wrong.

**Measurement, before the change.** 406 words enumerated; 277 of them absent from `NEVER_A_PERSON`;
**all 277 shipped a fabricated person** — every single one through the very
`"I am <Word> sure about that."` shape ISS-104 recorded for `Not`. The defect was never the word. It
was the sampling. [Corrected in cycle 1, with a committed, re-runnable script: **409 enumerated, 276
missing-and-shipped, 133 already present** — see "Cycle 1" above.]

**After the change: 0 of 406.** The audit also caught a transcription slip in this unit's own first
pass — `via` was in the enumeration and missing from what actually got written to the file, and the
probe found it rather than a future checker (`Via <- "I am Via sure about that."`). `noone` was
dropped from the enumeration as not being an English word; the correct `"No One"` is two tokens, both
already in the set, and is refused.

## What changed
- `packages/index/src/pipeline/speaker-name-rules.ts:138-143` — a 6-line header stating the SET A /
  SET B method, the 277/277 measurement, and the collision cost, pointing here for the long form.
- `packages/index/src/pipeline/speaker-name-rules.ts:144-166` — **+276 words** in 16 labelled groups
  appended to `NEVER_A_PERSON` (147 → 422 entries). Each group carries a trailing class label so a
  reader can audit the enumeration class by class instead of scanning a word soup. Nothing removed.
- `packages/index/src/pipeline/speaker-name-rules.test.ts:177-242` — a **D-015 fidelity test** that
  reads ISS-104's `evidence` field out of the ledger union (`qa/issues.jsonl` + `qa/issues.*.jsonl`,
  per D-019), re-parses its 20 recorded reproductions, and asserts the in-file corpus is
  byte-identical to them in content and order.
- `packages/index/src/pipeline/speaker-name-rules.test.ts:244-287` — one standing sentinel per closed
  class (16 classes, 44 cases), in the recorded `I am <Word> sure about that.` shape.
- `packages/index/src/pipeline/speaker-name-rules.test.ts:279-308` — the name-collision cost pinned in
  **both** directions: bare `Will` refused, multi-token `Will Smith` / `Doris Day` / `Can Ozturk`
  still resolving.

Only these two files changed. No function, test, export or config was deleted or renamed;
`packages/index/src/pipeline/speakers.ts` is byte-untouched (**[I2]**), nothing is persisted
(**[I3]**), and no contract or ledger file was edited.

## D-015 — measured against ISS-104's OWN recorded reproductions

The 20 cases were extracted programmatically from `qa/issues.jsonl` row `ISS-104` field `evidence`
(pattern `"([^"]+)"/"([^"]+)"->person:`), not retyped, and the in-file corpus is now asserted equal
to that extraction by a test rather than by my word.

**`ISS-104: 17/20 refused`** — the same before and after, because these 20 were already at 17 and
this unit's additions target the *class* that the 20 only sampled. The number is reported rather
than improved on purpose: **a cycle that moved 277 live bypasses to 0 and left this count flat is
the honest reading**, and raising it would have required claiming the gazetteer residue.

The 3 deliberately left open, named with their reason as D-015 requires:

| case | candidate | why it is still open |
|---|---|---|
| `"This is India speaking on the panel."` | `India` | gazetteer class — a country name |
| `"Coming up next, Mumbai from the west zone."` | `Mumbai` | gazetteer class — a city name |
| `"Google here has an announcement."` | `Google` | gazetteer class — an organisation name |

These are **not** charged to this unit, on the checker's own recorded judgement ("no pattern
separates a city from a person without world knowledge"), and this unit did **not** invent a
gazetteer. Each has a person-valid twin of identical syntax — `"This is Rahul speaking on the
panel."`, `"Nilesh from the west zone."`, `"Nilesh here has an announcement."` — so any syntactic
gate that refused them would refuse a real introduction. They stay pinned as expected-shipping tests
so the count cannot rot in either direction. **What closing them would actually require** is under
"Honest limits" item 1.

## How to verify (commands + expected)
- `pnpm test` in `packages/index` → expected: exit 0, `pass 285`, `fail 0`
- `pnpm typecheck` in `packages/index` → expected: exit 0, no diagnostics
- `node --test --import tsx "packages/index/src/pipeline/speaker-name-rules.test.ts"` → expected
  `pass 87`, `fail 0`, including `D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions`
- `node scripts/lint-loc.mjs` → expected: the **same 4 pre-existing** violations as at 2bda4f4
  (`speakers-llm.ts`, `sb_join.py`, `obs-windows.ts`, `run-watch.mjs`) and **not**
  `speaker-name-rules.ts`
- `node scripts/lib/mutate.mjs assert-clean` → expected `MUTATIONS CLEAN: none outstanding`
- **(cycle 1)** `node scripts/lib/audit-closed-class.mjs --base 2bda2f4` → expected:
  ```
  enumeration: 409 words (SET A 299 + SET B 110)
  AFTER  (current tree): LIVE BYPASSES: 0 / 409
  BEFORE (2bda2f4):    LIVE BYPASSES: 276 / 409
  ```
  (the `--base` flag is optional and slower — it swaps in the base-commit `speaker-name-rules.ts`
  in a scratch copy and re-runs the real module against it; omit it for a fast AFTER-only check,
  which is what a re-check of "0 live bypasses now" actually needs)

Note for the checker: this worktree had no `node_modules` on arrival; `pnpm install --frozen-lockfile`
at the worktree root is needed before any test command. If `pnpm test` fails with
`Cannot find package 'esbuild'` from inside `tsx/dist/*.mjs` (a broken/partial pnpm link, hit during
cycle 1, unrelated to any code in this diff), `pnpm install --force` at the worktree root repairs it;
re-ran clean afterward at `pass 285 / fail 0`.

## Actual outputs (from maker's own run)

`pnpm test` (packages/index):
```
ℹ tests 285
ℹ pass 285
ℹ fail 0
```

`pnpm typecheck` (packages/index):
```
> @lkb/index@0.0.0 typecheck D:\KnowledgeBase-lanes\iss-104-speaker-closedclass\packages\index
> tsc --noEmit -p tsconfig.json
TYPECHECK EXIT=0
```

Speaker suite alone, 84 → 87 tests (44 sentinels + 4 collision + 1 fidelity are added as new
`test()` calls; the existing 84 roll forward unchanged, none replaced):
```
ℹ tests 87
ℹ suites 0
ℹ pass 87
ℹ fail 0
```

ISS-104's 20 verbatim ledger cases, run through the real module:
```
refused  "Everyone" in "Hello Everyone, thanks for joining."
refused  "Everyone" in "Welcome Everyone to the session."
refused  "Everyone" in "Hey Everyone welcome aboard."
refused  "All" in "Thanks All for being here."
refused  "Guys" in "Hi Guys, let us start."
refused  "There" in "Hi There, can you hear me?"
refused  "Back" in "Welcome Back to the second session."
refused  "To" in "Welcome To the annual conference."
refused  "So" in "Thank you So much everyone."
refused  "Sorry" in "I'm Sorry about the delay."
refused  "Not" in "I am Not sure about that."
refused  "Great" in "That's Great news for us."
refused  "Important" in "This is Important for all of you."
refused  "Monday" in "Thank you Monday for the slot."
refused  "Monday" in "Monday with us marks the deadline."
refused  "Diwali" in "Welcome Diwali celebrations this week."
SHIPS    "India" in "This is India speaking on the panel."
SHIPS    "Mumbai" in "Coming up next, Mumbai from the west zone."
SHIPS    "Google" in "Google here has an announcement."
refused  "English" in "English speaking students may apply."

ISS-104: 17/20 refused
```

The 406-word closed-class audit, before and after (8 cue templates per word, first hit reported):
```
BEFORE (at 2bda4f4, probing the 277 enumerated words then missing from NEVER_A_PERSON):
LIVE BYPASSES: 277 / 277 probed
  Above  <-  "I am Above sure about that."
  Absolutely  <-  "I am Absolutely sure about that."
  Across  <-  "I am Across sure about that."
  Adios  <-  "I am Adios sure about that."
  After  <-  "I am After sure about that."
  ... (all 277 shipped; every one matched on the first template tried)

AFTER:
LIVE BYPASSES: 0 / 406 probed
```

`node scripts/lint-loc.mjs` — unchanged from baseline, `speaker-name-rules.ts` absent:
```
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```

## Capability coverage (each new claim -> its isolating falsification)

All three runs used `scripts/lib/mutate.mjs apply` (which refuses a file not byte-identical to HEAD)
plus a byte backup restored from a `trap ... EXIT INT TERM ERR` and verified with `cmp` — **D-020**.
Each run's restore printed `RESTORE: cmp byte-identical`, `MUTATIONS CLEAN: none outstanding` and
`RESTORE: git clean vs HEAD`; nothing was left applied. The speaker suite is green at
`pass 87 / fail 0` before every row, so no row is reddening an already-red check.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| A candidate drawn from a closed grammatical class is refused even when a naming cue sits beside it | `speaker-name-rules.test.ts:244-287` — `ISS-104 closed class — preposition: refuses "Between"` | delete the 3 preposition lines from `NEVER_A_PERSON` (`speaker-name-rules.ts:149-151`) — one hunk, one file | GREEN BEFORE: `✔ ISS-104 closed class — preposition: refuses "Between" (0.0724ms)` · RED AFTER: `✖ ISS-104 closed class — preposition: refuses "Between" (8.2316ms)`. Assertion that fired: `AssertionError [ERR_ASSERTION]: Between is a preposition, not a person`, `operator: 'deepStrictEqual'`, `actual: [ { displayName: 'Between', personId: 'person:between', ... } ]`, `expected: []`. Totals `tests 87 / pass 83 / fail 4` — the 4 are exactly the preposition sentinels `Between`, `Despite`, `Towards`, `Via` |
| **CONTROL for row 1** — another class is untouched by that edit, so the row isolates the prepositions rather than "a denylist exists" | same file — `ISS-104 closed class — auxiliary / modal: refuses "Should"` | (same edit as row 1) | STAYS GREEN: `✔ ISS-104 closed class — auxiliary / modal: refuses "Should" (0.5547ms)`, and so do `✔ D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions (17.1508ms)`, `✔ ISS-104 collision bound: multi-token "Will Smith" still resolves (0.4677ms)`, `✔ ISS-098 recall: still resolves "Ruby speaking here." (0.473ms)` |
| The ledger corpus cannot be silently substituted or shrunk — D-015 is enforced by the suite, not by intention | `speaker-name-rules.test.ts:177-242` — `D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions` | shorten one corpus row from `"I am Not sure about that."` to `"I am Not sure."` in `speaker-name-rules.test.ts` — one hunk, one file | GREEN BEFORE: `✔ D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions (20.3532ms)` · RED AFTER: `✖ D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions (25.2579ms)`. Assertion that fired: `AssertionError [ERR_ASSERTION]: the in-file corpus must equal the ledger's own cases, in order — substituting a corpus is the D-015 defect`. Totals `tests 87 / pass 86 / fail 1` |
| **CONTROL for row 3 — and the entire point of that row** | same file — `ISS-093 corpus: "Not" in ... is refused`, plus `preposition: refuses "Between"` and `ISS-098 recall: still resolves "Ruby speaking here."` | (same edit as row 3) | STAYS GREEN: `✔ ISS-093 corpus: "Not" in "I am Not sure." is refused (0.2574ms)`. **The weakened row's own refusal test passes** — which is exactly how cycle 3 measured 12/12 against a shrunken exam with nobody seeing it. Only the fidelity test caught the shrink. Also green: `✔ ISS-104 closed class — preposition: refuses "Between" (0.0898ms)`, `✔ ISS-098 recall: still resolves "Ruby speaking here." (0.533ms)`, `✔ ISS-104 collision bound: multi-token "Will Smith" still resolves (0.4398ms)` |
| The collision cost is BOUNDED to bare single-token candidates — a real surname still rescues the name | `speaker-name-rules.test.ts:299-308` — `ISS-104 collision bound: multi-token "Will Smith" still resolves` | `isDiscourseOnly`'s `tokens.every(` → `tokens.some(` (`speaker-name-rules.ts:173`) — one hunk, one file | GREEN BEFORE: `✔ ISS-104 collision bound: multi-token "Will Smith" still resolves (0.4632ms)` · RED AFTER: `✖ ISS-104 collision bound: multi-token "Will Smith" still resolves (4.0761ms)`. Assertion that fired: `AssertionError [ERR_ASSERTION]: isDiscourseOnly requires EVERY token — a real surname rescues the name`, `0 !== 1`. Totals `tests 87 / pass 84 / fail 3` — `Will Smith`, `Doris Day`, `Can Ozturk` |
| **CONTROL for row 5** — the refusal side is unaffected, so the row isolates the ALL-tokens rule rather than the denylist | same file — `preposition: refuses "Between"` and `collision cost: a bare closed-class name is refused` | (same edit as row 5) | STAYS GREEN: `✔ ISS-104 closed class — preposition: refuses "Between" (0.0765ms)`, `✔ ISS-104 collision cost: a bare closed-class name is refused (accepted, documented) (0.2853ms)`, `✔ D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions (25.5657ms)` |

## Live browser evidence

**Not UI-touching — no surface changed.** The changed paths that justify it, in full:
`packages/index/src/pipeline/speaker-name-rules.ts` and
`packages/index/src/pipeline/speaker-name-rules.test.ts`. The first is a pure predicate module (four
exported functions over strings — no I/O, no provider, no persistence per **[I3]**); the second is
its test file. No app, API, route, view, template or worker path appears in the diff, so no rendered
surface exists to photograph.

## Honest limits (stated, not hidden)

1. **The gazetteer class is genuinely open and this unit did not close it.** `India`, `Mumbai` and
   `Google` still ship. Closing them needs **world knowledge, not a pattern**: an entity-type lookup
   (place / organisation / language gazetteer, or an NER model with type labels) able to say "this
   proper noun denotes a city". A hardcoded country/city/company list was deliberately **not**
   shipped — it would be unbounded, locale-specific, and would start refusing real surnames
   (`Paris`, `Lincoln`, `Madison`, and in this corpus's own domain a great many place-derived Indian
   surnames). My assessment of the right layer: **the model should decline to propose them**, via
   the extraction prompt, with this module keeping only the syntactic guards it can actually
   discharge. That is a separate unit, and it needs an eval rather than a list.

2. **The after-cue narrowness the checker recorded is real, and it is NOT fixable within the
   closed-class approach.** The checker noted that demoting the bare demonstrative was narrower than
   the previous manifest claimed, because `"...India speaking..."` still ships through the after-cue
   branch rather than `DEMONSTRATIVE_CUES`. Confirmed, and I judge it unfixable here for a specific
   reason: the closed-class list is a **candidate-level** guard and `India` is not a closed-class
   word, so no enumeration can ever reach it. Tightening the *cue* side instead is the move that has
   already failed twice on this seam — ISS-094 (cycle 2 refused the greeting/handover class this
   contract exists to admit) and ISS-098 (the `speaking` gate cost ten recorded self-introductions).
   `"This is India speaking on the panel."` and `"This is Rahul speaking on the panel."` are the same
   construction; a syntactic gate cannot separate them, and each attempt to try has bought a recall
   regression. Item 1's entity-type layer is the only honest route.

3. **The name-collision cost is real and accepted, not eliminated.** `will`, `can`, `dare`, `need`,
   `day` and `true` are closed-class words that are also attested personal names, so a speaker
   introducing themselves as a bare `"Will"` is now refused. They are kept in because **[C12]** makes
   these guards the only surviving barrier against a fabricated identity, so refusal is the safe
   direction of error and matches this module's standing policy of leaving a low-confidence speaker
   unresolved rather than guessing; and because `may`, `march`, `june` and `august` have carried the
   identical cost as month names since cycle 3. The cost is **bounded** by `isDiscourseOnly`'s
   ALL-tokens rule, and both directions are pinned by tests, so it is visible and reversible rather
   than silent. A checker who judges this the wrong trade has everything needed to say so.

4. **SET B can still have gaps, by construction.** Greetings, interjections, acknowledgements and
   evaluative responses are bounded by enumeration, not closed by grammar. A future finding there is
   legitimate; completeness is claimed for SET A only.

5. **The source file is now at exactly 300 non-blank lines — the budget ceiling**
   (`structure.config.json` `loc.max`). It passes, with zero headroom, and the next addition to the
   enumeration will not fit. The structurally right next step is extracting the word list into its
   own data module — the same budget-driven split that created `speaker-name-rules.ts` out of
   `speakers-llm.ts` in the first place, as that file's own header records. I did **not** do it here
   because this unit's brief named a primary file and said to edit in place; flagging it rather than
   acting unilaterally.

6. **Pre-existing, untouched:** `everyone` appears twice in `NEVER_A_PERSON` (once under pronouns,
   once under collective address). Harmless in a `Set`. Not removed — removal is outside this unit's
   diff scope.

## What ISS-104 still has open

`ISS-104: 17/20 refused`, 3 open, all gazetteer class (`India`, `Mumbai`, `Google`), with the reason
and the required remedy in "Honest limits" item 1. **This unit does not close ISS-104** and does not
ask for it to be marked fixed. What it claims is narrower and checkable: the closed-class half of
ISS-104's `fix_direction` is now enumerated rather than sampled, measured at 277 → 0 live bypasses
across 406 enumerated words, and D-015's measurement rule is enforced by the suite instead of by
intention.

## Status: checked-PASS

**Handshake status:** checked-PASS (Cycle checked: 1, verdict
`qa/verdicts/iss-104-closed-class-function-words.md` committed 95a43fe, VERDICT: PASS, SCOREBOARD
19/19, CAPABILITY-COVERAGE 3/3 rows reproduced independently this cycle, LIVE-BROWSER
not-applicable, ISSUES-WRITTEN: none new) - closed out 2026-09-28.

**Read the verdict file from the BOTTOM.** It carries TWO `VERDICT:` lines: `## VERDICT: FAIL` at
line 12 (cycle 0) and `## VERDICT: PASS` at line 174 (cycle 1, the operative one). Cycle 0's block
is byte-intact, as the protocol requires. A reader who greps for the first match gets the wrong
answer.

**What this PASS does and does not close - stated precisely, because the gap is the point.**

- **Closed:** C13 only, i.e. ISS-104CC-1, the cycle-0 failure. The 409-word audit is now
  independently re-derivable: `scripts/lib/audit-closed-class.mjs` and
  `packages/index/src/pipeline/closed-class-audit-words.json` are committed, and the checker
  re-derived `409 (SET A 299 + SET B 110)`, `AFTER 0/409` and `BEFORE (2bda2f4) 276/409` itself
  rather than reading them here.
- **NOT closed: ISS-104 itself, which remains `open` and `severity: critical` in the canonical
  ledger.** This unit changed no behavior at all - `git diff 4f3fd9f..0a3463c` over
  `speaker-name-rules.ts` and `speaker-name-rules.test.ts` is empty. The speaker seam that D-041
  ruling 4 ordered worked "until it is clean" is therefore NOT clean; only the measurement of it
  is now trustworthy. Nothing here may be cited as progress on the fabrication defect.
- **NOT closed: ISS-104CC-2**, the worktree file-reversion anomaly found in cycle 0. Left open
  deliberately - it is a process/environment hazard, not this unit's scope. Root cause is already
  diagnosed (a `trap ... EXIT INT TERM ERR` whose byte backup was captured before the fix rather
  than before each mutation; a trap on EXIT fires on normal exit too, so shell teardown restored
  pre-fix content over finished work). D-020 as written permits that shape, which is the real
  finding.

**Corrections this cycle made to its own earlier record, rather than quietly restating:**

- The headline numbers moved `406 -> 409` enumerated and `277 -> 276` missing-at-base. Cycle 0's
  figures were produced by a script that was never committed and are therefore unverifiable; they
  are labelled that way throughout instead of being overwritten.
- The `147 entries` baseline was wrong; the real figure is 146.

**Standing constraint carried forward:** `speaker-name-rules.ts` sits at exactly 300 non-blank
lines, which is the `loc.max` ceiling with zero headroom - independently counted by the checker.
The next word cannot be added to that file. Extracting `NEVER_A_PERSON` into a data module is the
obvious move and is NOT authorized here; it needs its own unit.
