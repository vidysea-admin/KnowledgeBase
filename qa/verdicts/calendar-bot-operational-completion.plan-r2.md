PLAN-APPROVAL: APPROVE

No remaining pre-build design blockers in the supplied evidence. R1–R5 address all five original blockers: cross-host acquisition and authoritative rules delivery; private immutable staging with atomic publication; explicit response projections; end-to-end all/rules enforcement; and retained parent completion gates.

The proposed publication fence is compatible with the supplied revocation update: both contend on the same API-key document, with publication conditioned on `revokedAt=null`. Existing unconditional watch-state upserts and direct public row responses must be replaced or constrained as planned.

Required acceptance checks remain:

- Identical retries return the original acknowledgement without refreshing receipt time or freshness.
- Failed or incomplete scans preserve accepted coverage without renewing scheduling authority.
- Generation replacement permanently fences the old generation.
- Concurrent publication/revocation, conflicting replay, private-row exclusion and downstream rules enforcement behave as specified.

Seven-day observation, actual restart/recovery, Ubuntu capture portability, provider-backed downstream proof, human evaluation and production approval remain open completion gates.

This approves the pre-build plan only; it is not implementation verification or feature acceptance.