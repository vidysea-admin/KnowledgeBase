# Evaluation recovery UI delivery

Scope: T-059 source operator UI only; parent and all outstanding live/human gates remain HOLD.

New leased files:
- `apps/web/src/pages/operations/EvaluationFlywheelPanel.tsx`
- `apps/web/src/pages/operations/EvaluationFlywheelPanel.test.tsx`

The panel inspects durable loss lineage, saved source status and independent recovery stage, revision, captured session, child identity, last failure and lease. Explicit actions record the eligible loss gap or capture a permitted source/retest with a stable caller request ID. No mount-time fetch or write occurs. It displays retained citations/refusal text and internal score history without converting it into review approval, calibrated improvement or resolved loss. Source request inputs stay in memory only. Errors display safe generic messages. Credential changes clear evidence and invalidate late replies; returned child gap/question must match the selected saved head.

Model/client and narrow OperationsPage mounting are owned by operations_delivery, using existing authenticated APIs and preserving isolated database guards. No API/schema/runtime/config changes are made by this worker. No browser, network, secret or live database access occurred.

Eight authored component tests cover receipt/failure distinction, explicit stable-request retest, safe unavailable handling, credential-change stale replies, retained internal score with failed follow-up read, foreign-gap child refusal, same-turn duplicate write events, and inspected explicit same-ID retry after an uncertain failure. A synchronous in-flight guard blocks duplicate dispatch before React rerenders. Tests and builds NOT RUN: central broker owns CPU lease. Required verification: component/model tests, existing OperationsPage/integration tests, targeted web typecheck, contract/downstream gates through parent checker.

No PASS or completion claimed. Maker usage/cost unknown. Repo-local `skills/maker/SKILL.md` loaded after coordinator supplied the correct path; operations_delivery owns the combined maker/checker packet and workflow. Component tests isolate interaction/race behavior through model client mocks; operations_delivery's model tests exercise the real API wrappers and response validation. Broker must check both together plus mounted Operations consumers.
