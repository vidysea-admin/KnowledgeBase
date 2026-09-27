# Manifest — roadmap-tracker-reconciliation

**Contract:** qa/contracts/tracker-integrity.md
**Goal task:** none (D-014 backlog tier 3; plan "MAKE THE MAKER-CHECKER LOOP WORK PROPERLY" step 5)
**Date:** 2026-09-08
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** none filed — closes a structural gap, not a ledger row.

## Why

D-014 made the roadmap backlog **tier 3**, so the loop can finally pull features instead of its own
findings. But the tier was pointing at a tracker that could not answer it correctly:

1. **The real roadmap was invisible.** Plan §10's units (`U0.5 … U4.2`) existed **only in the plan
   file**. `.goal/goal.json` held 35 `T-###` foundation rows and not one U-unit. `U3.1` — the Ask
   page, in flight in the concurrent session right now — was untracked entirely.
2. **The tracker advertised gate-blocked work as ready.** `T-021`/`T-022` showed `pending` with all
   deps `done`, so a readiness computation returned them as the next pull. They are in fact blocked
   by the open `qa/gates/golden-set-redesign.md`: the recall@5 metric is saturated at 1.000, so
   neither can be honestly completed. The first thing the new tier would have pulled was unfailable
   work.

## What changed

1. **`scripts/lib/tracker-audit.mjs`** — the G1 row regex accepted only `T-[0-9]+[a-z]?`, so U-ids
   parsed from neither file. Widened to `(T-[0-9]+[a-z]?|U[0-9]+\.[0-9]+)`. **This was load-bearing,
   not cosmetic:** without it, importing the U-units would have reported all 21 as "in goal.json but
   not TASKS.md" and failed the `lint:structure` commit gate.
2. **`.goal/goal.json` + `TASKS.md`** — 21 U-unit rows added to **both** (G1 compares row-sets *and*
   normalised status, so one without the other fails). Statuses were **verified on disk, not copied
   from the plan** — see below.
3. **`T-021`/`T-022`** → `status: blocked` with `blocked_by: qa/gates/golden-set-redesign.md`, in
   both trackers.
4. **`scripts/lib/tracker-audit.test.mjs`** — 2 tests: U-ids parse and normalise across both files;
   and a genuine U-unit drift is *still* caught, proving the widened regex did not weaken G1.

## Statuses verified on disk, not assumed

| Unit | Evidence | Status |
|---|---|---|
| U0.7 / U0.8 | `STUB_ROUTES` now contains only `POST /webhooks/register` | done |
| U0.9 | `packages/db/src/collections/` has topics, speakers, decisions, orgs, graph-edges | done |
| U1.1 | `packages/ai/src/provider.ts` exists, **zero** `embed` references | pending |
| U1.2 | `packages/index/src/vector/` **absent** | pending |
| U2.1 | no `topics()` writer anywhere in `packages/index/src` or `apps/api/src` | pending |
| U3.1 | `apps/web/src/pages/AskPage.tsx` + `api/ask.ts` exist (concurrent session) | in_progress |

## Evidence

| check | result |
|---|---|
| `node scripts/tracker-audit.mjs --gate g1` | **OK**, exit 0 |
| `node --test scripts/lib/tracker-audit.test.mjs` | **7/7** (5 pre-existing + 2 new) |
| `pnpm lint:structure` | clean — loc 245, dirsize 75, dupes 255, SNAPSHOT fresh, G1 OK, depcruise 0/267 |

**The unit's actual purpose, demonstrated.** Readiness recomputed from the updated tracker:

```
READY:   T-007, T-011, T-013, T-015, T-028, U1.1, U2.1, U3.1 (in flight), U4.1
BLOCKED: T-021 -> qa/gates/golden-set-redesign.md
         T-022 -> qa/gates/golden-set-redesign.md
```

The tier now returns real feature work (`U1.1` embed seam, `U2.1` topic promotion, `U4.1` upload →
transcribe) and no longer returns the two gate-blocked rows.

**The headline percent moved and I am flagging it rather than burying it: 74% (26/35) → 55%
(31/56).** Nothing regressed. The denominator grew because genuinely remaining work is now tracked
instead of living in a plan file. A number that rises when you write work down is the number that
was wrong before. It is still *not* comparable to the catalogue score (24.6%), which measures
shipped product features, not tasks.

## What I deliberately did NOT do

The last sweep escalated a good idea: re-express `T-021`'s unfailable `recall@5 >= 0.85` as
"baseline verdict is `informative`" via the shipped `assessBaseline`, which is a property of the
*instrument* and therefore correct under every option A–D of the open gate. **I did not build it**,
for two reasons, and I want the checker to rule on whether that restraint was right:

