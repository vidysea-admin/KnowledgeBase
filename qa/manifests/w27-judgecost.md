# w27-judgecost

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-judgecost (branch lane/w27-judgecost)
Base: 4264418c (origin/master)
Candidate: the single commit on the branch tip (SHA in the handback; a manifest cannot name its own commit)

## Issue
ISS-T040WIRE-001 (qa/issues.T040WIRE.jsonl): judgeMaxCostUsd wiring from indexSession to summarize/claims unasserted.

## Finding
Production code already behaves correctly: with judgeMaxCostUsd:0 the judge is never called. No change to indexing/session.ts. Pinning test only.

## Changed paths
- apps/api/src/indexing/session-tests/session-grounded-wire.test.ts (2 tests + 1 import)
- qa/manifests/w27-judgecost.md

## Behaviour
indexSession(strict, dropUnverified, noteJudge, judgeMaxCostUsd:0) rejects with "strict webinar index incomplete", the injected judge and the "note-judge" provider job are called 0 times, and no session_pages/claims/chunks/tree_index write is issued. Control test: same run without a cap calls the judge.

## Checks for the checker
- cd apps/api; node --test --import tsx src/indexing/session-tests/session-grounded-wire.test.ts  (11 pass, 0 fail)
- tsc --noEmit -p apps/api/tsconfig.json (exit 0)
- node scripts/lint-loc.mjs --all
- Mutations (D-020, per-mutation backup/trap, hash check == HEAD): drop judgeMaxCostUsd from the extractClaims options (M8): killed; drop it from summarizeSession options: killed. Post-run `git -c core.autocrlf=true hash-object` of session.ts equals HEAD blob eb65aee8.

## D-015
ISS-T040WIRE-001: 1/1 recorded reproduction (cap 0 -> judge never called) replayed. Left open: the issue's second point (summarize and claims each build their own JudgeContext, so the cap is per extraction, not per session) is a policy/design choice (document vs share one context); not decided here.
