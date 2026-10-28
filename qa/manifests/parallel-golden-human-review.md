# Parallel golden human review packet

Status: checked-PASS
**Handshake status:** checked-PASS
Fix cycle: 0

Mode: NORMAL, per Umesh approval relayed by root orchestrator; independent checker required.
Priority: tier 3 T-021/U0.10 acceptance preparation by direct user choice; held higher-tier queue work remains with existing owners.

## Scope
Own only new data/eval/golden-set-human-review.json and this manifest. Six recorded misses joined by exact id/question/expectedSessionId to golden-set.json, recall-report-vector.json and golden-set-sibling-semantic.json. Expected and best-rival current transcript excerpts carry file/turn SHA256, source offsets and literal text. All adjudication and approval fields remain unanswered.

## Preflight
Read qa/QUEUE.md and qa/.last-tick: stale historical loop state plus held enforcement gates. Root controls parallel coordination; no queue/tick/gate takeover. structure.config.json roots are packages/apps/workers/scripts/schema; data/eval and qa/manifests lie outside scoped directory/LOC budgets. Neither owned path previously existed. No capped diagnostic code rerun.

## Builder evidence
Command: bounded Node24 stdin construction plus read-back assertion, using C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/cua_node/bin/node.exe (no persistent generator).
PASS cases6/6; joins18/18; literal-excerpts20/20; source-bindings12/12; all human fields null/unreviewed; bytes52373; SHA256 44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e.
Assertions require exactly six unique recorded misses, exact three-way joins, all negative historical margins, missing expected session in recorded top5, exact current source hash/turn metadata/text offset binding, and unanswered human fields. Historical scores are copied, not recalculated or bound as scores of current transcripts.
Follow-up command: same absolute Node executable with stdin assertions for unique miss ids, humanGate fields and excerpt metadata/offsets. Output: PASS unique-misses6/6; gate-fields6/6 unanswered; excerpt-metadata20/20; offsets valid. Exit0.

## Limits
Builder-selected candidate excerpts are incomplete; they establish no answerability or unique gold label. Full hashed local transcripts must be inspected before excluding alternative answers. Baseline is historical vector0.935 with question-blind control0.217. No provider, model, database, browser, test suite, pipeline, gold, threshold, QA contract, ledger, TASKS, DECISIONS, Ask/index/upload runtime, commit or push changes.
Independent checker PASS and downstream packet consumption verified in qa/verdicts/parallel-golden-human-review.md, Cycle checked: 0 matching Fix cycle: 0. Close-out read verified exact packet SHA256 44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e matching the verdict. All human fields remain unanswered. Full T-021/U0.10/U2.2 acceptance remains outstanding; this closes only the bounded review packet.
