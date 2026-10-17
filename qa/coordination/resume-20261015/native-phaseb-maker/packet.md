# Native Phase B bounded maker checkpoint

Validation contract: managed-review/1. Unit: native-phaseb-admission-and-postcommit, cycle 0. Status: source-frozen; NOT checked/PASS.
Root: C:/Users/product/Desktop/KnowledgeBase
Base HEAD and candidate HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a (dirty candidate identified by source-pins.json, not a clean commit).

Scope/authority: root exclusive source leases; no contracts/schema/dependencies/enforcement/global/tracker changes. Relevant requirements: native-phaseb-design.md; AGENTS definition of done, tenancy/data-write full ceremony, no maker PASS. Checker skill loaded. Byte backups and base fingerprints: base-pins.json and backups/. Preserve all other actors' dirty files.

Implemented
- Server-only IndexCommittedHook and descriptive full generation/source/turn-digest/review binding. Public indexSession notifies after acknowledged owned transaction commit. Scoped handles cannot notify; outer transcript composition separately notifies after refresh executor commit. Current generation/artifacts, completed review revision and all refresh targets are rechecked. Failed/pending/stale paths refuse. Hook failure returns unavailable without retrying paid work or changing successful publication.
- Moved existing manual transaction body to cohesive post-commit helper (same manual three commit-ack attempts, no provider body retries), and dependency type to types.ts. session.ts reduced from inherited 335 to 300 nonblank lines.
- Native archive store requires existing ACL-verified local server-selected root and authoritative current source/consent reader. Live finalizer/provider capabilities, provenance/consent hashes and finite copied-byte reservation precede exclusive copy, fsync and append-only sealed admission. Unadmitted/crashed orphans refuse. Pending scans are bounded; publication digests idempotent hints, never native proof.
- Neutral archive authority verifies trusted admission journal, exact manifest/inventory/current consent/hash readback and privately issues process-local admission. There is no arbitrary capability register or JSON issuer. Same trusted OS writer identity is the explicit boundary; this is not hostile-same-user authentication.
- Closed-spool rehydration exhaustively replays journal sequence, chunk/metadata hashes, clocks, IVF framing and actual PCM EOF/sample counts. Finalizer reproof freshly probes retained raw/selected/playback using server-configured decoder binaries and checks pinned binary hashes, exact PCM and decoded frame map. It issues no host/platform qualification.

Immediate consumers: indexSession and buildTranscriptIntegrations optional trusted callbacks; archive store/admission -> native spool -> native finalizer. Existing default flows remain unconfigured. No actual archive production composition or registry registration is claimed.

Required broker checks (NOT RUN by maker)
1. Full @lkb/api and @lkb/meeting-bot typechecks on combined epoch.
2. API post-commit.test.ts, vectorless-publication.test.ts, grounded-postprocessing/transcripts.test.ts (transaction rollback/unknown-commit/provider no-replay floor + new commit timing/callback error/no inner hook cases).
3. meeting-bot capture/native/native-capture-archive.test.ts, native-spool.test.ts, native-media-finalize.test.ts (unissued JSON refusal, original spool/finalizer regression corpus). Real decoder gates require existing LKB_NATIVE_TEST_FFMPEG/FFPROBE configuration; skip is incomplete native evidence.
4. Scoped structure/import-cycle checker for all source pins; contracts/verify_contracts.py where applicable. No policy relaxation. Native-spool 296, session 300 nonblank by lightweight line count; checker must use actual repository parser.
5. REQUIRED NOT YET AUTHORED/PROVEN: genuine live seal -> reopen/fresh-process -> spool/finalizer reproof positive; changed/orphan/wrong owner/receipt/gapped bytes/revoked consent/replacement/archive quota failure cases; actual trusted source/review/index join and post-index CAS race/recovery. Current archive test vectors cover only forged capability and invalid root/quota. Do not substitute them for full acceptance.

Remaining software, separate from host gate
- Production capture finalizer must call seal after actual source+sidecar/public privacy projection exists; API buildIndexer/startup must supply real authoritative source/consent/archive lookup and post-index current-state CAS/registry integration. These paths are not leased in this bounded unit.
- Archived private provider mask/canonical clock capability reproof is not implemented here. Reissued native media is still unqualified until actual trusted platform verifier runs. Unknown measured bounds REFUSE; JSON cannot recover a private mask cap. Actual public masked-video transform reproof remains required.
- Native standalone Mongo unsupported transactions remain an explicit host limitation. Actual platform/profile corpus and host/audio/sampler latency qualification remain real provisioning gates, not code-generated zero bounds.

Evidence/accounting: no tests/build/DB/providers/browser/decoder commands executed. Only scoped reads, byte backups, edits, hashes and line counts. Actual maker runtime token/time telemetry is unknown; token_metric actual_total, measured usage null. No independent reviewer dispatched. pnpm-lock SHA256: 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd. Environment identity and test receipts must be collected by sole broker. Independent checker alone may persist verdict after required gaps resolved; bounded checkpoint is not acceptance.