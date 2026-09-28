# AIOS Config Audit — 2026-09-28 (scoped, ISS-307 stall-detect fix)

**Grade: A (100 / 100)**

**Scope, stated honestly:** not the full 5-surface AIOS audit (Mode 1 covers `D:/ai_os`). This is a
targeted audit of the single enforcement-path file changed by this unit, run because the
delivery-gate security rule fires on any `.claude/hooks/*` edit. Audited surface: **hooks**, plus the
settings wiring that invokes the changed hook.

**Changed set (verified, not assumed):** `git status --porcelain .claude/ scripts/` returns exactly
one entry — `M .claude/hooks/mc-sessionstart.ps1`. No `settings.json`, no `CLAUDE.md`, no other hook,
no `append_decision.ps1`. The unit also adds `qa/tests/mc-hooks-stall-detect.ps1`, which is a test,
not an enforcement path.

**Authorization:** `docs/DECISIONS.md` **D-050 ruling 2**, `**Approved-by:** Umesh`, with
`Changes-authorized` naming this file and this change ("lines 47-49 only: newest-line read plus a
real status-field match"). Answered first-hand via AskUserQuestion this session.

## Critical findings

**None.**

## High findings

**None.**

## Medium / Low findings

**None.**

## What's NOT a finding (checked, and clean)

- **No command injection.** No shell invocation and no string interpolation into a command position
  is introduced. `Get-Content 'qa/.last-tick'` takes a literal relative path.
- **No network call.** None added; none present.
- **No writes.** The change is read-only — it reads one line and compares a token.
- **No path escape.** The read is relative to the location set at line 4
  (`Set-Location $env:CLAUDE_PROJECT_DIR`), so it stays inside the project.
- **No secrets** introduced or read.
- **No self-modification** of `settings.json` or of the hook itself.
- **No new silent error suppression.** Unlike the ledger-union change, this hunk adds no
  `-ErrorAction SilentlyContinue`. `@(Get-Content ...)` plus an explicit `.Count -gt 0` guard handles
  the empty-file case without suppressing anything.

## Prompt-injection surface is REDUCED, not merely unchanged — the one thing worth stating

This hook's own header records that its stdout is injected into agent context and *"read as an
instruction"*, so what the change lets reach stdout is the question that matters.

**Before:** `$unit = ($lt -split '\s+')[2]` was emitted into the banner as
`STALL UNDIAGNOSED: <unit> -- run /agent-debugger on it before any new unit.` whenever the word
`STALLED` or `EXHAUSTED` appeared **anywhere** in the line. `$unit` was therefore the third
whitespace token of an arbitrary prose line — attacker- or accident-influenced free text promoted
into an instruction-shaped sentence in agent context.

**After:** the banner is emitted only when the positional status token matches
`^(STALLED|EXHAUSTED)$` exactly, and the value emitted is `$status`, which by construction is one of
those two literals. **Free text from the tick file can no longer reach stdout through this path.**

That is a strict narrowing of an injection surface, and it was not the motivation for the fix — it
falls out of testing the field instead of scanning the line.

## Correctness note that belongs in a security audit

The pre-fix code was not merely noisy. Falsification (see the manifest's capability-coverage table)
shows it also produced **false negatives**: because it read only the OLDEST line of an append-only
oldest-first file, a genuine `STALLED` or `EXHAUSTED` on the newest tick raised **no banner at all**.
An enforcement check that silently fails to fire is a worse posture than one that fires spuriously,
and it had been in that state while the spurious banner drew all the attention.

## Scoring

Start 100. No Critical, High, Medium or Low findings = **100 → Grade A**.

## Suggested next actions

1. Nothing required for this change.
2. **Still outstanding on this same file:** the Medium from the 2026-09-28 ledger-union audit
   (`-ErrorAction SilentlyContinue` at line 9 cannot distinguish an absent `qa/` from an unreadable
   one) and the Low (the `issues*.jsonl` glob is wider than D-019's shape). Both deliberately
   untouched here — D-050 ruling 2 authorizes the stall-detect lines only.
3. **ISS-355 remains unaddressed and unauthorized:** `.codex/hooks/*` was committed with no Approver
   decision and carries the pre-D-041 single-file `$LEDGER`. It needs its own entry.
4. Hooks take effect only in a **new** session; this audit rests on direct execution of the script,
   not on an injected banner.
