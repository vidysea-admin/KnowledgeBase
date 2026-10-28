# goal-t028 — independent checker verdict

VERDICT: PASS
Cycle checked: 2
Task: T-028; roadmap tier 3; uncapped auth/tenant/data-write class.
ISSUES-WRITTEN: none

## Scoped acceptance and remaining gates

PASS is for the explicitly submitted **local counsellor account runtime** under qa/contracts/goal-t028.md C1–C7: existing server-verified API-key identity/T-060 authority, durable tenant CRUD/deactivation/grants/audit, actual mounted factory/server and accounts page. The scope preserves independently granted API scopes: inactive/deleted identities refuse ordinary consumers; active/null-role identities may use their existing scopes in the same tenant, while hosted/account permission boundaries require a fresh role grant. Revoked keys and pending commits cannot revive authority.

This does **not** establish whole-task live delivery or parent deployment completion. Real human accounts/credentials, supported-host/container/live-provider execution, private production DB/public operations and promotion/deployment remain their separate HOLD gates. No password/SSO, production writes or gate waiver is introduced.

## Evidence-only cycle 2 and provenance

Cycle-1 HOLD was solely the then-red required API/web coherence gate. Preserve its full unchanged evidence/verdict at qa/evidence/goal-t028-cycle1-verdict-preserved.md, SHA256 96e3cdf78379bda14dc5df04dbcd619d504cb11d0713d5f52b39e1ea9e75d2a7. This canonical matching-cycle verdict supersedes that gate result using actual new green evidence; the archived result was not edited.

Ready-cycle-2 manifest f0e48740c71f7eb4421b8626a1a40ac9410bcf8407caae1fb152849806c4f09b, packet cf7b3392a50cd2f36b6cded0aae066f8956f693d01cf268620af2e7950d35241 and contract ca67627935d47d6f6612f7e21fa8f85e31eda65d25d6d5826fd33e12401dc977 were independently matched. Criteria C1–C7 are unchanged; only the contract evidence-status paragraph and maker handshake metadata changed. No product/probe source changed and no behavioral command was repeated in this cycle.

Independent review record: qa/evidence/goal-t028-cycle2-evidence-review.json, SHA256 de91e7bf06484c328e979be8e077b36baf7621b09c0acb7764b29964395321a3. It stores exact candidate hashes, current 38/38 packet pins, 69/69 unchanged mounted source/validator pins, the 67 compiler-mapped source hashes, stage receipts/commands/durations and remaining gates. Before/after checkpoint snapshots each contain 1939 unique inputs, independently compared with zero drift. All 67 mounted application/config inputs match checkpoint-before, checkpoint-after and current bytes; the two frozen-validator files are outside the compiler snapshot and separately unchanged.

## Direct runtime and downstream proof retained

The independently authored actual buildHostingIntegrations/createServer/HostingService/journal/account-provider fixture passed **4/4**, exit 0, 6708.752 ms, with 76 execution/spec pins unchanged. Receipt qa/evidence/goal-t051checker-broker-t028-t060-mounted-independent4.json SHA256 b286fe8d19e8a523f00159db2bf9518c5c321397a4bf4fe3d72c7b29a92a3866; exact matching .stdout.txt/.stderr.txt. Executed 22:33:10.744–22:33:17.477Z by the sole broker: bundled node --test --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-t028-central-check.test.ts, outer timeout 90000 ms, repository cwd. Probe SHA256 43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084 remains unchanged.

Cases directly demonstrated tenant/scoped identity-directory eligibility; mounted lifecycle/grants/audit/reconstruction; lower-role and foreign identity refusal; deactivation/deletion fencing the unrelated search consumer; explicit reactivation role-versus-scope behavior; revoked-key regrant/recreation refusal; durable pending account/key crash fencing with sanitized JSON503/no consumer invocation and another tenant still usable; corrupt account/config refusal; and T-060 real webhook worker/transport exact-byte HMAC, tenant/secret projections and restart/replay. Only fixture key/DB callbacks and outbound DNS/HTTPS constructors were controlled; the authority, journals, mounted code, worker and transport were actual product code. This one shared receipt was independently consumed by both checkers and was not rerun.

Previously reviewed account API6 fault/race/tenant/metadata tests (exit0, 3450.4958 ms) and UI3 workflow/failure/late-tenant tests (exit0, 38610.5076 ms) remain **historical, narrowly attributed** via goal-t051checker-broker-t028-api.json and -ui.json/logs. Their original hashes are preserved; the old UI receipt is not claimed as a run on current page bytes. Current page logic/wiring was reviewed, including the wording-only correction to “Hosting and account access requires a fresh role grant.” Later shared dependency/caller behavior is supported by the actual current mounted proof and source review, not retroactively assigned to old receipts. Detailed original source review/commands remain in the preserved cycle-1 verdict.

Frozen validator receipt qa/evidence/goal-t051checker-validator.json remains byte-matched: python contracts/verify_contracts.py, exit0, empty registry PASS by vacuity. Individual duration unknown; combined batch 18:39:31.7184876–18:39:33.1459082Z. It does not replace affected-stage/downstream proof.

## Former coherence gate now satisfied

Checkpoint qa/goal-2026-10-14/ordinary-current-build-checkpoint-20261014T225425Z.json SHA256 9901fc4b8ba492648072584796450e1c8ec3eedb87829e3e95b278750689ed68 is actual green/stable current local evidence. Independently validated each referenced receipt hash, command, exit0 and timeout=false:

- api-types-ordinary-20261014T225425Z.json: bundled Node/pnpm --filter @lkb/api typecheck; 22:54:38.754–22:54:51.079Z; 12325 ms.
- web-types-ordinary-20261014T225425Z.json: same runtime --filter @lkb/web typecheck; 22:55:22.504–22:55:33.504Z; 11000 ms.
- api-build-ordinary-20261014T225425Z.json: same runtime --filter @lkb/api build; 22:56:23.497–22:56:25.215Z; 1718 ms; actual API/server-worker outputs recorded.
- web-build-ordinary-20261014T225425Z.json: same runtime --filter @lkb/web build; 22:57:47.944–22:58:04.014Z; 16070 ms; chunk-size warning is nonfatal.

All receipt files above are under qa/goal-2026-10-14; exact program/arguments/stdout/stderr/hashes are retained there and in the evidence-review JSON. These stages establish local types/builds, not container execution, native ACL behavior, live imports or provider stages.

## Timing and explanation

Evidence-only follow-up clock/launch: 2026-10-14 23:05:13 UTC. Scope/ready-metadata review ended 23:08:41; independently persisted evidence review at 23:09:45.0925874Z. Prior source-review/command phases and original unknown launch duration remain preserved in cycle1. No permission or CPU grant was requested in cycle2, no new test/behavioral command ran, and no source was edited. The 120–180-second efficiency target was exceeded while waiting for the exact next-cycle maker metadata and checking evidence; intervals not directly measured are unknown, not allocated by subtraction. No required coverage was dropped. Final hashes are checked again below by the persistence receipt; maker may close only this matching scoped cycle2 PASS.

Canonical verdict write initiated: 2026-10-14T23:10:49.3847096Z.
