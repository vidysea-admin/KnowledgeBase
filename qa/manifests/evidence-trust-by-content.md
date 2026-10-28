# Manifest — evidence-trust-by-content

**Contract:** qa/contracts/catalogue-progress-score.md — **I11** (added by the cycle-1 checker of
`catalogue-input-integrity`, effective this cycle), plus no regression on I1–I10.
**Goal task:** plan §10 U0.5 (follow-up 2)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-037 (high), ISS-038 (medium), ISS-039 (medium)

## Why — I overclaimed, and the checker caught it

The previous unit's manifest said the honest ceiling was *"a visible commit with a changed sha"*.
**That was wrong.** `isTracked()` used `git ls-files --error-unmatch` — a **path** query. The path
stayed perfectly tracked while the bytes said whatever was typed, so **editing the
already-committed `preflight.json` in place** restored the full **+19.3-point** lever:
20.2% → 39.5%, `--check` **exit 0**, `lint:structure` **exit 0**, **no banner**. The real cost was
a dirty working tree, exactly like the original attack.

This is the fifth layer of the same pattern: **verdicts → numerator → denominator → inputs →
the trust check on those inputs.** Each fix revealed the next.

## What changed

1. **`scripts/lib/evidence.mjs` (new, 115 LOC)** — evidence selection and trust extracted out of
   `lib/catalogue.mjs`, which was at 248/300 and had been told to *extract, not append*. It is
   also a genuinely separate concern: the scorer decides what a verdict IS; this decides which
   measurements it may believe. `lib/catalogue.mjs` is now **194 LOC**.
2. **Trust is content-vs-HEAD, not path-vs-index (ISS-037).** `trustOf()` returns
   `committed | modified | untracked | unknown` using `git diff --quiet HEAD -- <path>` — the check
   `ls-files` structurally could not make. Only `committed` is trustworthy.
3. **The banner distinguishes the two failures.** `modified` now says *"EDITED SINCE COMMIT — no
   longer matches the version in git, so this score is not the one the repository supports"*,
   which is a different and more alarming statement than "uncommitted".
4. **The fingerprint is content-based, not byte-based (ISS-039).** It hashes canonical parsed
   content (stamp + key-sorted counts) instead of raw bytes, so `core.autocrlf` cannot flip it on
   checkout and send `--check` STALE on an untouched clone. A fingerprint that moves when nothing
   meaningful moved just teaches people to ignore it.
5. **Four new tests (19 in this file, 33 in `pnpm test:lint`)** covering the guard that previously
   had none (ISS-038).

## Real evidence

### The ISS-037 attack — edit the COMMITTED file in place, no new folder, no commit
```
$ python - <<'…'   # rewrite every zero count to 4242 in the committed preflight.json
$ node scripts/catalogue-score.mjs
wrote docs/PROGRESS.md — 39.5% adjusted / 50% machine-derived      # write mode still computes it
# …and the doc now says, unmissably:
Collection counts from `qa/evidence/live-2026-09-07-01-58-41/preflight.json`
(run 2026-09-07T01:58:41.367Z, content `6ee25972dbc8`) — **EDITED SINCE COMMIT — … no longer
matches the version in git, so this score is not the one the repository supports**

$ node scripts/catalogue-score.mjs --check          # the gate inside lint:structure
REFUSED: evidence qa/evidence/…/preflight.json is not what the repository holds (modified).
exit=2
```
**Before this unit the same attack gave exit 0 and no banner.** Restored byte-identically
afterwards; `--check` back to `OK: docs/PROGRESS.md is current (20.2% of 57 features)`.

### Mutation test of my own new guards — the standard the checker has been holding
Neutering each guard in turn must turn a test red. All five did:
```
neuter content-vs-HEAD check (always "committed")   -> RED
neuter isTrustworthy (accept everything)            -> RED
neuter future-date refusal                          -> RED
neuter stamp-based selection (back to folder name)  -> RED
neuter canonical fingerprint (hash raw stamp only)  -> RED
```

