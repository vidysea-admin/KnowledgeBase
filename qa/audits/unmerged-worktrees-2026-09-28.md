# Audit — 5 unmerged worktree branches (D-055 ruling 3)

**Read-only audit. No merge, rebase, unpause, delete, or ledger/manifest/contract edit was performed.**
Authority: `docs/DECISIONS.md` D-055 ruling 3 (Approved-by: Umesh). Context: `qa/gates/unmerged-worktree-inventory.md`.
Master reference commit for this audit: `955f16a` (D-055 batch commit, current HEAD).

**IMPORTANT — environment note discovered during this audit, not caused by it:** the main checkout
is currently mid-merge. `.git/MERGE_HEAD` = `126311c` (the tip of
`worktree-agent-a779f0b3b445697af`), and `apps/api/src/production.ts` is `UU` (unresolved). This is
**a different loop's in-progress work, not this audit's**. All "does master already have this"
checks below were done exclusively via `git show master:<path>` / `git log master` / `git
diff master...<branch>` — **never** by reading files on disk in the working tree, which right now
reflect an unfinished merge rather than master. No `git merge --abort/--continue`, `reset`,
`checkout`, or `add` was run.

**Commit status:** this report is written but **not committed** — committing now would attempt a
partial commit during another loop's unresolved merge and fail (and risk touching unrelated staged
state). A backup copy is saved to the scratchpad at
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--KnowledgeBase\21132795-be68-45be-b8b9-2c0bac822a56\scratchpad\unmerged-worktrees-2026-09-28.md`.
Once the other loop's merge clears, run:

```
git commit -F <msgfile> -- qa/audits/unmerged-worktrees-2026-09-28.md
```

where `<msgfile>` contains e.g. `audit: unmerged-worktree-inventory read-only report (D-055 ruling 3)`.

---

## Summary table

| Branch | Commits ahead | Files touched (non-qa highlights) | Enforcement path? | Manifest/verdict state | Master already has equivalent? | Recommendation |
|---|---|---|---|---|---|---|
| `wave/u2-4-phase3-fix` | 13 | `packages/index/src/pipeline/{speaker-name-rules,speakers-llm}.ts`+tests, `qa/contracts/speaker-resolution-llm.md` | **Yes** — `qa/contracts/speaker-resolution-llm.md` (checker's own "C14" amendment, not in master, no DECISIONS entry found) | Manifest `Fix cycle: 1`; verdict `VERDICT: FAIL` (cycle 1) — checker ruled the live-run protocol was only ever executed pre-fix | Partially — master already independently holds the cycle-0 FAIL record, the pause marker, and ISS-282/283/284 (open). The cycle-1 **code fix itself is unique**, unmerged, and unverified | **NEEDS-HUMAN-DECISION** — paused (D-038), gated behind critical open ISS-282, code conflicts with master, contract amendment orphaned |
| `worktree-agent-a3d4ea73632cda74e` | 4 | `qa/tests/mc-hooks-round-cap.ps1` (new standing test), `qa/evidence/.../delivery-gate-stop.roundcap-fixes.diff` (evidence only — no `.claude/hooks/*` file is touched by the branch itself) | No (evidence artifact only; live hook untouched) | Manifest `Fix cycle: 1 of 3`, `Handshake status: ready-for-check`; verdict on file is **cycle 0** (`FAIL`) — cycle 1 has not yet been checked | Partially — the live global hook already has 2 of the 3 originally-proposed fixes (via a separate D-049 route); only the standing test and one small regex hunk are new/unique | **RESUME-THROUGH-PAIR** — cycle-1 fix responds directly to the cycle-0 FAIL; needs one more `/checker` pass, no human call needed |
| `worktree-agent-a779f0b3b445697af` | 2 | `apps/api/src/production.ts`, `routes/health.ts`, `routes/watched-sources.ts`, `apps/web/src/pages/WatchPage.tsx`, `watch-state.ts` | No | Manifest `Status: ready-for-check`; verdict `VERDICT: PASS`, `Cycle checked: 0` | **A merge of this exact branch is already in progress on master right now** (see note above) — not yet committed | **ALREADY-IN-MASTER** (merge in flight, unfinished) — do not re-derive this work; the existing merge should be finished or safely resumed by whoever owns it |
| `wave/vector-gap-durability` | 2 | `apps/api/src/indexing/{session,types,vector-gap}.ts`, `ingest-store.ts`, `whatsapp-store.ts` | No | Manifest `Fix cycle: 0`, no verdict file exists on the branch (never checked) | No — master's `vector-gap.ts` catch block is unchanged (still `console.warn`-only, no observable return) | **RESUME-THROUGH-PAIR** — Umesh already ruled the path forward as **D-044** (one-time round-cap waiver); only the two D-044 conditions (ISS-346 check landing first, then a fresh `/checker` PASS) remain outstanding |
| `lane/a-speakers` | 2 | `qa/manifests/{speaker-verbatim-token-boundary,u2-4-phase3-precision-regate}.md` + eval-corpus files | No | Both commits' content is bookkeeping/import, not new code | **Yes, both commits** — content confirmed equivalent-or-superseded on master by independent routes | **RETIRE-NO-LOSS** |

---

## `wave/u2-4-phase3-fix` — 13 commits

**What the commits do.** `c527207` imports the cycle-0 FAIL manifest/verdict/evidence for the
U2.4 phase-3 precision re-gate (imported "from feat/webinar-bot b1c9d01"). `6497719` through
`9098546`/`03e46dd`/`03aa212`/`8ad7258`/`11a1988`/`783a164` are a genuine iterative fix to
`speakers-llm.ts`'s `extractSpeakers` and `speaker-name-rules.ts`: binding an LLM-cited speaker
identity to a transcript turn only via a real self-identification/handover/greeting/thanks
relation (`namingTurns`), progressively closing false positives a fresh-context reviewer
("Block") found each round (quoted/reported speech, clause-opening vocatives, "thanks a
ton/again" variants). `b40327f`/`6256e94` are the cycle-1 manifest and its "ready-for-check"
submission. **`5479b1a` is the checker's cycle-1 FAIL**, read in full: it independently
re-verified 9/9 capability rows and 4 new falsifying edits, but ruled the manifest's claimed PASS
numbers are an **offline replay** of proposals, not a live re-run of the actual second-round fix
code — the named live 3-outer-run protocol (`qa/gates/speaker-segment-identity.md` step 3) has
only ever been executed against the *first*-round fix, and it failed cleanly there (0
accepted). It minted `ISS-U2-4-1` (high) for this gap. `9d97c8e` carries that FAILED live-run
evidence plus the offline replay/histogram/exhaustive-relation tooling. `5662426` (tip) marks a
subsequent cycle-2 live-eval attempt as **aborted**: the maker launched it without reading
`qa/.paused.u2-4-phase3-precision-regate` (resume condition: free RAM ≥ 8 GB), actual free RAM was
1.71 GB falling to 0.52 GB, and it was killed after 9/33 lines — this is explicitly a paused unit
being touched in violation of its own pause marker, later folded into D-038.

**Files changed / enforcement path.** `git diff master...wave/u2-4-phase3-fix --stat` shows 54
files, 19,006 insertions. The one enforcement-path hit: **`qa/contracts/speaker-resolution-llm.md`
gains 32 lines** — commit `5479b1a`'s body states this is "recorded as routine amendment C14."
Read directly: **master's copy of this contract has no C14** (its amendment log stops at the
C2a/C2b tightening from 2026-09-08), and `grep -n "C14" docs/DECISIONS.md` returns **nothing**. So
a checker-authored contract amendment exists only on this branch, invisible to master's canonical
contract, with no DECISIONS entry citing it. Under the project's normal maker-checker rule this is
within the checker's own remit (it owns `qa/contracts/`, routine amendments are logged in-file, not
necessarily gated by a DECISIONS entry the way the Lab-Protocol root `contracts/` is) — flagging it
per the audit brief's literal instruction, not asserting it is out of process.

**Checked?** Manifest `Fix cycle: 1`. Verdict on the branch is `VERDICT: FAIL` (twice, at lines 210
and 338 of the verdict file — the file is append-downward, both cite cycle 1, the later one is the
operative/final ruling for this cycle). No cycle-2 verdict exists (cycle 2 was aborted mid-run, per
`5662426`, and never resubmitted).

**Does master already have equivalent work?** Partially, and precisely: master **already
independently holds** the cycle-0 FAIL manifest (`qa/manifests/u2-4-phase3-precision-regate.md`,
hash `fd3662f…`, different from both branches' copies but same substantive cycle-0 content),
its verdict, the full evidence corpus under `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/`,
the pause marker `qa/.paused.u2-4-phase3-precision-regate`, and open ledger rows **ISS-282
(critical)**, **ISS-283 (high)**, **ISS-284 (medium)** — all still `status: open` on master. What
master does **not** have is the cycle-1 code fix itself (`speaker-name-rules.ts` /
`speakers-llm.ts`'s `namingTurns`/`OPENS_VOCATIVE`/`reported()` machinery — confirmed absent from
master by direct grep) — that part is unique to this branch and unmerged.

**Does it still apply?** No — `git merge-tree master wave/u2-4-phase3-fix` reports **CONFLICT
(content)** in both `packages/index/src/pipeline/speaker-name-rules.ts` and
`speaker-name-rules.test.ts` (master has moved under this branch, most likely via the sibling
`wave/iss-104-speaker-closedclass` work on the same files for a different issue, ISS-104), plus
add/add conflicts on the qa manifest/verdict files master independently created. It would **not**
merge or rebase cleanly today. (Determined via `git merge-tree`, no working-tree or index changes.)

**Recommendation: NEEDS-HUMAN-DECISION.** Evidence: this is the branch D-055 explicitly named as
in scope while paused — "a pause records stop working on it, not discard 13 commits." The code fix
is real, iteratively reviewed, and responds directly to a critical open issue (ISS-282), but it
last FAILed at the checker's hands for a live-verification gap (ISS-U2-4-1), is still blocked by
its own RAM pause (D-038) and by ISS-104 (per its own pause-marker text, "Blocks: ISS-104 (same
speakers-llm files)"), and no longer applies cleanly against master. Resuming it is real, gated
work (fresh live run, checker cycle 2, contract-amendment reconciliation), not a rubber stamp —
exactly the shape D-055 reserved for the Approver.

---

## `worktree-agent-a3d4ea73632cda74e` — 4 commits (ISS-346 round-cap mechanical check)

**What the commits do.** `a07a977`: a standing PowerShell test (`qa/tests/mc-hooks-round-cap.ps1`)
for D-014's round-cap logic in the live global hook `delivery-gate-stop.ps1`, plus 3 measured
defects filed as ISS-346. `26bd6a2`: folds in a `senior-software-engineer` review (3 findings, all
applied). `ca3ab75`: **checker cycle-0 FAIL**, read in full — the standing test itself
("(1) is sound... I reproduced every headline claim independently") was verified correct, but the
proposed 3-hunk hook patch's **H3 does not apply to the live hook and is regex-unsound** against a
real verdict file (`vector-cosine-retriever.md`), filed as `ISS-ISS346-001` (high, in the lane
shard `qa/issues.iss346.jsonl`). `3d68219` (tip, cycle 1) responds: drops H3 entirely (noting the
live hook's `Test-VerdictPass`/`VERDICT_VOCAB` mechanism already solves the same problem better),
fixes a related standing-test defect (assertion 4b), adds 2 more assertions, and repackages the
fix to a **single remaining hunk** — the comma-separated line-range regex fix
(`` `:\d+(?:-\d+)?` `` → `` `:[\d,\-]+` ``).

**Files changed / enforcement path.** Only `qa/tests/`, `qa/manifests/`, `qa/verdicts/`, and
`qa/evidence/.../delivery-gate-stop.roundcap-fixes.diff` (an evidence artifact — a unified diff
*about* the hook, stored under `qa/`, not an edit to `.claude/hooks/*` itself). Confirmed by
`git diff master...worktree-agent-a3d4ea73632cda74e --name-only`: no path under `.claude/`,
`docs/DECISIONS.md`, `CLAUDE.md`, `qa/contracts/`, or `scripts/append_decision.ps1` is touched.
**Not an enforcement-path change by this branch** — it is evidence *for* Umesh to apply, which
matches the manifest's own framing (the live hook lives outside this repo, at
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`).

**Checked?** Manifest: `**Fix cycle:** 1 of max 3`, `**Handshake status:** ready-for-check`.
Verdict file present but is the **cycle-0** verdict: `**Cycle checked:** 0`, `**VERDICT: FAIL**`.
Cycle 1 (the tip commit, which answers that FAIL) has **not yet been checked** — no cycle-1
verdict exists on the branch.

**Does master already have equivalent work?** Partially. Reading the live global hook directly
(`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`): it already has `VERDICT_VOCAB` and
`Test-VerdictPass` (the mechanism the cycle-1 commit says already supersedes H3) and the
comma-suppression `return ,$set` fix (H1, referenced in the diff's own comments as already-landed
"via a concurrent lane," i.e. D-049). What the live hook does **not** yet have is the one remaining
regex hunk (comma-range citations) and — more importantly — `qa/tests/mc-hooks-round-cap.ps1`
itself does not exist anywhere in master, so the standing regression test is genuinely new and
unique to this branch. `ISS-346` (high, open) and `ISS-ISS346-001` are not present in the ledger
union on master — this branch's ledger contribution (the lane shard `qa/issues.iss346.jsonl`) has
not landed either.

**Does it still apply?** Yes — `git merge-tree master worktree-agent-a3d4ea73632cda74e` returns a
clean merge tree with **no conflict lines**.

**Recommendation: RESUME-THROUGH-PAIR.** This is a normal in-flight maker-checker cycle: cycle 0
FAILed with a specific, narrow defect (H3); cycle 1 responds to exactly that defect and is sitting
at `ready-for-check`. It needs one more `/checker` dispatch, not an Approver decision. (Its
outcome does gate `wave/vector-gap-durability` per D-044's own conditions — see below.)

---

## `worktree-agent-a779f0b3b445697af` — 2 commits (u4d — watch page state visibility)

**What the commits do.** `6a28088`: `/watch` now reads `watch_state` and `watch_heartbeat`
(D-047/D-048) instead of only `watched_sources`, closing the gap `ISS-358` (high, open on master)
described — R1's failure alerts fire off `watch_state` but the linked `/watch` page previously had
no code path to show it. `2518795`: manifest update recording a post-commit confirmation that a
dirty-tree test failure cleared. `126311c`: **checker PASS, cycle 0**, read in full — it
deliberately attacked tenancy (confirmed the ISS-078 cross-tenant shape cannot exist here "by
construction," since the tenant id's only entry point is `req.auth!.tenantId`), confirmed the test
double genuinely branches on `tenantId`, and ran a real-browser Playwright walk the manifest had
disclosed as missing rather than taking sufficiency on faith.

**Files changed / enforcement path.** `apps/api/src/production.ts`, `routes/health.ts`,
`routes/watched-sources.{ts,test.ts}`, `apps/web/src/api/watch-state.ts` (new),
`apps/web/src/pages/WatchPage.{tsx,test.tsx}`, `docs/features/u4-watch-dashboard/{plan,spec}.md`,
`packages/db/src/collections/watch-state.ts`. No enforcement paths touched.

**Checked?** Manifest `**Status:** ready-for-check`, `**Fix cycle:** 0 of max 3`. Verdict
`**Cycle checked:** 0`, `**VERDICT: PASS**`. Cleanly checked and PASSed on the branch.

**Does master already have equivalent work — and the operationally important fact:** **A merge of
this exact branch is already in progress in the shared working tree, right now, by a different
loop.** `.git/MERGE_HEAD` = `126311c` (this branch's tip). `git status` shows 11 of this branch's
12 changed files already staged ("Changes to be committed"), and `apps/api/src/production.ts`
alone is `UU` (both modified, unresolved) — **but the working file itself contains zero conflict
markers** (`<<<<<<<`/`=======`/`>>>>>>>` all absent), meaning the conflict has apparently already
been resolved by hand in the working tree and is simply pending `git add` to complete the merge.
`.git/MERGE_MSG` confirms the intent: `"merge u4d-watch-page-state-visibility (PASS cycle 0,
verdict 126311c)... Closes ISS-358."` **This audit did not touch it** (no add, no continue, no
abort), per the coordinator's explicit instruction and this brief's read-only mandate.

**Does it still apply?** `git merge-tree master worktree-agent-a779f0b3b445697af` reports a
**clean** merge tree from the git-objects side (no CONFLICT lines) — noted for completeness, though
it does not resolve why the actual in-progress merge in the working tree shows `production.ts` as
unresolved; that discrepancy belongs to whoever owns the in-flight merge, not to this audit.

**Recommendation: ALREADY-IN-MASTER** (in the specific sense that its merge is already underway,
unprompted by this audit, and checked-PASS work). Nothing to decide here except: whoever is running
that merge should finish it (or, if abandoned, someone needs to `git add apps/api/src/production.ts`
and commit, or restart the merge cleanly) — not a candidate for retirement or re-review.

---

## `wave/vector-gap-durability` — 2 commits (ISS-122)

**What the commits do.** `49f49aa`: `recordVectorGap` returns `Promise<boolean>` instead of
`Promise<void>` (true on both success paths, false from the existing catch, which still never
rethrows); `IndexSessionResult` gains `gapRecorded`; `session.ts` threads it through;
`ingest-store.ts`/`whatsapp-store.ts` warn at the call boundary, mirroring the existing
`res.chunks.skipped` check pattern. This makes a previously log-only bookkeeping failure
observable to callers, per `ISS-122` (medium, open on master) — "an on-call operator reading
`GET /gaps` cannot tell 'no vectors, recorded fine' apart from 'no vectors, AND the gap record
silently failed too.'" `5d25837`: the ready-for-check manifest, which **opens with a "GOVERNANCE
FLAG"** — the maker itself disclosed, before any checker touched it, that dispatching this unit
appears to violate D-014's round cap, because the `vector-gap.ts` seam already has 2 prior PASSed
verdicts and the very verdict that filed ISS-122 explicitly said the fix belongs in "the next unit
touching this file... not a unit of its own."

**Files changed / enforcement path.** `apps/api/src/indexing/{session,types,vector-gap}.ts`,
`apps/api/src/{ingest-store,whatsapp-store}.ts`, `qa/manifests/vector-gap-durability.md`. No
enforcement paths.

**Checked?** Manifest `**Fix cycle:** 0`. **No verdict file exists anywhere in this branch's tree**
(`qa/verdicts/vector-gap-durability.md` is absent) — confirmed by the manifest's own text: "No
checker has been dispatched, deliberately. Dispatching one would be conducting round 3." Never
checked.

**Does master already have equivalent work?** No — `git show master:apps/api/src/indexing/vector-gap.ts`
shows the catch block still only `console.warn`s (line 88), with no boolean return or
`gapRecorded` field. The fix is unique and unmerged.

**Does it still apply?** Yes — `git merge-tree master wave/vector-gap-durability` returns a clean
merge tree, no conflicts.

**The decision here is not actually open — it was already made.** `qa/gates/iss-122-round-cap-breach.md`
(read on master) records that the maker raised exactly this as a `HUMAN_GATE`, and it carries an
**"Answered" line dated 2026-09-28: WAIVED ONCE, recorded as D-044 (Approved-by: Umesh)**, with
three explicit conditions: (1) the ISS-346 mechanical cap check "lands FIRST" — i.e.
`worktree-agent-a3d4ea73632cda74e`'s work, above, must complete its own handshake first; (2) "a
fresh `/checker` must still PASS it, since the author's own mutation run certifies nothing"; (3)
the waiver covers this branch/issue/seam, once. Neither condition is yet satisfied (ISS-346 is at
an unchecked cycle 1; this branch has never been checked at all).

**Recommendation: RESUME-THROUGH-PAIR.** Umesh already decided the merge path (D-044); nothing
further needs to return to him unless the fresh `/checker` in condition (2) finds something new.
The two outstanding steps (ISS-346 closing, then a `/checker` PASS here) are mechanical, not
gated.

---

## `lane/a-speakers` — 2 commits

**What the commits do.** `f1e616c` (older, 2026-09-08): closes out
`speaker-verbatim-token-boundary` as superseded — its manifest had stalled at "ready-for-check
(cycle 3)" after a FAIL, while the actual remedy shipped separately as
`speaker-denylist-ledger-corpus` (built, PASSed, merged) — recording that the bookkeeping was never
flipped, "the handshake is only as good as the close-out." `55b5469` (2026-09-24, tip): carries
the u2-4 phase-3 cycle-0 manifest/evidence/verdict into this lane (same cycle-0 import as
`wave/u2-4-phase3-fix`'s `c527207`, plus the smaller eval-script set — 7 scripts vs the other
branch's 10 — and the same corpus-dump/gold-labels files).

**Files changed / enforcement path.** `qa/manifests/{speaker-verbatim-token-boundary,
u2-4-phase3-precision-regate}.md`, `qa/verdicts/u2-4-phase3-precision-regate.md`, and the eval
corpus/scripts under `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/`. No enforcement paths.

**Checked?** Not applicable in the usual sense — neither commit is new dev work with its own
handshake; both are bookkeeping/import commits against pre-existing manifests.

**Does master already have equivalent work? Yes, both commits, checked directly (not via working
tree):**
- `f1e616c`'s close-out: master's live copy of `qa/manifests/speaker-verbatim-token-boundary.md`
  already reads `**Status:** superseded-by speaker-denylist-ledger-corpus (cycle 3 checker PASS;
  see qa/verdicts/speaker-denylist-ledger-corpus.md)` — and is **further advanced** than this
  branch's version, additionally carrying a `**Handshake status:** superseded — derived by the
  ISS-350 backfill` line this branch never got.
- `55b5469`'s cycle-0 import: master independently holds its own copy of
  `qa/manifests/u2-4-phase3-precision-regate.md` (hash `fd3662f…`, distinct from both this
  branch's `296edad…` and `wave/u2-4-phase3-fix`'s `ca1110a…` — three different copies of
  substantively the same cycle-0 record, none derived from either of these two branches), its
  verdict, the full evidence corpus, the pause marker, and the open ISS-282/283/284 rows.

**Does it still apply?** No — `git merge-tree master lane/a-speakers` reports **CONFLICT
(content)** on `speaker-verbatim-token-boundary.md` and **CONFLICT (add/add)** on both the
u2-4-phase3-precision-regate manifest and verdict (three independent copies of the same
substantive content colliding).

**Recommendation: RETIRE-NO-LOSS.** Both commits' real content — the close-out bookkeeping and the
cycle-0 import — is already present on master in equal or more advanced form, reached by an
independent route, verified by reading master's actual git objects rather than inferring from file
names.

---

## Decisions needed from Umesh

- **`wave/u2-4-phase3-fix` (13 commits, paused, ISS-282 critical open):** the cycle-1 code fix is
  real and iteratively reviewed but last FAILed on a live-verification gap, still blocked by its
  own RAM pause and by ISS-104 on the same files, and no longer merges cleanly. Decide whether to
  resume it through the normal pair (live run, cycle-2 checker, and reconciling the orphaned
  contract amendment "C14") or to hold it as-is. Not a chore either way — real gated work either
  direction.
- **`worktree-agent-a779f0b3b445697af` (u4d, checked-PASS, closes ISS-358):** its merge into master
  is **already in progress, unfinished, in the shared working tree, started by someone/something
  other than this audit.** `apps/api/src/production.ts` is unresolved (`UU`) though its content has
  no conflict markers — it looks manually resolved but not `git add`ed. Whoever owns that merge
  should finish it (or restart it cleanly); this is checked, wanted work sitting mid-integration,
  not a candidate for a fresh decision.
- **`worktree-agent-a3d4ea73632cda74e` (ISS-346 mechanical round-cap check) and
  `wave/vector-gap-durability` (ISS-122, D-044-waived):** no new decision needed from you — D-044
  already set the path. Route both through the normal pair: ISS-346's cycle-1 needs one more
  `/checker` pass, and once it closes, `wave/vector-gap-durability` needs its first-ever `/checker`
  pass per D-044's condition 2.
- **`lane/a-speakers`:** safe to retire (`git branch -D`) whenever convenient — both commits'
  substance is already on master via independent routes, verified against master's actual git
  objects, not just by filename. No loss.

## Work at risk of silent loss

- **None of the 5 branches is a sole copy of anything** — every unique piece of work identified
  above (the `wave/u2-4-phase3-fix` cycle-1 code, `worktree-agent-a3d4ea73632cda74e`'s standing
  test, `wave/vector-gap-durability`'s fix) exists only on its own branch, but each branch's
  reflog/commit history is intact and none is scheduled for deletion by this audit.
- **The one live risk is operational, not branch-content:** the in-progress, manually-resolved-but-
  uncommitted merge of `worktree-agent-a779f0b3b445697af` sitting in the shared working tree.
  Anything that resets, checks out, or cleans the main checkout before that merge is either
  finished or explicitly aborted by its owner would discard that manual conflict resolution (the
  underlying branch commits are safe either way — only the in-progress resolution work in the
  working tree is fragile).
