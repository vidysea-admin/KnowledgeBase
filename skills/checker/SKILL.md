---
name: checker
description: Independently verify one affected KnowledgeBase feature or change from its maker packet and write the matching scoped verdict. Use for unit checking; repository sweeps are a separate scope.
---

# Checker

This is a new repo-local portable workflow, explicitly loaded for this repository. AGENTS.md and applicable contract clauses remain authoritative. A focused check targets 120–180 seconds from checker launch to persisted verdict; that is an efficiency target, never an acceptance condition.

## Establish scope

Record checker launch time immediately. Read the named manifest and packet, applicable AGENTS.md rules, exact relevant contract clauses, affected diff, and the immediate caller/consumer. Verify slug, Fix cycle, and final-file hashes before relying on supplied evidence. Include untracked changes. If the packet lacks necessary scope or provenance, record HOLD with the missing information rather than conducting a broad exploratory survey.

Use the packet's changed-call-site/dependency map to navigate. Read all new code, complete changed logic and the relevant consumer/security boundaries. Read targeted excerpts of unchanged dependencies; expand only when missing context, a contract or observed behavior requires it. Do not reread a whole unchanged runner simply because it calls the changed feature.

Independently determine whether the proposed behavior and tests satisfy the affected contract. Maker explanations are claims to check. Reuse attributed maker evidence when its command, result, fixture, cycle, and checked bytes are clear, while performing a direct source review and independent behavioral check of the change. State precisely which evidence is reused and which is independently reproduced.

## Run focused verification

Select the smallest checks that exercise the affected behavior, failure boundary, and immediate downstream consumption. Derive at least one meaningful independent probe from the contract or actual boundary when needed; do not merely mirror implementation wording. Check the affected stage on sample data and the immediate downstream stage. Preserve the required contracts/verify_contracts.py check when applicable; if required evidence is absent or fails, withhold PASS.

Use established execution facts: when the same capability has already demonstrated a sandbox restriction in this environment, request the necessary approval directly instead of repeating the known failing attempt. Approval and permission boundaries still apply to the actual action. After scope/hash validation and approvals, start the focused command and retain its running handle while independently reviewing the changed seams, relevant consumers and security behavior. Keep this overlap light on CPU; do not launch competing local suites. Batch independent scoped reads, and inspect every result. Draft the verdict skeleton during review so completion needs only results, limits and final hash checks.

For issue-fix units, read the cited issue from the union of qa/issues.jsonl and qa/issues.*.jsonl and re-run its recorded reproductions verbatim. Report corpus counts by issue ID. Do not substitute a newly authored easier corpus. Name and explain any unreplayed case; required omissions prevent PASS.

Record every command's exact invocation, duration, exit code, counts, and output or output artifact path. Bound potentially hanging commands with suitable timeouts and capture timeout as incomplete evidence. At the time target, report progress, the smallest remaining required check, and its expected cost. Finish feasible necessary checks with an explicit reason for exceeding the target; persist HOLD if evidence is blocked or the check must stop incomplete. Persist FAIL for a proven acceptance violation. Do not drop required coverage to meet the target, silently continue indefinitely, or claim a 2–3 minute result without measuring it.

Widen coverage only for a concrete changed dependency, contract requirement, security boundary, or observed failure. Record that reason and expected extra work before a broad suite. Auth, tenancy, cross-tenant access, writes, and credentials require relevant boundary checks regardless of severity; these findings are never round-capped. Keep local work light while the shared Chrome worker's CPU restrictions apply.

Every mutation run requires timeout, byte backup restoration in a trap on timeout/interrupt/error, and cmp verification; prefer scripts/lib/mutate.mjs. Do not leave modified product files after verification.

## Persist the independent verdict

Write qa/verdicts/<same-slug>.md with:

- VERDICT: PASS, FAIL, or HOLD; Cycle checked; exact scoped acceptance and remaining whole-task gates.
- Launch/completion timestamps, total launch-to-verdict elapsed time, and per-command durations. Report any uncertainty in timing rather than presenting an estimate as measured.
- Phase checkpoints for dispatch/launch, approval requested/resolved, scope-read/review start/end, commands start/end, and draft/persist start/confirmed completion. Record actual timestamps and known waits; mark absent measurements unknown. Review and commands may overlap, so their durations do not automatically add to total elapsed time. Never attribute an unmeasured gap to drafting or approval by subtraction.
- Checked final-file hashes, contract clauses, independent findings/probes, attributed reused evidence, exact commands/results/output paths, and issue reproduction counts.
- ISSUES-WRITTEN: none or the actual filed IDs; EXPLANATION including missing evidence or reason for widening.

Use a compact draft, filling only evidence established by this check:

```text
VERDICT: pending until required checks finish
Cycle checked: <current cycle>
Scope / remaining gates:
Phase timestamps / total elapsed / unknown intervals:
Commands: exact invocation, duration, exit, counts, output path
Checked final hashes / relevant clauses:
Independent findings / attributed reused evidence:
ISSUES-WRITTEN:
EXPLANATION:
```

Keep this draft in working notes until the verdict is supported. The persisted verdict may be longer when security or acceptance evidence needs detail; the template is not a limit on coverage.

Before verdict, recheck relevant final-file hashes. A changed candidate or cycle requires HOLD/resubmission; the verdict cannot certify different bytes. PASS requires complete evidence for this unit's authorized scope, not merely passing selected tests. FAIL identifies a reproducible acceptance violation. HOLD identifies missing prerequisites or incomplete necessary evidence. Only checker may PASS; maker closes the manifest after matching PASS.

An issue-free check is complete and creditable. Low observations belong in EXPLANATION, not the backlog. Apply AGENTS.md's severity ceremony and prior-two-PASS non-security seam cap. Ledger readers use all lane shards; new lane issue IDs retain their lane namespace. Do not rewrite contracts merely to match the implementation or lower acceptance requirements; feedback and contract maintenance are separate explicitly authorized checker work.

## Separate sweep

Unit checking does not launch repo-wide sweeps, backlog audits, full acceptance campaigns, unrelated refactors, or another maker unit. Existing separately authorized sweeps remain separate work; this skill does not change their freshness requirements, automation, or stale-lock threshold. Preserve enforcement, frozen-contract, decision-write, and AGENTS.md approval boundaries.
