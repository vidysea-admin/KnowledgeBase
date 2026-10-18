# Maker manifest — source-delivery-registration-retry

**Goal task:** T-052
**Tier:** 3 — scoped continuation
**Fix cycle:** 1
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Root:** C:/Users/product/Desktop/KnowledgeBase
**Base observed:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
**Packet:** qa/packets/source-delivery-registration-retry.md
**Contract:** qa/contracts/goal-t052.md C1,C3,C4,C7,C11

Nine leased paths implement durable conservative pre-submit proof and changed-configuration recovery after current authorization. Exact pins: qa/coordination/knowledge-brain-20261015/source-delivery/t052-retry-pins.json. Source/test changes await sole broker evidence and independent checker; no ready or task completion claim. Scope excludes provider activation, shared schemas and live acceptance. Actual maker tokens, cost and active elapsed unknown.

## Close-out cycle 1 (lane w16-t052reg, base a9fac545; candidate = the commit carrying this manifest)
No source change in this cycle; checkpointed bytes were run for the first time. Final sha256: sb_join_register.py 1effe057e670e4a3e2ef5ea12998ec0c0dffa45cdf5ec640fb4963a3701176b1; test_sb_join_registration_redirect.py c6fd12661e09218f13ae7d2ee9f48db991a987a60518088ff418db9b4ec256b1; browser-joiner.ts 7ebbcaa532878a22776c90b410e575fb69b1ca9911eda74525be6fc8f0cc6b29; joiners.test.ts e702736ea88f31830fb77d5d34380b6c879de821b293a08ed6cff5d70e861353; registration-workflow.ts 6de9f34fd6edca460a9eb536c2970637ffda75ee92db61e0f458f1e9cd04fbf4; registration-workflow.test.ts 673bc59e4607af7650d1d70ba86e630973aaca4698b5aa8e8b0da60cc4c80cdf; auto-record-policy.ts 6c8512e461c8bea87d2dd9a63785e6f255a3b7d5cdf31203a050d2248d5f3408; schedule-state.ts 33d02b724ee3fad0a029e1d6d6fe6976fb7672d3cd49a438731330246d5fa3eb; schedule-state.test.ts 55d1637acb4dfb49175e3060e4fa0dac1f38e42bb68b0ada9dbd7c2be4a190cf.
Evidence (cwd packages/meeting-bot, CPU load ~100% from shared worker):
- registration-workflow.test.ts + state/schedule-state.test.ts: tests 31, pass 22, fail 9. The 9 failures are all `ERR_MODULE_NOT_FOUND: express` from apps/api/src/server.ts (native API tests in schedule-state.test.ts; lane has no apps/api node_modules): environment gap, not attributed. All 4 pre-submit/recovery tests in registration-workflow.test.ts pass ("proven pre-submit recovery...", "pre-submit recovery rechecks source and policy...", "persisted action_required cannot promote...", "registration attempt round-trips strictly...").
- Python (repo .venv, LKB_NODE set, no browser; fixtures read first: fake DOM under node, Stub driver): `pytest py/test_sb_join_registration_redirect.py -q` -> 16 passed in 154 s (includes test_retry_receipt_proves_only_exits_before_submit_entry).
- joiners.test.ts "registration child lifecycle": with the committed 2000 ms child timeout, 12 of 13 subtests timed out under load (node cold start 3-7 s; run twice, same result, recorded as timed out under load, not as logic failure). With a temporary copy at timeoutMs 40000 (copy deleted, not committed): 13/13 pass. The committed test is unchanged. "registration actual child timeout..." test launches the real browser and was NOT run.
- tsc --noEmit -p packages/meeting-bot: only 2 errors, both in files outside this unit (src/capture/native/windows-capture-clock.ts, src/capture/tiles/native-measurement.test.ts).
No filed issue is fixed (no ISS corpus). contracts/verify_contracts.py not run. Checker should re-run joiners lifecycle test when CPU is idle.
