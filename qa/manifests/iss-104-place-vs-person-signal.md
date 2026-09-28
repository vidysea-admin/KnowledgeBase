# Manifest — iss-104-place-vs-person-signal

**Contract:** qa/contracts/speaker-resolution-llm.md — [C2b] (no fabricated person from a
capitalised non-name) and [C12] (these guards are the only barrier against a fabricated identity).
No criterion changes; the maker does not edit `qa/contracts/`.

**Goal task:** No `.goal/goal.json` task id equals this slug. Nearest related task is `U2.4`
("Speaker resolution (TOC turns are literally spk:0)"). The unit's driver is ledger issue
**ISS-104**, filed `critical`.

**Date:** 2026-09-28

**Fix cycle:** 0 of max 3

**Dual check:** Full ceremony, per D-013's severity gate — ISS-104 is `critical`.

**Persona walk:** **Skip**, decided from the changed paths, not asserted. The change is exactly
three files, all under `packages/index/src/pipeline/`: `speaker-name-rules.ts`,
`speaker-name-data.ts`, `speaker-name-rules.test.ts`. There is no route, view, template, component,
API handler, CLI surface or persisted document in the diff — verifiable with
`git show --stat b67fcd7`. The observable effect is confined to which `resolved` speaker rows the
indexing pipeline emits; no user type can reach it in this wave.

**Executor:** claude-opus-5 subagent (maker build agent)

**Executor rationale:** the unit is a judgement call about what a contextual signal can and cannot
know, on a seam that has survived six rounds and where the previous failure mode was measurement
dishonesty rather than coding difficulty.

---

## Authorization

- **D-052 ruling 2** (`docs/DECISIONS.md`, **Approved-by: Umesh**) — NEW AUTHORITY. Umesh was shown
  four options for ISS-104 and chose **"add a place-vs-person signal"**: use the surrounding
  sentence to tell a place/organisation from a person. `Changes-authorized` names
  `packages/index/src/pipeline/` speaker-name modules for "a place-vs-person contextual signal plus
  its tests", which is exactly and only what this unit changes.
- **A place-name lookup list / gazetteer was REJECTED on the record** in that same ruling, because
  it wrongly refuses real people named India or Paris and the list never ends. This unit therefore
  contains **no place, country, city, region or company name anywhere** — not in
  `LOCATIVE_GOVERNORS`, not in `NEVER_A_PERSON`, not in any new constant. What is enumerated is a
  closed grammatical class (prepositions), the same completability property that justifies
  `NEVER_A_PERSON`. Place names appear only inside test fixtures and doc comments.
  Accepting the residue and parking the issue were also not chosen.
- **D-041 ruling 4** (**Approved-by: Umesh**) deliberately overrides D-014's class-based round cap
  **for this seam only** — "keep working until it is clean". Stated explicitly so no reader has to
  wonder: this seam carries well over 2 PASSed verdicts and the cap does **not** block this unit.
- **D-052 also corrects the record** that the earlier data-module extraction closed ISS-104. It did
  not: it was the prerequisite that freed 78 lines of headroom. This unit treats ISS-104 as fully
  open at cycle start, and the 17/20 baseline below was re-measured, not inherited.

---

## What changed

Three files, all edited in place. No file was created, renamed or deleted; no existing function,
export, constant or test was removed. `NAME_PARTICLES`, `NAMING_CUES_BEFORE` and `HANDOVER_MARKERS`
are all still present, as the previous unit asked.

1. **`packages/index/src/pipeline/speaker-name-data.ts`** (data only, per the D-050 ruling-1 split)
   - NEW export `LOCATIVE_GOVERNORS` — the closed class of prepositions that cannot govern a
     person: `in, into, inside, outside, across, throughout, within, around, at`. `from`, `to`,
     `with` and `about` are absent on purpose: each takes a person perfectly well, and `from` is the
     affiliation cue the rules module must keep admitting.
   - `NEVER_A_PERSON` is **untouched** — not one word added, removed or reordered.

