# Independent verdict — goal-t059

VERDICT: FAIL

Cycle checked: 0

**Scoped cycle-0 source result: FAIL. Whole T-059 / D8 remains HOLD.** A newer repair candidate is not certified by this verdict.

## Proven violation and recorded corpus

**ISS-T059REPLAY-001 — HIGH / data-write**, filed in the explicitly authorized unique shard `qa/issues.T059REPLAY.jsonl`. Contract `qa/contracts/goal-t059.md` S5 requires durable idempotent requests without overwriting newer accepted progress; S10 preserves distinct historical child evaluations.

Actual independent reproduction: open the stored loss; accept retest request `first`; accept retest request `second`; replay exact request `first`. The replay returns the correct historical first child, but mutates `head.flywheel.lastRetestId` from the newer second child back to the older first child. Expected current head: `eval-retest-c7c0c0fed45d145e86b0e09a2665c7c07bc7a4e0cbac46f22e30509d9df99f1b`. Actual regressed head: `eval-retest-5f4ad2fb96a1e8d2680aef8ecb63a4218144703dd0b6782f0d51fe2766b4be1f`.

Root cause in checked `apps/api/src/evaluation-flywheel/workflow.ts`: line102 returns an existing child only when it already equals the latest head. A valid older child instead passes through lease acquisition, index assignment and child reuse, then line172 assigns that historical `childId` into the current head. Returning old history does not require changing the newer operational head.

**Actual RED corpus: ISS-T059REPLAY-001, 1/1 reproduced; 0/1 fixed in cycle0.** No unexecuted case is counted. Exact full independent probe bytes/argv, observed IDs, source pins, timeout and evidence are embedded in the shard and copied to `qa/evidence/goal-t059-checker-issue-request.json`; the frozen script is `qa/evidence/goal-t059-checker-probe.ts` SHA256 `b056b465a89ff02725a04cc1b79213be8bd67cffab104619fd3b02d9c7d82e59`. Maker cycle1 must rerun this original floor verbatim, preserve the existing interrupted-after-child-write recovery and nearby sixteen-test regression scope, and additionally verify historical retries do not alter head/revision/lock or process intake/index/Ask again. Added tests cannot replace the recorded floor.

## Independently derived behavioral evidence, broker executed

The sole authorized `/root/docker_checker` executed the checker-authored probes centrally, not a maker-authored substitute. This checker directly reviewed their receipts/output and pinned source. No duplicate reproduction was run after the proven failure.

| Command and scope | Actual result |
|---|---|
| Bundled Node `--import tsx qa/evidence/goal-t059-checker-probe.ts --isolated`, repository cwd, outer40000ms | Exit1, 2488.129ms; 2026-10-14T21:15:03.697Z–21:15:06.191Z; assertion77 specifically proves historical head regression. No timeout/signal/error. Earlier sequential factory/no-construction-side-effect and completed-child original/source-drift assertions were reached without throwing; this is not reported as a numbered passing suite. No mounted HTTP code executed. |
| `.venv/Scripts/python.exe qa/evidence/goal-t059-checker-rows.py`, repository cwd, outer10000ms | Exit0, 429.0843ms; 21:15:10.293Z–21:15:10.729Z. Actual broker-produced original/gap/child validate **3/3** against current canonical schemas; malformed fingerprint/comparison refuse **2/2**; exact question, original score and parent/gap lineage agree. No semantic improvement or human approval is inferred. |

Receipts/stdout/stderr: `qa/evidence/goal-t051checker-broker-t059-independent-isolated.json` and matching `.stdout.txt`/`.stderr.txt`; `qa/evidence/goal-t051checker-broker-t059-independent-rows.json` and matching outputs. Each receipt records full executable path/argv/cwd, deadlines, timestamps, measured durations and **all18 expanded before/after pins unchanged**. Important tested workflow hash: `21696e4ef656c25263935ed085afc4d9bb7f1b31f75923456543b31af07132b4`. This FAIL belongs to those cycle0 bytes; it does not certify subsequently repaired files.

## Source review, earlier evidence and current-caller limit

Reviewed full new production logic, store/receipt/Ask boundaries, canonical types/schemas, source fixtures and immediate callers/consumers. Existing stored finite-loss policy, immutable snapshot, tenant tuple IDs, scoped collections/CAS, transcript receipt, actual index/output digests, request-bound hydration, internal unscored children and safe error projection are substantive foundations. The proven historical replay write violates their stated idempotency boundary despite the original sixteen green tests.

Reused attributed maker/broker evidence:

