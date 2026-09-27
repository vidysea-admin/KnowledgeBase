# Manifest — ledger-shard-union-reader

**Contract:** none yet (no `qa/contracts/mc-hooks.md`; this seam's ground truth is D-019 + D-041 —
disclosed gap, same shape as ISS-329)
**Goal task:** docs/plan.md unit 19 `ledger-shard-union-fix`
**Date:** 2026-09-28
**Fix cycle:** 0 of max 3
**Dual check:** no (no `.goal` task id matches this slug; criticality not declared `critical`)
**Persona walk:** skip (enforcement hook, no screen — `audience: internal-tool`, diff touches no UI surface)
**Issues addressed:** ISS-129 — and ISS-129 only.

> **Corrected at close-out, per the checker's ISS-353 (medium).** This line originally also claimed
> `ISS-350 (reproduction 2 of 4)` and `ISS-130`. The checker diffed the unit and showed neither is
> touched by it: the change is two hunks confined to the `$LEDGER`/`$n` lines, which fixes the
> session-start hook's reader and nothing else. ISS-350's remaining reproductions and ISS-130 stay
> **open**. The overclaim is the finding — a manifest that names ids it did not fix makes the ledger
> lie in the direction that flatters the builder, which is precisely what an independent check is
> for. Recorded rather than quietly edited.
**Executor:** claude-sonnet-subagent → corrected: built by the orchestrator (Opus 5) in-session
**Executor rationale:** single-line enforcement-path edit on an authorized path; delegating an
enforcement-path change to an Ollama lane is forbidden (maker SKILL.md "Never delegate"), and the
change was smaller than its own brief.

## Authorization (enforcement path — recorded before the edit)

