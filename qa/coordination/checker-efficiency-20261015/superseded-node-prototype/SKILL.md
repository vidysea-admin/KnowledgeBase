---
name: checker-efficient
description: Bound independent maker/checker verification using frozen evidence, reusable receipts and a measured checker budget. Use when dispatching or performing a checker review; preserve repository-specific acceptance and security requirements.
---

# Efficient independent checking

Use this admission layer alongside the repository's maker/checker rules. Existing contracts, independent verdict ownership, human gates and security checks remain binding.

## Maker preparation, once

- Finish self-verification before dispatch. Supply a READY manifest, cycle, complete changed delta, relevant contract clauses, caller/consumer map and exact final SHA256 pins. Include current hash-bound test receipts and their inputs. Keep the navigation packet at most 16 KiB; large necessary deltas stay in pinned files.
- Measure maker active milliseconds; exclude idle/approval waits, label estimates. Unknown timing cannot establish a 10% ratio: repair telemetry or use an explicitly reported exception, never claim compliance.
- Create one admission spec per coherent batch/cycle. Include required security and downstream checks, even if their cost exceeds budget. Do not create tiny per-file checkers or duplicate startup/context reads.

## Admission and dispatch

Run `node <this-skill>/scripts/checker-admission.mjs admit SPEC.json`. The helper validates READY/cycle, all pins, bounded input and exclusively reserves one cycle. A refusal means HOLD; fix the packet before spawning. Do not delete reservations to evade duplicate/budget limits.

Spawn one independent checker with `fork_turns="none"`, a self-contained brief and this skill's absolute path. Include the admission deadline, packet/spec paths, verdict ownership and at most 300 words of final reporting. Never inherit the maker conversation. Reuse an idle checker only with a fresh isolated context; otherwise spawn a fresh bounded checker.

The time allowance is `min(10% of measured maker active time, 180 seconds)` including scope review and verdict persistence. Orchestrator supervises the returned deadline, calls status at most every 30 seconds and interrupts on expiry; it must not wait beyond the deadline. Commands use their own remaining-time timeout via the helper's `run` action, no competing suite. Interruption can wait for a pending tool call; this is supervision, not a harness-level hard LLM cutoff.

## Checker: delta and risk only

Verify admission and pins, independently review complete changed logic and the immediate consumer/security boundary. Reuse attributable passing receipts for identical inputs and checked bytes; do not rerun maker suites, validators, typechecks or startup surveys without a concrete missing requirement. Perform the smallest independent risk probe; batch compatible checks in one runtime process through the verification broker. Broader testing is maker/CI work unless a changed dependency, contract or failure requires it.

Persist PASS only for complete independent scoped evidence with unchanged pins. Budget expiry, missing scope or required checks means HOLD; a demonstrated violation means FAIL. Security is never skipped to meet the budget. Split genuinely oversized scopes or obtain an explicit measured exception; no automatic retries, fabricated receipts or automatic PASS.

Finish using `finish SPEC.json REPORT.json`. The helper refuses stale bytes/spec and downgrades an over-budget or incomplete requested PASS to HOLD. Record actual elapsed time, reused receipts and independent checks. Token/cost counters are unknown unless attributable actual telemetry exists. Input bytes/4 is only an estimate; runtime `tokens_used` is not billing evidence. A 10% time result never proves 10% tokens or cost.

## Spec and report

Spec v1: `version`, absolute `root`, `slug`, integer `cycle`, measured `makerActiveMs`, pinned `manifest` and `packet`, nonempty `pins` (source, relevant contracts/dependencies and receipts), `riskFlags` (auth/tenancy/writes/credentials or none), `requiredChecks` (explicit identifiers), optional `independentCommand` (`file`: absolute executable; `args`: exact array). A pin is `{path: relative/forward/slash, sha256: lowercaseSHA256}`. Manifest has exactly one `Fix cycle: N` and consistent READY status fields. Ledger: workspace `.cache/checker-efficient/`; preserve completed and incomplete records.

Report: `verdict`, `completedChecks`, `explanation`, optional attributable `tokenUsage` and `billedCost`. The helper records budget outcome, not semantic verdict authority; only the independent checker writes the repository verdict. Missing actual usage stays unknown. Existing receipt inputs must be pinned in the spec; a receipt's filename or PASS text alone is insufficient proof.
