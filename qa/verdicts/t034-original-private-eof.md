# Verdict: t034-original-private-eof (cycle 1, scoped T-034/T-035 original private-EOF integration)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: ddfd942e1a4299c3de47911deedd551569c6e134
Base: a9fac545 (verified: `git diff a9fac545 ddfd942e` touches only record-commands.test.ts, workspace/record-stop-regression.test.ts and three qa manifests; zero production source changed)
Checker: independent, fresh context, 2026-10-16. Scope PASS only; parent T-034/T-035/T-011 stay open.

## Maker claim "source already complete at base": VERIFIED
Read record-finalize.ts at the candidate (identical to base). Lines 171-181: `readRecordConsent` (throws if the receipt is missing), `bindOriginalCapture` (workspace/original-capture.ts), then `if(consent.privateWindows.length)video=original.file;` so a private capture probes the ORIGINAL clock. Unknown or non-positive duration throws "Original private capture timeline unavailable" before extraction. `original.verify()` plus the consent-receipt SHA are rechecked at lines 190-191 before the public derivative is used. original-capture.ts refuses outside-slot, alias, ancestor, hardlink and oversize files, binds only the original or its `.playable.webm` remux, and streams a SHA with an identity re-read. record-commands.ts forwards `lean` and `originalVideo` (lines 218-225, 293-297) and finalize-workspace-recording.ts forwards both.

## Test-change review: no privacy or consent assertion weakened
- The seeding wrapper in record-commands.test.ts writes a receipt only when none exists for a valid session id. The receipt has privateWindows `[]`, consent.given false and organizerConsent unknown, so the seeded cases are non-private finalizer cases. No private-window assertion lives in that file.
- Refusal without consent remains proven by separate tests:
  - capture/record-consent/context.test.ts line 42 ("no approval, missing actor ... zero capture effects") and line 60 (`readRecordConsent` ENOENT for a missing receipt).
  - My own probe (temp file, removed): `finalizeRecordingWith` with no receipt rejects /ENOENT/, and with no tenant rejects /tenant/. 1/1 pass.
  - finalize-original-eof.test.mjs and original-capture.test.ts seed their own explicit receipts.
- Residual weakness, low severity, noted only: the wrapper cannot itself test a missing receipt, because it auto-seeds one. That is covered elsewhere as listed above.
- Timeout raises (3000 to 15000 ms startup; give-up 6000 to 30000 ms) are bounds only. Assertions are unchanged. Cost: the startup test now takes about 22 s.
- The `validateTranscription: () => {}` stub applies only to the -50 dB boundary case and does not touch privacy.

## Independent execution (node v24.19.0, timeout 600, sequential, outputs in scratchpad w16chk)
- record-commands.test.ts: 20/20, exit 0, 78 s.
- finalize-original-eof.test.mjs (real FFmpeg, literal corpus): 5/5, exit 0, 139 s. Corpus SHA256 d07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7 verified.
- original-capture.test.ts plus record-stop-regression.test.ts: 6/6, exit 0, 68 s.
- contracts/verify_contracts.py: exit 0, "PASS by vacuity" (no frozen contracts).

## ISS-CAPTUREMAKER-002 recorded reproductions (D-015), 4/4
1. exact corpus, private 9..12, tail <= -80 dB with public prefix audible, output 12.2 s: `private-eof` PASS.
2. exact corpus, private 9..10, public tail > -60 dB, output > 12 s: `closed-private-public-tail` PASS.
3. both cases after a real Matroska remux that exposes a longer duration: `raw-remux-private-eof` and `raw-remux-closed-public-tail` PASS.
4. unknown original duration refuses before extraction/source/provider, and foreign/mismatched/changed originals plus normal and recovery forwarding refuse: `private raw clock unavailable...` PASS, plus original-capture.test.ts (2 cases) PASS.

## Mutation (own, per-mutation byte backup, timeout 600, trap on INT/TERM/ERR, restore then cmp)
Mutant: record-finalize.ts `if(consent.privateWindows.length)video=original.file;` replaced with `if(false)video=original.file;`. Verified applied (grep 1 to 1).
Result: eof suite 2/5 pass, 3 FAIL, exit 1. The failures are the remux-private-eof, remux-closed-public-tail and unknown-clock cases, which are the original-clock guard doing its job. Restored: `cmp` OK, and `git hash-object` equals `git rev-parse HEAD:` for record-finalize.ts (7ae96e92a61cdd690a81ee86f792e8c0de1c865d). The lane tree is clean apart from the copied corpus. Mutation script and probe deleted.

## Pins
The manifest's SHA256 pin table is STALE as the maker said (all 8 live files differ). Live SHA256 at ddfd942e (raw bytes):
- record-commands.ts 531BDA060E6B723CC6ADBE14ABEF900DBC390E33C3CDA3E4A0B33B55C0DC76E0
- record-finalize.ts 8AC3798F063C0BB9A06405D10CB274B33DD169CDA9D59BF99B610E31E531E927
- workspace/finalize-workspace-recording.ts 2FE637EFD733EDB617CF2C9778283F2E67B9C441008D128AE6C6A55D51514E79
- workspace/original-capture.ts E5D44A9A50BC3E58926830632A015555C1F7605A0252499D85254E48D50EDBE7
- workspace/original-capture.test.ts 71B8F0EE799F1720875FD001EDBDCEBD7510C80898A7008E98406552EBAC0236
- finalize-original-eof.test.mjs 6231C9C0AFA3707CBDC7D39DBD2BDF5AAD41C3542D272CD8806707194C113C70
- workspace/record-stop-regression.test.ts 2B66C4EB46355DE1D14D525EED80639F18D951A99436790A6B88BE41B79A9338
- record-commands.test.ts A020AD4C2A0F599BEE951DBFB08384AD6B6EA9906A020C637FB2B9E66E47DE0A

## Not verified
Real Chrome private timelines, 60-minute capture, provider, OBS, other tests in the package (tsc errors the maker listed as outside scope not rerun). The maker's "10 failed before" at base was not re-run (not needed: the diff shows tests only).

## Ledger
ISS-CAPTUREMAKER-002: may be flipped to resolved for the scoped source-clock integration, with the real-private-timeline limitation noted. ISSUES-WRITTEN: none.
Maker may close the manifest to checked-PASS for cycle 1.
