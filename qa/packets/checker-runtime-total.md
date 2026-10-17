# Checker packet: runtime token accounting

Root: C:/Users/product/Desktop/KnowledgeBase
Unit: checker-runtime-total
Fix cycle: 4
Base SHA: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate SHA: fbfa445ede6fd9c82138f24743f8cd0ea4f2f3c82f5b98dc71123e5a8cdc24b2
Identity kind: broker SHA256 of ordered helper/test pins, not a Git commit. Include separately pinned skill amendment below. No product source or global skill/helper changed.

## Exact new scoped files and SHA256

- qa/coordination/checker-runtime-total-20261015/review_budget.py: 2b4fe0b118269ef5cd63aa520df86f65d7d9453be2fbc1898ca73ceab3599ef2
- qa/coordination/checker-runtime-total-20261015/test_review_budget.py: 155798c0edd741c44d16fa45e6034a8d867f6cd1c80ee136c86d307dffa8de0e
- qa/coordination/checker-runtime-total-20261015/SKILL.md: e49e54f86dcfc65faa75770ae226a1423e5843367e00840981ee59099cd18afd (cycle4 docs-only)

Canonical comparison helper: C:/Users/product/.agents/skills/checker/scripts/review_budget.py SHA256 36b1650cf7d65d0cb4416f558486df279a519c75d2dae44d3f64875d3dbef66e. Compare changed assess logic and its immediate assess CLI caller; reuse/preflight unchanged.

## Acceptance and risk boundaries

Explicit actual_total tokens mean runtime input plus output including cached input; maker/reviewers/debits/phase/bootstrap/escalation token-bearing objects require matching explicit units. Legacy allocation inputs remain supported but never verify actual-token efficiency. Never silently relabel 6000 legacy allocation debits as measured runtime totals. Unknowns remain null. Preserve all children/retries and conservative commensurate max(actual,debit); mixed-unit histories HOLD pending documented reconciliation. Output allocation remains separate and bounded, never observed usage. Actual-total completion reserve is configurable within cumulative existing budget; legacy reserve stays 30s/800. Required quality checks and independent PASS authority remain unchanged.

Known maker primary time/token denominators retain their individual 10% limits despite unknown optional cost or larger bootstrap values. Unknown primary denominators select finite bootstrap. Numeric ratio verification means known actual ratio, not successful projected allocation admission; exceeded/target_missed remain separate. No invented active time, cost or telemetry authentication. Helper cannot authenticate omitted ledger rows; independent evidence provenance still required.

## Evidence: retain failures and exact scope

All evidence below is relative to qa/goal-vectorless-2026-10-15/ unless noted:

- verification-staged-token-metric-ten.json: initial 7/10 pass, three fixture failures; retained.
- verification-staged-token-metric-eleven.json: ten passing cases and one escalation fixture error, exit1; retained.
- verification-token-metric-bootstrap-one.json: only repaired failed node rerun, pass1/1 exit0.
- token-metric-targeted-composite.json: exact old-test reconstruction authenticates sole cost None-to-10 fixture diff. Ten unchanged green cases plus one repaired replay; NOT a fabricated all-eleven green command.
- verification-token-metric-legacy-twenty.json: existing authoritative20 copied against staged helper, pass20. Exact prospective hash pin and single legacy ratio_verified True-to-False assertion amendment documented in qa/coordination/checker-runtime-total-20261015/broker-legacy/amendment.json. Unamended20 was NOT executed; no raw failure exists or is claimed.
- verification-token-metric-reserve-fourteen.json: existing reserve14 copied against staged helper, pass14 unchanged.

Receipt fingerprints: Python3.12.10 C:/Program Files/Python312/python.exe; executable SHA256 4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a; environment 536475920c6b56ea68847561b44e5b98ab84c903e1eeedcf66d0a42ef95d3277; lock 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd. Composite discloses cwd/import-root difference; both explicitly load same pinned sibling helper. Exact commands, own exits, times and raw stdout/stderr linked in receipts.

## Independent scope and finite allocation

Cycle4 is docs-only: staged skill amendment now requires checkpoint then immediate FINAL after a queued request/blocker, with no waiting loops. Helper/test bytes and all code evidence remain unchanged. Parent reactivates once receipt is ready and interrupts a still-running blocked checker. Historical checker actual input1004313 plus output2708 equals total1007021 (cached960256 is already included); inflight lower bound is retained. Initial400000-total cap was breached; interrupted checker has no verdict.

Root authorizes ONE fresh combined runtime-accounting integration checker covering this helper unit and telemetry parser cycle1, after both packets and five-parser GREEN exist. Fresh incremental cap500000 actual total/4000 output allocation/150 active seconds, review300000/2500/120 and protected final200000/1500/30. Preserve prior helper>=1007021 and telemetry614949 plus any later children/shared integration cost once; no measured10%claim. Canonical assessor remains honest legacy_unreserved with external actual-total ledger. This authorization supersedes the former400000 incremental review dispatch, never erases its overrun.

Load canonical checker skill explicitly. One batched minimal read of helper unified diff with context/changed functions, parser diff and actual sanitized fixture, two skill paragraphs, receipt metadata and current raw hashes. Verify unchanged-function byte/AST identity. Independently decide whether composite and amended20 evidence is reusable. No duplicated full baseline/candidate loads, reread loops, unrelated repository survey or broad tests.

Sole CPU/test executor is /root/verification_broker. Submit one exact script/spec/hash covering native metadata through actual_total accounting, primary-cost-null, mixed units, 41000 actual total vs800 output and reserve boundary behavior. After broker acceptance/blocker persist a checkpoint and emit FINAL immediately; no wait_agent/sleep/poll/repeated waiting updates. Parent measures at checkpoint and reactivates once receipt is ready. No local tests, provider/browser/DB/global writes.

Root finite BOOTSTRAP authorization: aggregate checker <=400000 actual runtime input+output tokens (cached input is a subset, not additive), <=3000 separately bounded output allocation, <=150 active seconds. Review phase <=250000 actual total /2200 output /120s; protected final phase <=150000 actual total /800 output /30s. Canonical assessor is invoked before dispatch using declared total-token numeric caps with completion_reserve:false; its legacy_unreserved report is honest. External ledger enforces these actual-total limits; uninstalled staged helper is not trusted as its own gate. Maker time/tokens/cost unknown: 10% ratios unverified. No prior independent checker rows/children for this unit; preserve any subsequently incurred charges across retries/children.

Record monotonic active intervals and explicit broker idle start/end; runtime actual token metadata per phase/children or null. Unknown usage cannot establish efficiency. Cap breach checkpoints HOLD/NEEDS_EXTRA_REVIEW and no automatic PASS. Do not invent active time or monetary cost. After actual broker receipt, do final same-byte hashes, write sole canonical verdict and parse/read back authoritative Verdict, Cycle checked and Reviewed SHA in one bounded phase. Only independent checker issues verdict; root controls dispatch finalization when telemetry known. No global installation authorized.

Maker usage: actual active time/tokens/cost unknown. Broker command durations are command observations only; all failed attempts remain separately attributable. Reviewer must not claim measured ratio success.
