---
name: checker
description: Independently verify a completed development unit with measured reviewer budgets and a persisted verdict.
---

# Staged token-accounting amendment

After queued broker request or blocker, persist checkpoint then emit FINAL immediately. Do not call wait_agent, sleep, poll, or send repeated waiting updates. Parent reactivates once receipt ready; parent interrupts a still-running checker after persisted blocked checkpoint.

For new reviews, set `token_metric: actual_total`: tokens mean runtime input plus output (including cached input), for both maker and every checker child/retry. Repeat this tag on each token-bearing maker, reviewer, budget_debit, next_phase, bootstrap, and escalation limits object. Ratios require comparable measured maker and all checker totals; missing actuals stay null even with allocation debits. Preserve every prior charge. Mixed or unlabeled historical units require HOLD and documented same-unit telemetry reconciliation; never relabel legacy allocation debits as runtime totals. The helper cannot establish ledger completeness or authenticate telemetry: persist immutable prior inputs and receipts for independent review.

With completion_reserve enabled, actual_total additionally requires positive `completion_reserve_tokens`, sized for completion's expected runtime input plus output. The helper protects this amount and 30 active seconds inside the cumulative total; it adds no budget. `next_phase.output_tokens` optionally bounds output allocation separately, must not exceed the total-token allocation, and is never measured output usage. Omitted token_metric retains legacy allocation arithmetic and its 800-token reserve, explicitly labelled unverified legacy units; it cannot demonstrate actual-token efficiency. Use `ratio_verified_by_metric` to distinguish time, tokens and optional cost; unknown money or time remains unknown. Required checks and independent PASS authority are unchanged. This file is a staged amendment only; canonical skill installation requires separate authorization and independent review.
