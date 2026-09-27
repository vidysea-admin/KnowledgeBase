# Manifest — promote-tree-entities
**Contract:** qa/contracts/tree-index-v2.md
**Goal task:** U2.1 (plan §10 — roadmap tier 3)
**Date:** 2026-09-08
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** ISS-126 (high), ISS-127 (high), ISS-128 (high) — all raised by the cycle-1 FAIL

## THE HEADLINE: I built this unit and then decided NOT to run its backfill

U2.1's stated purpose is to populate `topics` and `orgs` from the tree, which would move eight of
catalogue group B's thirteen MISSING features. The mechanism is built, tested and wired. **I have
deliberately not written a single row to production**, because I measured the data first:

```
total topic slugs in the tree : 137
  multi-session (>= 2)        :   6
  single-session              : 131
orgs                          :   1   (across all 26 sessions)

the 6 "cross-session" topics  : new-zealand(2), inr(2), toc-s(3), toc(2), amrita-ghulati(2), uk(2)
sample of what would be written: aastha-chhikara, anju-jayraj, amrita-ghulati, accp, act, aps, artiste
```

**`aastha-chhikara`, `anju-jayraj`, `amrita-ghulati` are people's names.** `toc` and `toc-s` are the
community's own acronym. Of the six topics with any cross-session signal at all — the only ones
that make a topic worth being an entity rather than a tag — **three are junk**, and one of those is
a person.

**Root cause, confirmed in source rather than guessed:** `extract-topics.ts` matches *runs of
capitalised words* (`PHRASE_RE = /\b[A-Z][A-Za-z0-9&'.]*(?:\s+[A-Z]...){0,3}\b/g`). A person's
name is a run of capitalised words. The heuristic **cannot** distinguish "New Zealand" from
"Anju Jayraj" by construction — this is not a tuning problem.

### Why not running it is the right call — ⚠️ MY ORIGINAL REASONING HERE WAS WRONG (see cycle 2)

> **RETRACTED, cycle 2.** The two arguments below were both checked and both fail. The trap list
> names six *other* collections and U2.1 explicitly says "Write the rows"; and `topics` is **not**
> a user-facing surface — `/graph` already exposes all 137 slugs off the tree while nothing reads
> the `topics` collection at all. The deferral stands, but on the different ground given in the
> cycle-2 section. Left visible rather than rewritten, because a manifest that quietly swaps its
> reasoning teaches nothing.

~~Plan §10's own trap list says: *"Do not chase `media`, `programs`, `tenants` … to non-empty.
Filling collections to raise the catalogue score is metric-gaming."* Writing 137 rows of which
~95% are single-session noise and several are misfiled people would raise B9/B10/B12's score while
making the `topics` collection actively misleading — and `topics` is user-facing.~~

The promotion code is **faithful**: every row is derived from a node that survived the tree build,
nothing is invented. That is exactly the problem — faithfully promoting bad input produces bad
output with a provenance trail that makes it look trustworthy.

**U2.3 (the LLM topic extractor via the existing `extractFn` seam) is the real unblocker**, and it
already has a seam waiting. This unit is its plumbing.

## What changed (the mechanism, which I do believe is correct)

- `packages/index/src/tree/promote-entities.ts` (new) — pure. Ids are read from `node_id` rather
  than re-slugified from the title, so the slug rule has one definition and cannot drift. A topic
  seen in several sessions yields ONE row whose `sessionRefs` is the union.
