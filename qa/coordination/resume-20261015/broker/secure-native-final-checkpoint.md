# Secure synthetic native joins — requested batch complete

| Requested scope | Own exit | Actual result |
| --- | --- | --- |
| Original postcommit/vectorless/transcript20 | 0 | 20/20 passed |
| Original workspace12 | 0 | 12/12 passed |
| Only two previously ACL-blocked actual native joins | 0 | 2/2 passed, no skips |

Transcript verifier ordering and workspace mock clock changes were adopted only at their exact two frozen test paths. No production code, assertion thresholds, runtime callbacks or permission guards were changed by broker. No full typecheck repeated for these root-authorized statement-reorder/mock-only edits; previous compiler evidence remains separate.

Native setup used the existing native-acl-fixture.ps1 Create action, trusted native Windows PowerShell and its sanitized PSModulePath. The helper created a NEW UUID directory under this workspace's qa/evidence/native-acl-fixtures with protected current-SID/SYSTEM/Administrators inheritable DACL at creation. Returned absolute UUID/root containment was independently verified. Actual production verifyPrivateDirectory accepted the root before tests. No existing directory ACL or global setting was changed, no production ACL verifier bypassed and no fake ACL snapshot supplied.

Both exact real synthetic native integration node names ran from native-capture-runtime.test.ts only. First reached actual runRecord configuration, opaque receiver close, awaited playback and canonical selected WAV. Second reached actual server runtime/finalizer/provider guard with fake transcription callback, selected WAV and synthetic source registration. Existing FFmpeg/ffprobe binary hashes matched prior9.0.2 receipts. Browser executable was used only for version/resource identity; no live browser/meeting/provider/database/network call. Tests used genuine synthetic media/decoder/private filesystem, not fake decoded identities.

Finally, existing marker/UUID/owner/reparse-validated Cleanup completed with exit0; target absence verified. Only the new owned fixture was removed. Create, real ACL verify and cleanup full outputs/hashes/PIDs/own exits retained. All commands used tested JobObject Tree supervision and bounded cleanup. No timeout or retry.

Final source/setup inventory is sealed in secure-native-final-sealed-inventory.json; source/production hashes unchanged after execution. Detailed exact vectors, actual counts, binary/environment/source hashes, stage durations and fixture_removed are in secure-native-two-test-phase-summary.json. Previous failed receipts are retained; no historical red was rewritten.

Standing limits: unsupported file-symlink privilege remains unmet and was NOT rerun in this two-test selection. Production automatic secure private-root creation remains missing/unaccepted; provisioning this new test-only fixture does not certify that product capability. Archive successful fresh-process rehydration, complete PhaseB production wiring, real platform/host qualification/human/DB acceptance and independent review remain separate gates. No independent PASS or efficiency claim; runtime total tokens unknown. CPU returned to root after this finite batch.
