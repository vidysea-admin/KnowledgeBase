# Manifest — t052-registration-persistence
**Contract:** qa/contracts/gmail-meeting-candidates-approval.md
**Goal task:** T-052
**Fix cycle:** 1 of max 3
**Date:** 2026-10-05
## Authorization and plan
D-075 appended before schema edit; independent release_gate_plan APPROVE. Existing schema fields/types, store factory whitelist/injection and route regression only.
## Evidence
node --test --import tsx apps/api/src/gws-gmail.test.ts apps/api/src/routes/meeting-candidates.test.ts:35/35 pass.
python schema/validate.py:27 collections PASS,exit0.
Direct API compiler exit0 after restoring last-good alert re-export removed by generator. Initial generated check0 preceded discovery of this regression; current full generator parity NOT claimed. D-076 approved existing generator repair now implemented: alerts export discovery plus import-safe indexFile, existing lint regression. Generation twice wrote0files; --check0; lint18/18.
LOC:four existing unrelated violations,no new file violation.
## Remaining
Both whitelist-field removal mutations independently rejected under30s process timeout; finally byte restoration exact. Independent checker cycle1 PASS3/3criteria2/2invariants on disk; HTTP/schema/whitelist probes pass,68downstream22lint/snapshot/schema27/APIcore/generator parity independently reproduced. Root additionally9/9thread-schema boundary probes pass. No actual DB write, registration submission,confirmation or release completion. T-052 stays pending.
**Handshake status:** checked-PASS