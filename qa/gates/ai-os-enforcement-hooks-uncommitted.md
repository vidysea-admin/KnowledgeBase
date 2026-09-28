# HUMAN GATE — three machine-wide enforcement hooks are live, uncommitted, and being edited by concurrent lanes

**Opened:** 2026-09-28 by the maker. **Owner:** Umesh (Approver).
**Blocks:** nothing from building. It blocks any honest claim that a verdict on these files stays true.
**Related:** ISS-372 (critical), ISS-190, D-049, `qa/verdicts/delivery-gate-machine-wide-fix.md`.

## What was measured, not inferred

`D:/ai_os` is a separate git repo whose `.claude/hooks/` fire in **every project on this machine**,
including this one. Right now it carries **56 dirty files**, among them:

| File | State |
|---|---|
| `.claude/hooks/delivery-gate-stop.ps1` | modified, uncommitted — the Stop hook |
| `.claude/hooks/aios-write-guard.ps1` | modified, uncommitted — the guard that makes `docs/DECISIONS.md` append-only |
| `.claude/hooks/edit-in-place-guard.ps1` | modified, uncommitted — the anti-drift guard |
| `.claude/rules/lifecycle.md` | modified, uncommitted — the routing table loaded in every directory |
| `.claude/skills/maker/SKILL.md`, `.claude/skills/checker/SKILL.md` | modified, uncommitted |

Last commit touching the Stop hook: `87042de`. Everything since exists only in one working tree.

**And it is moving while we work.** `delivery-gate-stop.ps1` changed **five times today**, each by a
different lane, every state uncommitted:

```
28c1ae44  ~741 lines   <- the state qa/verdicts/delivery-gate-machine-wide-fix.md PASSED
2d14024c   802 lines   <- observed mid-check by the iss-346 checker
6f2e7a16   810 lines
fc328d06   816 lines
5d6e0994   823 lines   <- current
```

## Why this is a gate and not just an issue

1. **A PASS already stopped being true.** `delivery-gate-machine-wide-fix` PASSed cycle 0 today and its
   checker said, in the verdict, that it "certifies a byte-state that nothing pins." Within the hour the
   file was a different file. The verdict is now a statement about something that does not exist.
2. **The repo rule for enforcement paths is being satisfied on paper only.** This project requires an
   authorizing DECISIONS entry with `**Approved-by:** Umesh` before an enforcement path changes. D-049
   gave that for one change. The four changes after it have no verdict and no entry, and the guard that
   enforces *append-only DECISIONS* is itself one of the uncommitted files.
3. **It is unreviewable by construction.** With no commit, there is no baseline to diff against, so no
   checker can state what changed, and `git -C D:/ai_os diff` mixes five lanes' work into one blob.
4. **Rollback is not available.** If one of these edits breaks a hook, the recovery path is
   reconstruction from memory, not `git revert`.

This is the ISS-190 condition, realized, on Approver-authorized work rather than on work-in-progress —
which is why the delivery-gate checker recommended ISS-190 rise **high -> critical**.

## What the maker has NOT done, and will not do without an answer

Committed anything in `D:/ai_os`. D-049 authorized **editing** that file, not making an enforcement-path
commit in another repo, and a blanket `git -C D:/ai_os commit -a` would capture five lanes' unrelated
work — including skills, rules and two other guards — under one message, which is the opposite of an
audit trail. Every agent this session was told not to touch it, and none did.

## The options

**(a) Commit the three enforcement hooks only, as one reviewed change, and leave the other 53 files.**
A `/checker` pass over `git -C D:/ai_os diff .claude/hooks/` first, then one commit with a DECISIONS
entry carrying `Approved-by`. Restores a baseline and makes every later verdict meaningful. Cost: the
diff is five lanes' combined work, so the review has to attribute it before it can approve it, and some
of it may be work you have not seen. **This is the maker's recommendation** — the review is the point,
not an obstacle to it.

**(b) Commit everything dirty in `D:/ai_os` in one sweep.** Fastest, restores a baseline immediately.
But it ratifies 56 files of unreviewed change across hooks, rules, skills and generated artifacts in a
single act, and that includes the guard enforcing append-only decisions. Not recommended.

**(c) Freeze: no further edits to `D:/ai_os/.claude/` by any lane until (a) happens.** Stops the drift
getting worse but fixes nothing on its own, and cannot be enforced mechanically from this repo.

**(d) Accept it as a standing exception and stop claiming verdicts on those files.** Honest, and cheap,
and it means the machine-wide Stop hook is permanently unreviewed. It would also require withdrawing the
PASS on `delivery-gate-machine-wide-fix` rather than carrying it with a caveat.

## Added 2026-09-28 — three verified fixes are now parked behind this gate

Whoever answers this gate is also deciding when these land. All three are verified against the live
file at sha `5d6e0994` / 823 lines, and **none is applied**:

| Fix | Source | State |
|---|---|---|
| comma-separated line ranges (`:12,40-44`) in the round-cap seam | `qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff` | applies clean at `--fuzz=0`; PASSed cycle 1 (verdict `2776aac`) |
| paren-scope pin for `Cycle checked` (ISS-230) | `qa/evidence/delivery-gate-stamp-adoption/delivery-gate-stop.paren-scope-fix.diff` | applies clean at `--fuzz=0`; PASSed cycle 2 (verdict `3d3c71d`) |
| **line-start anchoring for BOTH `Cycle checked` alternatives (ISS-STAMPADOPT-001)** | not yet written — fix direction only | see below |

**ISS-STAMPADOPT-001 is why the third row matters.** The stamp-adoption checker constructed a verdict
whose *prose merely quotes* the real corpus form — `"...wrote Status: FAIL (Cycle checked: 9) here
before it was corrected"` — and the gate misreads it as `pend=0 unclosed=1` **on the live hook and on
the patched candidate alike**. The ISS-230 pin narrows the match surface without anchoring it to
line-start, so quoting the shape still defeats the real field.

This is the **fourth** recurrence of one defect family: ISS-307 (a substring match found `STALLED`
inside a tick's prose), `iss-346`'s H3 hunk (an unrestricted regex returned the stray prose token
`RULE`), ISS-230, and now this. Every instance is the same root shape — **an unanchored pattern
scanning a whole file for a bare label** — and every instance made an enforcement gate fail **silently**,
in the permissive direction.

Under D-014's class-based cap this seam is at 2 non-security PASSes and is closed to further units, so
per `.claude/CLAUDE.md` the finding is filed rather than turned into round 3. That rule's own escape
hatch says a seam that still looks unsafe past the cap raises a HUMAN_GATE instead — which is this
gate. So: **anchor both alternatives to line-start when the hunks land, and re-verify
`transcription-empty-result-guard.md` still reads correctly under the stricter anchor** (it is the sole
real occurrence across all 175 verdict files, so it is the whole reason the alternative exists).

None of this changes the options below. It raises the cost of (c) and (d): every additional day the
gate stays open is a day two verified fixes sit unapplied while the hook they fix keeps firing.

## Answer format

`aios-hooks: <a|b|c|d>`

**Answered:** _(pending)_

**Gate status:** OPEN — awaiting the Approver. Work continues on everything else; the loop is not blocked
by this. What is blocked is any claim that a verdict on those files describes a durable artifact
