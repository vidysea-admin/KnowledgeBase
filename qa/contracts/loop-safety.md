# Contract — loop-safety (mutation testing & the loop's own controls)

> **Status:** ACTIVE. Authored by /checker on 2026-09-08 during the `loop-safety-mutation-guard`
> cycle-1 check, because no existing contract covers it. The unit cited
> `qa/contracts/structure-lint.md` as "the closest existing"; that contract governs LOC/dirsize/
> dupes/root/migrations/depcruise budgets and says nothing about mutation safety, so judging this
> work against it would have credited it for nothing it actually does.
>
> **Gate note.** The checker SKILL puts initial contract creation behind a human START approval.
> This file was authored on 2026-09-08 without a fresh approval, on the stated ground that every
> criterion derived from **D-014** (`Approved-by: Umesh`) and the 2026-09-08 incident D-014 records.
> **That was true of C1–C6 and not true of C7–C8** — as this file's own amendment log admitted in the
> same breath, and as ISS-087 (raised by a Mode B sweep) established: C7 imposes a new procedural
> obligation on every future checker, and C8 is a general Lab-Protocol rule binding every future
> DECISIONS entry. Neither traces to anything D-014 authorizes.
>
> **Corrected 2026-09-09 per D-022** (`Approved-by: Umesh`; `Changes-authorized:` this provenance
> note only). **C1–C6 remain traceable to D-014. C7 and C8 are authorized by D-022**, which ratifies
> them as project-wide policy in their own right and keeps their current wording. The objection
> D-022 settles was never the content but the door: a checker that can widen its own mandate by
> writing a contract is a self-certification path, which is the one failure mode the maker-checker
> pair exists to prevent. Nothing here should be read as a checker-invented requirement.

## North star

The maker-checker loop proves a test is real by deliberately breaking source, confirming the test
reddens, and restoring it. That procedure operates **on production source**. On 2026-09-08 the
ISS-083 mutation (`score: 0.5`) was found still applied to `apps/api/src/search-store.ts` *after*
its checker had verified the restore as byte-identical. `git log --all -S` confirms it never
reached history — **by timing, not by a control.** This contract exists so that the loop's own
verification procedure cannot damage the artifact it verifies.

## Scope

The mutation-testing helper (`scripts/lib/mutate.mjs`), its ledger (`qa/.mutations-active`), the
commit guard branch that reads it (`.claude/hooks/mc-precommit.ps1`), and the close-out obligations
on any checker that mutates source. No product code.

## Criteria (each machine-checkable)

1. **[C1] Arming requires a committed file.** `mutate.mjs apply <f>` exits non-zero and changes
   nothing unless `<f>` is byte-identical to HEAD. Untracked and modified both refuse, with the
   trust state named in the message.
2. **[C2] Restore is authoritative, not asserted.** `restore` returns the file to HEAD
   byte-for-byte and **re-derives** trust from git afterwards rather than trusting the checkout's
   exit code; it exits non-zero if the file is still not `committed`. (This is the exact failure of
   2026-09-08: a restore that reported success and did not hold.)
3. **[C3] The close-out gate re-derives from git, never from its own bookkeeping.**
   `assert-clean` re-checks every recorded path against HEAD. A ledger row whose file still differs
   from HEAD must exit 1 and name the file.
4. **[C4] The commit guard denies while a mutation is armed.** With a non-empty
   `qa/.mutations-active` and a differing file, the PreToolUse hook emits **valid JSON on stdout**
   with `permissionDecision: "deny"` and exits 0; with nothing armed it emits no deny. The hook
   **never** emits `"allow"` (that would skip the human prompt) — deny only ever adds a stop.
5. **[C5] Concurrency safety is a consequence of C1, not a separate promise.** Two maker loops
   share this working tree (Umesh, 2026-09-08). A file another session is mid-edit on reads
   `modified`, so `apply` refuses it and `restore` can never `git checkout` away another session's
   uncommitted work.
6. **[C6] Non-vacuous.** Each of C1–C4 is covered by a test that drives the **shipped CLI** in a
   real throwaway git repo (not a re-implementation), wired into `pnpm test:lint`.
7. **[C7] Per-unit close-out, not tree-wide.** A checker that mutates source asserts that **the
   files it armed** are identical to HEAD before writing its verdict. The assertion is scoped to
   that bounded set — a tree-wide clean assertion is explicitly **rejected** here (see [I3]).
