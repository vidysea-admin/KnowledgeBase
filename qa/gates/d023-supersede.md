# HUMAN_GATE — D-023's Result states something measurably false

**Opened:** 2026-09-09
**Blocks:** nothing buildable. It blocks the *accuracy of the decision log*, which is the thing
DECISIONS exists to provide.

## The question, in one line

Should a superseding DECISIONS entry be appended to correct D-023, whose **Result** says
*"Protection is unchanged and was verified by parity test"*?

## Why it needs you

`docs/DECISIONS.md` is append-only and the only write path is `scripts/append_decision.ps1`.
Appending to an Approver-governed record is your act, not the maker's — the cycle-1 checker of
`write-guard-enforcement-gaps` ruled exactly that, and ruled it is **not** a PASS blocker. But it
also ruled it cannot stay a bullet in a manifest, because a manifest is closed out and forgotten
while the decision log is read forever.

## What is actually false

D-023's parity test named three paths — `docs/DECISIONS.md`, `.claude/settings.json`,
`.claude/hooks/*.ps1`. All three route through the guard's Lab check, which was ported verbatim, so
all three passed. The paths that fell through to the config check were never probed. Measured
afterwards, **six** enforcement-shaped paths went `ask` to `silent`, including
`sources/whatsapp_msg/.claude/settings.json` — a submodule with its own Lab Protocol repo.

The defect is not the six paths, which are fixed (ISS-165, harness-pinned). It is the sentence:
a fix measured against a corpus its own author chose, asserted in the log as if it were general.
That is D-015's rule, broken in the record of the change rather than in the change.

## Options

- **A — append a superseding entry** (recommended): a short D-entry that supersedes D-023's Result
  only, stating what the parity test actually covered and citing ISS-160/ISS-165 and the fixture
  block in `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1`. D-023's What and Changes-authorized
  stay correct and are untouched.
- **B — leave it.** The claim is wrong but the change it authorized was small and correctly scoped,
  and the ledger already records the truth. Costs nothing today; costs a reader later.

## Answer format

Say A or B here. On A the maker drafts the entry and you run
`powershell -File scripts/append_decision.ps1 -EntryFile <entry.md>`, since only you can supply
`**Approved-by:** Umesh`.

**Links:** ISS-160, ISS-165, ISS-168; D-023; `qa/manifests/write-guard-enforcement-gaps.md`

Answered: 2026-09-26T23:54:34+05:30 — APPROVED (supersede D-023 via a new DECISIONS entry with a reasoned Supersedes field; old entry untouched) — Umesh via AskUserQuestion in checker session knowledgebase-7a (multi-select, all four ticked), following his chat message "go on i approve". Scribed by /checker (check 6).
Confirmed: 2026-09-26T23:56:41+05:30 — Umesh first-hand in maker session knowledgebase-ed (AskUserQuestion: 'Run the InFocus repair, U5 fully automatic, Write DECISIONS entries') — acting on it
