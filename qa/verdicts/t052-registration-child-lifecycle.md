# Independent verdict — t052-registration-child-lifecycle

VERDICT: PASS
Cycle checked: 1
Scope: Amendment 5 CL1–CL4 and CLI1 of qa/contracts/gmail-meeting-candidates-approval.md; Node registration terminal-result and bounded exact-profile cleanup boundary only.

The result is accepted after clean successful child termination with one valid event. Failed termination, fatal events, duplicate/malformed protocol and missing results cannot retain earlier submitted stdout. Independent real controlled children proved exact cleanup invocation and sanitized uncertainty. Clean submitted, uncertain, action_required and ordinary progress cases remain supported.

ISS-379: **7/7 original unsafe cases handled; clean positive 1/1 retained.** The exact ledger command was rerun unchanged: nonzero, SIGTERM, fatal, duplicate, malformed, missing and cleanup-fails. No recorded case was omitted. Nine Node results include the parent test. Independent additional corpus: **16/16 real controlled-child cases**, including fatal-before/fatal-after, conflicting results, invalid events before/after valid results, overflow and timeout.

## Commands and evidence

- Independent command from root: `node --test --import tsx --test-concurrency=1 --test-timeout=15000 --test-name-pattern='registration child lifecycle' packages/meeting-bot/src/joiners/joiners.test.ts`. Exit 0; tests 9/pass 9/fail 0/skip 0; runner 2044.0589ms, tool wall 2.5350721s. Output: qa/evidence/registration-child-checker-original-replay.txt.
- Independent command from apps/web: `node node_modules/vitest/vitest.mjs run --config ../../data/registration-checker-vitest.config.mjs`. Exit 0; one framework test/pass 1/fail 0, actual child corpus 16/16; runner 5.62s, tool wall 6.8351747s. 15-second test timeout, maxWorkers 1/fileParallelism false. Output: qa/evidence/registration-child-checker-probe.txt. Fixtures and wrapper: data/registration-checker-probe.mjs, data/registration-checker-probe.test.mjs, data/registration-checker-vitest.config.mjs. All use real Node children, never mocked child events or a browser. Each cleanup receipt proves exact about:blank/profile/title/stop-file/cleanup-only argv.
- Initial framework setup attempt from root, `node node_modules/vitest/vitest.mjs run --config data/registration-checker-vitest.config.mjs`, exited 1 (tool wall 0.5083484s): root Vitest entry absent. Corrected to installed apps/web runner. First corrected attempt exited 1 (tool wall 1.6693338s): createRequire selected Vitest's unsupported CommonJS export. The final narrow config uses the standard globals API and passes. Setup outputs: qa/evidence/registration-child-checker-setup1.txt and registration-child-checker-setup2.txt. Neither failure exercised or changed product source.
- Attributed immutable maker downstream evidence reused, not claimed independently rerun: `node --test --import tsx --test-concurrency=1 --test-timeout=15000 --test-name-pattern='registration saves submitting|registration persistence rejection' scripts/webinar/run-pipeline.test.mjs`. Exit 0; 2/2 pass, zero skip; 3115.2039ms. Four result branches and interrupted restart show persisted submitting before execution, uncertain failures and no resubmission; failed persistence launches nothing. Command/count/duration provenance is the cycle-1 manifest/packet; raw downstream stdout was tool-transcript-only. Relevant unchanged consumer/test hashes independently match. I directly reviewed the actual runWebinarRegistrations state transition and runner call site.
- Attributed immutable integration verifier receipt reused: `./.venv/Scripts/python.exe contracts/verify_contracts.py --repo-root C:/Users/product/Desktop/KnowledgeBase`. Exit 0, 0.133968s; qa/evidence/execution-wave1-integration-validator.receipt.json and .stdout.txt. Verifier and contracts.json hashes match below. Output explicitly says no frozen contracts and PASS by vacuity; this is not feature acceptance.

## Checked bytes and review

Initial pins matched at 2026-10-14T09:21:07.2989758Z; final relevant pins rechecked at 09:31:44.6970116Z, unchanged:

- packages/meeting-bot/src/joiners/browser-joiner.ts: 9DA7B3B23C30D3F8CF1CCE400C448517014F2DF2C3BECB34963AE71D3DB19F8D
- packages/meeting-bot/src/joiners/joiners.test.ts: 9B0DFA6FD29B8C0539A1F4D68DE25503437BD949604EAA4D3C7FAE25A26362C7
- qa/contracts/gmail-meeting-candidates-approval.md: 6ED2B9F05CB5FE41BCF0C49E68AB0E240C0A01D43A43BE72BA86150EBA480909
- packages/meeting-bot/src/calendar/auto-record-policy.ts: B7CAD72276E4D10FB2813A9FA9537C41163B2539A8DBA37C25905E5FE1BABEB3
- scripts/webinar/run-pipeline.test.mjs: 2B2D0549E6FD1E6AEBD2175DC3EC1EFCEEE840E142F32089FC1EF5852C58F300
- contracts/verify_contracts.py: 1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3
- contracts/contracts.json: D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940

Reviewed the complete changed logic/test diff against base HEAD 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd and relevant existing validation/abort code, Python's result-inside-context/fatal-exception producer, actual durable consumer and runner call site. Cleanup retains existing 5-second close observation and 20-second execFile limits, fixed configured profile, 65536 output bounds, stdin privacy, discarded stderr, and single settlement. No global process enumeration or broad termination was added.

## Timing and limits

Frozen-READY check launch/scope read began at 2026-10-14T09:21:07.2989758Z. Preparatory work and waiting before READY began about 08:37 and are separate from execution. Review checkpoints: second scope/diff/hash read at 09:22:07.7516565Z; final producer/caller excerpt read completed by 09:32:03.6357553Z. Review intervals between checkpoints are unmeasured. Runtime coordinator held this check in the light queue until GO, then the first setup attempt had completed by the 09:29:37.7460226Z checkpoint. Exact queue entry/GO timestamps are unknown; do not infer queue duration by subtraction.

Saved approvals were reused; no new user approval wait was observed. Command starts other than framework stdout timestamps are unmeasured. Final successful Vitest stdout start: 09:30:43 UTC (second precision); duration 5.62s. The original replay followed serially; exact start/end timestamp unknown, measured wall duration above. Slot released after both passed. Persisted verdict completion timestamp, confirmed file presence and total launch-to-verdict elapsed are recorded in qa/evidence/registration-child-checker-timing.json from actual filesystem/time observations. Draft interval is not measured. The 120–180-second efficiency target was exceeded because of the observed resource queue and two framework setup corrections; acceptance was not reduced.

Whole T-052 remains in progress: real organizer configuration/submission and confirmation, actual Mongo durability, full browser ownership/OS containment, custom-JS forms, deployed restart, capture/index/Ask and Ubuntu proof remain separate. No browser/provider/database/production action, source mutation or broad suite occurred. Final-source package typecheck remains an integrated verification gate; no claim is made from the earlier integration typecheck receipt.

ISSUES-WRITTEN: none by this checker. Canonical writer filed ISS-379; this PASS supports its scoped verified transition.
EXPLANATION: Independent checks found no further acceptance violation. This is a scoped source boundary PASS, not full registration or release acceptance. Maker may close only this matching cycle with unchanged pins.