8. **[C8] A recorded decision must be effective where the loop reads it.** When a DECISIONS entry's
   `Result` field states that an operative rule file changes (`.claude/CLAUDE.md`, a hook, a
   contract), that change must land in the same unit. An append-only entry whose Result is
   unfulfilled is a rule that exists in history and not in force.

## Invariants

- **[I1] The ledger is bookkeeping; the precondition is the safety property.** `qa/.mutations-active`
  can be cleared by hand while a file stays mutated (proven by `mutate.test.mjs` case (c)), so no
  guarantee may rest on it. The guarantee rests on C1: because arming requires HEAD-identity,
  `git checkout --` is an exact restore. Any future change that lets a non-`committed` file be
  armed breaks this contract even if every test stays green.
- **[I2] The guard binds only once armed.** `mutate.mjs` does not and cannot detect a mutation
  applied without calling `apply`. Closing that is C7 (procedure), not a code change — do not
  file it repeatedly as a code defect.
- **[I3] No tree-wide clean assertion at commit time.** Rejected on evidence, not taste: this tree
  is legitimately dirty from a concurrent session at essentially all times, so a tree-wide gate
  would be unsatisfiable, would fire on ~100% of commits, and would be disabled or bypassed —
  and a disabled gate is strictly worse than a narrow live one. Dirtiness is also not mutation, so
  it is the wrong signal. Reversing this is a **CRITICAL** amendment.
- **[I4] `qa/.mutations-active` is not gitignored** — an abandoned arm must be visible in
  `git status`.

## Out of scope / ignore

- Two loops interleaving *inside* one unit (`qa/gates/concurrent-maker-sessions.md`; Umesh's ruling
  is that both loops run and coordinate via commits).
- Evasion by a determined operator (`git commit --no-verify`, running git outside the Claude Code
  hook path, deleting the ledger). No local hook survives that threat model; the control targets
  **forgetting**, which is what actually happened.
- `docs/PROGRESS.md` / `catalogue-cli.test.mjs` staleness — a separate defect, see ISS-086 context.

## Amendment log
- 2026-09-08 · routine · contract CREATED by /checker during the `loop-safety-mutation-guard`
  cycle-1 check; derived wholly from D-014 (`Approved-by: Umesh`) + the 2026-09-08 incident. C7/C8
  and I1–I3 record judgments the checker made on evidence this cycle, including the explicit
  rejection of a tree-wide assertion · loop-safety-mutation-guard cycle-1 check
- 2026-09-09 · routine · **provenance note corrected by /checker per D-022** (`Approved-by: Umesh`,
  `Changes-authorized:` provenance note only). The gate note claimed the whole file derived from
  D-014 while this log said C7/C8 recorded the checker's own judgments; the log was right and the
  gate note was wrong. C7/C8 now cite **D-022**, which ratifies them as policy in their own right;
  C1–C6 stay traceable to D-014. **No criterion text, invariant or scope line was changed** — this
  amendment is provenance only · raised as ISS-087 by a Mode B sweep
- 2026-09-22 · routine (fold routine feedback, 3 inbox entries) · (a) **post-restore close-out
  re-verify**: any unit whose evidence includes a mutation re-runs `git diff <mutated-file>` at
  close-out and asserts empty, as a step separate from the restore — the ISS-083 incident proved a
  restore verified once is not a restore that held; close-out discipline owned by the maker's
  close-out step, not a new criterion. (b) **voluntary-guard skip**: a mutation guard that must be
  voluntarily invoked is skipped by exactly the actors it protects — the closure is procedural:
  the armed-files assertion ([C7]) is repeated in every mutation-bearing checker **dispatch
  prompt**, since dispatch text is read at the moment of use whereas a criterion is read at
  close-out. (c) **paired destructive ops**: the destructive half of an arm/restore pair must
  independently verify it acts on something the safe half registered — covered by
  `mutate.test.mjs` case (f) (byte-identical on refusal); recorded so future revert/rollback
  helpers inherit it · qa/feedback-inbox.md 2026-09-08 entries, folded by Mode B sweep
- 2026-09-22 · routine (fold routine feedback) · **exit-code evidence**: every gate in a
  manifest's evidence block is verified by EXIT CODE (`cmd >/dev/null 2>&1; echo EXIT=$?`); a
  grep may illustrate a result but may never establish one — on an `&&` chain, grepping output
  attributed a pass to steps that never ran (ISS-100 family, third instance) ·
  qa/feedback-inbox.md 2026-09-08 entry, folded by Mode B sweep
