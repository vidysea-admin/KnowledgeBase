# ISS-U4BR2-001 — watcher alert backstop
**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Owner:** next_feature (maker); independent checker: alert_check
**Priority:** tier 2, open high issue ISS-U4BR2-001; full ceremony for high/credential-adjacent delivery.
**Scope:** Prevent repeated health probes from repeatedly sending the same tenant/source alert inside 60 seconds. No health/production edits, scheduling, real notification, source discovery, database writes, provider calls, contracts or enforcement edits.
**Round cap:** one prior PASS naming alert-sink.ts (u4b-r2-alert-interface), below two before this unit.
**Authority:** User remaining-build authorization and root's explicit scoped dispatch, 2026-10-09.
**Ground truth:** qa/contracts/iss-u4br2-001-alert-throttle.md C1-C5, checker-authored; qa/issues.u4br2.jsonl ISS-U4BR2-001 exact 3 reproductions; original R2 delivery verdict qa/verdicts/u4b-r2-alert-interface.md. Maker never edits contracts.

## Candidate and evidence
Exact changed source/tests, original hashes, final SHA256, commands and caller context: qa/packets/iss-u4br2-001-alert-throttle.md. Base HEAD3498a3f16401981545ce80ddd0a612457acc4bac. Preserve all other owners' WIP.

Final affected stage+consumer: 33/33 tests pass, 0fail/skip, exit0, 7.1004952s (Node duration6721.5001ms). Consumer subsequently strengthened to replay original recording-fake counts and actual default sources: 2/2 exit0,1.7007758s. Core final typecheck exit0,7.5327861s. API typecheck exit0,48.3961727s before the final sync transport containment and additive recording-fake assertions; public API signatures and health source unchanged. Initial combined32/32 run20.1920425s/core29.2942763s retained as preliminary, not final evidence.

ISS-U4BR2-001: 3/3 recorded reproduction conditions replayed/inspected, with first condition deliberately unchanged at detector level: recording fake gets2calls (default3sources6calls); actual sink makes1/3 transport attempts. Sink inspection now has tuple key/attempt Map/default60s/clock+interval. Sibling inspection confirms same strict-less-than boundary and reservation before send. No recorded case omitted. No false claim that inspection conditions are three attacks.

Frozen validator: bundled Python contracts/verify_contracts.py exit0: "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity". Scoped git diff --check exit0. No full suite/repo audit or mutation run.

## Remaining boundary
This closes only the repeated-probe transport storm. It does not establish live Telegram delivery, scheduler activation, production heartbeat writes, overall webinar/Ask acceptance or unattended release. Independent checker alone owns acceptance.

## Close-out
Independent qa/verdicts/iss-u4br2-001-alert-throttle.md: PASS, Cycle checked0. Final three source/test SHA256 matched before/after independent run and persisted verdict. Independent35/35 tests exit0,4.7914267s; ledger3/3 exact reproductions, pending-transport/two-tenant floor verified; no issues. Launcher originally exited1 only while printing cp1252-incompatible checkmarks after child exit0; saved UTF8 output+JSON prove completed green child, then print-only runner repair (no redundant test rerun). Frozen validator independently exit0/vacuity. Manifest closed by maker against this verdict; issue shard fixed/verified with exact verdict reference.
Checker timings: recorded launch-to-confirmation392.841s includes packet preparation/wait and necessary sync failure repair; ready-observation-to-confirmation158.841s. Original120-180s total target exceeded; actual ready candidate check fell within180s. No whole-release or unrelated gate upgrade.
