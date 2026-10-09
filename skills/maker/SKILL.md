---
name: maker
description: Build one authorized KnowledgeBase unit and prepare a focused, reproducible packet for an independent checker. Use for substantive development in this repository.
---

# Maker

This is a new repo-local portable workflow, not a restoration of the migrated global skill. Load this file explicitly for this repository. The repository's AGENTS.md remains authoritative; this skill changes neither enforcement nor acceptance criteria.

## Pick and bound one unit

Announce maker mode. Read root ARCHITECTURE.md, the effective decision index in docs/DECISIONS.md, and open TASKS.md entries once per session; reuse that context while it remains current. Inspect the pending file handshake before starting new work. Continue an already authorized pending unit rather than opening a duplicate. Honor user steering and HUMAN_GATE decisions.

State the selected priority tier: clear queue TODO; critical/high ledger issue; next unblocked roadmap task; medium issue; uncovered contract criterion; feedback. Read the union of qa/issues.jsonl and qa/issues.*.jsonl when evaluating issues. Before pulling a non-security seam, count its prior PASS verdicts: at two, file further findings without opening another unit. Security findings are uncapped. Medium findings receive a one-line ledger entry and verification in the next unit touching the file; low findings never become units. Apply AGENTS.md's ceremony gate.

Limit implementation to one independently checkable behavior. Inspect the necessary files, their immediate callers/consumers, and relevant existing tests. Preserve unrelated changes. Do not mix a repository sweep, backlog grooming, or unrelated repair into delivery.

## Build and prepare the check packet

Use an existing contract's relevant clauses as ground truth. Maker never edits qa/contracts/. Record feedback verbatim in qa/feedback-inbox.md for checker handling. Do not invent absent acceptance thresholds or convert a scoped patch into whole-task acceptance.

Implement and run the focused affected-stage check on sample data plus the immediate downstream consumption check. Run contracts/verify_contracts.py when the repository's definition of done requires it. Preserve exact commands, exit codes, output or output artifact paths, counts, and elapsed seconds. A filed issue's own recorded reproductions are the regression floor: replay them verbatim and report counts by issue ID; name any case left open and its reason.

Prepare qa/manifests/<slug>.md with the current Fix cycle and a compact checker packet, inline or at qa/packets/<slug>.md:

- Task/issue IDs, selected priority tier, authorized behavior, explicit exclusions, and the exact contract paths and clauses.
- Same manifest slug and cycle; exact changed paths; original/base hashes or commit plus patch, and hashes of the final files to be checked. For an untracked file, record that no base existed. Include actual tracked and untracked edits, not just a commit diff.
- Relevant caller/consumer paths and security flags: auth, tenancy, cross-tenant access, writes, credentials. Give the concrete basis for the flags.
- A compact change map: changed symbols/call sites, exact dependency/consumer paths and relevant line excerpts, plus the impact reason for each check. Excerpts guide navigation; the diff and actual source remain authoritative. Include complete changed logic and enough adjacent context to assess security boundaries without a fresh whole-module survey.
- Exact affected-stage and immediate downstream commands, fixtures, runtime paths, required environment names without secret values, and existing evidence with exit codes/durations.
- Known execution facts for these commands in this environment: required sandbox permissions, prior restriction/result and dependency readiness. For already demonstrated subprocess/CIM restrictions, identify the necessary approval directly; do not prescribe a predictable failing default attempt or treat prior approval as authorization for a different action.
- Linked issue IDs, exact reproduction locations, corpus counts, known failures, prerequisites, and remaining acceptance gates.

Keep the packet sufficient to begin an independent check without re-surveying the repo. Set the manifest's **Handshake status:** and legacy Status fields consistently to ready-for-check only when the authorized scoped build and required evidence are ready. Preserve any existing handshake field spelling and avoid disagreeing duplicate status fields. Dispatch one independent checker with fork_turns="none" and a self-contained brief naming the absolute repository, skill, packet, manifest, and verdict paths, slug/cycle, authorized check scope, timing target, write ownership, and a concise output limit. Do not supply an intended verdict or make the checker inherit unrelated session history. Maker must not write the checker verdict.

## Close the file handshake

Checker replies in qa/verdicts/<same-slug>.md with Cycle checked. Accept only a verdict for the current cycle and unchanged checked files. On FAIL or HOLD, address only actionable findings within authorization, increment the fix cycle for a new candidate, and submit again. Do not auto-retry missing human decisions or environmental prerequisites.

After checker PASS, set the same manifest's **Handshake status:** and legacy Status fields consistently to checked-PASS and cite the verdict and its scoped evidence. Whole-task completion requires the whole task's acceptance evidence. Incomplete scoped evidence remains HOLD; never infer PASS from elapsed time. Report what changed, validation, and material remaining gates.

## Preserved boundaries

Protected decisions are append-only through scripts/append_decision.ps1. Frozen architecture/contracts changes and enforcement changes retain the approval requirements in AGENTS.md. Do not edit AGENTS.md, hooks, settings, or approval mechanisms through this skill. Do not alter stale-lock thresholds.

For every mutation run, use a timeout, a byte backup restored by a trap on timeout/interrupt/error, and cmp verification; prefer scripts/lib/mutate.mjs. Honor current CPU restrictions. Use only available scheduling tools when continuation is explicitly authorized, and report success only after the tool confirms it; this skill does not recreate missing ScheduleWakeup primitives or prescribe a new schedule.