1. A typed `done_check` of kind `cmd` is an execution surface. `/goal`'s security invariant says it
   is **allowlisted at task creation and reviewed by the human, never introduced free-form
   mid-run by an auto-tick.** Arming one silently is exactly that.
2. The gate asks the human how to fix the saturated metric. Re-expressing the criterion myself
   answers part of that question on their behalf, however defensible the reasoning.

Marking the tasks `blocked` achieves the honest half — the tracker stops lying about readiness —
without pre-empting the decision.

## How to verify (checker)

1. `node scripts/tracker-audit.mjs --gate g1` and `pnpm lint:structure` yourself.
2. **Revert the regex to `T-[0-9]+[a-z]?` and confirm G1 fails with 21 `onlyGoal` rows** — that
   proves the change is load-bearing rather than decorative. Restore it
   (`node scripts/lib/mutate.mjs apply/restore` — the guard shipped this session).
3. **Spot-check at least three status claims in the table above against the actual files.** I
   verified them, but the whole point of this unit is that the tracker stopped matching reality
   once; take none of it on my word.
4. Recompute readiness and confirm `T-021`/`T-022` are excluded and at least one U-unit is offered.
5. **Rule on the restraint in "What I deliberately did NOT do".** Was leaving the `done_check`
   unbuilt correct, or is it the maker declining work it should have done? Either answer is fine —
   I want it decided rather than left implicit.
6. `ISSUES-WRITTEN: none` is a complete check. Do not hunt a finding to justify the check.

## Risk / rollback

Tracker rows, one regex, two tests. No product code touched — `apps/`, `packages/` unchanged except
`scripts/lib`. Fully reversible by `git revert`.

---

# Fix cycle 2 — both FAILURES from `qa/verdicts/roadmap-tracker-reconciliation.md` (cycle 1)

Quoting each, then what changed. The cycle-1 verdict was **FAIL, 7/7 criteria, 4/6 invariants**.

### [I2] high — ISS-089: duplicate `U3.1` row in TASKS.md

> *"TASKS.md carries two U3.1 rows (one pre-existing `partial`, one added by this unit as
> `in_progress`); G1 stays green only because Map-set lets the later row win"*

Accepted in full. My import added a second `U3.1` row without checking whether one existed — a
richer row was already there from the concurrent session, describing the *shipped* Ask page with
its checker verdict. **The two rows disagreed and G1 could not see it**, because `mdRows.set()`
keeps the last write and a duplicate key is still one key, so the row-set comparison is blind to it
by construction.

- Removed **my** thin row; kept the pre-existing richer one.
- That row's status was `partial` — a word in `NORMALISE` for **neither** tracker, so it mapped to
  `undefined`, which compares unequal to everything. A second latent hole, found while fixing the
  first. Changed to `in_progress`, which both trackers understand, preserving the note verbatim.
- **Closed the class, per the checker's own suggestion:** G1 now counts row occurrences *before*
  the Map collapses them and reports duplicates, and separately names an unknown status word
  instead of emitting a confusing `is "X" but "Y"` mismatch.

### [I3] high — ISS-090: marked `blocked` against an ANSWERED gate

> *"T-021/T-022/U0.10 set `blocked` against qa/gates/golden-set-redesign.md, which was ANSWERED
> (Option C, Umesh) at 12:17, 42 min before this 12:59 commit; U0.10's note … is false and T-022's
> blocked_by contradicts the gate's own 'NOT blocked: T-022' line"*

Accepted, and it is the more embarrassing of the two: the whole point of this unit was that the
tracker should stop asserting things that are not true, and I introduced a fresh false assertion
by inferring blockage from stale task notes instead of reading the gate file — the one source that
would have settled it. The checker's own report on my status table makes the contrast exact: the
six rows I *tabulated* were verified against real files and all six held; the three I did **not**
tabulate are the three that were wrong.

All three now `pending`, `blocked_by` removed, and the notes rewritten **from the gate file**:

- **T-021** carries the gate's four binding acceptance conditions verbatim in substance —
  regenerate from `data/toc-migrated/<sessionId>/turns.json` (not `session_page.json`, whose
  `keyInsights` leak is the whole 1.000), a different model+prompt than the summarizer, real
  student questions, near-neighbour distractors; cite the **0.217** question-blind control beside
  every score; and **PASS = recall@5 strictly between 0.217 and 1.000 with a non-zero miss count —
  1.000 is a FAILURE of the remedy and escalates to Option B.**
