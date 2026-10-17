# goal-t028 — independent checker verdict

VERDICT: HOLD
Cycle checked: 1
Task: T-028; roadmap tier 3; auth/tenant/data-write ceremony, uncapped security class.
ISSUES-WRITTEN: none

## Scope and required remaining gate

Checked `qa/contracts/goal-t028.md` C1–C7: existing verified API-key identity and authoritative T-060 roles; durable tenant counsellor CRUD/deactivation/grants/audit; real mounted factory/server and accounts page. The root's explicit current scope releases the old priority deferral and preserves independently granted API scopes. After profile reactivation, a verified existing search scope works only for its original tenant; hosted/account permission boundaries still refuse until a fresh role grant. Deactivation/deletion, revoked keys and interrupted durable mutations cannot bypass their enforced authentication boundary.

The current independent mounted sample passes. **HOLD remains because the root explicitly requires coherent API/web type checks, and the supplied current-freeze receipts are still red: API exit 2 with 39 TypeScript errors; web exit 2 with 5.** No newer green receipt was available for this check. This is a required integration gate, not an inferred defect in account source. No maker close-out or whole-task done is authorized by this verdict.

Real human accounts/credentials, production writes/promotion and supported-host/deployment evidence remain separately unachieved; the checked sample uses controlled fixture identities and temporary journals. No password/SSO flow, real Mongo, provider call, browser, external account creation or deployment was performed.

## Independent source and sample evidence

Read all ten new account API/client/page/test files, the authoritative hosting service/policy/state/journal, the real production integration/caller map, shared authentication and Mongo verified-key metadata, App/navigation/Settings account wiring. Reviewed the final hosting factory's tenant-scoped `revokedAt:null, scopes:"hosting"` identity directory and lifecycle provider before mounted traffic. The account service uses the real hosting writer/audit authority, not a competing role registry; profile state and profile audit share one fsynced record. Interrupted deactivation retains durable revocation/quarantine.

The independently authored shared probe `qa/evidence/goal-t028-central-check.test.ts` was executed once by the sole CPU broker. It constructs **actual `buildHostingIntegrations` + `createServer`, `HostingService`, journals and account provider** against a strict tenant/key fixture registry. Its four passing cases cover:

- Mounted create/update/grant, lower-role/self-elevation and foreign-tenant refusal, hosting-scope directory eligibility, deactivation and deletion denying the unrelated `/search` consumer, reconstructed state/audit, the explicit role-versus-scope reactivation boundary, and revoked registry keys refusing regrant/recreation.
- Actual wrapped key-route refusal and byte-persisted pending account/key transactions surviving reconstruction: sanitized JSON 503, no unrelated consumer invocation, with tenant B still usable.
- Actual mounted webhook registry/event/worker/transport: only DNS/HTTPS socket dependencies are controlled; mixed private DNS and foreign/low-role requests refuse, exact transmitted bytes match HMAC, secrets/payload stay out of public projections, restart/replay does not duplicate delivery. This case was authored/reviewed jointly with the independent T-060 checker; its single receipt is shared, not rerun.
- Corrupt durable account metadata and invalid account configuration fail closed at the actual central unrelated consumer.

## Exact command and checked bytes

Independent specification: `qa/evidence/goal-t028-t060-mounted-checker-spec.json`, SHA-256 `d6798526db23bf5c85d47766c23dba11eab1c3107bbe8f3eb9023a1cb40f754f`; probe SHA-256 `43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084`.

Program: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

Arguments: `--test --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-t028-central-check.test.ts`; cwd `C:\Users\product\Desktop\KnowledgeBase`; outer timeout 90000 ms.

Receipt: `qa/evidence/goal-t051checker-broker-t028-t060-mounted-independent4.json`; exact output: matching `.stdout.txt` and `.stderr.txt` (stderr empty). Started 2026-10-14T22:33:10.744Z; completed 22:33:17.477Z; measured 6708.752 ms; exit 0; 4/4 passed, 0 skipped/failed/cancelled; test-runner duration 6528.7908 ms. Timeout/error/signal absent.

