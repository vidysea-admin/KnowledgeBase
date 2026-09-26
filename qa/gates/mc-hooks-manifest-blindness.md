# HUMAN_GATE — the session-start and pre-commit hooks are blind to bolded manifests

**Opened:** 2026-09-09
**Blocks:** the second half of ISS-183. The `delivery-gate-stop.ps1` half is fixed and pinned; the
two hooks below are **Lab enforcement paths** and are not the maker's to touch.

## The question, in one line

May `.claude/hooks/mc-sessionstart.ps1` and `.claude/hooks/mc-precommit.ps1` be changed to match a
**bolded** manifest status (`**Status:** ready-for-check`) and to take the **highest** recorded
cycle rather than the first?

## Why it needs you

Project CLAUDE.md: *"Enforcement paths (`.claude/hooks/*`, `scripts/append_decision.ps1`,
`.claude/settings.json`): Changes-authorized alone is NOT enough — the authorizing entry MUST carry
`**Approved-by:** Umesh`, recorded only after explicit confirmation."*

## What is wrong today, measured

| file | line | pattern | effect |
|---|---|---|---|
| `mc-sessionstart.ps1` | 15 | `'Status: ready-for-check'` | cannot match `**Status:** ready-for-check` — the `**` sits between the colon and the space |
| `mc-sessionstart.ps1` | 19 | `… \| Select-Object -First 1` | a verdict accumulates one section per cycle, so it reads cycle 1 forever |
| `mc-precommit.ps1` | 43 | `'Status: ready-for-check'` | same blindness, in the commit guard |

`mc-sessionstart.ps1:17` (`Fix cycle[:*\s]+`) is **fine** — `[:*\s]+` already tolerates the bolding.
Only the two patterns above are affected. Checked, not assumed.

**Live effect this session.** The SessionStart directive reported:

```
Checks pending: 1 [hybrid-arms-binding]
```

The manifests actually at `ready-for-check` were **`delivery-gate-manifest-blindness`** and
**`speaker-verbatim-token-boundary`**. It named a unit that was not pending and missed both that
were. The directive a session reads *first*, and acts on before anything else, was wrong in both
directions.

## Why this matters more than a miscount

`mc-precommit.ps1` is the commit guard. A guard that cannot see a pending handshake cannot refuse a
commit that leaves one dangling — which is the failure the maker-checker handshake exists to
prevent.

## The change, exactly

In both files, replace the bare literal with a pattern that tolerates markdown emphasis and a
leading list/heading marker, and in `mc-sessionstart.ps1:19` take the **maximum** matched cycle
instead of the first. **Nothing else** — no change to what either hook prints, when it fires, or
what it blocks. This is the same one-line class already fixed and mutation-pinned in
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`, which is *not* a Lab enforcement path and so
needed no gate.

## Options

- **A — approve** (recommended): a DECISIONS entry with `**Approved-by:** Umesh` and
  `Changes-authorized: .claude/hooks/mc-sessionstart.ps1 (status/cycle pattern only) ·
  .claude/hooks/mc-precommit.ps1 (status pattern only)`.
- **B — decline**: the hooks stay blind to the bolded form. Then the honest follow-on is to
  standardise every manifest on the unbolded `## Status:` form instead, because leaving two
  in-tree conventions with one visible to the guards is how this defect survived.

## Answer format

Say A or B here. On A the maker prepares the entry and you run
`powershell -File scripts/append_decision.ps1 -EntryFile <entry.md>`, since only you can supply
`Approved-by`.

**Links:** ISS-176, ISS-183; `qa/manifests/delivery-gate-manifest-blindness.md`;
`qa/contracts/delivery-gate.md` [C7]

Answered: 2026-09-26T23:54:34+05:30 — APPROVED (fix the hooks; the authorizing DECISIONS entry must carry **Approved-by:** Umesh, citing this line; run /aios-config-auditor before commit) — Umesh via AskUserQuestion in checker session knowledgebase-7a (multi-select, all four ticked), following his chat message "go on i approve". Scribed by /checker (check 6).
