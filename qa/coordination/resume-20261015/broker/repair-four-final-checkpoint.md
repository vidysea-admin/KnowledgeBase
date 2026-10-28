# Four-overlay verification — finite phase closed

Source/setup inventory1653 raw hashes unchanged, zero final drift. Latest four source overlays plus frozen QA adapter were explicitly reconciled in repair-four-overlay-adoption.json; final bytes sealed in repair-four-final-sealed-inventory.json. CPU returned to root; no source freeze held by broker after FINAL.

| Scope | Own exit | Actual result |
| --- | --- | --- |
| QA resolver required bounds/identity cases | 0 | 3/3 passed |
| Full declared bot/API types | 0/0 | green |
| Postcommit original20 | 1 | 19/20 passed |
| Native runtime/deferred/quota/receiver floor | 1 | 23/26 passed, all cases collected |
| Workspace original floor | 1 | 11/12 passed, no collection error |
| Python original14 | 0 | 14/14 passed |
| T037 current final-receiver epoch | 0/0 | 13/13 + last-valid2/2 passed |

Web full typecheck evidence is reused only as explicitly allowed: all unchanged web/config/compiler input pins are present and identical in the whole inventory. Current phase does not claim a new web compiler run. Prior cycles/affected structure/contracts receipts remain separate evidence; no whole-repo structure PASS is claimed.

Remaining exact failures

1. Transcript factory test now passes zero-embedding and current canonical-readiness proof, then retained transaction assertion fails: actual6 versus expected1 for `state.transaction.maxActive()`. Physical source assertion is grounded-postprocessing/transcripts.test.ts:82; raw transpiled stack reports91. Full output repair-postcommit-original20.log.
2. Both original real native runRecord/finalizer integrations are now collected with deep alias resolved. Each refuses at genuine `validatePrivateAclSnapshot` with `Private directory permits an unrelated identity`, before successful native publication. Existing inherited-ACL private test parent is insufficient; no ACL guard, directory permissions or production semantics were altered. Native acceptance remains open. Full output repair-native-runtime-deferred.log.
3. All three deferred close/retry/failure/deadline cases and genuine1MB oversized-chunk regression pass. The old owned-status symlink case still executes despite the attempted negative name filter (qualified-name matching) and again reports OS EPERM. Source assertion remains unchanged, raw actual count includes it, coverage remains unmet. No blind repeat or waived security PASS.
4. Workspace actual record consumer reaches its retained observation-versus-consent origin assertion; actual1900000000000 versus expectedundefined. Relevant physical source compares observation.mediaStartedAt with consent.mediaStartedAt near end of tab-session-workspace.test.ts; raw transpiled stack reports314. This is no longer a resolver/collection failure. Full output repair-workspace-original.log.

Python invalid-instance cases now pass on isolated fixture directories, preserving wrapped-clock identity, absent evidence and advancing clock assertions. No production Python edit. T037 actual static relative closure94 includes the changed native-tab-receiver; therefore the root-authorized exact13+2 rerun was performed and bound to this new whole-source epoch (repair-t037-closure-admission.json).

Original failed and held receipts retained. Resolver repair is QA-only; normal/export-denial/traversal/foreign-importer behavior tested, canonical bootstrap and production imports untouched. All external commands used existing tested JobObject Tree supervision; exact vectors, own exits, PIDs, complete outputs/counts/durations, environment/runtime/lock hashes and completed tree closure retained. No paid/provider/external network/DB/live-browser activity, no source edits, no unit or parent PASS. Existing synthetic loopback and injected transport fixtures only. Actual runtime token telemetry unknown.

Recorded script phase104.641 seconds. Remaining: secure owned Windows private fixture setup without guard weakening, transcript transaction accounting diagnosis, workspace receipt-origin mismatch diagnosis, unsupported symlink host evidence; then affected frozen reruns. No unplanned retry executed.
