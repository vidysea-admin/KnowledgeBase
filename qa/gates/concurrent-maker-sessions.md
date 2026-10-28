# HUMAN_GATE — two maker loops are running in one working tree

**Opened:** 2026-09-08T06:05:00Z
**Blocks:** the next unit pull (this session cannot safely pick work without knowing which
session owns which files)
**Severity of what it already caused:** a mutation was left applied to production source.

## The question, in one line

Do you want **two** maker-checker loops running concurrently in `D:\KnowledgeBase`, or should
this session stand down and leave the tree to the other one?

## What was observed (not inferred)

During this tick's checker run, files this session never touched changed underneath it:

| File | State | Whose |
|---|---|---|
| `apps/web/src/pages/AskPage.tsx`, `apps/web/src/api/ask.ts` | new, untracked | other session (U3.1, the Ask page) |
| `apps/web/src/App.tsx`, `NavSidebar.tsx`, `icons.tsx`, `api/types.ts` | modified | other session |
| `.claude/CLAUDE.md` | modified — new "Backlog priority override" section | other session |
| `docs/DECISIONS.md` | +8/-0 — new **D-013**, `Approved-by: Umesh` | other session |
| **`apps/api/src/search-store.ts`** | **modified — `score: hit.score` → `score: 0.5`** | **unattributed** |

## Why this is a gate and not a note

The last row is the ISS-083 mutation sitting in **production source**. The checker for
`search-store-rank-assertion` had already verified its own restore of that exact mutation as
SHA256-identical with an empty `git status` on the file — and the mutation was present again
afterwards. Two loops mutation-testing the same file in the same tree is the only mechanism that
explains a restore verifying and then not holding.

It was caught and restored (`git checkout`), tests are 109/109, and
`git log --all -S 'score: 0.5' -- apps/api/src/search-store.ts` is **empty** — no commit ever
captured it, nothing shipped. This gate exists because it was caught by luck of timing, not by a
control, and the same race can put a mutation in a commit.

This is the third mutation-concurrency incident this session; the first two were a sweep *reading*
a mid-mutation tree (recoverable, a false finding). This one is a mutation *surviving its own
restore verification*, which is a different and worse class.

## Options

1. **Stand this session down** — the other loop owns the tree; this one stops after the current
   close-out. Simplest, no coordination cost.
2. **Split by path** — this session takes `apps/api` + `packages/*`, the other takes `apps/web`.
   Requires that neither mutation-tests a file outside its lane; the incident above crossed lanes.
3. **Serialize** — pause one (`/maker pause`) until the other reaches a terminal state.
4. **Keep both and accept the risk** — add a close-out assertion (`git diff <mutated-file>` must
   be empty) as the control. Already logged as a PATTERN in `qa/feedback-inbox.md`; it narrows the
   window but does not close it, because two loops can still interleave inside one unit.

## Also needs your confirmation, separately

**D-013 claims `Approved-by: Umesh`.** Its shape is correct and this session did not revert it.
But no approval for it was received in *this* session, and an `Approved-by` line is the one thing
in this repo's protocol that may only be written after explicit human confirmation. Please confirm
you actually approved D-013 and the `.claude/CLAUDE.md` backlog-priority override. If you did not,
it needs a superseding entry — not a silent edit, since `docs/DECISIONS.md` is append-only.

**Answered: 2026-09-08 — Option 4 (keep both loops), coordinating through commits — Umesh, in
session ("dono code push by commits kregne").**

Recorded late, and that lateness is itself the finding: the answer was given in chat hours ago and
this file was not updated, which is precisely the D-006 pattern this gate mechanism exists to stop
(a gate answered in conversation but not on disk keeps being re-raised). Written down now.

**What the ruling means in practice**, as implemented since:

- Both sessions run. Neither stands down.
- **Commits are the coordination channel.** A dirty file belongs to whoever is mid-unit on it; you
  do not edit, mutate, or commit another session's dirty file. Commit at the end of every unit with
  a narrow pathspec, never `git add -A`.
- **The mutation hazard is now closed by construction, not by care.** `scripts/lib/mutate.mjs`
  refuses to arm any file that is not byte-identical to HEAD, so a file the other session is
  mid-edit on reads `modified` and cannot be mutated or `git checkout`-ed away. That is the same
  precondition that makes restore authoritative — one check, both guarantees. Shipped and
  checker-PASSed as `loop-safety-mutation-guard`; `.claude/hooks/mc-precommit.ps1` denies a commit
  while a mutation is armed.
- Option 2 (split by path) is effectively in force as a convention — this session works
  `qa/`, `scripts/`, `.claude/`, `.goal/`; the other works `apps/web` — but it is **not** the
  safety mechanism. The `apply` precondition is.

**Evidence the ruling works:** the other session landed D-013, the golden-set gate answer, and the
U3.1 Ask page cleanly while this session shipped the mutation guard and the tracker reconciliation.
Zero collisions after the guard landed. The one collision that did occur (a mutation left on
production source) predates it and is what motivated it.

**This gate is CLOSED.**

**Gate status:** CLOSED — the file states This gate is CLOSED in its own closing line
