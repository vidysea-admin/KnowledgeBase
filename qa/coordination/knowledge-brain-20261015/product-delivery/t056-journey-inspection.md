# T056 journey inspection — 2026-10-15

Read-only product inspection, roadmap priority tier 3. No source edits or tests/builds performed. No browser, provider, database or external operation.

Inspected AGENTS.md, skills/maker/SKILL.md, architecture, recent decision authority, TASKS.md T-056, qa/contracts/goal-t056.md, delivery-matrix.md and goal-t056 packet. Current PolicyAskPage, AnswerSources and AnswerReviewPage already expose inputs, suggestions/history, confidence disclosure, evidence/turn links, feedback and evidence review/regeneration. Existing test source exercises these paths; source presence is not executed evidence or parent acceptance.

Useful remaining navigation gap: AnswerReviewPage shows rebuild status text and directs users to find a generated answer manually in history. Approved candidates have no direct Open answer link. Existing /ask?run=ID restores only records in the latest100 tenant-bound history. GET /answer-history/:runId exists and safely uses authenticated tenant and publication/freshness guards, but returns query/reason/result without saved filter/class/display metadata. Faithful older-run restoration therefore needs a separately authorized API DTO extension, not just a new link.

Potential exact paths: apps/web/src/pages/answer-policy/AnswerReviewPage.tsx; existing apps/web/src/pages/answer-policy/PolicyAskPage.test.tsx. Robust older-run extension additionally needs PolicyAskPage.tsx, client.ts, apps/api/src/answer-policy/answer-workflow.ts and direct API test. No grant or source edit claimed.

Material remaining parent gates: current coherent broker validation, independent verdict, native transactional persistence/restart, real provider grounding, actual browser use and genuine human calibration. Do not manufacture these with fixture/source inspection.
