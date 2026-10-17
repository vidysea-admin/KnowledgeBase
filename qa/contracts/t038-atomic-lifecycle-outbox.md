# T-038 atomic lifecycle outbox — scoped acceptance

Checker-owned contract under the root's explicit QA lease. This is the three-file canonical producer correction (`scripts/webinar/run-pipeline.mjs`, `scheduler/lifecycle-alerts.mjs` and its standing tests), cycle 0. It does not narrow `qa/contracts/goal-t038.md` C1–C7 or certify the full scheduler. Priority tier: 3. There are zero prior PASSes on this canonical producer/outbox; the prior durable-alert-retries PASS covers the separate sink.

## C1 — Atomic durable transition and notification intent

The canonical artifact-start callback, terminal operation update and Calendar/Gmail acquisition must stage their finite tenant-bound notification snapshots in the same state image as their corresponding transitions. One durable save precedes enqueue and legacy notifications. A crash after the first durable write and before enqueue must preserve both the transition and its exact event for reconstruction/replay. Invalid artifact paths remain refused; state-persistence failures must not be swallowed by the path-validation catch.

Standing crash/restart coverage retains all four cases: capture-started with its artifact, capture-done with ready, discovery-degraded with failed feed, and discovery-recovered with healthy feed. Each records one initial durable write, no initial sink call, the reconstructed matching event, successful handoff and an empty acknowledged outbox.

## C2 — Original saturation floor and truthful bounds

Retain the original reproduction: hold 50 pending sends, submit a 51st transient capture-started event, transition that operation to ready, age it beyond the ordinary lookback, reconstruct actual persisted state and replay. The started and done events must both survive and reach handoff; no current-status inference substitutes for retaining the transient event. Overflow is visible. Existing per-carrier outbox bound of eight, pending-send bound of 50 and replay-row bound of 25 remain enforced without silent event loss. Unsupported kinds and full durable backlogs retain truthful refusal/reporting.

## C3 — Actual immediate consumers and security

The canonical runner uses the changed atomic operation and acquisition interfaces. Focused runner/dispatch/chain evidence must consume those current bytes. The producer's snapshots continue through the actual alert sink, tenant-filtered host reader and API projection; finite kind vocabulary, ordinary/failure ceilings, digest deduplication and non-career staging behavior remain intact. Transport is injected for this source check and cannot establish real email or UI delivery.

Foreign tenant rows and invalid operation identities cannot be replayed into another tenant's feed. Persisted alert data projects accepted fields only; opaque URLs, control tokens and arbitrary private row fields do not leak. Current lane ownership is checked before durable mutations and handoff acknowledgement. Missing/failed channel results remain replayable; only accepted sink handoff results remove matching intent, preserving the sink's own durable channel retry obligations.

## C4 — Evidence and independent verdict

The matching ready-for-check cycle specifies exact changed paths, final SHA256 pins and attributable command/output, exit, counts and measured duration. The checker directly reviews changed source and immediate consumers, rechecks final bytes, and clearly separates broker-reused evidence from independently reproduced checks. Reuse the unchanged frozen-validator/registry command result only with its exact hashes and timing limits recorded. No duplicate suites, mutation, provider, browser, live channel or database work is authorized by this contract.

Scoped PASS requires complete C1–C3 current evidence plus the applicable validator. Missing evidence/prerequisites yield HOLD; a reproducible acceptance violation yields FAIL. No speculative or unexecuted RED result is evidence. No issue closure is implied without its own recorded corpus replay.

## Remaining whole-task gates

Full `goal-t038` remains HOLD pending actual approved-rule promotion/registration coverage, usable simultaneous tab recordings, real downstream/email/dashboard proof, independently verified Windows/Ubuntu supervision/recovery and seven actual elapsed unattended days. A scoped PASS here can close only this atomic outbox unit.
