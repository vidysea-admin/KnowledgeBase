# Manifest — t052-registration-acquisition
**Contract:** qa/contracts/gmail-meeting-candidates-approval.md
**Goal task:** T-052
**Fix cycle:** 1 of max 3
**Date:** 2026-10-05

## Plan approval
Independent release_gate_plan APPROVE for existing scanner interfaces/fetchOne and tests, including direct body/snippet precedence amendment. No canonical schema or storage changes.

## Change and evidence
Scanner exposes literal body registrationUrl and optional validated threadId. Direct joins from body then snippet outrank non-registration generic platform matches. Registration-only classification considers both sources. New snippet-priority regression first failed (Zoho selected instead of Zoom), then passed after in-place repair. Empty/non-string/oversized thread identifiers reject sanitized discovery.
Actual node --test --import tsx apps/api/src/gws-gmail.test.ts apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/auto-join.test.ts: 67 tests,67 pass,0 fail.
Direct API compiler exits0, no diagnostics. LOC exits1 with four existing unrelated violations; Gmail source remains within300.

## Scope limits
Scanner-only evidence is NOT persisted: existing store whitelist unchanged. No external request, registration submission, confirmation correlation, capture, deployment or production write. T-052 remains pending; full registration acceptance requires durable correlation and real supported organizer proof.

**Handshake status:** checked-PASS