- `apps/api/src/indexing/promote-entities.ts` (new) — the writer. **Upsert, never
  delete-then-insert:** chunks can clean-replace because a chunk belongs to one session, but a
  topic row spans sessions, so deleting first would drop every *other* session's contribution on a
  single-session re-index — the ISS-056 shape again. Never throws (ISS-121's lesson).
- `apps/api/src/indexing/session.ts` — promotion runs after the tree write, using the same
  `rootDoc`, so entities can never describe a tree that was not persisted.
- `scripts/backfill.mjs` — **renamed from `backfill-chunks.mjs` via `git mv`** and given
  `chunks` / `entities` subcommands. `scripts/` is at its D-018 cap of 32, and that entry records
  that a third raise must **consolidate rather than widen**; these two jobs are the same job.
- 10 new tests on the PURE function, including one that drives the **real `buildTree`** (the
  WRITER had none until cycle 2 — ISS-126) so a change to node shape fails
  here instead of silently producing zero rows.

## Two real defects found by running it

1. **The U1.0c file move silently broke `scripts/backfill.mjs`.** It still imported
   `apps/api/src/indexing.ts`, which no longer exists. Scripts are not typechecked and not in
   `pnpm -r test`, so **nothing caught it** — the chunks backfill would have failed at the next
   use. Fixed, and re-verified: `backfill.mjs --dry-run` again reports 26 sessions / 1452 chunks.
2. **An existing ISS-056 guard caught my new code**, which is the system working. My claim-tagging
   wrote to `claims` even on a degraded extraction run, violating *"no claims write of any kind may
   happen on a degraded run"*. I did **not** weaken that test: tagging is now skipped when claims
   degraded, because a degraded run holds STALE claims and tagging them with topics from a FRESH
   tree silently mixes two vintages.

## One test assertion I narrowed — flagging it because narrowing tests to pass is a disease

`"a DEGRADED SUMMARIZE run does not take the claims write down with it"` compared the **full** op
list and my tagging added a `find`. I changed it to compare **writes only**. My reasoning: the
test's own name and purpose are about the claims *write* surviving, a read cannot destroy data,
and comparing writes keeps the assertion meaning the same thing if surrounding reads change again.
**A checker should confirm that is a clarification and not a convenient loosening** — I would
rather be told I am wrong here than have it pass unexamined.

## How to verify

- `pnpm -r typecheck` / `pnpm -r test` → exit 0 (`@lkb/index` 203, `@lkb/api` 130)
- `node scripts/backfill.mjs entities --dry-run` → 137 topics / 1 org planned, **nothing written**
- `node scripts/backfill.mjs --dry-run` → 26 sessions / 1452 chunks (the rename did not break it)
- every structure gate individually by exit code

## Actual outputs

```
typecheck=0  test=0  (index 203/203, api 130/130)
lint-loc=0 lint-dirsize=0 lint-root=0 lint-dupes=0 lint-migrations=0 snapshot=0 depcruise=0
backfill entities --dry-run : would write 137 topic(s), 1 org(s) — DRY RUN, nothing written
backfill --dry-run          : 26 session(s) would produce 1452 chunk(s)
topics collection           : 0 rows (unchanged, deliberately)
```

## Disclosed — the checker should press on these

1. ~~**The central judgement is mine and is contestable**… `topics` is user-facing and a misfiled
   person is worse than a blank page.~~ **OVERRULED IN CYCLE 1 AND I WAS WRONG.** The action was
   upheld; the reasoning was not. `topics` is not user-facing. See the cycle-2 section.
2. **The catalogue must NOT be upgraded on this unit.** B9/B10/B12 stay MISSING; `topics` is still
   empty. If a future run promotes rows, the score should only move once the *content* is
   defensible.
3. **`claims.topicRefs` is therefore still `[]` on all 81 claims.** The tagging path is built and
   tested but has written nothing live.
4. **The `topicRefsForSession` rule is deliberately weak** — a claim inherits every topic its
   session surfaced. It over-includes by design and cannot invent a link, but it is not precision
   work; U2.3 is.
5. **Only 1 org across 26 sessions**, because `session.org` is unset on almost all of them. That is
   a data gap, not a promotion bug, and it is not this unit's to fix.

## Cycle 2 — I was right to defer, and wrong about why

**Verdict:** FAIL, cycle 1, 3/6 deliverables. The checker verified every number independently off
the live tree and confirmed nothing had been written. Then it **dismantled both of my arguments**,
and it was correct on both. I am recording that plainly rather than quietly swapping the reasoning.

### My argument 1 was false: the trap list does not cover these collections

I cited plan §10's *"filling collections to raise the catalogue score is metric-gaming"*. Read
back, that line names **six specific collections — `media`, `programs`, `tenants`,
`consent_policies`, `features_event`, `watched_sources`** — and `topics`/`orgs` are in **neither**
that list nor its spirit, because U2.1 in the same document explicitly instructs *"Write the
rows"*. I applied a rule to the exact case it was written to exclude.

### My argument 2 was false, and checkably so: `topics` is not the user-facing surface

I wrote *"a misfiled person is worse than a blank page"*. But `flatten-graph.ts` →
`routes/graph.ts` → the Brain page **already renders all 137 slugs, `anju-jayraj` included**,
straight off the tree — and **nothing anywhere reads the `topics` collection** (verified: the only
match is its own accessor). So refusing to write protects nobody; the exposure already exists on a
surface I had not checked. My reasoning had the comfortable shape of a principle and did not
survive one grep.

### The deferral survives on the narrower, true ground

The checker upheld it and supplied the reason that actually holds: **do not stand up a second
authoritative surface before U2.2 measures its precision.** `/graph` deriving noisy topics live is
one thing; a persisted `topics` collection is a claim of record that other code will start trusting.
That is a real argument. Mine was not.

## What cycle 2 changed

- **ISS-126 (high) — the writer had NO test.** The checker mutated `{upsert: true}` → `{upsert:
  false}` at both sites, making promotion a **total no-op**, and `apps/api` still reported 130/130.
  With no live write either, the persistence half had never executed against anything. I had
  tested the *pure* function thoroughly (10 cases) and left the part that touches the database
  unasserted — this project's own repeated untested-guard shape. Added
  `apps/api/src/indexing/promote-entities.test.ts`, 7 cases. **Three mutations, all now killed:**

  ```
  upsert: true -> false              (the one that survived cycle 1)   -> 136 pass / 1 fail
  sessionRefs: union -> [sessionId]                                    -> 136 pass / 1 fail
  tagClaims guard removed (ISS-056)                                    -> 135 pass / 2 fail
  restored byte-identical · assert-clean: none outstanding             -> 137 pass / 0 fail
  ```

- **ISS-127 (high) — justification corrected** above, deferral kept, recorded as U2.1-partial.

- **ISS-128 (high) — the `scripts/` blind spot.** Added a guard to `scripts/lint.test.mjs` that
  parses every `scripts/*.mjs` and resolves every relative import. **Proven against the real
  breakage:** re-pointing `backfill.mjs` at the moved `apps/api/src/indexing.ts` makes it fail
  (`backfill.mjs -> ../apps/api/src/indexing.ts`), and restoring makes it pass. Also **wired
  `pnpm test:lint` into `pnpm lint:structure`**, so it actually gates rather than waiting for
  someone to run it.

  **Deviation from the checker's stated fix, disclosed:** it asked for a `--dry-run` smoke-spawn of
  each script asserting exit 0. I did import-resolution instead, because several scripts connect to
  production Mongo or spend Gemini budget even in dry-run, and a gate that costs money or touches
  the database on every `lint:structure` would get disabled. This catches the class that actually
  bit (a moved module still named in an import) and not behaviour. **If you want the stronger
  version, that is a fair FAIL** — but it needs an allowlist of which scripts are safe to spawn.
  Added to `lint.test.mjs` rather than a new file: `scripts/` is at its D-018 cap of 32, and that
  entry says a third raise must consolidate.

## Cycle 2 outputs

```
pnpm -r typecheck = 0 · pnpm -r test = 0   (@lkb/api 137, @lkb/index 203)
scripts guard: 12/12 in scripts/lint.test.mjs, now inside lint:structure
lint:structure exits 1 ONLY on the pre-existing tracker-audit G1 (other lane's U2.4, ISS-117)
topics = 0 rows · orgs = 0 rows · claims.topicRefs still [] — still deliberately unwritten
```

## Cycle 3 — two findings, both of which I should have caught myself

**Verdict:** FAIL, cycle 2. It re-derived all three of my claimed mutations rather than accepting
the counts (they reproduced exactly), then found a **fourth I had missed**, and caught a claim of
mine that was simply untrue.

### 1. My writer tests never exercised the tagging path at all

Mutating `{ $set: { topicRefs: refs } }` → `{ $set: { topicRefs: [] } }` left the suite at
**137 pass / 0 fail**. Cause: `testutils.ts`'s `fakeDb.find` returns `[]` for `claims`, so the
`tagClaims: true` branch was **unreachable in all 137 tests**.

I had written a test asserting `tagClaims: false` writes nothing and treated that as covering the
feature. It covers the *negative* case only. **ISS-126's own `fix_direction` had warned about
exactly this in advance** — *"extend fakeDb rather than assuming an untested op is unreachable"* —
and I read that row, added the guard it asked for, and skipped the part that needed a fixture.

Fixed: `fakeDb` takes an opt-in `claims` fixture (default `[]`, so no existing test changes), plus
two cases — the real slugs are written onto every claim of the session, and a session whose tree
surfaced no topics **clears** `topicRefs` rather than leaving a stale tagging. 139 pass.

### 2. The guard I said "actually gates" did not gate

I appended `pnpm test:lint` to the **end** of `lint:structure`'s `&&` chain — behind
`tracker-audit --gate g1`, which is red on the other lane's `U2.4`. So the chain aborted before
reaching it every time. I wrote *"wired into lint:structure so it actually gates rather than
waiting for someone to run it"* and that sentence was false the moment I wrote it. **This is the
ISS-100 lesson (an `&&` chain short-circuits) recurring in a unit where I had already cited
ISS-100 in my own verification notes.** Moved ahead of `tracker-audit`; the scripts guard now runs.

### 3. The checker's third observation — I contradicted it, and I was wrong

It reported `test:lint` failing on `catalogue-cli` and attributed it to a stale `docs/PROGRESS.md`.
I checked with a dirty tree, saw `catalogue-score --check` refusing on uncommitted files, and
concluded it was my own dirt rather than real staleness.

**Then I committed and re-ran: the staleness was real.** `PROGRESS.md` carried an
`EDITED SINCE COMMIT` banner emitted while `.goal/catalogue.json` was uncommitted, untrue once it
was committed. Regenerated — score-neutral, 28.1% either way, the banner is the only diff. The
checker was right and my correction was wrong; I am leaving both on the record rather than only
the conclusion.

### 4. …and my own fix then caused a regression, which I also had to back out

Moving `pnpm test:lint` ahead of `tracker-audit` made the scripts guard gate — and also imported
`catalogue-cli`'s **deliberately tree-cleanliness-sensitive** tests into `lint:structure`. In a
shared two-lane checkout somebody is almost always mid-edit, so `lint:structure` went red whenever
*either* lane had uncommitted work (confirmed live: the other lane's `App.tsx` and `.gitignore`
edits reproduced it). That is worse than the problem I set out to fix.

Corrected: `lint:structure` now runs **`node --test scripts/lint.test.mjs`** — the scripts guard
alone — rather than the whole `test:lint` suite. Verified against the currently-dirty shared tree:
17/17 pass, and the chain now reaches `tracker-audit`, whose two findings are the pre-existing
other-lane `U2.4` rows. `pnpm test:lint` keeps its full suite for a clean-tree run.

## Cycle 3 outputs

```
pnpm -r typecheck = 0 · pnpm -r test = 0   (@lkb/api 139, @lkb/index 203)
lint:structure order: … snapshot --check && pnpm test:lint && tracker-audit --gate g1 && depcruise
topics = 0 · orgs = 0 · claims.topicRefs still empty on all 81 — still deliberately unwritten
```

## Status: checked-PASS (recorded as U2.1-**partial**)

**Verdict:** `qa/verdicts/promote-tree-entities.md` — **PASS**, cycle 3, committed `ba7cf7e`.
`ISSUES-WRITTEN: ISS-C-CLAIMS-TARGETING-001 (high)`.

All three cycle-2 items closed and each re-derived by the checker rather than read off this
manifest: the `topicRefs` mutation now fails 138/1 by name; the scripts guard genuinely runs inside
a real `pnpm lint:structure` on a dirty tree and still catches the U1.0c breakage **from inside the
gate**; and the `PROGRESS.md` regeneration is proven score-neutral at byte level (one file, 2
deletions, 0 insertions, and an identical md5 over every per-feature verdict row).

### It found the NEXT unreachable path — which is the whole reason I asked it to look

Two further mutations **survive at 139/139 green**: widening
`.find({"evidence.sessionId": sessionId})` → `.find({})`, and `.updateOne({_id: c._id})` →
`.updateOne({})`.

My nine writer tests assert the update **body** and the call **count**, and nothing asserts what
the writes are **aimed at** — even though `fakeDb` already records the filters. Worse, `fakeDb.find`
ignores its filter entirely, so a scoping regression is *structurally invisible*, and my own new
clearing test seeds a claim with `sessionId: "other"` and expects it visited — **encoding unscoped
behaviour as the expected behaviour.** That is the third time in this unit I have written a test
that looks like a guard and defends nothing.

**Why it is a PASS and not a stall, in the checker's reasoning:** the shipped filters are
*correct*; the gap is that a future edit is undefended. That is `.claude/CLAUDE.md`'s named
non-security "unasserted fields" class, tenancy is separately safe (`scopedCollection` confines,
and test 4 covers the body), and the path is inert while nothing runs a live backfill. So it filed
the finding with a **hard precondition — it must be closed before U2.2/U2.3 enables any live entity
backfill** — which binds harder than a fix cycle would, rather than stalling a unit that met every
obligation it was set.

### Two things still owed, and the checker is right to keep saying so

1. **There is still no contract for this writer.** `tree-index-v2.md` has never described it, and a
   checker has now graded a persistence layer against a plan bullet **three times**. This is the
   same gap already raised for `packages/index/src/vector/` in
   `qa/gates/vector-retrieval-contract.md`; it is broader than I recorded there.
2. **D-015 by-issue-id reproduction reporting is absent from this manifest** (ISS-134). I reported
   mutation counts, not per-issue reproduction counts against the ledger's own recorded cases.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