- `qa/evidence/goal-t051checker-broker-t059-tests.json` SHA256 `1de82bfddbd40810ef22af74d8addf1010007149dfc0de980bfa40c8664d7f7f`: `C:\Program Files\nodejs\node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/evaluation-flywheel/workflow.test.ts apps/api/src/evaluation-flywheel/router.test.ts apps/api/src/evaluation-flywheel/composition.test.ts`, cwd repository, outer120000ms, exit0, **16/16 PASS**, zero skipped/cancelled/todo; 20:16:16.977Z–20:16:24.167Z, wall7184.8055ms/TAP7055.2434ms. Source/schema/generated/factory fifteen pins remained unchanged before independent execution. The actual offline intake→strict grounded indexSession→production bounded Ask fixture checks exact session/turn/speaker/time/quote. Its model/embedding replies are explicitly fixtures.
- Root API typecheck `qa/goal-2026-10-14/api-types-receipt.json`: bundled Node→bundled pnpm `--filter @lkb/api typecheck`, exit0, 14239ms, no stderr. Exact start/end unknown; no current-caller typecheck is invented from mtime.
- Root `.venv/Scripts/python.exe schema/validate.py` receipt `qa/goal-2026-10-14/schema-receipt.json`: exit0, 1912ms, existing43-schema valid/invalid fixtures; distinct from independently validated produced rows above.
- Root `C:\Program Files\nodejs\node.exe scripts/gen-types.mjs` receipt `qa/goal-2026-10-14/generate-receipt.json`: exit0,733ms,43collections/18files. Generation-only is not a drift `--check` receipt.
- Reused `qa/evidence/goal-t051checker-validator.json`: `python contracts/verify_contracts.py`, exit0, **PASS by vacuity**, no frozen contracts. Script hash `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3` and registry `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940` independently matched. Individual duration unknown; combined recorded batch1.4327147s. No duplicate validator was run.

READY manifest SHA256 `3601729d8d2afdef72420b3056088708140c30677cffc96c06e97806dcae961d`, packet `8e492eb264e5ff0e22dcfa3c55b9f12b8fbac822e917bfc11c44d0375894046c`, contract `aa2cbf36698158f5a92dad3386ad9a8c41e0b31420f38f27968c5e11c17ae1bd`. Shared server/brain hashes matched the packet; production/integrated routes differed on resume and the mountedHTTP probe was explicitly deferred until ROUTE_FREEZE. Root must provide frozen current caller pins and current boundary receipts for eventual source acceptance. No moving/shared candidate is passed by the historical runtime evidence. The earlier evidence-only HOLD is preserved byte-for-byte in `qa/evidence/goal-t059-checker-prior-hold.md` with its original completion receipt.

## Timing and remaining gates

Initial independent check launch20:37:37Z; prepared probe confirmation20:39:50Z; explicit human-pause resumption/pin check20:50:46Z. Exact human-pause boundaries and individual review subphase timestamps were not measured. Earlier HOLD persisted21:06:43.2210716Z with measured1746.2210716s including pause/waits, not active CPU. Broker independent commands ran at the exact21:15 timestamps above. Failure receipt review resumed21:15:41Z; FAIL persistence confirmation and final measured total are in `qa/evidence/goal-t059-checker-fail-completion.json`. The120–180s efficiency target was exceeded by human steering/serialized evidence and is not an acceptance waiver. No child CPU grant or approval escalation occurred: sole broker ran the exact preserved probe centrally.

Whole-task T059 remains **HOLD** for actual T022 thirty genuine human scores/live calibrated judge, T043 live indexed-session/cited Ask, and L1–L5 actual loss→capture→index→retest→new judgment/interrupted live recovery. Capture receipt and unscored fixture answers never establish a solved loss, calibrated approval or win. Deadline leases do not cancel external work or fence unrelated indexers. No provider/browser/realDB/fullsuite/production write occurred. No source or parent PASS is claimed.

ISSUES-WRITTEN: ISS-T059REPLAY-001 (`qa/issues.T059REPLAY.jsonl`, explicitly authorized unique high data-write shard)

EXPLANATION: Actual unchanged-candidate independent evidence proves S5/S10 historical replay regression. The canonical-schema row proof is separately green; earlier16 green tests did not exercise this ordering. Maker/root were notified before repair. Only root's central owner appends verbatim feedback; this checker wrote no canonical issue IDs or feedback inbox. Cycle1 needs the exact floor and affected regressions on frozen repaired bytes, followed by current mounted/caller evidence. No matching PASS means no maker close-out.
