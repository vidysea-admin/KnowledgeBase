# T057 setup journey survey

2026-10-15; read-only source survey. No implementation lease yet, tests/builds not run.

Concrete gaps: SetupWizardPage snapshots are keyed only by apiKey/generation; AuthContext.sessionVersion exists but is not consumed. A same-key reauthentication can retain an earlier login's checklist and in-flight snapshot. The setup model also asserts missing Gemini means transcription/summaries/embeddings unavailable, although current product routing is vectorless and supports multiple providers. The existing booleans-only setup producer cannot prove runtime/model readiness.

Proposed exclusive source paths: apps/web/src/pages/setup-wizard/SetupWizardPage.tsx; setupModel.ts; SetupWizardPage.test.tsx. Preserve all four existing read endpoints and API shapes; add current-login snapshot ownership, honest optional integration wording and explicit unknown runtime readiness. Do not claim a configured integration proves working models. No central composition or schema changes.

Ground truth: qa/contracts/goal-t057.md C6 (auth generation), E4 scope and truthful states; apps/web/src/auth/AuthContext.tsx; apps/api/src/activity-health/setup-status.ts. Prior seam verdict: qa/verdicts/t057-e4-setup-wizard.md (one PASS; optional-Gemini limitation explicitly noted).

Broker checks proposed: focused SetupWizardPage.test.tsx including deferred old/new login responses, same-key login reset, logout and refresh ownership; affected web typecheck. Actual mounted browser, live provider readiness and whole-task acceptance remain separate unproven gates.
