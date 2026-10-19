# Verdict - w27-aitransport (ISS-CILINUX4-001, ISS-OLLAMAFIRST-001, ISS-OLLAMAFIRST-002)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 2c10f2861617fec0ce827523eca19a05f1a75c6a
Base: 4264418c (diff 4264418c..2c10f286 reviewed; HEAD equals candidate, worktree clean)

## Checks (all independent, node via codex runtime, each under timeout 600, exit codes captured to files)
- packages/ai src/vision/chain.test.ts: rc 0, 32/32 pass.
- apps/api src/ai-transport.test.ts: rc 0, 25/25 pass.
- scripts/webinar/vision/routed-vision.test.mjs: rc 0, 4/4 pass.
- tsc --noEmit packages/ai rc 0; apps/api rc 0.
- Mutation (own): VisionDemotion.order() made global (demoted backends sorted behind all others regardless of provider). Per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 600. KILLED by "demotion reorders only inside a provider group: a demoted ollama model is still tried before gemini" (the second failure, the ISS-VISIONFIX-002 linear-extractor timing test, is a load flake). Restored; cmp clean; git -c core.autocrlf=true hash-object = ceb308069ab70c7568a0d70c2b50daa895635332 = git rev-parse HEAD:packages/ai/src/vision/chain.ts.

## Verify items
1. Demotion: order() regroups by provider in first-seen order and reorders only inside each group, so no Gemini model can move ahead of Ollama; state is an in-memory WeakMap keyed by the backends array (per process, never persisted); demotion:false disables.
2. No leak: VisionNonJsonError has a fixed message; a SyntaxError from validate maps to it; the demotion log line carries provider/model only. Covered by the leak test. Note: non-SyntaxError exceptions thrown by a caller's validate are passed through unchanged (pre-existing, out of scope).
3. /proc parse: slices after lastIndexOf(")") + 2, state=rest[0], pgrp=rest[2]; the test covers comm with spaces and parens. Correct. Z/X members count as gone; ESRCH only is gone; EPERM stops and reports; no /proc falls back to kill-only.
4. Tests and tsc as above.

## D-015 replay
- ISS-CILINUX4-001: row records no reproduction (reasoned). Fake-driven coverage only; real Linux zombie behaviour unverified until Ubuntu CI.
- ISS-OLLAMAFIRST-001: 1/1 (bounded deadline + signal reaches every backend, abort stops later backends).
- ISS-OLLAMAFIRST-002: 1/2 replayed (prose "The user w..." in unit, no leak, glm demoted after one call). The live frame230.jpg case against real glm-5.3-flash is NOT replayed; no network.

## Ledger
- ISS-CILINUX4-001: MAY FLIP to verified for the code fix (note: needs Ubuntu CI confirmation of real zombies; compose init:true not done).
- ISS-OLLAMAFIRST-001: MAY FLIP.
- ISS-OLLAMAFIRST-002: STAYS OPEN (live case unreplayed).

Not verified: real Linux /proc zombie, live provider calls, lint-loc aggregate (maker reported 3 stages timed out under load). Budget helper (review_budget.py) not run (ship mode); ratios unverified.
ISSUES-WRITTEN: none
