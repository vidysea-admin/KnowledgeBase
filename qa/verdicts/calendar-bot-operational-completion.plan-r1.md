PLAN-APPROVAL: CHANGES-REQUIRED

R1–R5 appear coherent and preserve C1–C8, including production-write restrictions and outstanding live-evidence gates. However, the requested comparison with the **five original blockers remains unverified**: local reads failed with `helper_unknown_error: setup refresh had errors`.

Provide bounded excerpts of:

- `qa/verdicts/calendar-bot-operational-completion.plan.md` — the five blockers.
- Existing `watch_state` / `api_keys` schemas and store methods for conditional updates and key revocation.
- Existing `/watch-state` and `/keys` response projections.

These establish whether R2’s atomic publication and R3’s privacy guarantees fit the actual storage/read paths.

Implementation acceptance must also explicitly prove that duplicate retries **do not refresh freshness**, failed scans cannot renew scheduling authority using retained coverage, and generation replacement permanently fences the previous worker.

No files changed, external calls made, or fresh policy verification claimed. This is an evidence gap in plan review, not a feature verdict.