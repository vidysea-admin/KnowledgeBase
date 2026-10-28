# Full parent acceptance — T-037 auto-join rules, approval and opt-out

Checker-owned full-task contract. Maker must not edit this file. Exclusive checker
lease granted by root through docker_dependency_review on 2026-10-14. This contract
does not authorize changes to frozen contracts, enforcement paths or production.

## Authoritative acceptance sources

- Current user attachment: `C:/Users/product/.codex/attachments/db7dce52-5317-4ddc-acf6-e3965405c3ab/pasted-text-1.txt`.
  T-037 is auto-join rules, approval and opt-out within the complete operational
  discovery/rules/capture-to-answer flow. A task closes only when its full acceptance
  criteria pass; a foundation or screen is insufficient. Actual output must be
  checked independently and consumed by the next stage.
- `TASKS.md`, T-037; `.goal/goal.json`, T-037: sender/domain/platform rules,
  approve-once and opt-out; relevance rules and approved operator registration
  profile/scope. Approval does not prove registration success.
- `docs/meeting-bot-roadmap.md`, P3 T-037: editable sender/domain/platform and
  internal/external rules, approve once to trust, opt out per meeting; a trusted
  sender's next webinar is scheduled with no click.
- `docs/DECISIONS.md`, D-165, D-166 and explicit confirmation D-167: career
  counselling/guidance priority; other webinars staged as tests; authorized
  automatic discovery/joining; last-valid policy and email/dashboard degradation.
- Historical full-goal reconciliation: `C:/Users/product/.codex/attachments/5b9890de-27a1-4700-9e7e-7f04f6050b5c/goal-objective.md`.
- Existing scoped contracts remain binding at their affected seams, including
  `t037-auto-join-rules-engine.md`, `t037-join-rules-persistence.md`,
  `t037-join-rules-edit-api.md`, `t037-join-rules-api-host.md`,
  `t037-join-rules-editor-page.md`, `t037-join-rules-veto-select.md` and
  `t037-last-valid.md`. Historical enable-precondition descriptions must be
  reconciled with later approved decisions and demonstrated current behavior.

## Required full-task criteria

1. **Editable usable rules.** The real authenticated API and web page load, edit,
   save and reload sender/domain/platform, internal/external and relevance rules.
   Operator-visible matching and reasons agree with the active deployment policy.
   Career counselling/guidance priority and staging of other test webinars reach
   the actual scheduling consumer. A page or uncalled evaluator is insufficient.
2. **Approve once and retain controls.** A deliberate confirmed operator approval
   persists the intended sender/domain trust in the authenticated tenant. Subsequent
   edits and restarts preserve approvals, deny rules and opt-outs. A trusted sender's
   next genuinely distinct eligible webinar reaches the actual scheduler without
   a new click; demonstrate its selected identity and persisted scheduling outcome.
3. **Opt-out actually prevents joining.** Confirmed opt-out and removal operate on
   real saved state and the running scheduler. Opt-out/deny takes precedence over
   trust and relevance approval, with honest visible skip reasons. Demonstrate the
   same meeting arriving through Calendar/Gmail identities, with one source absent,
   and recurring-instance/shared-room behavior. Remaining id-only/cross-source,
   series-id and ISS-376 sender-policy exceptions require explicit Approver
   disposition; do not silently treat prior scoped PASSes as closing these gates.
4. **Approved registration profile/scope.** Persist and expose an operator-approved
   registration profile and allowed scope consumed by the T-052 registration path.
   Require server-derived tenant, appropriate write permission, explicit approval
   and validated profile/scope/relevance content. Missing approval, foreign tenant,
   malformed or stale state cannot authorize registration. Changes cannot bypass
   the approval boundary. Profile/credential contents do not leak to logs or other
   tenants. Scope bounds supported hosts/forms/fields; it does not imply successful
   registration. T-052 independently owns submit/confirmation-success evidence.
5. **Real auth and durable writes.** Demonstrate no-key/read-only/write-authorized
   behavior and two-tenant isolation through actual mounted routes and persistence.
   Client-supplied tenant hints cannot widen reads/writes. Safe concurrency/CAS and
   lock/restart behavior preserve complete documents without lost approvals or
   opt-outs; scheduler reads cannot repair or overwrite authoritative rules.
   Applicable hostile-input and issue-recorded reproductions remain required.
6. **Last-valid matches D-166/D-167.** The real tick verifies current configured
   tenant equals the actual key's tenant through the authenticated least-privilege
   signal before any primary/cache use. Only an actually present complete validated
   primary refreshes the full tenant-bound integrity-checked snapshot. Primary
   failure can use it only for `0 <= age < 3600000 ms`; fallback/restart does not
   renew expiry. Missing, expired, future, corrupt, invalid or foreign state refuses
   selected joins. Cached deny/opt-out remains effective and cannot resurrect
   cancelled, rejected, unregistered or otherwise ineligible candidates.
7. **Delivered degradation and truthful UI.** A real primary failure immediately
   records durable dashboard degradation and attempts authorized email delivery.
   Capture successful delivery or visible delivery failure accurately; ordinary
   rate caps do not suppress initial degradation. New expiry/refusal stays visible.
   Recovery clears degradation only after successful current primary validation,
   evaluation and snapshot persistence. Enabled flags, UI copy and actual tick
   behavior agree. Callback/fake-transport tests alone cannot prove this criterion.
8. **Live host and immediate downstream proof.** On an authorized nonproduction
   tenant/host, demonstrate real edit/approval persistence, real authenticated
   discovery-to-poller consumption, no-click trusted-next-webinar scheduling,
   opt-out/deny refusal, broken primary fallback and expiry/refusal, wrong tenant
   and insufficient-scope refusal. Show actual scheduler output consumed by the
   capture dispatch boundary without error, with the same meeting identity and
   tenant. Registration-required inputs obey T-052 approval/confirmation gates.
   Dry-run/fake API/pure helper proof may supplement, never replace this evidence.
9. **Independent reproducible acceptance.** Submit a cycle-bound maker manifest
   and packet with changed-call-site map, final candidate hashes, exact commands,
   fixture/host identity, timestamps, exit codes, counts and evidence locations.
   Independently verify affected stage and immediate consumer; run applicable
   `contracts/verify_contracts.py`, focused typechecks and meaningful security
   boundaries under a root CPU lease. Re-run claimed fixed issues' own recorded
   reproductions from the union of lane ledgers; report counts by issue id and
   name omissions. Mutation runs require timeout, byte backup, restoration on
   timeout/interrupt/error and byte comparison. Recheck hashes before verdict.

## Verdict boundary

Full-parent PASS requires all nine criteria with actual end-to-end/live/host/security
evidence as applicable. Foundations, individual scoped PASSes, mounted screens,
green fixture suites or approvals alone do not close T-037. Missing packet, CPU
lease, authorized live host/access or required proof yields HOLD; a demonstrated
acceptance violation yields FAIL. Only checker can PASS, and only the matching
parent manifest can be closed afterward. T-038 observation-period, T-052 complete
registration and T-051 full release/Ubuntu acceptance retain their own contracts;
the consumed T-037 boundary must still be demonstrated here.
