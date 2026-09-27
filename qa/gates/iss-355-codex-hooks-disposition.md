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
