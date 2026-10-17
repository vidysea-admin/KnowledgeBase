---
name: checker
description: Independently verify a completed development unit from its maker packet, using a fresh context, scoped checks, measured reviewer budgets, and a persisted verdict. Use when reviewing maker work or issuing a checker PASS; repository sweeps require a separate scope.
---

# Independent checker

Check one authorized unit at an exact candidate SHA and fix cycle. Only the independent checker issues PASS. Repository contracts, required verification, security boundaries, and explicit user instructions remain authoritative. This skill never waives a mandatory check.

## Dispatch and packet

The maker prepares a compact packet (aim for 2,500 tokens, excluding linked diff/clauses): absolute root and candidate/base SHA; slug/cycle; changed and untracked paths; exact acceptance clauses; behavior and immediate consumers; relevant risk boundaries; commands/node IDs, fixtures and environment names without values; evidence paths and fingerprint; measured maker usage and remaining required gates. Link raw evidence instead of pasting logs. Never supply an intended verdict.

Dispatch a fresh reviewer with `fork_turns="none"`, the skill and packet paths, absolute verdict path, ownership, and explicit time/token allocation. Do not inherit the maker conversation. Read the packet, applicable instructions and exact required clauses, changed logic and relevant consumers. Do not scan unrelated history/backlog, load every skill/reference, or commission duplicate reviewers without a concrete reason. Verify identity, cycle and diff yourself; maker claims are untrusted evidence.

## Measured phase gate

Before dispatch and each material review/command phase, run `python <this-skill>/scripts/review_budget.py assess --input <metrics.json>`. Keep the input/result with the unit evidence. Example shape is in [metrics.json](references/metrics.json). Batch one assessment per phase; do not poll tokens. The PRIMARY objectives are checker active time and tokens each at most 10% of comparable maker active time and tokens, aggregated over every checker child, retry, and fix cycle. Monetary cost is optional secondary accounting. Preserve all earlier checker usage when resubmitting, including prior unknown reviewer overhead as null rather than resetting it to zero. Read runtime usage when available; never invent tokens or monetary cost. Unknown values stay null. Phase allocation must include expected command time.

The helper exits nonzero on an exhausted or insufficient budget. Persist a checkpoint and `NEEDS_EXTRA_REVIEW`, then seek a narrower scope or explicitly justified allocation before continuing. Required high-risk checks can justify an explicit escalation; record approver/authority, reason and finite allocation in the input. A ratio miss stays reported even after escalation. The helper cannot authorize escalation itself. An absent/zero maker denominator selects `BOOTSTRAP_REVIEW`: explicit bounded scope, default 180 seconds and 6,000 allocated tokens, ratio unverified. Unknown token usage cannot prove token-budget compliance; track remaining allocation if the host exposes it.

These are dispatch/phase workflow gates, not provider interception. A review can exceed its target because required work takes longer; it cannot PASS by omitting that work. Elapsed target and verification verdict are separate facts.

## Verify efficiently and independently

Before pytest/build, run `python <this-skill>/scripts/review_budget.py preflight --root <root> --import-name <package> --import-root <source-root> --temp-parent <existing-basetemp-parent>` under the intended Python executable and required environment flags. Check Python/import identity, dependency/runtime compatibility and temp writability. The helper checks import containment and writes a temporary probe; it does not certify dependency compatibility. Use the existing compatible environment rather than creating another venv without cause. Record unavailable dependencies once and repair/hold rather than repeating the same failed setup. Do not expose credentials or full environment values.

Select the smallest relevant checks covering the changed behavior, immediate consumers and failure/security boundaries, plus applicable mandatory repository commands. Put each selected test node ID and its coverage reason in the packet; do not blindly run all tests for every unit. Auth, tenancy, secrets, writes, schema/public API, shared infrastructure and enforcement need their relevant boundary checks. Widen for a specific contract requirement, dependency or observed failure, documenting the additional scope. Run the full combined release/integration suite once on the exact combined candidate, reusing a matching successful receipt where policy permits. Full suites still run wherever the governing repository or release/integration gate explicitly requires them.

Reuse existing evidence only if the governing policy permits it and candidate/base SHA, command/node IDs, Python executable/version, lock hash, import root, environment fingerprint, and browser/runtime identity match exactly. `review_budget.py reuse --input <pair.json>` checks the supplied fingerprints but does not authenticate maker evidence. Independently inspect evidence provenance and perform a contract-derived behavior/failure probe; rerun mandatory independent commands and sabotage checks. Use isolated mutation copies with asserted green baseline, verified application, attributable named failure, restoration and timeouts as required by the repository. Do not duplicate unchanged runs without a reason.

Capture each command's own exit code and complete output to a file, never rely on a filtered pipe. Timeout, collection error, stale candidate, unknown prerequisite or missing evidence means incomplete verification, not PASS. Keep code/build work within machine slots and shared CPU restrictions.

## Persist verdict and accounting

When historical actual usage is unknown, retain null and record the already committed allocation in that reviewer's `budget_debit` object (`active_s`, `tokens`, optional known `cost`). Debits are conservative allocation charges, never measured usage. Every supplied debit must be positive and finite; missing active/token debits cannot unlock another phase. The helper budgets the greater of actual usage and debit for every child/retry, while actual totals and ratios remain unknown. Finite escalation limits cover cumulative prior debits plus the next phase; they never reset the ledger. Unknown monetary cost remains null. For prospective phases, record monotonic start/end and explicit wait/pause intervals; active time is measured phase duration minus those intervals, never a guessed retrospective number.

Write the matching verdict with PASS/FAIL/HOLD, cycle, reviewed SHA/final hashes, clauses covered, exact commands/results/evidence, independently produced versus reused evidence, remaining gates and limits. PASS requires all applicable evidence complete; a proven acceptance violation is FAIL; missing evidence is HOLD. Recheck candidate bytes/cycle before persisting. Maker closes only a matching PASS.

Record actual launch/end/active/wait timestamps, command durations, host tokens/cost or null, child/retry IDs, ratio statuses and any escalation. Preserve immutable input/result snapshots per phase and append their paths to the unit ledger; never rewrite a prior phase to improve the ratio. Summed child active seconds measure resource use; launch-to-verdict wall time is separate. Missing metrics prevent an efficiency-success claim but never convert failing verification to passing.

Never pad maker duration, transfer checker work into maker accounting, omit children/retries, or exclude failed attempts to improve ratios. Exclude queue/wait time consistently from both active-time denominators and numerators. Record a shared integration/release suite separately once, with its receipt, rather than hiding its cost in either role. Receipt reuse needs exact scope, SHA/environment identity, successful exit and policy permission; it never substitutes for required independent evidence.