`.claude/hooks/mc-sessionstart.ps1` is an enforcement path under the project CLAUDE.md, so
`Changes-authorized` alone is insufficient. **D-041 carries `Approved-by: Umesh`** and names this
exact file and change ("line 5 `$LEDGER` hardcode -> union glob over qa/issues.jsonl +
qa/issues.*.jsonl"). Gate `qa/gates/ledger-shard-union-hook.md` carries the matching `Answered:`
line (Umesh, AskUserQuestion, "Yes, fix it"), after 19 days open.

**Deliberately NOT changed, though present in the same file:** lines 47–49 (ISS-307 — `-TotalCount 1`
reads the OLDEST line of an append-only oldest-first file, and `-match 'STALLED|EXHAUSTED'`
substring-matches inside that tick's prose, together producing the false `STALL UNDIAGNOSED:
ADVANCED` banner that is still printing). D-041 authorizes only the `$LEDGER` union. Fixing an
adjacent defect on an enforcement path under an approval granted for something else is precisely
what the `Approved-by` rule exists to stop. ISS-307 needs its own authorizing entry.

## What changed

- `.claude/hooks/mc-sessionstart.ps1`:5-9 — replaced the hardcoded `$LEDGER = 'qa/issues.jsonl'`
  single-file read with `$LEDGERS`, a `Get-ChildItem -Filter 'issues*.jsonl'` union over
  `qa/`, and made `$n` sum open rows across all of them. `$LEDGER` is retained as the
  human-readable display string (`qa/issues*.jsonl (N file union)`) so the banner's `Ledger:` field
  states what was actually counted. 4 comment lines cite D-019/D-041 and the measured gap.
- `qa/tests/mc-hooks-ledger-union.ps1` — new standing regression test (4 assertions), runs the REAL
  hook against a throwaway temp tree via `CLAUDE_PROJECT_DIR`; never reads or writes this repo's
  ledger.

## How to verify (commands + expected)

- `powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-ledger-union.ps1`
  → expected: `RESULT: PASS (4/4 assertions)`, exit 0
- `powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/mc-sessionstart.ps1`
  → expected: `Open issues: 153` and `Ledger: qa/issues*.jsonl (12 file union)`, exit 0
- Independent union re-derivation (must agree with the hook's number):
  `python3 -c "import glob,re;p=re.compile(r'\"status\":\s*\"(open|Open)\"');print(sum(1 for f in sorted(glob.glob('qa/issues*.jsonl')) for l in open(f,encoding='utf-8') if p.search(l)))"`
  → expected: `153`

## Actual outputs (from maker's own run)

```
$ powershell ... qa/tests/mc-hooks-ledger-union.ps1
  PASS  counts the union (6), not the canonical file alone (2)
  PASS  reports how many files the union covered (3)
  PASS  excludes files not matching issues*.jsonl
  PASS  no ledger present still reports UNKNOWN, not 0
RESULT: PASS (4/4 assertions)
EXIT=0
```

```
$ powershell ... .claude/hooks/mc-sessionstart.ps1
MAKER-CHECKER ACTIVE: ... Open issues: 153 | Checks pending: 0 | PASS not closed out: 0 |
Queue TODO: 0 | Last tick: 67 min ago | Last sweep: 472 min ago | Ledger: qa/issues*.jsonl (12 file union)
STALL UNDIAGNOSED: ADVANCED -- run /agent-debugger on it before any new unit.
AUTO-CONTINUE REQUIRED: ...
EXIT=0
```

Pre-fix baseline, measured on the same tree before the edit: **132 open** reported, **153** actual —
a 21-row undercount. The `STALL UNDIAGNOSED: ADVANCED` line above is the ISS-307 false positive,
still present and deliberately untouched (see Authorization).

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Counts open rows across the UNION of `qa/issues*.jsonl`, not the canonical file alone | `qa/tests/mc-hooks-ledger-union.ps1` assertion 1 ("counts the union (6), not the canonical file alone (2)") | `.claude/hooks/mc-sessionstart.ps1:9` — single-hunk change of `-Filter 'issues*.jsonl'` to `-Filter 'issues.jsonl'` | GREEN before: `PASS  counts the union (6), not the canonical file alone (2)` / RED after: `FAIL  counts the union (6), not the canonical file alone (2) -- expected 'Open issues: 6'; got: ... Open issues: 2 ...` |
| States how many shard files the count covered | same file, assertion 2 ("reports how many files the union covered (3)") | same single-hunk edit as above | GREEN before: `PASS  reports how many files the union covered (3)` / RED after: `FAIL  reports how many files the union covered (3) -- expected '3 file union' ...; got: ... (1 file union)` |
| Does not widen the glob onto non-ledger files | same file, assertion 3 | same edit (control) | `PASS` before AND `PASS` after — stays green under the mutation, proving the red above is isolated to the union claim rather than a blanket reddening |
| Absent ledger still reports UNKNOWN, not 0 (pre-fix semantics preserved) | same file, assertion 4 | same edit (control) | `PASS` before AND `PASS` after |

**Mutation-run safety (D-020):** the falsifying edit was applied with a byte backup restored by a
`trap ... EXIT INT TERM`, the test command wrapped in `timeout 120`, and the restore verified by
`cmp` → `RESTORED: byte-identical (cmp clean)`. `git diff --stat` after the run shows only the
intended `7 insertions(+), 2 deletions(-)`.

**Assertion identity:** both reds name the union assertion and report the wrong *count*
(2 vs 6, 1-file vs 3-file) — not a parse, import or load failure. The two control rows stayed green
in the same run, which is the isolation evidence.

## Live browser evidence

Not UI-touching — no surface changed. Changed paths are `.claude/hooks/mc-sessionstart.ps1` (a
PowerShell SessionStart hook) and `qa/tests/mc-hooks-ledger-union.ps1` (a test). Neither is
`*.tsx|jsx|vue|svelte|html|css`, nor under `apps/web/**`, `**/routes/**`, `**/pages/**` or
`**/components/**`, and no page's data flows through either.

## Status: checked-PASS
**Handshake status:** checked-PASS (Cycle checked: 0, verdict `qa/verdicts/ledger-shard-union-reader.md`
committed 36909f1, VERDICT: PASS, SCOREBOARD 5/5 directed checks, CAPABILITY-COVERAGE 4/4 rows
reproduced in a throwaway copy, ISSUES-WRITTEN: ISS-353 + ISS-354 new, ISS-129 flipped open -> fixed)
— closed out 2026-09-28.

**Non-blocking findings carried forward, neither fixed here:**
- **ISS-353 (medium)** — the `Issues addressed` overclaim, corrected in this manifest above.
- **ISS-354 (low)** — the glob is unguarded against a same-prefix non-ledger file
  (`issues.sample.jsonl`, `issues.archive.jsonl`). Independently found by the session's own scoped
  config audit (`qa/evidence/config-audit-ledger-shard-union-reader-2026-09-28.md`, Low) before the
  verdict landed — two instruments converging on the same gap.

**Config audit (required for an enforcement-path edit):** Grade **A (94/100)**, no critical, no high;
one Medium (`-ErrorAction SilentlyContinue` suppresses unreadable-`qa/` as if absent) and the Low
above. Verified specifically that no ledger row text can reach this hook's stdout, which matters
because the hook's output is injected into agent context as instructions — a hostile shard row can
perturb a count, not inject an instruction.

**Deliberately still unfixed in this same file:** ISS-307 (lines 47-49 — oldest-line read plus a
substring match on `STALLED` inside tick prose, which is why `STALL UNDIAGNOSED: ADVANCED` prints at
every session start). Confirmed untouched by the checker. It needs its own DECISIONS entry with
`Approved-by:`; D-041 authorizes the union change only.
