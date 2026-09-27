# DISPOSITION gate — `.codex/hooks/`: sanction with parity, or remove?

**Opened:** 2026-09-28 by the maker after the sweep filed ISS-355 (high). **Owner:** Umesh (Approver).
**Blocks:** ISS-355, currently ranked #2 in `qa/QUEUE.md`. Also resolves the long-open disposition
question in ISS-268, which ISS-355 escalates.

## What was found

`.codex/hooks/` is a mirror of this repo's `.claude/hooks/*.ps1`. Sweep shard 3 established, and the
consolidation checker independently confirmed at HEAD:

- The directory was **committed for the first time** on 2026-09-27 at commit `eff401b`, with **no
  authorizing DECISIONS entry**. Under this repo's Update Authorization rule, enforcement-path files
  require an entry carrying `Approved-by:`; these arrived with neither.
- It was **born already stale**, not drifted. `.codex/hooks/mc-sessionstart.ps1` and `mc-precommit.ps1`
  each reintroduce **three defects that had already been separately found and fixed** in the `.claude`
  originals:
  1. Reading only `qa/issues.jsonl` instead of the union over `qa/issues.jsonl` + `qa/issues.*.jsonl` —
     the exact 132-vs-153 open-issue undercount that **D-041 was written the same day to close**.
  2. The pre-D-034 naive `'Status: ready-for-check'` substring match instead of the bold / heading /
     bullet-tolerant regex.
  3. Taking the **first** `Cycle checked` match rather than the maximum across a multi-cycle verdict file
     — reintroducing the ISS-350 reproduction-3 trap, in which a reader of a newest-first verdict file
     gets the oldest verdict.
- Byte-identical to their originals: `decisions-append-guard.ps1`, `lab-session-start.ps1`,
  `lab-session-end.ps1`.
- **Correction the consolidation checker made to the shard's claim:**
  `features-snapshot-session-end.ps1` differs **only by CRLF vs LF** (`diff --strip-trailing-cr` is empty).
  It is not a content regression and is not part of the finding.
- **Not established:** whether anything currently invokes `.codex/hooks/*` — i.e. whether Codex CLI
  sessions actually run against this repo. Nobody has verified this, and the answer changes the severity
  from "latent wrong code on disk" to "an enforcement surface silently reporting wrong numbers right now".

## Why this is the interesting finding of the sweep

Every other finding this tick was a record that had drifted out of date. This one is different: it is a
**second copy of the enforcement logic**, created after all three defects were found and fixed, that
carries the pre-fix versions of all three. A duplicated guard is worse than no guard, because it looks
like coverage. The repo's whole governance argument rests on a reader being able to compute the true state
from the files; a mirror that computes a different, stale answer breaks that at the root.

It is also the third instance this session of the same underlying pattern — a **static copy of something
that should have been derived** (the stale gate-status fields, the three incompatible manifest `Status`
forms, and now a forked hook). That pattern is worth naming, not just fixing case by case.

## What is being asked

**(a) Remove the mirror.** Delete `.codex/hooks/`. Correct if nothing invokes it, and it is the only
option that cannot drift again. Cost: if Codex CLI sessions are in fact being used against this repo, they
lose their hooks and run ungoverned — which must be checked before choosing this.

**(b) Sanction it with enforced parity.** Keep it, write the authorizing DECISIONS entry it never had, and
add a structure-lint check that **fails when any `.codex/hooks/*.ps1` diverges from its `.claude` original**
(modulo line endings, per the correction above). Costs a lint rule; buys the ability to run Codex sessions
under the same guards. Note this makes the duplication permanent and the lint rule becomes load-bearing.

**(c) Replace the copies with links.** A junction or symlink per file, so there is one implementation and
divergence is impossible by construction rather than by a lint. Cheapest to maintain; depends on whether
Codex follows links on Windows, which is unverified.

**Before answering, the maker recommends one measurement**, which it has not taken: whether anything
actually reads `.codex/hooks/`. That is a five-minute check and it decides between (a) and (b)/(c) on
evidence instead of preference. Say the word and it will be taken first.

## Answer format

`iss-355: <a|b|c>` — optionally preceded by `measure-first` to have the invocation check run before the
decision.

**Answered:** (pending)

**Gate status:** OPEN — awaiting the Approver. Also carries the ISS-268 disposition question, which has
been open since that row was filed and is now more urgent

## MEASUREMENT TAKEN — 2026-09-28, before asking. It changes the answer.

The maker said above that it had not checked whether anything invokes `.codex/hooks/`, and that the
check would decide between the options on evidence. The check has now been run, and the answer is
**yes, the mirror is live-configured and the Codex CLI is installed on this machine.**

- **`.codex/hooks.json` exists** (committed in the same commit `eff401b`, previously unnoticed because
  the earlier scan looked only at `.codex/hooks/`) and it wires **all six** scripts by absolute path:
  `PreToolUse` on `Bash|PowerShell` → `mc-precommit.ps1`; `SessionStart` → `lab-session-start.ps1` and
  `mc-sessionstart.ps1`; `SessionEnd` → `lab-session-end.ps1` and
  `features-snapshot-session-end.ps1`.
- **The Codex CLI is installed:** `C:/Users/Lenovo/AppData/Local/Programs/OpenAI/Codex/bin/codex`.

So this is not dormant code on disk. **Any Codex session opened in this repo runs a SessionStart hook
that reports the undercounted open-issue figure and matches manifest status with the pre-D-034 naive
substring** — the two defects D-041 and D-034 were written to close. ISS-355 is therefore **live wrong,
not latent**, which is a stronger claim than the row was filed with.

**This removes option (a) as a free choice.** Deleting `.codex/hooks/` without also removing the
`hooks.json` wiring would leave a config pointing at absent files; deleting both would leave Codex
sessions in this Lab Protocol repo running with **no governance hooks at all** — no session-start
directive, no pre-commit guard, no decisions-append guard. That is a worse state than a stale mirror,
because the stale mirror at least still blocks the things `mc-precommit.ps1` blocks.

**The maker's recommendation, now that it has the evidence: option (c), replace the copies with links.**
There is then one implementation per hook and divergence is impossible by construction rather than
policed by a lint that someone must keep passing. The single unverified assumption is whether the Codex
CLI resolves Windows symlinks or junctions when PowerShell is invoked with `-File` against them — it
almost certainly does, since PowerShell itself follows them, but that should be proven with one hook
before all six are converted. If it turns out not to, **(b)** is the fallback: keep the copies, write the
authorizing entry the mirror never had, and add a structure-lint rule that fails on any divergence
modulo line endings.

Either way, two things are true regardless of which option is chosen and should be done as part of it:
the mirror still has **no authorizing DECISIONS entry** despite being an enforcement path, and the three
reintroduced defects are live in a configured hook **right now**.

**Note on provenance:** `eff401b` is a maker tick commit — *"tick: maker 2026-09-27 17:5x - tier 2,
ISS-337 built, checker dispatched"*. So the mirror was created by a maker loop as an incidental part of
a tick about something else, with no manifest, no verdict and no authorizing entry for the
enforcement-path files it added. That is the same class as the unauthorized `delivery-gate-stop.ps1`
edits recorded in `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md`, and it is the second
instance of a loop quietly widening its own enforcement surface.
