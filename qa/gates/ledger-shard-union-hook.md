# HUMAN_GATE — the session-start hook still reads only the canonical ledger

**Opened:** 2026-09-08
**Blocks:** the second half of `ledger-shard-union-readers` (ISS-129). The script reader is fixed
and shipped; the hook is not.

## The question, in one line

May `.claude/hooks/mc-sessionstart.ps1` be changed to read the ledger **union**
(`qa/issues.jsonl` + `qa/issues.*.jsonl`) instead of the canonical file alone?

## Why it needs you

`.claude/hooks/*` is an **enforcement path** under the project CLAUDE.md: it requires an
authorizing `docs/DECISIONS.md` entry carrying **`Approved-by: Umesh`**, recorded only after
explicit confirmation. `Changes-authorized` alone is not enough. So this is not a maker fix.

## What is wrong today

Line 5 is `$LEDGER = 'qa/issues.jsonl'`. Every session therefore starts with an open-issue count
that **excludes every lane shard** — including `ISS-C-UNRUN-WRITERS-005`, which `D-020` cites as
its own evidence. The directive a session reads first is computed from a partial ledger.

D-019 declared the union and authorized only `.claude/CLAUDE.md`, so the mechanism it required was
never scoped to a file it could touch. That is the root cause of ISS-129 and it applies to this
half too.

## The change, exactly

Replace the single-file read with a glob over `qa/issues.jsonl` and `qa/issues.*.jsonl`, summing
open rows across all of them. **Nothing else** — no change to what the hook prints, when it fires,
or what it blocks.

## Options

- **A — approve** (recommended): a DECISIONS entry with `Approved-by: Umesh`,
  `Changes-authorized: .claude/hooks/mc-sessionstart.ps1 (ledger path resolution only)`.
- **B — decline and revert the convention**: if per-lane shards are not worth an enforcement-path
  change, the honest alternative is to retire D-019 rather than leave a declared union that only
  one of two readers implements.
- **C — defer**: leave the hook partial and accept that startup counts under-report. Recorded as an
  accepted risk rather than an oversight.

## Answered

*(unanswered — append `Answered: <ISO date> — <choice> — <where>` before acting)*

**Gate status:** OPEN — awaiting the Approver; see the Answer format section in this file

Answered: 2026-09-27T17:2x+05:30 — APPROVED ("Yes, fix it") — Umesh first-hand, AskUserQuestion in
checker/maker session 21132795, question "Our issue counter only reads one file, so it under-reports.
Right now it says 125 open issues; the real number across all files is 146. Fix is roughly one line.
Approve?" Authorizes replacing the hardcoded $LEDGER = 'qa/issues.jsonl' at
.claude/hooks/mc-sessionstart.ps1:5 with a union glob over qa/issues.jsonl + qa/issues.*.jsonl, and
the same union in every other ledger-reading surface (checker sweep, tracker audit) per D-019.
Enforcement path -> authorizing entry D-041 carries **Approved-by:** Umesh. Unblocks plan unit 19
and ISS-129/130. Gate open 19 days.
