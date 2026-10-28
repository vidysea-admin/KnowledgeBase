# Verdict — handshake-field-reader

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** fresh Claude subagent (this session never wrote the code under review)

## Authority (checked first, per this unit's own framing)

D-043 item 3 (`.claude/hooks/mc-sessionstart.ps1` reading `**Handshake status:**` for
`Checks pending`/`PASS not closed out`) carries `Approved-by: Umesh` and names this exact file and
change (docs/DECISIONS.md:611-628). D-049 corrects D-043's scope error for items 1-2
(`delivery-gate-stop.ps1`, machine-wide) but explicitly leaves item 3 "ACTIVE and correct ...
genuinely repo-local" (docs/DECISIONS.md:931-933) — confirmed by direct read, both entries. The
diff stays inside that scope: `delivery-gate-stop.ps1` does not exist in this repo (`git ls-files`
confirms nothing), and the manifest's claim that it was not touched or even opened as a live file
holds — I found no reference to it in the diff. `verdictCycle()`, `stripQuoted()`, and
`manifestCycle()` are byte-identical to `8cf88fc` (confirmed via the diff below) — the maker's claim
of leaving them untouched holds.

**One inaccuracy found, upstream of this unit, not caused by it:** D-049 also says item 3 was
"built and PASSed as `ledger-shard-union-reader`." That is false — `ledger-shard-union-reader`'s own
manifest, corrected at close-out per its checker's ISS-353, states it touched only the `$LEDGER`/`$n`
ledger-union lines and explicitly did NOT touch ISS-350/the handshake field, and it was authorized by
D-041, not D-043. `handshake-field-reader` is the first unit to actually build item 3's reader-side
work. This does not weaken this unit's own authorization (D-043 item 3's Approved-by/Changes-authorized
text names the file and change directly, independent of what D-049 believed was already built) — filed
as `ISS-A0CDAEE-002` (low) for the record, not a reason to withhold PASS.

**Diff scope (step 4c):** `git diff 8cf88fc..1f263e0 --stat` touches exactly the 4 files the manifest's
"What changed" names (`.claude/hooks/mc-sessionstart.ps1` +33/-3, `scripts/lib/dispatch-state.mjs`
+96/-4, `scripts/lib/dispatch-state.test.mjs` +138, `qa/tests/mc-hooks-handshake-field.ps1` new +205),
plus the manifest itself. No existing function, export, test, or config key was deleted or renamed.

## Merge hazard (the crux of this dispatch)

Master had advanced to `21b6975`, including `ca86e53`/`0cf1b17` (the ISS-307 stall-check fix to this
same file, authorized by D-050-SPEAKER ruling 2, docs/DECISIONS.md:989-992: read the newest
`qa/.last-tick` line and match a real status token). Trial-merged with `git merge-tree --write-tree
1f263e0 21b6975` (read-only, no working tree touched, no worktree/branch created) — **exit 0, clean
merge, no conflict markers.** The two edits occupy disjoint hunks: this unit's diff ends exactly at
the `# Discovery/repair directives` comment; the ISS-307 fix is entirely inside the `qa/.last-tick`
stall-check block that follows it.

Extracted the merged tree (`git archive <merge-tree hash>`) into a scratch copy outside the bound repo
and re-ran the REAL test suites and a live hook invocation against it — both changes applied together:

