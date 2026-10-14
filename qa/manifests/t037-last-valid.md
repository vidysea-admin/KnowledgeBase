# t037-last-valid

Task: T-037. Priority tier: 3, authorized roadmap behavior. Class: SECURITY (join authorization, tenancy and cache writes).
Fix cycle: 0
**Handshake status:** checked-PASS
Status: checked-PASS
Checked: qa/verdicts/t037-last-valid.md (cycle0, independent source-scope PASS; final four candidate hashes rechecked unchanged at close-out).

## Authorized scope

User approved the execution plan's one-hour last-valid tenant-bound rules snapshot policy, immediate email/dashboard degradation alert and refusal when no trusted unexpired snapshot exists. This unit implements snapshot storage and enforcement callback only. Source deployment remains OFF. Integrator owns schedule-tick glue; alert lane owns delivery. Checker owns qa/contracts/t037-last-valid.md and relevant standing policy amendment.

## Changes

- packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts: explicit last-valid mode, strict current key-tenant agreement, snapshot fallback, sanitized degradation callback, readOnly suppression.
- packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid.ts: primary availability check; full validated rules/state snapshot, tenant/time/content SHA256 integrity, atomic write and one-hour exclusive expiry.
- packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid.test.ts: snapshot boundary fixtures.
- packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts: consumer enforcement fixtures.

Base: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. New helper/tests had no base. No git commit made.
Packet: qa/packets/t037-last-valid.md.

## Evidence

Final source checks (commands, final SHA256 pins and attributable limits in packet):

- New helper and enforcement fixtures: `tests 14 / pass 14 / fail 0`, exit0, duration_ms1560.2721, wall1.98s.
- Existing enforcement/preconditions/key-tenant regressions: `tests 38 / pass 38 / fail 0`, exit0, duration_ms22407.5088. This run precedes the final new-mode-only stale-primary refusal guard; legacy branches did not change.
- Final meeting-bot `tsc --noEmit`: exit0, no output, wall6.40s.
- `python contracts/verify_contracts.py`: exit0, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, wall0.43s.
- Recorded ISS-T037W1-001 corpus output: id-only (verbatim)0/2 refused remains open; URL hints2/2 and sessionKey hints2/2 preserved. ISS-T037WIRE-002 original8/8 variants warn and remain OFF; existing tenant-header and new-mode strict-tenant fixtures pass.

Independent checker:4/4 behavioral probes PASS exit0 wall1.2186757s, plus attributed current downstream scheduler integration receipt27/27 (four new last-valid integration cases and14 existing scheduling consumers are the rules-relevant subset). See cycle0 verdict for actual commands, byte pins and provenance. Maker closed only this source/callback unit after matching PASS; fullT-037 remains open.

No live/provider/database/capture calls, deployment flags, commits or runtime activation performed.

## Limits

No maker-owned scheduler glue, default/UI enabling, live tenant/key checks, actual notification delivery or deployment. Integrator/alert lane owns those additions. Legacy modes unchanged. Existing id-only cross-source opt-out gap and ISS-376 everyWebinar trust-policy issue remain separately tracked. Snapshot integrity is not an authentication MAC: local filesystem permissions remain the trust boundary. Each successful primary validation refreshes snapshot lifetime; fallback never does. The hour bound uses wall-clock age; arbitrary backwards system-clock changes are not monotonic elapsed-time proof.
