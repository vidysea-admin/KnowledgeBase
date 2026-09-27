# Verdict — ledger-shard-union-reader

**Date:** 2026-09-28
**Cycle checked:** 0
**Checker:** fresh Claude Sonnet subagent, no ANTHROPIC_BASE_URL override, no builder context.
**Project root (bound):** D:/KnowledgeBase — all reads/writes below resolved inside it; nothing
outside it was read or written.
**Contract:** NONE EXISTS. Judged against D-019 (docs/DECISIONS.md) and D-041's stated
requirements, as directed. Recording the missing-contract gap itself as a finding (see below).

## 1. Authorization scope

Verified independently, not taken on the manifest's word:

- `docs/DECISIONS.md` D-041 (grep + read in full) exists, `status: ACTIVE`, carries **`Approved-by:
  Umesh`**, and its `Changes-authorized` field reads verbatim: *".claude/hooks/mc-sessionstart.ps1
  (line 5 $LEDGER hardcode -> union glob over qa/issues.jsonl + qa/issues.*.jsonl, per ruling 3) -
  and no other enforcement path."* This names exactly the file and exactly the change the manifest
  made.
- `qa/gates/ledger-shard-union-hook.md` carries a matching `Answered:` line (Umesh, AskUserQuestion,
  "APPROVED", session 21132795), consistent with D-041.
- `git diff -- .claude/hooks/mc-sessionstart.ps1` (re-run myself): exactly 2 hunks, `@@ -5 +5,6 @@`
  and `@@ -8 +13 @@`, both confined to the `$LEDGER`/`$LEDGERS`/`$n` lines (old lines 5–8). The
  ISS-307 lines (`-TotalCount 1` / `STALLED|EXHAUSTED` match, now at new-file lines 52–53 after the
  5-line insertion shifted them down) are **not touched by either hunk** — confirmed both by the
  diff's hunk headers and by reading the current file's content at those lines, which is
  byte-identical prose to before. Claim holds: the edit does not exceed D-041's authorization.

**Result: PASS.**

## 2. Capability coverage (throwaway copy, outside the bound root)

Copy built at `<scratch>/ledger-union-row-copy/` containing only `.claude/hooks/mc-sessionstart.ps1`
and `qa/tests/mc-hooks-ledger-union.ps1` in the same relative layout the test's `$PSScriptRoot`
resolution requires (qa/tests and .claude/hooks as siblings under a root). Bound working tree was
never edited.

- **Green-before, in the copy** (not reused from step 3): `RESULT: PASS (4/4 assertions)`, exit 0.
- **Falsifying edit** applied to the copy only: single-hunk `-Filter 'issues*.jsonl'` →
  `-Filter 'issues.jsonl'` at the hook's line 9, exactly as the manifest's table specifies.
- **Red-after, in the copy**: assertions 1 and 2 (the union-count and file-count claims) both FAIL
  with the exact wrong values the manifest's table predicts (`Open issues: 2` not 6; `1 file union`
  not 3) — assertion identity confirmed, not a parse/import/load failure. Assertions 3 and 4
  (controls) **stayed PASS** under the same mutation, which is the isolation evidence.
- Copy restored from a byte backup; **SHA256 of restored copy == SHA256 of the bound tree's real
  file** (confirmed via `Get-FileHash`), so the falsification never touched the artifact the maker
  will build the next cycle on.

**CAPABILITY-COVERAGE: 4/4 rows reproduced.**

## 3. The number