2. **`packages/index/src/pipeline/speaker-name-rules.ts`**
   - `import` line: adds `LOCATIVE_GOVERNORS`.
   - NEW `readsAsAPlaceOrOrg(text, name)` (module-private) — the place-vs-person signal. True when a
     whole-name occurrence of a **single-token** candidate is governed by a locative preposition and
     is not possessive. This is D-052's own "`I'm in Mumbai`" vs "`Mumbai said`" distinction, made
     syntactically and candidate-independently.
   - NEW `endsTheClause(tail)` (module-private) — ISS-098's discriminator stated once instead of
     twice, now shared by the `speaking` and `here` branches. Behaviour-preserving for `speaking`.
   - `hasNamingCue(text, name, at)` → `hasNamingCue(text, name, at, place)`. When `place` is true the
     WEAK affiliation after-cues (`here` / `from` / `speaking` / `with us` / `joining us`) are
     refused for that occurrence; the explicit-naming before-cues and the direct-address branch are
     untouched, so "my name is Paris" and "Paris, what do you think?" still resolve.
   - `here` is no longer an unconditional after-cue: `X here` is the self-identification idiom only
     when nothing follows it. A finite verb after it is a **third-party deictic** — "Ruby here has
     an announcement." is the moderator pointing AT Ruby, and binding that name to this turn's own
     label is the ISS-255 inversion, whoever the name belongs to.
   - `HANDOVER_MARKERS` gains `"coming up next"`, for the same reason.
   - `citesNameAsAnIntroduction` computes `readsAsAPlaceOrOrg` once per call and threads it through.

3. **`packages/index/src/pipeline/speaker-name-rules.test.ts`**
   - `ISS_093_GAZETTEER` shrinks from `{India, Mumbai, Google}` to `{India}`, so the two now-closed
     ledger rows flip from pinned-shipping to expected-refused. The D-015 byte-faithfulness test
     over `ISS_093_CORPUS` is untouched and still passes: the corpus itself was not edited.
   - New standing corpora: 4 place-signal attacks, 4 place-signal recall cases, 1 pinned
     false-positive cost, 6 `here`-idiom recall cases, 2 `here`-deictic refusals, 2 handover cases.

### Not done, deliberately

- **`qa/issues.jsonl` was not edited.** The checker is the sole maintainer of the ledger, so
  ISS-104's status, its `checker_note`, and **ISS-SPKDATA-001** (whose evidence is verified below and
  which is now closable) are left for the checker to flip.
- No `.claude/hooks/*`, no `qa/contracts/`, no `docs/DECISIONS.md`.

---

## What this does NOT fix — stated before the numbers

**ISS-104 is not fully closed.** One of its 20 recorded reproductions still ships:

> `"This is India speaking on the panel."` / `"India"` → `person:india`

Named with its reason, per D-015: it is **not separable from `"This is Rahul speaking on the panel."`
by anything inside the sentence** — the two strings are syntactically identical, and this turn
supplies no locative frame for the place signal to read. Closing it would need either the rejected
gazetteer or world knowledge. Its **generalisation is closed**: `"Our students in India. India
speaking on the panel."` now refuses, which is the honest boundary of a contextual signal.

**A finding worth the Approver's attention.** Two of the three residues were never place-vs-person
problems at all. `"Coming up next, Mumbai from the west zone."` is a handover and
`"Google here has an announcement."` is a third-party deictic — both are refused for **any** name,
including the person-valid twins `Nilesh` and `Ruby`, because in both sentences the name belongs to
someone other than the turn's own speaker. Six rounds read them as a gazetteer problem; they are
ISS-255's problem. The place-vs-person signal Umesh authorized closes a **different, larger** class
(locatively-framed fabrications) and closes none of the three ledger rows by itself.

---

## How to verify

Run from the repo root of this worktree. `packages/index` is run directly, never `pnpm -r test`
(the ISS-360 load flake makes `packages/meeting-bot` report `Failed` spuriously).

```
# 1. the suite (285 -> 304 tests)
cd packages/index && node --test --import tsx "src/**/*.test.ts"
# expect: tests 304 / pass 304 / fail 0

# 2. typecheck
cd packages/index && npx tsc --noEmit -p tsconfig.json
# expect: no output, exit 0

# 3. D-015 by-id measurement against ISS-104's OWN recorded reproductions, read from the ledger
#    union. The suite enforces this too (see "D-015: the corpus above is byte-faithful..." and the
#    ISS-093 corpus rows), so it needs no extra script:
cd packages/index && node --test --import tsx --test-name-pattern="ISS-093 corpus" "src/**/*.test.ts"
# expect: 20 "ISS-093 corpus:" rows printed and all green -- 19 asserting REFUSED, 1 (India)
#         asserting STILL SHIPS. The run's own totals read `tests 39 / pass 39 / fail 0`, because
#         node counts each test FILE as a test alongside the 20 filtered ones. Observed: exactly that.