The receipt's **76 before/after pins** are the 75-path current T-028/T-060/caller/fixture/handshake union plus the spec. Independently compared every receipt pin with current files at 22:34:31 UTC: **76/76 matched; zero mismatches**. They include ready-for-check cycle-1 manifest/packet, current contract and account files, final factory `f356f167…`, production `fabf2366…`, route composition, global auth, App and current page `697bf112…`. The receipt is the full canonical hash list; hashes are not inferred from task labels or historical Gmail evidence.

## Attributed reused evidence and limits

- `qa/evidence/goal-t051checker-broker-t028-api.json` and logs: historical exact `node --test --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/counsellor-accounts/accounts.test.ts`; 20:05:48.851Z–20:05:52.309Z, exit 0, 6/6, 3450.4958 ms. Reviewed cases include journal sync faults, concurrent authority lock, tenant/role/malformed/stale/duplicate refusal, tombstone recreation and invalid durable metadata. Account API files remain byte-identical, but later shared hosting/caller changes are **not** certified by this old receipt; the current mounted proof and source review establish their tested current behavior.
- `qa/evidence/goal-t051checker-broker-t028-ui.json` and logs: bundled pnpm `--filter @lkb/web exec vitest run src/pages/accounts/CounsellorAccountsPage.test.tsx --maxWorkers 1 --minWorkers 1`; 20:05:55.679Z–20:06:34.298Z, exit 0, 3/3, 38610.5076 ms. This is historical workflow/failure/late-tenant evidence on the prior page bytes. The current page wording is independently inspected as "Hosting and account access requires a fresh role grant." No current UI rerun, browser proof or claim that the old hash matches is made; the root directed preservation of unchanged behavior evidence without needless repeats.
- `qa/evidence/goal-t051checker-validator.json`: exact `python contracts/verify_contracts.py`, exit 0, "no frozen contracts yet ... PASS by vacuity". Validator/empty-registry hashes match current pins. Combined batch 18:39:31.7184876Z–18:39:33.1459082Z; individual duration unknown. This does not replace affected-stage/downstream evidence.
- Required red coherence artifacts: `qa/goal-2026-10-14/api-types-current-freeze.json` SHA-256 `28cde10c6a2fdbab4b84fcbb168bbd8150ef98cac81995373ab9cfef8255eda3`, and `web-types-current-freeze.json` SHA-256 `2fd4b5fab37429c3a3f89b4f71f4cecf5c7992d84a77a048fab38520918553fe`. Both invoke bundled Node/pnpm with `--filter @lkb/api typecheck` or `--filter @lkb/web typecheck`. Actual exit 2, no timeout; 18553 ms / 13182 ms; exact stdout/stderr inline. Independently counted 39 / 5 error lines. Affected account/hosting paths have no diagnostics in these supplied reports; the global required gate remains red.

## Timing and explanation

Original dispatch/launch timestamp was not measured; full original launch-to-verdict duration is unknown. Recorded phase checkpoints: initial acceptance work clock 18:23:50 UTC; resumed source review 19:15:53; current ready-candidate review 20:51:34; final metadata/hash acknowledgement 21:53:15; latest resumed spec coordination 22:31:08; broker command start/end above; independent receipt/source verification 22:33:52–22:34:31; verdict drafting began 22:34:31. Approval timing is not applicable: no permission request occurred. The intervening span contains explicit human stops, resumes, source freezes and serial CPU scheduling; its individual intervals were not measured and are not attributed by subtraction. The 120–180-second efficiency target was exceeded while preserving necessary mounted proof and gates. No required coverage was dropped.

Verdict persistence confirmed at **2026-10-14 22:35:39 UTC**. Latest recorded resume-to-confirmation span is 271 seconds (4m31s); ready-review-to-confirmation span is 6245 seconds (104m05s), including the explicit stops/freezes/queue waits described above. Full original launch-to-verdict remains unknown. No acceptance defect was demonstrated and no ledger edit was made. Recheck the required current coherent type gate and final hashes before considering a later verdict; preserve this result rather than closing the manifest as checked-PASS.
