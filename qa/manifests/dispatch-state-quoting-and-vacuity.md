# Manifest — dispatch-state-quoting-and-vacuity

**Contract:** none yet — the cycle-1 checker ruled that handshake liveness needs
`qa/contracts/handshake-liveness.md` and queued it as a HUMAN_GATE rather than authoring it. Judge
against ISS-196/197/198's recorded fix directions until that contract exists.
**Goal task:** none (tier 4 — three mediums, all in the file the previous unit shipped).
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-196**, **ISS-197**, **ISS-198** (all medium).

## Why this is a unit and not a deferral

The severity gate says mediums are "verified inside the next unit that touches the same file". This
**is** that unit, run immediately rather than banked — all three are in
`scripts/lib/dispatch-state.mjs`, which I shipped an hour ago, and two of them are defects in the
safety properties that file documents about itself.

## D-015 — measured against each issue's own recorded reproductions

### ISS-196 — the parser counted quoted stamps in four shapes

All four are the **unsafe** direction against the module's own written claim that "undercounting is
safe". Every case below is verbatim from the issue's `evidence`, not invented:

| recorded reproduction | before | after |
|---|---|---|
| (a) `~~~` fence | 9 | **-1** |
| (b) `<!-- Cycle checked: 9 -->` | 9 | **-1** |
| (c) mid-line code span ``see `Cycle checked: 9` here`` | 9 | **-1** |
| (d1) unclosed ` ``` ` opener | 9 | **-1** |
| (d2) ` ```` `-wrapped nested fence | 7 | **-1** |

**4/4 reproductions closed** (d counts as one issue shape with two cases; both fixed).

The single non-greedy `^```[\s\S]*?^``` ` regex is replaced by a **scanning** stripper: HTML
comments first, then fences paired by marker character *and length* — so an unclosed opener
suppresses to EOF instead of nothing, and ` ```` ` survives an inner ` ``` ` — then inline code
spans. Shape (c) is the one that mattered: it is **live prose in ten verdict files today** and was
harmless only because the numbers quoted there happened not to exceed the real stamp.

### ISS-197 — a test named for a property it never exercised

`dispatch-state.test.mjs:195` was named *"a real fault is NOT swallowed"* and asserted only the
ENOENT path, so mutating `if (err?.code !== "ENOENT") throw err` to `if (false) throw err` survived
all 14 tests. Replaced with a case that makes `qa/manifests` a **file**, so `readdirSync` fails with
something other than ENOENT, and asserts `sweep()` throws. The errno is deliberately not asserted —
the contract is "anything but 'no directory' propagates", and it differs across platforms.

**This is the third time in one day I have shipped a test whose name asserts more than its body**
(the others: `[].every()` on an empty array in the C6 tenant test, and the 16h-gap probe that read
line order as time order). Recording it as a pattern rather than three incidents.

### ISS-198 — undecided git status

Position taken and encoded: `qa/dispatch/` is **gitignored**, with the reasoning in the ignore file
itself. Markers are per-session ephemera; the verdict file is the durable record, which is already
what the module treats as authoritative over any marker. A committed marker outlives the check it
describes and reads as in-flight until a matching verdict lands — and another session's `git add -A`
on this shared tree would do exactly that. `git check-ignore -v` confirms `.gitignore:57`.

## Mutation evidence (D-020)

`scripts/lib/mutate.mjs` arm/restore, `timeout 180`, restore in a trap on EXIT/INT/TERM/ERR, each
mutant asserted present on disk before its run counted, `assert-clean` green afterwards.

| mutation | killed |
|---|---|
| M10 — swallow non-ENOENT (`if (false) throw err`) | **yes** (survived before this unit) |
| M-codespan — drop the inline code-span strip | **yes** |
| M-tilde — strip only ` ``` `, not `~~~` | **yes** |
| M-unclosed — never enter the fence state | **yes** |
| M-comment — drop the HTML-comment strip | **yes** |

**Two false signals happened and are reported rather than smoothed over**, because both are the
class this repo keeps hitting:
1. `mutate.mjs` **refused** the first M10 attempt — the file was modified, not committed. The guard
   worked; I committed first and re-ran.
2. My first M-codespan attempt had an anchor mismatch (`count=0`) and would have read as a
   **survivor**; my second used an unquoted heredoc, so the shell mangled the escapes into a
   syntactically broken file and it read as a **kill**. Both are fake. The run in the table used a
   written script plus an explicit `import()` parse check, so a broken mutant cannot masquerade as
   a kill.

## How to verify (commands + expected)

- `node --test scripts/lib/dispatch-state.test.mjs` → **16 pass, 0 fail, 0 cancelled**
- corpus scan over `qa/verdicts/` → **114 of 115 parse**; the one that does not is
  `calendar-auto-join.md`, unchanged from the previous unit and genuinely prose. No verdict changed
  its parsed cycle as a result of this fix.
- `git check-ignore -v qa/dispatch/dispatch-state-tracking.json` → `.gitignore:57`

## Actual outputs (from maker's own run)

```
$ node --test scripts/lib/dispatch-state.test.mjs
ℹ tests 16   ℹ pass 16   ℹ fail 0   ℹ cancelled 0

$ corpus after the ISS-196 fix
115 files | 114 parse | unparsed: [ 'calendar-auto-join.md' ]
   delivery-gate-manifest-blindness => 2
   write-guard-enforcement-gaps     => 3
   hybrid-arms-binding              => 3

$ node scripts/lib/mutate.mjs assert-clean
MUTATIONS CLEAN: none outstanding
```

## Not done, stated

- **ISS-178 stays open**, correctly: this unit hardens the mechanism, it does not wire a reader.
  Both readers remain enforcement-gated or checker-owned.
- **`lint:structure` is still red at HEAD** on the stale `docs/SNAPSHOT.md` (74 lines, from
  `qa/debug/` appearing in commit `ad98add`). Independently confirmed by the cycle-1 checker as not
  caused by this file. Still not mine to regenerate.

## Live browser evidence

`Not UI-touching — no surface changed.` Changed paths: `scripts/lib/dispatch-state.mjs`,
`scripts/lib/dispatch-state.test.mjs`, `.gitignore`. `qa/ui-surfaces.json` lists `scripts/**` under
`genuinely_not_user_facing`; nothing under `apps/` or `packages/` imports the module.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