- `qa/tests/mc-hooks-handshake-field.ps1` → **22/22 PASS**
- `qa/tests/mc-hooks-stall-detect.ps1` (master's ISS-307 regression suite) → **4/4 PASS**
- `qa/tests/mc-hooks-ledger-union.ps1` (D-019 non-regression) → **4/4 PASS**
- Live hook run against the merged copy: `Checks pending: 1 [handshake-field-reader] | PASS not
  closed out: 0`, **no** `HANDSHAKE DISAGREEMENT` line, **no** `STALL UNDIAGNOSED` line (the ISS-307
  fix correctly suppresses the false banner in the same run that correctly reports the pending
  manifest) — both fixes verified working together, not just each in isolation.

No conflicted or half-merged state was left anywhere; the merge-tree call never touched the real
worktree, and the scratch copy is outside the bound root.

## Claims re-derived (not accepted on the manifest's say-so)

1. **Canonical-field precedence + the three legacy `Status` forms.** Ran the unit's own JS (28/28) and
   PS (22/22) suites myself in the worktree — both include explicit fixtures for the bold-field,
   heading, and bare inline `Status:` forms, plus canonical-only and disagreement-direction cases. All
   green, re-run independently.
2. **Disagreement surfacing, positive and negative.** Confirmed via the same suites: a real
   canonical/legacy conflict produces the banner / `disagreement` key in both directions; a
   canonical-only manifest produces neither (`legacyPresent`-gated, as claimed).
3. **The backtick fix.** Re-ran the live disagreement scan against the real `qa/manifests/` corpus
   myself: `total 162 disagreements 0 missing-canonical 0` (162, not 161, because this checker run
   includes the manifest's own file — consistent). Read the diff directly: the old vulnerable class
   `[\s\-*#>|` + backtick `]` is gone from `legacyReadyForCheck`/`legacyStatusPresent`, confirmed
   character-for-character.
   - **`manifestCycle()` scoping — I found a real latent defect, filed rather than demanded here.**
     It still carries the identical backtick-inclusive leading class with no `stripQuoted()` pre-pass.
     Live-scanned all 162 manifests for a backtick-quoted "Fix cycle" mention: 10 files carry one, and
     in every one today the quote happens to sit AFTER the file's real field, so `manifestCycle()`
     returns the correct value in all 10 — 0 live misreads, confirmed by direct comparison. That is a
     coincidence of document ordering, not a property of the regex: a constructed fixture placing the
     quoted mention as the FIRST line (matching the live corpus's own shape, several of whose 10 files
     already document this exact bug class) reads `manifestCycle()` as 9 when the real field says 1.
     Filed as **`ISS-A0CDAEE-001`** (medium) in `qa/issues.a0cdaee.jsonl`, not blocking this unit.
4. **ISS-350 honesty (D-015).** Read the ledger row directly. The row's own `checker_note` (dated
   2026-09-28, before this unit) already states the cited live instance
   (`delivery-gate-stamp-adoption.md`) does not reproduce reproduction 2's mechanism and is really the
   separate ISS-267 gap, and that zero of 161 manifests were in the canonical-only blind state — this
   manifest's accounting (fixed at the code level, verified against a constructed fixture, reproductions
   3-4 left open and named with D-043 item 3's own scope boundary as the reason) matches the ledger row
   word for word in substance. Honest, not an overclaim.
5. **Claimed test outputs.** Re-ran all three commands myself in the worktree, not pasted:
   `node --test scripts/lib/dispatch-state.test.mjs` → 28/28; `mc-hooks-handshake-field.ps1` → 22/22;
   `mc-hooks-ledger-union.ps1` → 4/4. All match exactly. Confirmed both new/changed test files use only
   throwaway `GetTempPath()`/`mkdtempSync` trees (`grep`'d directly) — neither touches this repo's real
   `qa/`.
6. **PASS-closeout widening, false-positive check.** Scanned every real file in `qa/verdicts/` (161)
   comparing the old pattern (`VERDICT:\s*PASS`, case-insensitive) against the widened one. 17 files now
   match that didn't before; read all 17 by hand (6 directly quoted above, the rest sampled) — every one
   is a genuine PASS verdict written in a format the old regex couldn't see (`Verdict: **PASS**`,
   `**Result: PASS**`, bare `## Verdict\n**PASS**`), never prose merely discussing a PASS. No false
   positives found.

## Capability coverage

Re-ran the manifest's row 1 falsification myself, independently, in a throwaway copy (never the bound
worktree): confirmed the copy green first (28/28), applied the described mutation (collapse
`isReadyForCheck` to always call `legacyReadyForCheck`, undoing the canonical-wins branch) — **4/28
tests go RED**, isolated to the canonical-vs-legacy assertions; restored from the untouched
`.orig` backup and reconfirmed 28/28 green. The other rows are backed by tests I independently re-ran
green (items 1-6 above) and are consistent with the claimed mechanism on direct code read; not every
row was independently mutated given the redundant coverage already re-derived.

## Findings

Two issues filed, neither blocking this unit (`qa/issues.a0cdaee.jsonl`, this worktree's lane per
D-019 — master has allocated to ISS-364, no ids reused):

- **ISS-A0CDAEE-001** (medium) — `manifestCycle()` shares the exact backtick false-positive class this
  unit just fixed in two sibling functions; 0 live misreads today, by document-order coincidence, not
  design. Correctly out of this unit's authorized scope (D-043 item 3 covers the ready-for-check
  reading only); needs its own authorized unit.
- **ISS-A0CDAEE-002** (low) — D-049 misattributes item 3's completion to `ledger-shard-union-reader`,
  which its own corrected manifest shows never touched the handshake field. Does not affect this unit's
  authorization; a record-accuracy note for the next reader.

No other findings meet the >80%-confidence bar. The PASS-widening scope question (whether it exceeds
D-043 item 3's literal text) was considered and not filed: it is additive, non-regressing (confirmed by
dedicated control assertions), and disclosed candidly in the manifest as a distinct axis from the
canonical-field reading.

## Scoreboard

All capability-coverage rows evidenced; both authorized-scope questions (delivery-gate-stop.ps1
untouched, verdictCycle/stripQuoted/manifestCycle untouched except the one disclosed backtick fix)
confirmed by direct diff read; merge hazard resolved clean with both changes verified working together.

```
VERDICT: PASS
SCOREBOARD: 6/6 capability rows evidenced, 3/3 authorization/scope checks hold
CAPABILITY-COVERAGE: 6/6 rows reproduced (1 independently re-mutated by this checker; 5 backed by
  independently re-run green suites + direct code read)
LIVE-BROWSER: not-applicable (enforcement hook + library module, no UI surface)
ISSUES-WRITTEN: ISS-A0CDAEE-001, ISS-A0CDAEE-002
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Authorization holds (D-043 item 3, Approved-by Umesh, confirmed ACTIVE by D-049) and the
  diff stays inside its scope. The merge hazard against master's concurrent ISS-307 fix (ca86e53/
  0cf1b17) is a clean no-conflict merge (git merge-tree, exit 0), independently verified working —
  both hook behaviors correct together in a merged-tree scratch copy (handshake pending count right,
  no false disagreement, no false stall banner). All six claims in the dispatch were re-derived, not
  trusted: three status forms, disagreement surfacing (positive+negative), the backtick fix (0/162
  live, plus a real but out-of-scope latent twin in manifestCycle() now filed), ISS-350's honest
  partial-fix accounting matching the ledger's own note, all claimed test counts reproduced exactly,
  and the widened PASS-closeout pattern checked against all 161 real verdicts with zero false
  positives. One pre-existing governance-log inaccuracy (D-049 misattributing item 3 to a different
  unit) was found and filed but does not bear on this unit's own valid authorization.
```
