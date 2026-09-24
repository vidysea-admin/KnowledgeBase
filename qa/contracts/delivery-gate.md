# Contract — delivery-gate (machine-wide Stop-hook lifecycle gate)

**Status:** proposed — awaiting Approver ratification (initial contract creation is a
human-approved START per checker/SKILL.md's criticality gate). Authored by the checker on
2026-09-09 during the `delivery-gate-manifest-blindness` check.

**Why not folded into `qa/contracts/write-guard.md`.** That contract is scoped to
`aios-write-guard.ps1`, a **PreToolUse** guard whose north star is "every write that needs
authorization reaches the human, and no write that does not may prompt." This is a **Stop**
hook with a different north star, a different failure mode (silence, not a prompt), and a
different blast radius (it can block a session, never a write). Folding them would make C1–C7
of write-guard.md untestable against half its own artifact. Separate contract.

**Artifacts under contract** (outside this repo; in scope because this repo's loop depends on
them):
- `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` — Stop hook, registered user-level in
  `C:/Users/Lenovo/.claude/settings.json`.
- `D:/KnowledgeBase/.claude/hooks/mc-sessionstart.ps1` and `mc-precommit.ps1` — the repo-local
  siblings that compute **the same pending-handshake state** from the same files. They are in
  scope *because they share the predicate*, and a gate is only as good as its weakest reader.

**North star:** the machine can see the maker↔checker handshake exactly as the humans and the
skills write it, so a dead loop, an unanswered check, or an unclosed PASS becomes visible
instead of silently absent.

## Acceptance criteria

- **[C1] A manifest at `ready-for-check` is seen in every markdown form this repo actually
  writes** — `**Status:** ready-for-check`, `## Status: ready-for-check`, and
  `Status: ready-for-check` — by every reader of the handshake state
  (`delivery-gate-stop.ps1`, `mc-sessionstart.ps1`, `mc-precommit.ps1`).
- **[C2] Prose that merely quotes the phrase is not counted.** A close-out section or a
  manifest that discusses `Status: ready-for-check` inside backticks must not make a
  checked-PASS unit read as pending.
- **[C3] Cycle numbers are the HIGHEST recorded, never the first.** A verdict accumulates one
  section per cycle; a landed cycle-N verdict must not read as cycle 1 forever. Same rule for
  `Fix cycle` in a manifest that discusses its earlier cycles.
- **[C4] A cycle stamp is written on its OWN LINE** (`**Cycle checked:** 3`), and that is the only
  form the gate is required to read. **Amended 2026-09-25 by D-030 (`Approved-by: Umesh`), on the
  answered gate `qa/gates/delivery-gate-c4-heading-form.md` (option A).** The heading form
  (`# Verdict - <slug> · **Cycle checked: 3**`) is DROPPED from this criterion: it separates the
  stamp from its label with a middle dot or em dash, which forces a non-ASCII boundary into the
  gate's pattern and made the gate's answer depend on how PowerShell decodes the file — two
  independent measurements disagreed about which reader mangles it. Measured cost of keeping it:
  on 2026-09-25 the gate reported `1 check(s) pending` for `u2-4-phase3-precision-regate`, whose
  verdict IS stamped, because the stamp sat mid-line behind a middle dot; that false positive
  blocked two working sessions twice in one evening. All four verdicts using the heading form are
  closed, so nothing live is lost, and encoding independence (232 files × 3 decoders, 0 decision
  changes) is kept. A verdict MAY still carry a decorative heading; it just must not be the only
  place the stamp appears.
- **[C5] The fixture suite pins each predicate against the form the REAL corpus uses**, not
  only against a form the implementation was written to satisfy. A fixture authored from the
  fix rather than from the corpus is the defect this criterion exists to prevent.
- **[C6] Every counting change is evidenced by an old-vs-new re-derivation over the real
  `qa/manifests` + `qa/verdicts` corpus, itemised per manifest** — a count without a
  per-item explanation is not evidence.
- **[C7] A defect found in one predicate is audited across every predicate and every sibling
  hook that shares the pattern**, and the audit result is stated — "checked, not affected" is
  an acceptable answer; silence is not.
- **[C8] Fail-open is preserved.** Any exception, missing transcript, or unreadable file
  leaves the session unblocked. A gate that crashes a session is worse than a blind one.
- **[C9] Block budgets and per-predicate markers hold** — no predicate may consume another's
  budget, and no predicate may block more times than its documented budget.

## Invariants

- **[I1] The hook never edits, never commits, never writes outside `%TEMP%/claude-delivery-gate`.**
- **[I2] Blindness is the expensive failure, noise is the cheap one — but neither is acceptable
  as a shipped state.** A change that trades C1 for C2 (or the reverse) is a FAIL, not a
  tradeoff.
- **[I3] Mutation evidence follows D-020** — timeout, restore in a `finally`/trap that fires on
  error and interrupt, hash-asserted restore, and a no-op control in the table.

## Out of scope / ignore

- Comment prose, trace-log wording, block-message copy.
- The transcript-scanning predicates' JSON patterns (review, config, browser, orphan,
  edit-count) are **not** markdown-form-fragile — they parse JSONL tool_use records. C1–C4
  do not apply to them; C7 still requires that this be stated rather than assumed.

## Amendment log

- 2026-09-09 · critical (initial creation, START) · contract authored during the
  `delivery-gate-manifest-blindness` cycle-1 check · three units have now touched the Stop
  hook's predicates with no ground truth to judge them against, and the cycle-1 unit's own
  Known Gap 4 asked for exactly the class audit C7 encodes.