Independently re-derived with my own script (JSON-parsing, not the manifest's regex one-liner),
per file and in total:

| file | open (json-parsed) | open (regex, sanity cross-check) |
|---|---|---|
| issues.jsonl (canonical) | 132 | 132 |
| issues.c-unrun-writers.jsonl | 6 | 6 |
| issues.live-record-repair.jsonl | 1 | 1 |
| issues.t-029.jsonl | 1 | 1 |
| issues.t-031.jsonl | 1 | 1 |
| issues.t-033.jsonl | 2 | 2 |
| issues.t-047-controller.jsonl | 0 | 0 |
| issues.u0.jsonl | 3 | 3 |
| issues.u1.jsonl | 3 | 3 |
| issues.u2.jsonl | 1 | 1 |
| issues.u2fix.jsonl | 1 | 1 |
| issues.u3.jsonl | 2 | 2 |
| **TOTAL** | **153** | **153** |

12 files matched, 0 malformed lines, JSON-parsed and regex methods agree exactly — no case in this
dataset where `"status":\s*"(open|Open)"` matches inside a non-status string field (title/evidence
text never happens to contain that exact quoted shape here). 153 − 132 = 21, matching the manifest's
"21-row undercount" arithmetic. Re-ran both verify commands myself in the real tree (not copied):
`qa/tests/mc-hooks-ledger-union.ps1` → `RESULT: PASS (4/4 assertions)`; the real hook →
`Open issues: 153 | ... | Ledger: qa/issues*.jsonl (12 file union)`. Both match the manifest exactly.

**Result: NUMBER VERIFIED.**

## 4. Glob width

`find qa -iname "*issue*"` (and a repo-wide search excluding worktrees) shows the 12 matches above
are the **only** files `-Filter 'issues*.jsonl'` currently touches — all genuine ledger shards, no
backups/archives/samples/fixtures/`.orig`/`.tmp` siblings present. The worktree copies under
`.claude/worktrees/*/qa/issues*.jsonl` are NOT reached (`Get-ChildItem -Path 'qa'` with no
`-Recurse` only lists `qa/`'s direct children in the current tree). **Currently safe.**

Filed as a finding rather than silently accepted, per instruction to reason about what the glob
*would* match: the manifest's own test control (assertion 3) uses a decoy `archive-issues-old.jsonl`
— wrong prefix, was never going to match the pattern regardless. It gives no evidence against the
real risk shape: a **same-prefix** non-ledger file (`issues.sample.jsonl`, `issues.archive.jsonl`)
would match `issues*.jsonl` and be silently summed into the count with no warning. Non-blocking today
(no such file exists, and D-019/D-041 authorize exactly this glob as the project convention) — filed
as ISS-354, low severity.

## 5. `$LEDGER` display string

`grep -n '\$LEDGER\b'` over the whole file: exactly 2 hits — the assignment (line 10, now a
human-readable phrase) and the banner `Write-Output` (line 45, `Ledger: $LEDGER`). No later code
path does `Test-Path $LEDGER` / `Get-Content $LEDGER` / anything else that would treat it as a
filesystem path. **Claim holds — no misleading downstream usage.**

## Mode D (live browser)

**LIVE-BROWSER: not-applicable** — changed paths are `.claude/hooks/mc-sessionstart.ps1` (PowerShell
SessionStart hook) and `qa/tests/mc-hooks-ledger-union.ps1` (PowerShell test). Neither matches
`*.tsx|jsx|vue|svelte|html|css`, none of `apps/web/**`, `**/routes/**`, `**/pages/**`,
`**/components/**`; no page's data flows through either. Confirmed from `git status`/`git diff`
myself, not taken from the manifest's assertion.

## Additional findings from independent verification (beyond the 5 directed checks)

**ISS-353 (medium, filed) — misattributed "Issues addressed" claims.** The manifest lists
`ISS-350 (reproduction 2 of 4)` and `ISS-130` under Issues addressed. Neither is actually touched by
this unit's diff:
- ISS-350's reproduction 2 concerns the `$pending`/`$unclosed` Status-parsing predicate
  (bold/heading/inline Status forms, first-vs-highest verdict cycle) — a completely different part
  of the hook, unchanged by this diff (confirmed: 2 hunks, both in the `$LEDGER` block; `grep -n
  "Handshake status"` on the hook returns 0 hits). That predicate was already fixed by an earlier,
  unrelated unit, commit `58cfaf0` ("mc-hooks-bolded-status", citing ISS-176/ISS-183, not ISS-350).
- ISS-130 is about worktree lanes not creating per-lane shard files; its own `fix_direction` begins
  "Not a code fix -- per-lane bookkeeping." A hook read-side change cannot fix that.

I did **not** flip either issue's status (per protocol: "each one must actually be fixed by this unit
or it stays open" — both stay `open`). I **did** flip **ISS-129** to `fixed`: it names two readers
(`tracker-audit.mjs` and `mc-sessionstart.ps1`); `tracker-audit.mjs` already globs the union
(confirmed by direct source read, its own docstring cites ISS-129) and this unit fixes the remaining
reader, so ISS-129 is now genuinely closed by the union of this unit + prior work.

**ISS-354 (low, filed)** — the glob-width coverage gap described in section 4.

Neither finding touches auth/tenancy/data-writes; both are governance/bookkeeping-class per this
project's severity gate ("Medium — one-line ledger entry; verified inside the next unit that touches
the same file... Low — ledger entry only, never a pulled unit"). Neither gates this unit's PASS: the
actual artifact (the hook fix + its test) is correct, authorized, and independently reproduced
exactly as the manifest describes. The misattribution is real but is a defect in the manifest's
bookkeeping paragraph, not in the code this unit shipped or in the authorization it relied on.

## VERDICT

```
VERDICT: PASS
SCOREBOARD: 5/5 directed checks pass (authorization scope, capability coverage, the number, glob
  width, $LEDGER safety); 2/2 informal criteria met (D-019 union requirement; D-041 authorization
  scope not exceeded)
FAILURES (if any):
- none blocking. Two non-blocking findings filed: ISS-353 sev: medium · manifest's "Issues
  addressed" line claims ISS-350/ISS-130 which this unit's diff does not touch · restate the claim
  to name the specific sub-fix and its real commit, or drop the id · issue: ISS-353
- ISS-354 sev: low · glob-width coverage gap (same-prefix decoy files untested) · add a same-prefix
  decoy row to the standing test if ever revisited · issue: ISS-354
CAPABILITY-COVERAGE: 4/4 rows reproduced (throwaway copy outside bound root; green-before from the
  copy itself, red-after isolated to the two union assertions, controls stayed green, restore
  verified byte-identical via SHA256)
LIVE-BROWSER: not-applicable (changed paths: .claude/hooks/mc-sessionstart.ps1,
  qa/tests/mc-hooks-ledger-union.ps1 — no UI surface, no page/route/component path)
ISSUES-WRITTEN: ISS-353, ISS-354 (new); ISS-129 flipped open -> fixed (both its named readers now
  verified union-correct); ISS-350, ISS-130 left open (not actually addressed by this unit)
EXECUTOR: claude-sonnet-subagent (built by the orchestrator, Opus 5, in-session per the manifest)
  (checker: claude-sonnet-subagent, no ANTHROPIC_BASE_URL override — self != executor confirmed)
EXPLANATION: The core deliverable is sound: D-041 authorizes exactly this file and change with
  Approved-by: Umesh, the diff does not exceed that authorization (ISS-307 lines confirmed
  untouched), the union logic works and was falsified/restored cleanly in an isolated copy, and the
  153/132/21 numbers all independently re-derive exactly as claimed with zero malformed lines.
  Two governance-bookkeeping findings were filed (misattributed Issues-addressed claims; an
  unguarded-but-currently-harmless glob shape) — both medium/low, neither blocking per this
  project's own severity gate, both now on the ledger for the next unit that touches this seam.
```