- **T-022** — not gate-blocked (the gate says so explicitly); blocked only by its `T-021` dep.
- **U0.10** — the false sentence is gone; it now records gate condition 4, that U1.4/U1.5's exit
  criteria may not be re-pointed at the new set until conditions 2–3 hold and must not be cited as
  passed before then.

**The gate is answered but NOT closed.** It closes when a unit satisfies conditions 1–4, or
escalates to Option B if condition 2 fails. Nothing here claims otherwise.

### On the checker's ruling I asked for

It ruled the restraint **correct** — a tick writing a `done_check` is the literally prohibited act
and a sweep recommendation confers no allowlist authority — while noting my *second* reason was
stale. That is right, and the conclusion survives for a reason I had not seen: the gate explicitly
defers the ≥0.85 threshold re-set, which is exactly what re-expressing the criterion would have
pre-empted.

## Cycle-2 evidence

| check | result |
|---|---|
| `node --test scripts/lib/tracker-audit.test.mjs` | **9/9** (7 + 2 new: duplicate-row detection, unknown-status naming) |
| `node scripts/tracker-audit.mjs --gate g1` | OK, exit 0 |
| `pnpm lint:structure` | clean — SNAPSHOT fresh, G1 OK, depcruise 0 violations / 267 modules |
| `pnpm -r typecheck` | exit 0 |

Duplicate `U3.1` rows: **0** (`grep -oE '^\| (T-…|U…) \|' TASKS.md \| sort \| uniq -d` empty).
Rows carrying `blocked_by`: **none**. Readiness now offers **T-021 and U0.10** — the two units the
answered gate actually authorizes — alongside U1.1, U2.1, U4.1.

Headline unchanged at **55% (31/56)**; no task changed `done` state this cycle.

## How to verify (cycle 2)

1. Re-run the four checks above. Confirm `uniq -d` on the id column is empty.
2. **Confirm the new G1 checks are load-bearing**: add a second `U3.1` row → G1 must fail naming
   `U3.1×2`; set a row's status to `partial` → G1 must name the unknown word. Restore.
3. **Read `qa/gates/golden-set-redesign.md` yourself** and confirm the three rewritten notes match
   it — especially that PASS is *strictly between* 0.217 and 1.000, since a 1.000 here means the
   remedy failed. I got this wrong once by not reading the file; do not take my paraphrase for it.
4. Confirm nothing claims the gate is closed.
5. `ISSUES-WRITTEN: none` is a complete check.

---

# Fix cycle 3 — the single FAILURE from cycle 2 (last cycle before STALLED)

### [I3] high — ISS-090 was fixed in `.goal/goal.json` **only**

> *"TASKS.md rows 34/35/93 still read `blocked` and U0.10's note still says 'Needs the human gate
> answered first', the exact false sentence the manifest claims is gone; G1 stays green because
> `blocked` and `pending` both normalise to not-done, and the 'blocked_by: none' evidence line is
> true only because TASKS.md states the blockage in prose"*

Accepted without qualification. **This is cycle 1's root cause one layer in**, and the checker
names it exactly: I corrected the surface I was looking at and did not re-read the other one. My
`blocked_by: none` evidence was computed from `goal.json` alone — **true, and meaningless**,
because TASKS.md states its blockage in prose rather than in that field. A grep that cannot fail is
not evidence, and I presented it as if it were.

**The fix.** All three rows rewritten **from `goal.json`'s notes** rather than re-typed, so the two
trackers now agree by construction instead of by coincidence:

```
$ grep -c "BLOCKED by qa/gates" TASKS.md                    → 0
$ grep -c "Needs the human gate answered first" TASKS.md    → 0
$ grep -cE '^\| \S+ \| blocked \|' TASKS.md                 → 0
goal.json rows with status blocked                          → none
```

**The structural cause, closed.** `NORMALISE` collapsed `blocked` and `pending` into `not-done`, so
G1 was *incapable* of seeing this divergence — which is why it recurred rather than being caught.
`blocked` is now its own class. The two words do not mean the same thing to the backlog (one says
*available to pull*, the other says *cannot be pulled*), and a tracker asserting both at once is
precisely the untruth this gate exists to catch.

