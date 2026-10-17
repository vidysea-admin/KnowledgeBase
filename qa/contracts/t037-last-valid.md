# Contract — t037-last-valid (T-037, SECURITY class)

Checker-owned ground truth. Authorization: Umesh approved the one-hour last-valid
rules policy, current tenant verification, immediate email/dashboard degradation
alerts, and refusal without a trusted unexpired snapshot. Maker never edits this file.

## Scoped source unit

The unit implements the explicit `last-valid` mode, snapshot persistence and a
degradation callback. It does not enable production, deliver real alerts or close
the whole T-037 task. Existing off/fail-open/fail-closed modes retain their behavior.
This contract governs the new mode where older W3/tenant-verification clauses
describe only the two legacy enabled modes. Existing security safeguards remain.

1. **Current verified tenant.** Before primary or snapshot reads/writes, require a
   valid configured tenant and explicitly verified equal API-key tenant. Missing,
   unknown, invalid or mismatched identity refuses every selected join; no fallback
   and no default tenant. A foreign primary envelope also refuses without fallback.
2. **Full validated state.** Only successful validation of an actually present,
   regular, bounded primary document may seed/refresh a snapshot. Capture the whole
   normalized rule set and approval/opt-out state, including event and meeting
   identities. Missing primary is unavailable, never permissive empty rules. A
   present, explicitly valid empty document is allowed. Reads must not accidentally
   seed empty state during a deletion/replacement race.
3. **One-hour bound.** Persist tenant, validation timestamp and integrity covering
   all policy/state content. Fallback is valid only for `0 <= age < 3600000 ms`;
   exact expiry, future/invalid timestamps, corruption, tampering, malformed or
   oversized data, nonregular files and foreign tenant refuse. Validate cached
   policy/state independently on read. Restart retains the original expiry;
   fallback never updates it. Clock/freshness limits must be disclosed accurately.
4. **Fresh primary wins.** A newly validated primary immediately governs this
   selection and replaces the cached policy/state safely. Failed snapshot writes
   preserve the prior complete snapshot and do not weaken the current primary's
   decisions. No write to the authoritative rules file. No temp residue after a
   failed write. State/config arguments and selections are not mutated.
5. **Refusal and veto.** When the primary cannot be loaded or validated, use only that tenant's
   independently valid unexpired full snapshot. Otherwise mark every selected item
   `rules-unevaluable` and schedule none. Cached deny/opt-out rules remain effective.
   Output is a subsequence of the input; cancellation, registration, rejection and
   existing identity checks cannot be bypassed or resurrected by the fallback.
   A per-item evaluator failure refuses that item and signals degradation; it never
   restores unevaluable items as the legacy fail-open mode does.
6. **Degradation source boundary.** Emit a sanitized degradation event immediately
   on failed primary availability, identity/refusal, unevaluable evaluation and snapshot-write failure,
   including ticks with zero selected meetings. Identify snapshot use and its
   validation/expiry when applicable. No secrets, sender/meeting contents or paths
   in the event. Sink failure cannot widen access and produces a fixed visible
   failure log. Read-only mode sends no callbacks and writes no snapshots.
   A healthy/recovery callback may clear prior degradation only after successful
   current-primary validation, successful evaluation and snapshot persistence. Failed cache persistence,
   unevaluable evaluation, fallback and read-only execution do not clear it; callback failure is visible
   and cannot change selection.
7. **Evidence.** Cycle-bound packet with final hashes; focused source, boundary and
   immediate consumer verification; required contracts validator and affected
   typecheck. Include current tenant rotation/mismatch, full-state fallback, exact
   expiry, restart/no-renewal, invalid snapshots, missing primary, atomic failure,
   and default/legacy regressions. Reuse attributed existing issue reproduction
   evidence explicitly; unchanged gaps are named, never claimed fixed.

## Remaining integration/deployment gates

Before enabling, the real scheduler must forward read-only/clock/degradation
dependencies correctly, and verify the actual key/tenant through the authenticated
least-privilege API signal. Degradation must immediately reach durable dashboard
state and attempt email; ordinary email caps must not defer the initial degradation
alert. Failed/disabled delivery is visible and repeated identical warnings are
bounded without hiding a new degradation or expiry/refusal. Real delivery,
nonproduction live enforcement proof and simultaneous truthful UI flag/copy are
separate acceptance evidence. Existing recurring/id-only opt-out and ISS-376 gates
remain unless separately resolved by the Approver. No scoped PASS implies enabling
or whole-task completion.
