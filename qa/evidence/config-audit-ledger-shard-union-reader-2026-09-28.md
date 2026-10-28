# AIOS Config Audit — 2026-09-28 (scoped)

**Grade: A (94 / 100)**

**Scope, stated honestly:** this is NOT the full 5-surface AIOS audit (Mode 1 covers `D:/ai_os`).
It is a targeted audit of the single config file changed in this session, run because the
delivery-gate security rule fires on any `.claude/hooks/*` edit. Audited surface: **hooks**, plus
the settings wiring that invokes the changed hook.

**Changed set (verified, not assumed):** `git status --porcelain .claude/ scripts/` returns exactly
one entry — `M .claude/hooks/mc-sessionstart.ps1`. No settings.json, no CLAUDE.md, no other hook,
no `append_decision.ps1`. Diff is +7/-2.

**Authorization:** `docs/DECISIONS.md` D-041, `**Approved-by:** Umesh`, `Changes-authorized` naming
this file and this change. Gate `qa/gates/ledger-shard-union-hook.md` carries the matching
`Answered:` line.

## Critical findings

**None.**

## High findings

**None.**

## Medium / Low findings

- 🟠 **Medium — hooks — `.claude/hooks/mc-sessionstart.ps1:9` — silent error suppression.**
  The new `Get-ChildItem ... -ErrorAction SilentlyContinue` is the PowerShell equivalent of the
  checklist's `2>/dev/null` / `|| true` pattern: if `qa/` is unreadable for a reason *other* than
  absence (permissions, a locked file, a path that is a file not a directory), the hook reports
  `UNKNOWN (no ledger)` rather than surfacing why.
  **Scored rather than excused,** even though (a) it is the file's own existing idiom at lines 13
  and 50, and (b) the suppressed path has a defined, *asserted* fallback — regression assertion 4
  ("no ledger present still reports UNKNOWN, not 0") pins it. I introduced one new instance of a
  pre-existing pattern; that is still one new instance.
  **Fix:** distinguish absent-`qa/` from unreadable-`qa/` — `if (-not (Test-Path 'qa')) { ... }`
  first, and let a genuine enumeration error surface into the banner.

- 🔵 **Low — hooks — `.claude/hooks/mc-sessionstart.ps1:9` — glob is wider than the old literal.**
  `-Filter 'issues*.jsonl'` matches any `qa/` file beginning `issues` and ending `.jsonl`. Today
  that is exactly the 12 intended files (1 canonical + 11 D-019 lane shards), verified by
  enumeration. But the old code read one *known* path; the new one reads whatever matches a pattern,
  so a future stray — `issues.sample.jsonl`, `issues-old.jsonl`, a fixture, a partially-restored
  backup — would silently inflate every count the banner reports. The regression test proves a
  *non-matching* decoy (`archive-issues-old.jsonl`) is excluded; it cannot catch a stray that
  *does* match.
  **Fix:** tighten to the D-019 shape — `issues.jsonl` plus `issues.<lane>.jsonl` — e.g. filter the
  enumerated set through `^issues(\.[A-Za-z0-9._-]+)?\.jsonl$` and additionally require that a
  shard's rows carry `ISS-<LANE>-` ids, or keep the glob and add a banner warning when a matched
  file is not in a known-shard list.

## What's NOT a finding (checked, and clean)

- **No command injection.** The change introduces no shell invocation and no string interpolation
  into a command. `-Path 'qa'` and `-Filter 'issues*.jsonl'` are literals; no user-, file- or
  ledger-derived value reaches a command position.
- **No network call.** None added; none present in the changed hunk.
- **No writes.** The change is read-only — it enumerates and counts. The hook writes no file.
- **No path escape.** The glob is relative to the location set at line 4
  (`Set-Location $env:CLAUDE_PROJECT_DIR`), so reads stay inside the project. No absolute paths, no
  `..` traversal.
- **No secrets** introduced or read.
- **No self-modification** of `settings.json` or of the hook itself.
- **Prompt-injection surface NOT widened — verified specifically, because this is the one way a
  ledger-reading change could matter.** This hook's own header notes its stdout is injected into
  agent context and "read as an instruction". The change makes it read *more files' content*, so the
  question is whether any of that content can reach stdout. It cannot: `Write-Output` emits `$openTxt`
  (the integer `$n`), `$LEDGER` (a string I construct from a literal plus `$LEDGERS.Count`), `$queue`,
  the two age strings, and `$pendTxt` (manifest **basenames**). No ledger row text is ever emitted.
  A hostile row in a lane shard therefore cannot inject instructions through this path — it can only
  perturb a count.
- **Wiring intact.** Project `.claude/settings.json` invokes the hook as a `SessionStart` command
  with `timeout: 15` and `-NoProfile -ExecutionPolicy Bypass`; unchanged by this edit.
- **Cost of the widened read is negligible** — 381 rows across 12 files, well inside the 15 s timeout.

## Scoring

Start 100. − 5 (one Medium) − 1 (one Low) = **94 → Grade A**.

## Suggested next actions

1. Apply the Medium fix (separate absent from unreadable) — small, and it removes the only scored
   security-shaped item.
2. Apply or consciously accept the Low (glob tightening). Recommended as a follow-up unit rather
   than folded in here: widening scope mid-unit on an enforcement path is what the `Approved-by`
   rule exists to prevent, and D-041 authorizes the union change only.
3. **ISS-307 remains unfixed and unauthorized** — lines 47–49 still read the OLDEST line of an
   append-only file and substring-match `STALLED` inside that tick's prose, which is why
   `STALL UNDIAGNOSED: ADVANCED` is still printing at every session start. It needs its own
   DECISIONS entry with `Approved-by: Umesh`. Deliberately out of scope here.
4. Hooks take effect only in a **new** session; this audit rests on direct execution of the script,
   not on an injected banner.