### Suite + lint + LOC (all re-derived, not typed)
```
$ node --test scripts/catalogue.test.mjs   → 19/19   (was 15)
$ pnpm test:lint                           → 33 pass, 0 fail   (was 29)
$ pnpm lint:structure                      → exit 0
countLoc: catalogue-score 130 · lib/catalogue 194 · lib/evidence 115 · catalogue.test 206  (/300)
```

### The score did not move: still 20.2% / 28.9%
A hardening change that moved the headline would mean one of the two was wrong.

## Disclosed limitations

- **Committed fabricated evidence still defeats this** — someone who commits a doctored
  `preflight.json` gets a trustworthy-looking score. That genuinely is the ceiling for a scorer:
  it cannot distinguish a well-formed lie from the truth. What it now costs is a **real commit**
  with a changed content fingerprint, in a repo whose history is reviewed — this time that claim is
  accurate, because the check is on content rather than path.
- **The `--check` gate test asserts wiring, not a spawned CLI run.** `trustOf`/`isTrustworthy`/
  `fingerprint` are unit-tested against a real throwaway git repo, and one test asserts the CLI's
  refusal branch calls the tested predicate. A full end-to-end CLI test would need a fixture repo
  containing `apps/api/src/routes`, `apps/web/src/App.tsx`, `schema/` and a catalogue; that
  scaffolding is not built. So: deleting the `if` from the CLI *is* caught (by the wiring
  assertion), but a subtler CLI-only regression might not be.
- `trustOf` shells out to `git`; outside a git checkout it returns `unknown` and `--check` refuses.
  Correct for this repo (Lab Protocol requires git), noted in case the scorer is ever reused.

## How to verify (for the checker)
1. **Re-run your ISS-037 attack**: edit the committed `preflight.json` in place (no new folder, no
   commit) → write mode must print the *EDITED SINCE COMMIT* banner; `--check` must exit 2. Restore
   and confirm byte-identical.
2. Confirm the distinction is real: an **untracked** file and a **modified** file must produce
   different warnings, and both must be refused by `--check`.
3. **ISS-039**: verify the fingerprint is computed from parsed content, not raw bytes — e.g. rewrite
   the evidence file with CRLF line endings and/or reordered keys and confirm the hash is unchanged,
   then change one count and confirm it moves.
4. **Mutation-test** the five guards listed above yourself; each must redden a test.
5. **ISS-038**: confirm the `--check` refusal is now covered — neuter it and check a test fails.
   Then judge my disclosed limitation honestly: is a wiring assertion adequate here, or do you
   consider a spawned-CLI test necessary? Say so either way.
6. No regression on I1–I10: determinism, delete-and-regenerate, manual-upgrade refusal, closed
   vocabulary, pinned denominator, probe fingerprint, staleness gate, 501/dead-code → STUB, the
   future-date refusal and stamp-based selection. Re-verify ≥3 verdicts against reality.
7. `pnpm test:lint` (33) + `pnpm lint:structure` exit 0; all four files ≤300 non-blank LOC.
8. Score still 20.2%/28.9%, no verdict changed.
9. **Sixth layer?** The pattern has held five times. Look again.

## Status: superseded-by score-input-trust-complete

Checker cycle 1 (`qa/verdicts/evidence-trust-by-content.md`): **FAIL** — ISS-038 (the `--check`
gate was pinned only by a source-text assertion, disproved by flipping `exit(2)` to `exit(0)` with
all tests green) and ISS-041 (`.goal/catalogue.json`, the +42.1-point lever, had no trust check at
all). Both were fixed in the next unit, `score-input-trust-complete`, rather than in a fix cycle
here — so this manifest is superseded, not stalled. Its own contribution (content-vs-HEAD trust
replacing the path-only check) shipped and was re-verified as holding in every later cycle.

**Handshake status:** superseded — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
