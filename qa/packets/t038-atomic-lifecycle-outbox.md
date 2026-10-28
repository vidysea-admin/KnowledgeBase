# T038 atomic lifecycle outbox — cycle 1 READY packet

Root: C:/Users/product/Desktop/KnowledgeBase. Manifest: qa/manifests/t038-atomic-lifecycle-outbox.md, Fix cycle1, ready-for-check. Maker: /root/scheduler_maker, skills/maker/SKILL.md. Root owns fresh independent checker dispatch. Checker owns qa/verdicts/t038-atomic-lifecycle-outbox.md and contract qa/contracts/t038-atomic-lifecycle-outbox.md C1–C4. Tier3 approved roadmap integration; parent goal-t038 C1–C7 remains HOLD.

## Candidate and minimal delta

Base Git5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Current receipt candidate269105c4fba47a66ae9f513bb4a3a24ae2e062ccdf47236abfa2a957cea773f4 is ordered file-pin SHA256, NOT Git commit. Only resumed source edit is scripts/webinar/scheduler/pipeline.test.mjs. No product logic changed.

The original shutdown fixture raced two abort sources: its recording-log callback and an immediate schedulerWait abort. That cadence abort could stop the asynchronous pool capture before recording disposition, so the line99 queued/service-stopped/attempt0 assertion failed. Corrected cadence waits for a deferred resolved by actual recording-log abort. Existing zero-launch and queued/service-stopped/attempt0 assertions remain. Added assertions require the intended recording boundary occurred and durable operations equal returned operations. This is deterministic test sequencing, not a proven product bug.

Exact original full fixture snapshot qa/evidence/t038-shutdown-before.fixture.txt SHA3B565BB2F805F4C7E1A554D9ABF5366421031547DBDFE2EC845AF4E85CE7F07C matches old failed receipt pin. Union ledger qa/issues.SCHEDULERRESUME.jsonl ISS-SCHEDULERRESUME-001 retains literal reproduction. Current full command replay1/1 green; issue remains open until checker disposition. No standing assertion weakened.

## Source and immediate consumer pins

| File | Current SHA256 |
|---|---|
| scripts/webinar/scheduler/pipeline.test.mjs | 6E88142E85898D2FB1F5BB1AAA0B4362DBBC987317C23BBA1F40F5749E1B975A |
| scripts/webinar/run-pipeline.mjs | 0D3687D8453BA0C4FCD903624E9E1C4411B1D4FA8749BFE7D3C79EA91A50E7EF |
| scripts/webinar/scheduler/dispatch.mjs | A56750C2BBE76E34927D36A2E9847C20AC2280DA872D4CF715D0F1D78AD1F0BD |
| scripts/webinar/scheduler/lifecycle-alerts.mjs | 31309DBA926806A9AB4290641E64F2127DD1C68C8DB440664F8D2AB9D535FEF4 |
| scripts/webinar/scheduler/lifecycle-alerts.test.mjs | 4FAFCCD7618FE0C3124FA2EF5AF89747CE0A8D3DBA234F5AE1FB92E13780A9DE |
| scripts/webinar/scheduler/dispatch.test.mjs | 6C14DA63B9DEE177F91778F62555F91E1E142A092958A3DF0BA2798138D2B40F |
| scripts/webinar/scheduler/index-proof-chain.test.mjs | 5AA521860A8D3E9BE67C689B39798A5D9A8F9D7F6E4123A4B1C56ED0E05D2DD4 |

Immediate behavior: runner execute line156 refuses an aborted autonomous launch in its child microtask with SCHEDULER_STOPPED; closed rejection preserves that error; final failure throw reaches dispatch capture catch. Dispatch stores priorAttempts before awaits and maps SCHEDULER_STOPPED to queued/service-stopped with restored priorAttempts. Lifecycle helper atomic update prepares finite sanitized intent, saves once, then dispatches. Auth/tenant/ownership and durable writes are relevant security boundaries; none changed in resumed fixture correction. Review exact fixture delta and adjacent abort/dispatch logic; broader source sweep unnecessary.

## Actual verification, attributed to sole broker

Current mandatory literal reproduction, cwd root:

`C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx scripts/webinar/scheduler/pipeline.test.mjs scripts/webinar/scheduler/dispatch.test.mjs scripts/webinar/scheduler/index-proof-chain.test.mjs`

Receipt qa/goal-vectorless-2026-10-15/verification-t038-literal-floor-20261015T0811.json SHA6CBFB1BFF702801B1695FA265D64CCBDF1C46C0039F1ED1467117EB40D6F1ADB; same-stem stdout/spec. Actual UTC2026-10-15T07:58:51.35Z–07:59:02.76Z,11407.9428ms, exit0,15/15,0fail/cancel/skip/todo, no pinned-input drift. Full executable v24.19.0, lock/dependency/environment identity is in receipt. All15 are attributed broker execution, not independent reviewer reproduction. No15 repeat requested.

Preserved failed history: verification-t038-owed15-20261015T0723.json records14/15 exit1,63130.3362ms at original test bytes. Intermediate verification-t038-consumer-fix-20261015T0807.json records15 scheduler named PASS but one extra consumer collection failure, batchexit1,17500.1406ms under safe-test-runtime/register.mjs. That alternate batch is NOT whole-batch PASS or literal ledger replay. The subsequent current tsx receipt above supplies the missing literal floor.

Original helper11 cases, including51-event saturation and four durable first-write crashes, were independently checked in cycle0 verdict. Historical receipt qa/evidence/goal-t038-lifecycle-current-20261015T013043Z.receipt.json SHAE94E8C40F1F4574524827773D776898E081322D3EF24126B332C6A02D77E46EE records11/11 exit0,6605ms. Helper/test hashes still match; retain those previously checked criteria as historical scope. Do NOT claim a new exact-runtime reuse identity or newly reproduced11. No duplicate helper run authorized absent concrete changed dependency.

Validator historical qa/evidence/goal-t051checker-validator.json SHA53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB records python contracts/verify_contracts.py exit0, PASS by vacuity only. Current verifier1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3 and registryD31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940 match. No frozen stage coverage inferred.

## Review allocation and limits

Root-approved canonical assessment input qa/evidence/t038-cycle1-review-budget.json preserves cycle0 actualreviewer seconds/tokens null with conservative budget debit180s/6000tokens. Explicit root finite escalation cumulative360s/12000; nextchecker180s/6000. Canonical helper C:/Users/product/.agents/skills/checker/scripts/review_budget.py must assess before dispatch/material phases. Root dispatches fork_turns none. Actual maker/reviewer token usage and complete comparable makeractive unknown/null; ratios UNVERIFIED, never zero-reset. Initial resumed inspection lacked monotonic checkpoint. Observed wall checkpoints07:52:41.2256962Z inspection,07:53:34.4396230Z test/ledger freeze,07:54:16.1975696Z originalsnapshot confirmation do not prove active-time denominator.

No browser/provider/Mongo/live join/channel/host activation/mutation performed. Fullparent gates remain actual approved-rule/registration integration, overlapping usable captures, downstream/email/dashboard, separate Windows/Ubuntu supervision/recovery and seven actual days. Scoped PASS cannot close T038.
