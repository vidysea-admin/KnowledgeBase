# Watcher final-source validation — candidate 0

Status: awaiting sole-broker execution; not ready-for-check and no PASS claimed.
Unit: T044 watcher final-source stale-validation repair. Fix cycle: 0.
Priority tier: 3, authorized roadmap integration; source-byte validation/data-write boundary.
Authority: central explicit two-file lease relayed by capture_delivery_coordinator.
Repository: C:/Users/product/Desktop/KnowledgeBase
Base HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate SHA: uncommitted exact bytes below; no invented commit SHA.

## Exact owned paths and byte pins

| Path | Pre-edit SHA256 | Candidate SHA256 |
| --- | --- | --- |
| scripts/watch/lib/ingest-chain.mjs | bc8876a9038ed03b81843ee7289d7a88919535da48ca3130cc1ceac75bbdb003 | a692dfd7f6a94a948346cb980b125c159e291fd7b4a574e2bbe9e7c3ba710be1 |
| scripts/watch/lib/ingest-chain.test.mjs | aba40564bbb52f2decc66445638ef75431dba64d9c32fe52faee96245bd87f04 | a00d4cb7514d4f57f85205658355f87116fd667fcc611b15d26c4865325de2cb |

No new runtime files. This untracked packet is the only coordination write.

## Behavior and consumers

The watcher validated stub source.json, then replaced its bytes with skeleton.source before seed/index. validateSession binds sourceSha256; loadWebinarSession refuses the resulting stale receipt. The patch preserves the first QA validation before deriving page/claims, retains truthful known title and explicit audioPath on the final skeleton source, revalidates those final bytes, and calls the real loader before provenance binding or seed/index. Existing createdAt generation is unchanged; no fabricated recording date is introduced.

runCommand/env/buildIndexer dependency injection defaults to existing production implementations; tests replace external commands/providers/index writes only. runCommand's ffprobe result remains synchronous. Ingest itself awaits transcription, validation and seed runners. Default process.env is preserved and passed to Node children.

Applicable contract: qa/contracts/goal-T044.md criteria 2–5 (opt-in bound QA, anomaly evidence, current generation, immediate downstream refusal) and 7 (independent proof). This fixes one watcher handoff slice. Criterion 6 actual recorded audio/provider/spotcheck remains HOLD. No native ACL/EOF/privacy root proof, schema/composition, live capture, provider, database, browser, host activation, promotion or whole-task acceptance is claimed.

Security: touches the pre-data-write admission boundary and local source/validation/derived writes. No auth/tenancy selection/credential change. Existing tenant identity and QA binding helpers remain authoritative. No ledger issue ID or unavailable corpus is invented.

## Required broker execution

From repository root, using existing Node/tsx environment:

`node --import tsx --test --test-concurrency=1 --test-timeout=30000 scripts/watch/lib/ingest-chain.test.mjs`

Use the sole broker's bounded outer timeout/environment preflight and writable temporary directory. No leaf test command has run. No pytest/build/native dependency is required. Tests use OS temporary fixture directories with cleanup and inject duration=60; synthetic bytes are never decoded or uploaded.

New exact test names:
- watcher validates finalized source before seed and real consumer accepts it
- watcher stale final validation prevents seed and index
- watcher final validation failure prevents seed and index

The clean case runs both actual validateSession calls with bound QA, verifies the initial receipt becomes stale after final source replacement, verifies actual loadWebinarSession acceptance, and checks assertDerivedArtifactsCurrent before fake seed. Negative cases independently retain a stale receipt or corrupt QA before final validation; neither may invoke seed/index. Existing ingest guard tests remain in the same focused file. Raw broker receipts/output should be linked here after execution; no result is currently available.

## Dependency byte pins before broker

| Path | SHA256 |
| --- | --- |
| scripts/webinar/validate/validate-session.mjs | 2b34daf2504128162d4c329e702d4745d167fbe4c5dcad2d204b192d909cf8f9 |
| scripts/webinar/session-rows.mjs | 684a6d3c5e6fafdd9879ce232d5b0703d6a1e7d667415e2be2b0543b70de8081 |
| scripts/lib/transcript-provenance.mjs | bd2570803ffbea67db375efb16d02f7374533ad2b27c4f700f7543b60745b301 |
| scripts/watch/lib/session-skeleton.mjs | 9ea9fb1bbbaed6f261c8c8a42fa98f5e6d0ea694cc7c461dcbb788170e5dc48b |
| scripts/lib/transcription/transcript-qa-generation.mjs | a632689f058ba86cf98a643144531b9feb1656d910cd6c3e0e11fc198285451b |
| packages/ai/src/stt/transcript-qa.ts | 06cc4ddf32b2ec80899ed2e3abc0f6cd179baf240c485c47b93fdb542e17c9bc |

Immediate consumer navigation: ingest-chain.mjs final source write -> second validate -> loadWebinarSession -> bindDerivedArtifacts -> seed -> buildIndexer. validate-session.mjs binds source/turn/QA digests; session-rows.mjs checks current digests and identity. transcript-provenance.mjs binds/validates derived source/session/turn/page/claim hashes.

## Accounting and remaining gates

Actual maker active time, provider tokens and monetary cost: unknown. No measured efficiency ratio is claimed. Parent should use canonical checker assess/admission and explicit bounded BOOTSTRAP_REVIEW if those denominators remain unavailable. Source hashes must be rechecked around execution/review. Shared frozen-contract verifier evidence and fresh independent checker verdict remain parent-owned gates; this packet is not a substitute.
