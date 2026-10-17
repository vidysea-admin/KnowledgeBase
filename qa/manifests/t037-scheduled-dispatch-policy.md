# T037 scheduled dispatch policy — cycle 0

**Task:** T-037 scoped dispatch-time authorization; parent remains HOLD
**Priority tier:** 3 — root-approved roadmap/security gap
**Status:** in_progress
**Handshake status:** in_progress
**Fix cycle:** 0
**Maker:** /root/scheduler_maker
**Contract:** qa/contracts/goal-t037.md C3, C5, C6, C8, C9; checker-owned, unchanged

## Authorized behavior

Current opt-out/deny must be evaluated at saved automatic dispatch, rather than only when scheduled. Approved exact source leases: calendar/schedule-tick.ts; calendar/state/schedule-dedup-state.ts; new calendar/scheduled-dispatch.ts and test; scripts/webinar/start-record-detached.ps1 and test. Central integration owns cli.ts. No schema/global enforcement/live configuration/DB/network/join changes. Direct manual record remains unchanged.

Saved dispatchPolicyV1 carries authoritative selected source, sourceId, sessionKey, normalized sender, meetingUrl,start/end; dispatch validates closed shape, bounds, tenant/key equality, saved tenant, jobKey/session/URL/end/start binding, current rule veto and no state mutation. Only last-valid/fail-closed accepted on new automatic route, per explicit root authorization; other modes refuse automatic_dispatch_rule_mode_unsupported. Legacy unidentified jobs require operator rescheduling; no inferred identity, repair, delete or silent upgrade. PowerShell -Job routes only record-scheduled key and refuses all capture overrides/replacement CLI. Existing direct invocation argv path is retained.

## Candidate and evidence

Base Git5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. CandidateF226E3B85C5407BBA9CE00D108BB9BF53C27CEBF68B90252B4147E26277222F8 is ordered scoped pin-set SHA256, not Git commit. Exact8 pins: qa/evidence/t037-scheduled-dispatch-policy-pins.json. Shared CLI owner source pinned72C7BC4D22CCCB6B0DFF17959E9F63524411C03C4B49B9B8A60E3BB0ED575B7D. New helper/test are new/untracked; other paths retain prior unrelated edits. Full actual source/diff authoritative; no clean-working-tree assumption.

Auth, tenancy, data write and credentials boundaries relevant: scheduling writes tenant-tagged identity; dispatch verifies key tenant from existing authenticated loader and consumes canonical readonly rules; runtime capture continues through existing claimedRecordWithDefaults/runRecord. No secret output. No QA contract edits, deployment, provider, browser or DB effects.

Filed issue floor ISS-ALERTTENANT-001 (qa/issues.alerttenant.jsonl) records launcher ignoring untagged/foreign job tags; no literal command is present in the row. Both scenarios are authored through actual saved-job reader and actual PowerShell->checked TS module fixture; execution pending, count0/2 until broker results. New fixtures also cover saved-after-scheduling deny/opt-out, expiry/foreign/corrupt snapshot, unsupported modes, invalid identity and retry recheck. No issue closure claimed.

Broker requested Node new helper7 + immediate existing integration4 cases, then scoped Windows native tenantfloor/override/directmanual positive. No local tests ran. Packet qa/packets/t037-scheduled-dispatch-policy.md supplies commands and limits. Status remains in_progress until required current broker evidence is available.

Prospective source-build QPC476.7732772s, wait0, frequency10000000,start233879132241,end238646865013; initial reads before meter unknown. Complete comparable makeractive/tokens/cost null, no fabricated denominator. Details qa/evidence/t037-scheduled-dispatch-policy-maker-metrics.json; shared suite costs tracked separately by broker. Canonical checker skill explicitly read; root owns fresh reviewer dispatch after assess gate. Full parent/live/cross-source exception gates remain open.

Precheck correction: immutable verification-t037-dispatch-eleven.json exit1,9/11,2773.241ms retained. Fake Zoho URL lacked key/sessionid and correctly failed existing guard; only two fixture URLs corrected to canonical /join?key=123. Policy negatives now assert actual evaluator reached. Source unchanged; current8pins candidate refreshed. Root broker reruns7new cases only and queuednativefloor; no localtests. Packet contains exact before snapshots and currenttesthashes. No ready/PASS/issueclosure claimed.

Current broker new7 allPASS exit0,1499.5899ms, no114capturedpin drift: verification-t037-valid-fixture-seven.json. Own8 matchcurrent; allold118 production/neighbor inputs unchanged except Node/native fixturetest URLs. Old4 greenneighbors remain partial evidence from exit1batch; fullclosure reconciliation/corealias+obs external metadata pending, eligibility qa/evidence/t037-composite-eligibility.json. Nativefloor unexecuted; notREADY/PASS. Actual_total usage unknown/null, no legacy allocation counted as actual.

Current sourcecomposite qa/evidence/t037-source-composite.json: actual7/7 +fresh4/4 separateexit0commands, four.5438777s, sharedpinszero drift/runtime/env/locksame, normalizedimportroot same. No failedbatchrelabeledPASS and no fabricatedsingleprocess11exit. Supplemental externalclosurecurrenthashes notretroactiveold7proof. NativefloorNOTRUN and scopeHOLD; actual_totalnull, rootreviewgatepending.

Root-narrowed nativefloor request checkpoint qa/evidence/t037-native-tenant-floor-request.json sent solebroker: exactmissing/foreigntag2 only, no other suite repeats,NOT EXECUTED. API repair evidence scoped to actual matching API route/deps/server consumers in qa/evidence/t037-api-repair-scoped-attribution.json; broadpin inclusion alone doesnotprove standaloneCLI/helper compile membership. No checker untilproperactual_total assessment; no sourcechanges.