# 4. the closed-class audit (must be unchanged: NEVER_A_PERSON was not touched)
node scripts/lib/audit-closed-class.mjs
# expect: enumeration: 409 words (SET A 299 + SET B 110) / LIVE BYPASSES: 0 / 409

# 5. the line ceiling
node scripts/lint-loc.mjs
# expect: the same 5 pre-existing violations as on master, none of them a speaker-name file
```

Note for the checker: `packages/index` has no `node_modules` inside a fresh worktree, so
`@lkb/ai` / `@lkb/core` will not resolve until the workspace links exist. Either run `pnpm install`,
or create the three junctions this unit used (`packages/index/node_modules/@lkb/{ai,core}` and
`packages/ai/node_modules/@lkb/core`, each pointing at the worktree's own `packages/<name>`).
They are untracked and outside the commit.

---

## Actual outputs

### The ledger measurement (D-015) — ISS-104: 19/20 refused

Measured by reading ISS-104's `evidence` field out of the ledger union and re-running its 20
recorded reproductions verbatim through the real `extractSpeakers`. Both numbers come from the same
script, the BEFORE run pointed at the unmodified main checkout at master:

```
BEFORE (D:/KnowledgeBase, master, unmodified):
ISS-104 recorded reproductions read from the ledger: 20
ISS-104: 17/20 refused
  STILL SHIPS: "India" / "This is India speaking on the panel." -> person:india
  STILL SHIPS: "Mumbai" / "Coming up next, Mumbai from the west zone." -> person:mumbai
  STILL SHIPS: "Google" / "Google here has an announcement." -> person:google

AFTER (this worktree):
ISS-104 recorded reproductions read from the ledger: 20
ISS-104: 19/20 refused
  STILL SHIPS: "India" / "This is India speaking on the panel." -> person:india
```

**`ISS-104: 19/20 refused`** (was 17/20). The one left open is named above with its reason.

### The false-positive direction — the signal's own cost is 3/20

A contextual signal that fixes the residue by rejecting real people has moved the bug, not closed
it, so the other direction was measured in the same shape: 20 turns in which a **real person** is
named after a place or an organisation (Paris, India, Mumbai, Georgia, Austin, Sydney, Dakota, Asia),
13 of them in ordinary person-shaped contexts and 7 in turns that also mention the place.

```
BEFORE (master, unmodified):  19/20 resolved as a person
AFTER  (this worktree):       16/20 resolved as a person
```

The four AFTER refusals, itemised:

| case | refused after | mine? |
|---|---|---|
| `"Over to Asia for the next section."` | yes | **No — pre-existing.** `over to` is an ISS-255 handover marker on master and refuses this turn there too (it is in the BEFORE 19/20 as the single miss). |
| `"We met in Paris. Paris here, from admissions."` | yes | Yes |
| `"Our centre is in Georgia. Georgia speaking from the visa team."` | yes | Yes |
| `"I studied in Sydney. Sydney here with an update."` | yes | Yes |

**So the signal's own cost is exactly 3 of 20 = 15%**, and all three are one shape: a single-token
candidate whose turn contains BOTH a locative place reading of that string AND only a weak
affiliation cue. It is the one case the signal genuinely cannot resolve, because the turn contains
both readings. Refusal is the safe direction under [C12] (a fabricated identity is the worse error),
the cost is pinned as a standing test so it cannot rot, and the escapes are real: with a strong cue
(`"We met in Paris. My name is Paris."`), a direct address
(`"Our centre is in Georgia. Georgia, what do you think?"`) or a multi-token name
(`"I studied in Sydney. This is Sydney Kapoor speaking on the panel."`) the person still resolves —
all three measured green above.

### Suite, typecheck, audits

```
packages/index: node --test --import tsx "src/**/*.test.ts"
  BEFORE: ℹ tests 285 / ℹ pass 285 / ℹ fail 0
  AFTER:  ℹ tests 304 / ℹ pass 304 / ℹ fail 0     (exit 0, read from the output, not from a pipe)

packages/index: npx tsc --noEmit -p tsconfig.json   ->  typecheck exit=0, no output

node scripts/lib/audit-closed-class.mjs
  BEFORE: enumeration: 409 words (SET A 299 + SET B 110) / AFTER (current tree): LIVE BYPASSES: 0 / 409
  AFTER:  enumeration: 409 words (SET A 299 + SET B 110) / AFTER (current tree): LIVE BYPASSES: 0 / 409

