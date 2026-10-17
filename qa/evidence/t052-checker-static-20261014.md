# T-052 independent static checkpoint — 2026-10-14

Scope requested by the maker while the root CPU lease is pending: source/config refusal, exact correlation and receipt freshness, extraction dependency shape, operation-draft merge, asynchronous persistence retries and acquisition cutoff. This is a BUILDING candidate review, not a unit or whole-task PASS. Full parent verdict remains HOLD.

Review checkpoints: first read UTC `2026-10-14T18:54:59.9473609Z`; relevant runtime/consumer excerpt read completed by `2026-10-14T18:55:48.0256868Z`. Initial dispatch timestamp was not instrumented. No tests, browser, provider/DB call, mutation or application change occurred.

## Specific concerns sent to maker and root

1. `registration-workflow.ts` configuration validation requires an absolute `browserExecutable`. Existing `joiners/browser-joiner.ts` accepts/forwards the supported `cft` SeleniumBase sentinel, and `joiners/joiners.test.ts` actual owned-child fixture configures `browserExecutable: "cft"`. The new check would reject that config before any attempt as configuration-invalid. Preserve supported sentinel behavior or provide an explicit justified compatibility change with evidence; do not treat valid existing config as missing data.
2. `auto-record-policy.ts` asynchronous reconciliation invokes `persist(prepared.state)` before comparing current state with its pre-persist snapshot. Revisions retry at most eight times. If a concurrent child update changes live state on the last write, the function throws while the persistence callback has already written an older operation snapshot. A memory-commit refusal cannot roll back durable stale state. The actual `scripts/webinar/run-pipeline.mjs` consumer currently supplies synchronous `writeWebinarOperationState`, so this concern is the new generic asynchronous interface/claimed test behavior rather than an observed production synchronous overwrite. Require serialized/CAS durable publication or clearly constrained safe persistence semantics before certifying async durability.

These are source-review concerns requiring candidate response and focused probes; no independently executed failure or ledger issue is claimed here. The existing fixture's one-conflict retry test checks eventual in-memory/latest saved state, not interruption after a stale write or final-retry durable state.

## Other reviewed boundaries

- Source admission checks approved or authenticated auto-approved state, webinar classification, accepted/unresolved acquisition and required IDs/times before candidate-bound config resolution.
- Configuration/profile failures become finite reasons and precede durable attempt creation. Operator fields remain outside the persisted attempt. Browser outcomes map into a finite diagnostic vocabulary.
- Pre-submit update is awaited; uncertain/interrupted attempts retain deduplication instead of repeating submission.
- Fresh confirmation requires canonical receipt bounded by attempt/acquisition cutoff and authenticated or manually approved confirmation, alongside the existing strict message/thread/organizer/time/direct-join predicate and baseline exclusion.
- Helper imports only node:path and core types, not auto-record-policy; policy imports helper and schedule-state imports both. No new helper-to-policy import cycle was observed.
- Confirmation cutoff uses `input.checkedAt`; this retains future-to-acquisition rejection instead of letting moving `now()` create invalid proof.
- Root canonical `receivedAt` acquisition/schema/storage/type integration remains pending and is not recorded as a maker regression.
- Actual `t052-real-mail-provenance.json` records two historical connected-Gmail messages with different threads/envelope senders and opaque invite tracking links. This is concrete scope-gap evidence under unchanged D-079, not current registration/confirmation execution or permission to widen correlation.

## Observed candidate identity

| File | SHA256 |
|---|---|
| registration-workflow.ts | E3840AD2B52FF82C401CD72005119F2D0C057CF633CAABD9B8627065A192AE78 |
| registration-workflow.test.ts | F68FE47608A72733BF30B24FB0608DF0BABFB1D32DA0ECF204C8D183CDCF59E7 |
| auto-record-policy.ts | A3FCBC0E04B418FF51877765C9B913F146C83AE00F4CCBF3F2C07538E1940FD6 |
| state/schedule-state.ts | 2EF302F1282E47EFBA7468B362B44CA5FDBECC1C2719DFB9CD4346F10C925619 |

Hashes are the read checkpoint, not a final candidate certification. The manifest and packet `t052-approved-registration-workflow` both said BUILDING, Fix cycle 1, no current tests/final hashes. Later edits require fresh review and hash binding.

## Read commands

1. UTC stamp and raw reads of registration-workflow.ts/test.ts, packet and manifest — exit0, 0.7440062s. Nine synthetic focused tests inspected; none run.
2. Raw reads of auto-record-policy.ts, state/schedule-state.ts, real-mail provenance JSON and SHA256 identity JSON — exit0, 0.5288569s. Tool outer output was truncated; needed policy logic and state confirmation excerpts were observed, and targeted header/runtime follow-ups supplied dependency context.
3. Targeted `rg -n -C` caller/runtime/consent/dependency queries — first combined command exit1 because one scoped search had no match, 0.9212063s; observed actual production synchronous persist and schedule-state imports. This was a read-query result, not a failing feature test.
4. `Get-Content browser-joiner.ts | Select-Object -Skip 80 -First 65` plus targeted Python consent/CLI and calendar-client searches and UTC stamp — exit0, 0.4723251s. Actual input validation/args and strict consent refusal inspected.

Exact tool invocations and directly observed output are retained in this checker turn. No CPU lease was consumed.
