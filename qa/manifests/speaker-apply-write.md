# Manifest — speaker-apply-write

**Contract:** none yet — first unit for the U2.4 **apply step**. Checker: please author
`qa/contracts/speaker-apply-write.md`. This is the unit the previous four deferred their blocking
items to.
**Goal task:** U2.4 / catalogue **B3** + **B10**.
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** none directly. Carries the deferred items listed below.
**Status:** checked-PASS (cycle 2 — `qa/verdicts/speaker-apply-write.md`, commit `7daccda`)
**Branch:** `lane/a-speakers`

## Why this unit is different in kind

Everything upstream could only **refuse** to name someone. This one **writes identities down**, so
its failure mode changes: it can assert that two different human beings are the same person.

The `speakers` collection has been empty since the schema was created, which is exactly why
catalogue B3 and B10 score MISSING — the probe is literally `collection speakers (empty)`.

## What changed

| File | Change |
|---|---|
| `packages/index/src/pipeline/speaker-docs.ts` | **new** — `buildSpeakerDocs()`, pure, no Mongo. |
| `packages/index/src/pipeline/speaker-docs.test.ts` | **new** — 9 tests, written first. |
| `scripts/sync-speakers.mjs` | **new** — the entrypoint. `--dry-run` never connects. |
| `structure.config.json` | `dirsize.overrides` set to scripts 31; `maxFiles` stays **30**. |
| `scripts/lint-dirsize.mjs` | consults the override, defaults to `maxFiles`. |
| `scripts/lint.test.mjs` | +1 test proving the override is **scoped**. |
| `packages/index/src/index.ts` | +1 re-export. |

## The identity rule: merge, but never silently

`personId` derives from the spoken name, so two people legitimately called Ruby in different
sessions collide. No upstream pattern work fixes that — it is an identity question, not a text one.

- **Same session, same name → one person.** Diarization splitting one voice across `spk:N` labels is
  the common case; treating those as two people would be the worse error.
- **Different sessions, same name → merged, but recorded as a COLLISION** and the document's
  confidence drops from 0.9 to 0.6. Collisions come back *alongside* the docs, so a caller cannot
  report a clean write over an ambiguous one. On a live run they **block** the write unless
  `--allow-collisions` is passed.

It deliberately does **not** invent a disambiguator: fabricating a distinction is as wrong as
fabricating an identity, and nothing in the corpus settles it.

## A governance correction inside this unit

D-016 authorized raising the `scripts` budget 30 to 31. **That entry was factually wrong** and was
never executed: `structure.config.json` has no per-directory budget, only one global
`dirsize.maxFiles` that `lint-dirsize` applies to *every* directory under *every* root. Executing it
would have relaxed `packages/`, `apps/`, `workers/` and `schema/` too — a repo-wide loosening
authorized by an entry that described a one-directory change.

Caught while implementing it, before any edit landed. **D-017 supersedes D-016** and authorizes a
scoped `overrides` map instead. `maxFiles` stays 30; only `scripts` is named; a test proves an
unlisted sibling still fails at the global cap.

## Evidence

```
$ node scripts/sync-speakers.mjs --dry-run
sessions scanned: 23
positional turns: 494; attributable by deterministic resolution: 78 (15.8%)
speaker documents to write: 2
  person:jubin-thakkar  aliases=["Jubin Thakkar"]  confidence=0.9  evidence=1 turn(s)
  person:ruby           aliases=["Ruby"]           confidence=0.9  evidence=1 turn(s)
no cross-session collisions
No Mongo connection attempted (--dry-run).

$ pnpm --filter '@lkb/index' test   tests 174   pass 174   fail 0   (165 + 9 new)
$ node --test scripts/lint.test.mjs tests 11    pass 11    fail 0   (10 + 1 new)
$ pnpm -r typecheck                 exit 0
$ pnpm lint:structure               all green; lint-dirsize OK (75 dirs); depcruise 277 modules / 0 violations
```

## Known gaps — stated, not hidden

