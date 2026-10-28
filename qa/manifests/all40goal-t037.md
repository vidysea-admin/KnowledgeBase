# all40goal-t037 — operator-approved registration profile, scope and relevance

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 2
Task: T-037 (full task remains in_progress)
Priority tier: 3 — explicitly requested all-goal implementation; security/data-write extension, uncapped.
Contract: qa/contracts/goal-t037.md, C4/C5; existing join-rule contracts retained.
Checker: /root/docker_dependency_review/checker_t037
Packet: qa/packets/all40goal-t037.md

Scope: actual tenant-bound persisted profile/relevance/scope editor and API with explicit revision-based approval/revoke; candidate-bound T-052 config resolver that respects existing deny and opt-out state. Profile approval authorizes an attempt only. No approval implies registration success.

Changed tracked paths: apps/api/src/join-rules/deps.ts; apps/api/src/join-rules/router.ts; apps/web/src/pages/join-rules/JoinRulesPage.tsx; scripts/webinar/join-rules-host.ts.
New source/test paths: packages/meeting-bot/src/calendar/join-rules/registration-policy.ts; registration-policy-store.ts; registration-policy.test.ts; apps/api/src/join-rules/registration-policy-router.ts; apps/web/src/pages/join-rules/RegistrationPolicyPanel.tsx; RegistrationPolicyPanel.test.tsx; scripts/webinar/registration-policy-host.ts; registration-policy-host.test.ts.
Central-runtime-leased integration: apps/api/src/composition/integrations/capture-policy.ts and capture-policy.test.ts. Pure explicit LKB_JOIN_RULES_ENABLED=1 factory; root production call centrally owned. Cycle 1 moves the single canonical policy implementation to packages/ingest/src/join-policy/**. Eight bot rule/registration modules, platform.ts and the approved pure send-now identity hunk are compatibility exports; scripts host delegates to the same factory. API imports @lkb/ingest, with no scripts/bot indirection or dependency-rule exception. UI now exposes paired optional organization value/selector.

Historical cycle-0 evidence: sole-broker Node 10/10 exit 0 (9.285s), pure integration bridge 2/2 exit 0 (0.683s), and UI 37/37 exit 0 (13.370s, new panel 4 + existing page 33); source pins unchanged within each receipt. Evidence roots: qa/evidence/goal-t051checker-broker-t037-{node,capture-bridge,ui}.json and sibling raw logs. These precede the allowed-layer refactor/organization controls and do not establish current-cycle PASS. Current affected replay, dependency/type gates and independent verification are queued to sole broker; no local CPU grant. No live UI, provider submission or registration ran. Status remains in_progress; full contract remains authoritative, with no foundation PASS closure.

Remaining full-task gates: actual central API-host composition and T-052/T-038 consumer integration/evidence; live UI/authenticated operator approval and restart; genuine next distinct webinar no-click schedule and cross-source/recurring opt-out evidence; D-166/D-167 degradation evidence. This packet cannot close full T-037 by itself.

Cycle 2 adds only NEW packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.ts and its synthetic .test.ts under root's finite ordinary-feature lease. Pure per-candidate projection appends exact persisted sender/domain approval only after same-tick owner/document binding, validated primary or strictly unexpired last-valid context, authenticated due webinar and deny/opt-out evaluation. No consumer, everyWebinar default, candidate status or veto semantics changed. Six authored tests use actual legacy selector, saved approval/reload and distinct source; plus negative authority/source/deny/opt-out cases and the explicitly retained ISS-376 broad-admission counterexample. Tests have NOT run. Current packet has 37 controlled pins. Consumer lease and ISS-376 semantic disposition remain separate; no scoped or parent PASS asserted.
