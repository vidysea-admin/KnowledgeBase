# Staged unit: protected completion reserve

Status: built-awaiting-broker; no review-ready or PASS claim. All writes restricted to this QA staging directory. No global skill/helper/settings/hooks changed; in-flight reviews retain installed behavior.

## Purpose and delta

Opt-in `completion_reserve: true` protects30seconds/800allocated tokens within existing review limits. `completion_reserve_id` binds the reservation to exact unit/cycle/candidate; identity must not change for unchanged bytes. Review admission requires historical charges + next review allocation + reserve to fit. `next_phase.kind: finalization` can spend at most30/800 without adding capacity. Once its allocation is committed, append its existing reviewer row with `phase_kind: finalization` and the same reserve id; positive further allocations for that identity refuse. A zero-work accounting snapshot remains allowed. Later changed candidates get their own identity but retain every historical actual/debit charge.

Omitted/false opt-in preserves legacy admission behavior and explicitly reports `legacy_unreserved`; old clients gain no false protection claim. Actuals remain separate from max(actual,debit), unknowns stay unknown, security/mandatory checks and independent PASS authority remain unchanged. No persistent state engine or provider interception is added.

## Pins and measured maker segment

- Installed helper base: f24a90da84e89a8a03e4a405997f6a0a9add3c4f9e1c282471d0bf9237542bbf; untouched global skill observed78d5da6bedda2c8aade9cb4de6d193dbad4419376313c444f0c49b5abf5af95f.
- Staged helper:36b1650cf7d65d0cb4416f558486df279a519c75d2dae44d3f64875d3dbef66e; staged tests:87de2a3d0d38818376795cfe7f3c3c1e4a866af150bb40219d41d88fc7f293b8.
- Exact patch: helper-delta.diff (SHAf9e22a7e8ffb63fec1ed8ad7561290c5d264a85c469436cc3b067e12ffdad065).
- maker-phase-start/end.json records one implementation segment99.531seconds, no explicit waits; tokens/cost unknown. Preparation/reporting outside that segment is not included; do not present it as total maker usage or prove token savings.

## Verification plan, broker only

Once the broker is free, run existing Python312 -B test_completion_reserve.py with outer20second timeout, full stdout/stderr and before/after pins. Fourteen pure cases cover exact reserve boundaries, past child debits, finalization limits/no double spend, post-finalization refusal, zero-work accounting, actual-overrun protection, unknowns, legacy compatibility, malformed options, and candidate identity with retained historical charges. No temp/import preflight, provider/network/DB/browser or environment installation is needed.

Because helper code changes, broker should also run the existing canonical20 regression cases against this staged candidate using an isolated copy with only import target/expected hash adapted; retain original test bytes and record the adapter exactly. Do not rerun unrelated application suites. Independent checker later selects at least one contract-derived reserve-failure probe and final candidate pin review; no global installation before that review and authorized central escalation.

## Limits

Stateless input cannot authenticate omitted historical rows or a forged candidate identity; existing immutable snapshots and coordinator ownership remain necessary. A total allowance below30seconds/800tokens cannot admit protected review; batch coherent units or request an honest finite exception instead of reducing required checks. This is a practical guard against verdict-tail continuations, not a demonstrated runtime/token improvement until measured in a real reviewed batch.
