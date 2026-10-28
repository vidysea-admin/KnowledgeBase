# Manifest — meet-autojoin-20261009

**Goal tasks:** T-051 / T-052 — explicit user-owned Meet self-test continuation
**Tier:** 3 — current roadmap feature; explicit user steering to create and test a meeting
**Fix cycle:** 0
**Handshake status:** checked-PASS
**Status:** checked-PASS
**Contract:** qa/contracts/meeting-bot-live-capture.md C1, C2, C6; inherited tenancy boundaries
**Packet:** qa/packets/meet-autojoin-20261009.md
**Prepared at:** 2026-10-09T11:04:11Z

## Scope

Enable Google's existing bounded Join now path by returning true for meet in shouldAutoClick. Both existing recorder backends already consume this predicate. Previously Meet was discovered, routed through the browser fallback, then passed --no-click. Revise the old Meet=false test intentionally and verify actual child argument forwarding through the tab launcher.

Recorder microphone/camera prompts remain denied. No Python production edits, presenter, owned-room creation, authentication, browser run, OAuth/API/.env changes, paid model calls or production data writes. This candidate does not establish live meeting attendance or audio/video capture.

## Changed paths and hashes

Base HEAD: 68f1a4e4f3111d451216e15d6dcdf63301e672e1. All three source/test paths existed at base. Manifest/packet are new.

| Path | SHA256 final bytes | Nonblank lines |
|---|---|---:|
| packages/meeting-bot/src/capture/record-commands.ts | 2c2cb261a7ed63a0b9f6a18777bdf1e1dcfaaed1cf006e4d2109d2fd4d607480 | 297 |
| packages/meeting-bot/src/capture/record-commands.test.ts | b41be69a5f2a6fa5a779130bf5345ac3ae4bec97db17dba9592a83ad373933fa | 332 |
| packages/meeting-bot/py/test_sb_join.py | 89ed06043533ff133f8c3ef3187648e52106e2bed4ac56e2b918f8e0723c463d | 317 |

## Maker evidence

- Final focused Node forwarding/platform tests: exit0, 2/2 passed; reported runtime12.1267955s, consumer5.6813304s. Includes three real argument-inspection child processes, zero Chrome launches. Temporary extension and profile lock cleaned; failed capture status retained.
- Existing tenant selection/other-tenant finalizer refusal: exit0, 2/2 passed; reported runtime1.1803775s. Finalization is injected local fixture behavior, not external capture or database proof.
- Final Python floor: exit0, 7/7 passed,19deselected; pytest runtime0.39s. Includes two click-cap tests, three label/denylist tests, no-click gate, actual mocked SB launch arguments. No browser launches.
- contracts/verify_contracts.py: exit0, PASS by vacuity; no frozen contracts exist.
- Scoped git diff --check: exit0. File budgets respected.
- Initial Node PATH failure and sandbox spawn EPERM, plus two pytest temporary-directory access failures, are retained as environmental failures in the packet. Focused reruns required sandbox escalation. Exact commands/results are in the packet; no full suite/typecheck performed under shared CPU constraints.

## Remaining acceptance

Fresh independent checker cycle0 scoped PASS: qa/verdicts/meet-autojoin-20261009.md. The three checked hashes remain identical. Independently reproduced Node forwarding2/2, tenant2/2, Python7/7 and malformed/spoofed platform probe11/11; no issues. Measured checker launch-to-verdict243.4799543seconds exceeded the120–180second target; no clock reset or elapsed-time acceptance inference.

This close-out applies only to the predicate repair. Managed-browser actor/sign-in, resource gate, presenter with controlled media, actual Meet UI/join/capture and downstream real-media processing remain required for the user goal; full contract C10 repository qualification remains unverified under shared-worker CPU constraints. Private-room provider acquisition was independently reported later by the room producer, outside this candidate/checker's scoped proof. No live-proof.json was produced.
