# SCOPE gate — D-043 items 1 and 2 touch a MACHINE-WIDE hook, not this repo's

**Opened:** 2026-09-28 by the maker, immediately on discovering the error. **Owner:** Umesh (Approver).
**Blocks:** D-043 item 1 (the delivery-gate `Fix cycle` predicate + the ISS-205 stripper clause, owed as
`delivery-gate-stamp-adoption` fix cycle 2) and D-043 item 2 (ISS-346, the round-cap mechanical check).
**Does NOT block:** D-043 item 3, which is genuinely repo-local and is being built now as
`handshake-field-reader`.

## The error, stated plainly

When the maker asked Umesh to authorize D-043, it presented the question as *"three fixes are held
because they edit `delivery-gate-stop.ps1` / `mc-sessionstart.ps1` — enforcement paths that **this repo**
requires you to authorize by name."* That framing is wrong about one of the two files, and the maker
wrote it.

Measured after the fact:

- `.claude/hooks/mc-sessionstart.ps1` **is** repo-local — it lives inside `D:\KnowledgeBase`, and a
  decision of this repo can authorize it. Item 3 is properly authorized.
- `delivery-gate-stop.ps1` **does not exist in this repo at all.** It lives at
  `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` (47,209 bytes) and is registered in the **user-level**
  `C:\Users\Lenovo\.claude\settings.json:124`, so it fires as a Stop hook in **every project on this
  machine** — `d:/erp`, `d:/vc`, `d:/autoTesting`, `d:/vidysea/*`, and every scratch directory.

D-043 is a decision of `D:\KnowledgeBase`, appended to this repo's `docs/DECISIONS.md` under this repo's
Approver rule. **It cannot authorize a change to a shared, machine-wide enforcement path**, because the
blast radius extends to projects that never saw the decision, whose maker loops depend on that hook's
current behaviour, and whose own Lab Protocol records would contain no trace of why it changed.

Item 2 is likely in the same position for a second reason: the unit-selection logic that ISS-346 wants a
mechanical cap check in is the shared maker skill (`~/.claude/skills/maker/`, a junction to
`D:/ai_os/.claude/skills/`), which is also machine-wide. That needs confirming as part of answering this
gate — the maker has not verified where the check would have to live.

## Why this was not caught by the existing rule

The repo's Update Authorization rule names enforcement paths by **filename pattern** —
`.claude/hooks/*` — not by resolved location. `delivery-gate-stop.ps1` matches that pattern in prose
while living outside the repo, so the rule read as satisfied by an `Approved-by` line that has no
authority over the file. The rule has no notion of scope: it cannot distinguish a hook this repo owns
from a hook this repo merely runs. That is a defect in the rule, not only in this instance, and it should
be filed regardless of how the gate below is answered.

## What is being asked

**Question 1 — authorize the machine-wide change, or keep it repo-local?**

- **(a) Authorize machine-wide.** Umesh approves changing `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`
  for all projects, with the decision recorded in the **shared** log (`D:/ai_os/decisions/log.md`) as well
  as here, so the other projects have a record. Correct if the defects are genuinely generic — and the
  `Fix cycle` predicate bug and the ISS-205 stripper clause do look generic, since every maker-checker
  project has manifests with fix cycles.
- **(b) Keep it repo-local.** Do not touch the shared hook. Instead put the corrected predicate in a
  KnowledgeBase-local hook or test that this repo registers for itself. Safe, and it leaves the same bug
  live in every other project — including `d:/erp`, where a maker loop is running.
- **(c) Neither yet.** Leave items 1 and 2 held, and file the shared-hook defects for a separate,
  properly-scoped decision in the AIOS repo where that file lives.

**Question 2 — does the retro-ratification in D-043 also need rescoping?** D-043 retroactively ratified
commits `4a71633` and `e5402d6` as authorized changes to `delivery-gate-stop.ps1`. If that file is
machine-wide, those commits changed machine-wide behaviour, and a KnowledgeBase entry ratifying them has
the same scope problem as authorizing a new change. The gate this replaced
(`enforcement-hooks-unauthorized-and-live-regressed.md`) is stamped ANSWERED on the strength of D-043, so
if the answer here is that the ratification does not hold, that stamp must be corrected rather than left
standing.

## Answer format

`d043-scope: 1=<a|b|c> 2=<ratification-holds|rescope-needed>`

**Answered:** `d043-scope: 1=a 2=ratification-holds` -- Umesh, AskUserQuestion, 2026-09-28. The
machine-wide `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` change is authorized, with the decision
recorded in the shared `D:/ai_os/decisions/log.md` as well as this repo's log so the other projects have a
trace; and the retro-ratification of `4a71633` / `e5402d6` stands now that it is correctly scoped, so the
ANSWERED stamp on `enforcement-hooks-unauthorized-and-live-regressed.md` needs no correction. Authorized by
**D-049**. The scope-blindness in the rule itself -- enforcement paths named by filename pattern rather
than resolved location -- is filed for its own fix regardless.
**Gate status:** ANSWERED 2026-09-28 (D-049). Unblocks delivery-gate-stamp-adoption fix cycle 2 and the
ISS-346 cap check, which D-044 requires before wave/vector-gap-durability gets a manifest
maker opened this gate against its own earlier question rather than proceeding on an authorization it had
obtained by mis-describing the file