1. **DETERMINISTIC ONLY, deliberately.** The script calls `resolveSpeakers`, never
   `extractSpeakers` — no provider is contacted and no model output is written. It caps at the
   measured **78/494 turns (15.8%) and two speakers**. The LLM path exists and is checker-PASSed,
   but wiring it here would write model-proposed human names into the knowledge base, and that
   deserves its own approval rather than arriving as a side effect.
2. **No live write has been performed.** Only `--dry-run` has run. The live write is the separately
   approved step, exactly as `sync-real-turns.mjs` treats its own.
3. **B3/B10 have NOT flipped** and will not until a live write happens. Even then I expect
   **B10 to need a human downgrade to PARTIAL**: it is Speaker Intelligence *profiles*, and no
   `org`, `role` or profile of any kind is extracted — only identity, aliases, evidence and
   confidence. Letting an empty-collection probe flip B10 would repeat the C2/C3 over-credit.
4. **`turns.speakerRef` is not rewritten.** Turns keep their `spk:N` labels; the speaker documents
   carry the mapping. Rewriting 78 turns in place is a data migration and belongs in its own unit.
5. **Carried from earlier units, still open:** three gazetteer residues (India, Mumbai, Google);
   ISS-099 (the discriminator is an enlarged allowlist, not the noun test I described); ISS-101 (a
   nominal pin); and `person:j` from a J. Smith style introduction.

## Note to the checker

Two things I most want challenged. **First**, the merge rule: I chose to merge same-named speakers
across sessions and lower confidence, rather than keep them separate. The opposite choice is
defensible and I may have it backwards — if merging is the worse error, FAIL it and say so.
**Second**, the D-016/D-017 correction: judge whether the scoped override is genuinely better than
consolidation, or whether I should have consolidated the scripts and taken no budget change at all.
`ISSUES-WRITTEN: none` is creditable.

---

# Fix cycle 2 — responding to the cycle-1 FAIL (ISS-102, ISS-103)

FAILed 11/12. The three rulings I asked for all came back in my favour — merge rule correct, the
D-016→D-017 correction genuine and the mechanism the checker would itself have required, B10's
downgrade the right call. **The unit failed on the one thing it shipped but never exercised.**

## ISS-102 (high) — the live write could not run at all

`scripts/sync-speakers.mjs` called `speakers(TENANT).replaceOne(...)`. The tenant-scoped accessor
has no `replaceOne` — `raw` was removed under ISS-065 — so the "separately approved step" would
have thrown `TypeError` on its first document. I wrote a gate for a path that was already broken.

Worse, the obvious repair is a trap the checker named: a bare `replaceOne` passthrough, combined
with the `const { tenantId: _t, ...rest }` strip, would persist **tenant-less** documents —
violating `speakers.schema.json`'s `required: ["tenantId"]` and defeating tenant isolation. That is
the ISS-060 shape. I copied the precedent's idiom without copying its method.

## ISS-103 (medium) — and it is the third recurrence of one shape

`scripts/*.mjs` sits outside every typecheck **and** every test: each `tsconfig.json` is
`include: ["src/**/*.ts"]`. So an entrypoint can call an accessor method that does not exist and
nothing objects until runtime. ISS-060, ISS-065, ISS-068 and now ISS-102 are all that same shape.

**Patching the line would have left the mechanism intact.** So the fix is structural, in two parts:

1. **The write logic moved into typechecked source** — `writeSpeakerDocs()` in `speaker-docs.ts`,
   behind a `SpeakerWriteTarget` interface naming exactly the three accessor methods it may use.
   The entrypoint now only wires it up. It uses `deleteMany` + `insertOne`, the precedent pair,
   which is what makes the `tenantId` strip safe: the scoped `insertOne` re-attaches the tenant.
2. **The accessor surface is pinned where it is owned** — `packages/db`'s existing
   `tenantScope.typecheck-test.ts` now asserts `countDocuments`, `deleteMany` and `insertOne`
   exist with the right shapes. `packages/index` does not depend on `@lkb/db`, so the cross-package
   check has to live on the db side.

