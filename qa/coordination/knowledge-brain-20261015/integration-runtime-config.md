# Current integration candidate — not operational acceptance

The central composition connects approved watched snapshots to the durable worker, public webinar acquisition to an authenticated scan route, and accepted speaker relationships to the current speaker profile snapshot. The trusted-review policy is shared by answer review and relationship review. These joins require current-byte verification before independent acceptance.

## Operator-owned configuration

- `LKB_REVIEW_AUTHORITY_JSON` is optional. Absence grants no proposal or human review authority. The version-1 configuration contains `tenants`, each with an explicit `tenantId` and `keys`. Each key entry contains its verified key document `keyId`, named `subject`, explicit `reviewerKind`, `canPropose`, `canReview`, and `answerActions`. Supported answer actions are `answer-review`, `source-preference`, and `usefulness`. Only an explicitly configured human can review; automation cannot receive review or answer action grants. This setting contains key identifiers, never plaintext API keys. Invalid supplied configuration refuses construction. The agent has not populated this configuration or granted a live human identity.
- `LKB_PUBLIC_WEBINAR_TENANT` and `LKB_PUBLIC_WEBINAR_SOURCES` bind public discovery to one operator-configured tenant and bounded HTTPS source inventory. The latter is a JSON array of `{id,url}` entries. Absent inventory leaves discovery unavailable. Acquisition returns discovery evidence; it does not fabricate Gmail identities, grant sender trust, approve registration, or schedule joining.
- Existing source-worker spool/database/tenant settings and `LKB_CONNECTOR_WORKFLOW=1` remain required for watched execution. A watched snapshot needs current `sources` and `ingest` authority. Media jobs still require their audio-capable provider and source-session authority where applicable. No worker process has been activated by this change.

## Native prerequisites and remaining gates

Relationship proposals/reviews and accepted-profile reads require their existing transaction/snapshot prerequisites. The current staging Mongo server is standalone; transactional acceptance remains HOLD. The dedicated replica-set proposal is not activated, Docker readiness is unproved, and existing hosts/databases remain untouched.

The bootstrap route returns current authorized base evidence and explicit capabilities; the UI must discard these on login, person, or source revision changes. Published relationships still require real human decisions. No calibration labels, reviews, seven-day observation, or external outcomes are supplied by these integrations.