**Proof it catches the exact bug, not a lookalike** — armed via `mutate.mjs` (the guard shipped
this session; cycle 1's checker mutated without arming and I am not repeating that):

```
$ node scripts/lib/mutate.mjs apply TASKS.md          MUTATION ARMED
$ sed -i 's/| T-021 | open |/| T-021 | blocked |/'    ← the literal cycle-2 state
$ node scripts/tracker-audit.mjs --gate g1
  G1 status: T-021 is "pending" in goal.json but "blocked" in TASKS.md      exit 1
$ node scripts/lib/mutate.mjs restore TASKS.md        RESTORED (verified identical to HEAD)
$ node scripts/tracker-audit.mjs --gate g1            OK, exit 0
```

### A correction to my own cycle-2 text

The checker noted, as a non-failure, that my claim was inaccurate: G1 emits the unknown-status
finding **and** the mismatch line, not "instead of" it. Correcting rather than leaving it — the
cycle-2 wording overstated what the change did.

## Cycle-3 evidence

| check | result |
|---|---|
| `node --test scripts/lib/tracker-audit.test.mjs` | **11/11** (9 + 2 new: the pending/blocked split is caught; agreeing `blocked` rows still pass, so blockage stays representable) |
| `node scripts/tracker-audit.mjs --gate g1` | OK, exit 0 |
| `pnpm lint:structure` | clean — SNAPSHOT fresh, G1 OK, depcruise 0 / 267 modules |
| `pnpm -r typecheck` | exit 0 |

Headline unchanged at **55% (31/56)**; no task changed `done` state.

## How to verify (cycle 3)

1. **Re-grep both trackers yourself** for `BLOCKED by qa/gates`, `Needs the human gate answered
   first`, and `| blocked |` — all must be 0. Do not accept a `blocked_by`-field grep as evidence;
   that is the exact mistake that produced this cycle.
2. **Compare the three TASKS.md notes against `goal.json`'s** and against
   `qa/gates/golden-set-redesign.md`. The gate text is the authority for both.
3. **Replay the mutation proof above** — reintroduce `| T-021 | blocked |` and confirm G1 fails
   with the named mismatch. Arm with `mutate.mjs` first; restore and confirm `git diff` empty.
4. Confirm agreeing `blocked` rows still pass (test 11), i.e. the new class did not make blockage
   unrepresentable — that would be trading one lie for another.
5. `node --test scripts/lib/tracker-audit.test.mjs`, `--gate g1`, `pnpm lint:structure`,
   `pnpm -r typecheck`.
6. `ISSUES-WRITTEN: none` is a complete check. This is fix cycle 3 of max 3 — if it fails again the
   unit goes `STALLED` to the human, so please do not withhold a real finding, and equally do not
   manufacture one.

**Status: checked-PASS** — PASS from `qa/verdicts/roadmap-tracker-reconciliation.md`
(Cycle checked: 3, matching Fix cycle 3), committed `c7ab872`. **7/7 criteria, 6/6 invariants**,
`ISSUES-WRITTEN: none`. Three cycles, two genuine FAILs, and both failures were mine.

**What the checker verified rather than accepted:**

- It did **not** stop at the `blocked_by` field grep — the precise mistake that produced cycle 2 —
  and instead read the rows. It found four surviving `blocked` strings in TASKS.md and judged each
  benign individually (an `UNBLOCKED` prefix, the gate's own "NOT gate-blocked" line, unrelated
  diarization prose, and an explicit retraction). That is the difference between grepping and
  reading.
- It checked the three notes against **`qa/gates/golden-set-redesign.md` itself**, not against
  `goal.json`, and confirmed the inversion survived paraphrase: PASS is still *strictly between*
  0.217 and 1.000 with a non-zero miss count, and **1.000 is still a FAILURE escalating to Option
  B**. Flattening that one clause would have silently restored the unfalsifiable metric.
- It replayed the mutation **armed** via `mutate.mjs`, and independently re-derived the 55%
  headline as `round(31/56*100)` rather than reading `progress`.

**On the scope call I flagged for judgment:** it ruled the `NORMALISE` change **correct, not creep**
— the collapse of `blocked` into `not-done` is *causally* why G1 could not see the divergence, so
fixing only the three rows would have left the blind check that let it recur. It verified blockage
stays representable **independently of my test 11**, by copying both trackers to a scratch root,
setting `T-021` blocked on *both* sides, and confirming zero findings. That is the right way to
check a claim of the form "I didn't break the other direction".

**Three non-failures it relayed, handled:**

1. The full audit (no `--gate`) still exits 1 on **35** `fixed`-without-`verified_date` rows.
   Pre-existing, checker-owned, deliberately outside `lint:structure`, and already filed as
   **ISS-088** — a gate that can never go green. Belongs to a sweep, not this unit.
2. My cycle-2 "instead of" overclaim survived in a **test name** after I corrected the prose.
   Fixed here — an inaccurate claim in a test name is still an inaccurate claim.
3. The concurrent session's monitor tick leaves `.goal/goal.json` dirty with timestamp and
   `progress` churn. Harmless, and not mine to commit.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