node scripts/lint-dupes.mjs -> lint-dupes: OK (456 unique export(s), 26 unique schema $id(s))
```

The RED-first run is recorded too (TDD, `superpowers:test-driven-development`): with the tests
written and no implementation, `ℹ tests 304 / ℹ pass 294 / ℹ fail 10` — and the 10 failures were
exactly the 10 new assertions, with every pre-existing test and every new recall case already green.

### Line ceilings (`node scripts/lint-loc.mjs`)

| file | before | after | budget | headroom left |
|---|---|---|---|---|
| `packages/index/src/pipeline/speaker-name-rules.ts` | 222 | **271** | 300 | **29** |
| `packages/index/src/pipeline/speaker-name-data.ts` | 97 | **119** | 300 | **181** |
| `packages/index/src/pipeline/speaker-name-rules.test.ts` | 289 | **392** | 400 (testMax) | **8** |

`lint-loc` reports the **same 5 violations before and after**, none of them in these three files:
`packages/index/src/pipeline/speakers-llm.ts:313`, `packages/meeting-bot/py/sb_join.py:437`,
`packages/meeting-bot/src/capture/obs-windows.ts:359`, `scripts/lib/dispatch-state.test.mjs:332`,
`scripts/watch/run-watch.mjs:572`. Verified identical by running `lint-loc` on the unmodified tree
before any edit.

**Flagged for the next unit on this seam:** the test file is at **392/400**, 8 lines of headroom.
The next corpus addition will need a test-file split along the same seam as the source split. Not
done here — it is not this unit's authorization.

`lint:structure` as a whole fails, at its first step, on those 5 pre-existing `lint-loc` violations.
Its later steps were run individually: `lint-dupes` OK; `lint-dirsize` FAILs on
`apps/api/src: 32 files (budget 31)` and `snapshot.mjs --check` FAILs on a stale `docs/SNAPSHOT.md`
— **both reproduced on the unmodified main checkout at master**, neither touched by this unit (the
diff is three `.ts` files; `git status` is clean).

### ISS-SPKDATA-001 (medium) — verified, and closable by the checker

A comment-aware extractor over the `NEVER_A_PERSON` literal (block comments then line comments
stripped before counting quoted strings):

```
comment-aware   raw strings: 422  unique: 421   duplicate: ['everyone']
comment-UNAWARE raw strings: 426  unique: 425
closed-class-audit-words.json totals: {words: 409, setA: 299, setB: 110}
excludedCollectiveAddress.words: 12
identity: 421 unique - 12 excluded = 409 == totals.words   OK
```

So ISS-SPKDATA-001 is confirmed exactly as filed: **422 raw / 421 unique**, and the 426/425 figure
is a comment-unaware extractor counting four quoted strings that sit inside doc comments. The
`421 − 12 = 409` identity **holds and is unchanged by this unit** — `NEVER_A_PERSON` was not
touched, and `LOCATIVE_GOVERNORS` is a separate constant that the audit does not read. The ledger
row is the checker's to flip.

---

## Capability coverage

Every falsification below is a **single-hunk edit to a single file** named in "What changed"
(`packages/index/src/pipeline/speaker-name-rules.ts`), leaves the module parsing and importing, and
reddens the named assertion rather than the loader. GREEN-before was taken from the very tree that
was then mutated (committed at `b67fcd7`, `git hash-object` == `git rev-parse HEAD:<file>` before
each mutation).

**Mutation-run safety (D-020 as amended by D-050-SPEAKER ruling 3).** Each mutation used
`scripts/lib/mutate.mjs`'s arm/restore ledger, which refuses to mutate a file that is not
byte-identical to HEAD, so the backup is **per mutation** by construction. **No `trap` was used at
all** — every restore is an explicit printed step, so a normal shell exit cannot revert anything.
Each test command ran under `timeout 300`. Each mutation ended with a **HEAD-fidelity check**
(`git hash-object <f>` vs `git rev-parse HEAD:<f>`), not a `cmp` against a backup, plus
`mutate.mjs assert-clean`. All three reported
`FIDELITY 7311e94a64f188e978c3779cb74117f4efffc215 == HEAD` and `MUTATIONS CLEAN: none outstanding`;
`git status --porcelain` is empty and the full suite is 304/304 after the last restore.

| # | Capability | Check covering it | Falsifying edit (single hunk, single file) | GREEN-before / RED-after |
|---|---|---|---|---|
| 1 | **The place-vs-person signal**: a locatively-governed occurrence removes the weak after-cues | `ISS-104 place signal: refuses …` (4 rows) + `ISS-104 place signal cost: …` | `speaker-name-rules.ts` `citesNameAsAnIntroduction`: `const place = readsAsAPlaceOrOrg(...)` → `const place = false && readsAsAPlaceOrOrg(...)` | GREEN: `tests 304 / pass 304 / fail 0`, all 4 place-signal rows ✔ · RED: `pass 300 / fail 4` — the `India`, `Mumbai`-`from` and `Bangalore` rows plus the cost row go ✖. (The `"students in Mumbai. Mumbai here has forty students."` row stays green: capability 2 independently closes it. Overlap, stated rather than hidden.) |
| 2 | **`X here` is the idiom only at clause end**; a finite verb after it is a third-party deictic | `ISS-104 here-deictic: refuses …` (2 rows) + `ISS-093 corpus: "Google" … is refused` | `speaker-name-rules.ts` `hasNamingCue`: `if (HERE_AT.test(rawAfter) && endsTheClause(rawAfter.replace(HERE_AT, ""))) return true;` → `if (HERE_AT.test(rawAfter)) return true;` | GREEN: `pass 304 / fail 0` · RED: `pass 301 / fail 3` — both here-deictic rows ✖ **and the ISS-104 ledger row for `Google` ✖**, i.e. the ledger measurement itself moves |
| 3 | **`coming up next` is a handover**, so the introduced name is not this label | `ISS-104 handover: \`coming up next\` refuses …` + `ISS-093 corpus: "Mumbai" … is refused` | `speaker-name-rules.ts` `HANDOVER_MARKERS`: delete `"coming up next", ` | GREEN: `pass 304 / fail 0` · RED: `pass 302 / fail 2` — the handover row ✖ and the ISS-104 ledger row for `Mumbai` ✖ |
| **C1** | **CONTROL — the `speaking` idiom's recall is untouched by the place signal** | `ISS-098 recall: still resolves …` (10 recorded regressions) | *same mutation as row 1* | GREEN before, **GREEN after**: 0 of the 10 ISS-098 rows appear among the 4 failures |
| **C2** | **CONTROL — real `X here` self-identification still resolves** | `ISS-104 here-idiom recall: still resolves …` (6 rows) | *same mutation as row 2* | GREEN before, **GREEN after**: 0 here-idiom-recall rows among the 3 failures (the mutation only widens acceptance, so a recall test that reddened would mean the test was asserting the wrong direction) |
| **C3** | **CONTROL — ISS-255's own handover reproductions are independent of the new marker** | `ISS-255: a moderator's handover turn …` + the two ISS-255 recall tests | *same mutation as row 3* | GREEN before, **GREEN after**: 0 ISS-255 rows among the 2 failures |

---

## Issues addressed

- **ISS-104** (critical) — **partially fixed, not closed.** 17/20 → **19/20** of its own recorded
  reproductions refused. `"This is India speaking on the panel."` remains open and is named above
  with its reason. The row's status is the checker's to set; this unit does not claim it closed.
- **ISS-SPKDATA-001** (medium) — **evidence produced, not flipped.** The 422/421 count is confirmed
  with a comment-aware extractor and the `421 − 12 = 409` identity re-derived. Closable by the
  checker; the maker does not write the ledger.

Nothing else is claimed. In particular this unit does **not** claim ISS-255, ISS-097 or ISS-098 work
— it reuses their discriminator and keeps their corpora green.

---

## Status: checked-PASS

**Handshake status:** checked-PASS

**Close-out:** `/checker` returned **PASS** at `Cycle checked: 0`, matching this manifest's
`Fix cycle: 0`. Verdict: `qa/verdicts/iss-104-place-vs-person-signal.md`, committed `923aea2`.
Capability coverage 3/3 rows reproduced with 3/3 controls clean, in the checker's own throwaway
copies. **ISS-104 remains `open` at `critical`** — this unit is a disclosed partial fix (19/20 of
its recorded reproductions), not a close. ISS-SPKDATA-001 flipped `open -> fixed` by the checker.
New finding **ISS-104CC-3** (medium): the false-positive cost is nearer **32%** than the 15% this
manifest reported, because the refusal is candidate-independent; filed, not fixed here.