ISS-103's acceptance was explicit: *"reintroducing ISS-102's exact line must redden a command that
runs in CI, not merely fail when a human triggers a live write."* Both directions now do:

```
# reintroduce replaceOne in the write helper
src/pipeline/speaker-docs.ts(145,18): error TS2339:
  Property 'replaceOne' does not exist on type 'SpeakerWriteTarget'.

# drop deleteMany from the accessor
src/collections/tenantScope.typecheck-test.ts(65,79): error TS2339:
  Property 'deleteMany' does not exist on type '{ find: ...; insertOne: ...; }'.
```

## Evidence

```
$ pnpm --filter '@lkb/index' test   tests 178   pass 178   fail 0   (174 + 4 new write tests)
$ pnpm -r test                      @lkb/db, @lkb/index, @lkb/meeting-bot 40/40, apps/api 109/109 — all green
$ pnpm -r typecheck                 exit 0
$ pnpm lint:structure               green; depcruise 277 modules / 0 violations
$ node scripts/sync-speakers.mjs --dry-run   unchanged: 2 docs, no collisions, 78/494 (15.8%)
```

The four new tests use a fake that mirrors the **real** accessor surface, so accessor drift shows
up as a test failure rather than on a live run. One of them asserts the stored document carries its
`tenantId` — the specific thing a bare replace would have dropped.

## Still true, unchanged

No live write has been performed. B3/B10 have not flipped. The script remains deterministic-only,
capped at 78/494 (15.8%) and two speakers.

## Not done this cycle, deliberately

The checker's low note — persist a `contested` marker on documents born of a cross-session merge —
is **not** implemented. No collision exists in the corpus today and `--allow-collisions` has never
been passed, so adding an unexercised field would be the same mistake as the `replaceOne` path:
shipping code no test and no run has touched. It belongs with the first real collision. Recorded
rather than silently skipped.


---

## Close-out (2026-09-08)

**PASS, cycle 2** — 12/12 criteria, 6/6 invariants, `ISSUES-WRITTEN: none`. ISS-102 and ISS-103
both closed, and closed structurally rather than patched.

The checker tested ISS-103's own acceptance in both directions itself, re-derived the two documents
from the corpus, pushed them through `writeSpeakerDocs` against a target modelled on the real
`scopedCollection` source, and validated the persisted result against `schema/speakers.schema.json`
with Python `jsonschema`. Both validate and both carry `tenantId` — the bare-replace trap is
genuinely closed, not renamed. `pnpm -r test` 490/0 across the workspace.

It also confirmed no key mismatch: `_id` is deterministically `<tenantId>-<personId>` and
`deleteMany` is tenant-merged, so deleting by `personId` and by `_id` select the same row. Two
consecutive writes gave before=0→after=2, then before=2→after=2.

### My reasoning for deferring the `contested` marker was wrong

The checker accepted the decision and rejected the argument, and it is right. I claimed that adding
a `contested` field would repeat the `replaceOne` mistake — shipping unexercised code. It would not.

**ISS-102 was unexercised because it was structurally *unexercisable*:** a `.mjs` entrypoint,
outside every typecheck scope, on a branch only a live write could reach. A `contested` flag would
sit in **typechecked source on a path that already has three passing tests**, and is schema-legal
today. Deferring it until a real collision exists is fine on product grounds; the analogy is not,
and it must not become precedent — "unexercised" and "unreachable by any check" are different
things, and only the second is what made ISS-102 dangerous.

### One more overclaim of mine, recorded

Among the checker's low notes: the new typecheck-test pins `insertOne` **for existence, not for
shape**, while my manifest implied the shapes were pinned. `countDocuments` and `deleteMany` are
shape-pinned; `insertOne` is not. Stated plainly here rather than left standing.

Other low notes carried, none blocking: the tenantId test asserts a composition rather than the
accessor's own behaviour; delete-then-insert is not atomic; and the sync is
authoritative-by-replacement, so it would discard a richer future document.

**U2.4 stays `pending`.** B3/B10 cannot flip without a live write, and B10 still needs its human
downgrade to PARTIAL.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
