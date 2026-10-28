# Goal T-013 — 3D voice counsellor client

**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Task:** T-013 / C13 / C14
**Priority tier:** 3 — next roadmap task, explicitly selected in D-170 parallel continuation.
**Authorization:** D-170; root source lease conveyed by deploy_environment coordinator on 2026-10-14.
**Contract:** qa/contracts/goal-t013.md F1–F9 (checker-owned).
**Review scope:** frozen source candidate and centrally executed fixture receipts; full-parent live/compiler gates remain unmet, without narrowing F1–F9.

## Build scope

Actual WebGL 3D mesh character, browser-native recognition/synthesis with disclosed browser speech service, editable dictation and explicitly enabled conversational question→existing `/ask`→qualified spoken answer. Existing auth/client and citation paths retained. Cancellation/auth generation guards retire stale API/voice work. No new brain, server route, speech credentials, provider purchase or persistent transcript store.

## Owned paths

- apps/web/src/pages/counsellor/** (all newly added; no base existed)
- docs/counsellor-client.md (new)
- qa/manifests/goal-t013.md (new; root-assigned final handshake slug)
- qa/packets/goal-t013.md (new; root-assigned final handshake slug)
- qa/evidence/t013-counsellor-client/**

Shared App/navigation mounting is root/docker_runtime-owned and must be included in acceptance with final checked hashes. Maker never edits qa/contracts or checker verdicts.

## Evidence / gates

Central broker executed the four focused files on matching candidate/dependency pins: 21/21 passed, exit0, 8.1585565 seconds, 2026-10-14T21:52:08.823Z–21:52:16.987Z. Receipt `qa/evidence/goal-t051checker-broker-t013-web.json` SHA256 `0164AA3C6A136384B219A27AB4A9B44D769DF6B466F098561C719ABC4E163FFC`; stdout/stderr paths, hashes, exact executable/arguments and scope are recorded in the packet. All receipt pre/post pins are unchanged. This includes 9 authenticated consumer/lifecycle fixture checks, 8 voice-host fixture checks, 3 tests importing the actual Avatar component for unavailable/blocked context and null GPU resource cleanup, and 1 malformed-provenance check.

Actual microphone/STT/TTS/successful WebGL/provider/API/citation browser evidence is not yet acquired. App/nav mounting is source-verified, not a real browser proof. Current coherent compiler result remains red (39 API / 5 web errors, per broker); no T-013 owned diagnostic was reported, but this is not an integrated type/build PASS. Full task remains in_progress with its original F1–F9 gates. Ready-for-check applies to this source candidate and actual fixture evidence; it does not assert full-parent readiness/completion. No fixture/typecheck/validator rerun was launched by maker.
