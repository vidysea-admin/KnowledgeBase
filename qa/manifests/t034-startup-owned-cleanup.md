# T-034 startup owned cleanup

**Handshake status:** checked-PASS — closed out 2026-10-26 by maker resume, citing qa/verdicts/t034-startup-owned-cleanup.md
**Status:** checked-PASS — closed out 2026-10-26 by maker resume, citing qa/verdicts/t034-startup-owned-cleanup.md
**Fix cycle:** 0
**Task:** T-034; ISS-CAPTUREMAKER-001
**Priority tier:** 2 — high security/resource issue encountered during explicitly allocated tier-3 capture task.
**Authority:** D-173 and root exclusive tab-browser source/test lease, confirmed 2026-10-15. Maker capture_maker. No checker assigned yet.
**Contract:** qa/contracts/goal-t034.md criteria 4/5/7 only; SHA256 A819BCCD04B70BD96E4BED9F1FD0BD0C568E62FA1307A1EB8EAA435E69761D4D.
**Base:** current repository HEAD 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a plus preexisting working-tree capture changes. New test and issue shard had no base. This candidate claims only the startup catch repair, not prior parallel-workspace implementation.

## Scope and exact candidate

- packages/meeting-bot/src/capture/tab-browser.ts SHA256 FED87C5A4A64A735F484D435CFD72F5C0CB2D40761E53EC419AEDC860B7E7112. Existing launch catch now treats status refusal as secondary and always attempts each owned cleanup. Stop-file failure still kills the owned child; receiver failure cannot suppress lock/extension cleanup. Original startup error is preserved. Generic diagnostic messages contain no credentials or source URLs.
- packages/meeting-bot/src/capture/tab-startup-cleanup.test.ts SHA256 C510FE523980C0D54479DE8EE4594F75AC8E9E40E261E3511A042BBAFB7833E8. Two actual disposable Node-child/loopback cases reproduce both ledger cases verbatim. Each attempts twice on one adapter, requires closed receiver/acknowledged child shutdown/removed own lock and extension, and preserves corrupt or foreign status bytes. No browser or media.
- qa/issues.capturemaker.jsonl (new) and this manifest (new).

Tenancy/credential/data-write flags apply because the owned extension contains a receiver credential and the current status must not overwrite foreign identity. No new tenant authority or acceptance is granted. Root received notice before source change; no other capture/privacy/recorder source was edited.

Immediate caller is createBrowserJoiner via capture/record-commands.ts runRecord. Receiver and child are created by createTabBrowserDeps.launch before its starting-status write and readiness wait. On failure the launcher must reject and release resources before the caller can retry. Tests invoke that actual launch boundary and consume the postfailure HTTP/filesystem/child state, rather than only testing a helper.

Dependencies reviewed: capture/controller-state.ts process identity, SHA256 491B42B03AB072EA416962721889D08F7665F864C64944A9F2045ECAD9F70638; capture/reconnect-gaps.ts status identity validation, SHA256 A66449F9DE1110FC848967B160D31BDD907364809508C63716666D1DA6B7776A. Existing browser-profile/guard/obs imports remain unchanged.

## Reproduction and required execution

From packages/meeting-bot using bundled node at C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe:

`node --test --test-concurrency=1 --test-timeout=20000 --import tsx src/capture/tab-startup-cleanup.test.ts`

Outer timeout 45 seconds. Expected corpus count ISS-CAPTUREMAKER-001: 2/2 refused safely, two attempts per case. No .env credentials needed or read by these tests. Child subprocess creation can require the same sandbox exception as existing Node-child tests; broker handles exact environmental policy. No pre-fix runtime baseline claimed: source control flow identifies the previous bypass; broker may independently test a byte-backed baseline under mutation safety if needed.

No tests launched by maker. Sole broker verification_broker has the pinned request. Actual receipt/exit/count/duration pending; status remains in_progress. Full-parent live60min/two-tab/OBS/downstream provider evidence remains HOLD. Existing parallel-workspace 67Node+4UI packet and original-private-EOF composition gate are not discharged by this narrow unit. No contracts/decisions/trackers/shared composition or historical verdict edited.

## Actual broker evidence and READY

Sole broker reports both exact ISS-CAPTUREMAKER-001 reproductions PASS,2/2, two attempts each, with actual Node child and loopback receiver. Combined execution with nine proof-consumer cases gave11/11 PASS,0FAIL/SKIP, exit0,11487.7102ms; all source/test pins unchanged. Receipt qa/goal-vectorless-2026-10-15/verification-capture-consumer-startup-20261015T0815.json includes exact argv/runtime/environment/full reuse identity and stdout/spec. This supersedes prior pending-execution note; no maker launched CPU checks. Rootchecker follows current fresh-context efficiency policy; preliminary source review is reused and not repeated by maker. No parent completion.

## Metadata reconciliation for independent review

Combined compact handoff is the final section of qa/manifests/t034-original-private-eof.md. Both startup changed-file hashes still match receipt before/after/current; TAP explicitly names the two ledger cases. Correction to “full reuse identity” above: five direct startup dependency pins are absent from that execution receipt (controller-state, tab-receiver-guard, tab-silence-health, tab-remux, browser/browser-profile). No source drift is established, but full historical import identity cannot be inferred. Reviewer must reconcile this narrow gap before crediting complete reuse; current scoped verdict and shared required verifier evidence remain pending. No edits/tests or parent/live acceptance were fabricated during metadata reconciliation.

## Fresh dedicated startup receipt resolves missing pins

Sole broker independently executed only the two original corrupt/foreign-status ledger cases: qa/goal-vectorless-2026-10-15/verification-capture-startup-two-20261015T1120.json, exit0,2PASS,0FAIL/SKIP,8329.5662ms. Adjacent stdout records the exact two nodes (TAP1510.0505ms and1289.3734ms). All7 now-required startup source/test/direct-dependency hashes are present before and after and match current bytes: no missing pins or drift. Nodev24.19.0 executable and current pnpm lock match the fresh receipt. No FFmpeg/browser/media/live capture was rerun.

Fresh environment fingerprint1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac is authoritative for this execution. Compared with the old combined receipt, only whitelist hashes T054_AUTHENTIC_INPUT_OPT_IN and LKB_WHATSAPP_CONSENT_MONGO_RUN differ. Do not relabel the older environment as identical; fresh evidence supersedes reuse of the older startup execution. Values/secrets remain omitted. Historical missing-pin notes above remain accurate for that old receipt and are preserved.

READY cycle0 for independent scoped review with the fresh receipt. No source edits or maker tests occurred during this authentication. Independent current-cycle verdict and a separately supplied shared required contracts-verifier receipt remain outstanding; none is fabricated here. Parent60minute/two-tab/live/private-timeline acceptance remains open.
