# Runtime token metadata: compact maker packet, cycle0

Root C:/Users/product/Desktop/KnowledgeBase. Manifest qa/manifests/review-runtime-usage.md. Base5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate5f409c1c9cc2c5bcc46ebb3d8ed2b2c33d1831479b9dc7354eca88279badb399 (broker scoped-pin digest, not commit). Both changed files NEW/untracked; exact pins in manifest and broker receipt. No prior unit review/charges known; do not infer actual zero from missing telemetry.

## Applicable clauses

User orchestration instructions: "Unknown usage/cost is never reported as measured success"; "Exclude wait time consistently; record shared suites separately"; checker-only persisted verdict; affected stage and immediate downstream evidence required. Canonical checker skill C:/Users/product/.agents/skills/checker/SKILL.md governs independent review, assess gates, exact-SHA evidence reuse and reserved completion. No existing qa/contracts clause specifically covers this NEW tool; direct current authorization below is the scoped acceptance, not a maker-authored ground-truth contract edit.

Root-authorized behavior:

1. Stream selected session_meta/token_count metadata from explicitly supplied session files; map agent_path/thread/parent identity. Never export message/tool bodies, credentials or full environment. Lifecycle task_started/task_complete/turn_aborted metadata determines known completeness.
2. Explicit unit/cycle/phase baseline/end snapshots. Distinct threads under canonical prefix aggregate children/retries once. Every reused/new thread needs baseline and end; missing/reset/inflight/partial/conflicting data means unknown, not zero.
3. Preserve input, cached input, cache-write input, output, reasoning output and total counters separately. Cache/reasoning subsets are not added again. Advisory actual_total_tokens means runtime total delta, never allocated output budget.
4. Explicit absolute workspace output only; resolve parent containment, refuse symlink target and existing file. No global helper/skill/enforcement changes.
5. Do not invent active time or dollars. Wall spans separate; explicit-file coverage cannot certify complete role ratios. This is prospective tooling, not proof of historical unit attribution or full workflow completion.

## Changed logic and consumers

scripts/qa/review-runtime-usage.mjs: readSession streams lines, filters event kinds before JSON parsing, allowlists identity/counters/lifecycle; snapshot filters exact canonical prefix and deduplicates thread IDs; phaseDelta validates scope identity and computes per-thread deltas with conservative unknown propagation; writeReceipt enforces resolved workspace parent and exclusive creation; main exposes snapshot/delta CLI with strict options. Built-in Node modules only. No current production caller; exported functions consumed by NEW test, future orchestrator/broker wiring remains root-owned after PASS. No auth/tenancy/data-store writes; sensitive local session metadata and explicit receipt filesystem writes are risk boundaries.

scripts/qa/review-runtime-usage.test.mjs: four synthetic public fixtures, temporary directories with cleanup. No real session histories consumed. First node reads persisted report JSON as immediate downstream consumer. Node runtime v24.19.0 supplied broker, no package dependency installation.

## Required checks and receipts

Broker executed `node --test scripts/qa/review-runtime-usage.test.mjs` under30second timeout: PASS4/4 own exit0,464.6155ms. Receipt qa/goal-vectorless-2026-10-15/verification-review-runtime-usage-four.json includes complete stdout/stderr locations, scoped source before/after hashes, exact runtime SHA/version, lock hash, safe environment fingerprint, and broker runner hash. No maker execution. Tests:

- metadata allowlist, deduplication, cumulative phase delta and downstream receipt
- reset, inflight, missing baseline and malformed tail are unknown
- prefix boundary excludes siblings; retries/children aggregate by thread identity
- explicit output refuses outside workspace and symlinked parent

Shared frozen verifier receipt qa/goal-vectorless-2026-10-15/verification-frozen-contracts-20261015T0914.json: check exact current verifier/registry pins before reuse; empty registry proves vacuity only. This tool does not change registry/validator.

Independent checker must review changed source and test consumer, authenticate four-test receipt, independently probe metadata-only privacy, unknown-count propagation and refused output path using a tiny independent PUBLIC fixture through sole /root/verification_broker (no parallel local execution). Do not audit full real-runtime history. Stop active phase while queued; resume only with receipt and new assess if phase transition. No mutation required by scoped direct acceptance; if introduced, timeout/backup/trap/cmp rules apply.

## Accounting and workflow handoff

Maker active seconds, attributable phase total tokens and dollars unknown/null; lifetime runtime counters alone cannot repair missing phase baseline. Broker4 suite is separate shared execution accounting. Explicit root finite actual-token exception: reviewer120seconds/200000 actual TOTAL input+output cap; prep40s/80000TOTAL,review50s/80000TOTAL,final30s/40000TOTAL. Output allocation<=3000 separate advisory, never compared against actual total. Earlier3000-total proposal not dispatched/no reviewer charges, demonstrably below fresh context floor~41000. Read actual metadata first/end across phases; do not invent missing attribution. Preserve all charges/unknowns. Canonical helper hardcoded800token finalization reserve cannot be reinterpreted as800output; if this prevents required finalization, checkpoint NEEDS_EXTRA_REVIEW and request exact finite helper-compatible approach without source/globalhelper edits. BOOTSTRAP_REVIEW ratios unverified. Initial assess input qa/evidence/review-runtime-usage/dispatch-input.json. Canonical helper assess before dispatch/each phase. Authoritative Verdict/Status/Cycle checked/Reviewed SHA match manifest and parser readback. Only independent checker writes qa/verdicts/review-runtime-usage.md.

After scoped PASS root will wire prospective snapshots into maker/checker phase dispatch; no claim that unused CLI alone fulfills user workflow. Future snapshots must bracket complete idle boundaries and enumerate all children/retries. In-flight or unbaselined phases remain unknown. Compare complete actual total-token maker/checker denominators, never allocation6000 against runtime total. Cost and active time require their own evidence.
