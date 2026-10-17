# T-042 capture-clock suggestions adapter

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Goal task:** T-042 (parent remains in_progress)
**Priority tier:** 3, user-directed roadmap implementation under D-170.
**Maker:** /root/goal_attachment_reader/maker_t042
**Checker:** /root/goal_attachment_reader/checker_t042

## Authorized scope and source ownership

New callable API adapter for an independently clock-verified capture sidecar. Root GO relayed by goal_attachment_reader; existing indexing hooks and composition remain owned by central integration. No existing source, contracts, schema, generated files, decisions, trackers or git state modified.

- `apps/api/src/indexing/tile-speaker-suggest.ts` — NEW, no base existed.
- `apps/api/src/indexing/tile-speaker-suggest.test.ts` — NEW, no base existed.
- `qa/manifests/t042-capture-clock-suggestions.md` — this manifest.
- `qa/evidence/t042-capture-clock-suggestions/` — focused run output and resume hash audit.

Current SHA256:
```
tile-speaker-suggest.ts D3473147AB4010F533CAC8AE5BB36918A6020F33DEE2CA3EBB55B1D59EC5EDDE
tile-speaker-suggest.test.ts 8600237450FF563FECA024CC7D0A2A28CF56A7FD1C20C76F04279287BE413F91
```

Ground truth: `qa/contracts/goal-T042.md`, all six clock-verified adapter clauses. Parent P1–P12 are retained. D-160 and D-141 require suggested-only tile results and explicit human confirmation; ARCHITECTURE H3/H4 require provenance and aliases.

## Change map and trust boundary

`TileCaptureContext` is obtained independently from a trusted media/capture registry. It contains exact media/capture digests, capture instance, measured shared epoch recording/capture origins and recording duration. The sidecar cannot create or certify this context. `ReadTileCapture(tenantId, sessionId, context)` returns the selected envelope and JSONL. A cloned context protects the adapter's snapshot from loader mutation.

`suggestTileSpeakersForSession(tenantId, sessionId, turns, context, readCapture, db, options)` returns immediately without I/O unless `options.enabled === true`. `tileSpeakerSuggestEnabled` requires exactly `LKB_TILE_SUGGEST=1`. It verifies turns' tenant/session/time bounds, envelope tuple, exact SHA256, first/sole metadata and measured start epoch, Meet source, monotonic sample time, finite times and confidence range. The offset is `captureStartedAtEpoch - recordingStartedAtEpoch`; samples outside `[0, recordingDurationSec)` are discarded without extending a pre-recording observation.

It calls existing `buildTileSuggestionDocs` (index -> core alignment -> fusion). Confirmed labels/people and rejected label/person pairs are filtered through existing tenant/session queries. Writes use `insertSuggestionsIfAbsent` only, retaining $setOnInsert decisions. Provenance includes capture instance, both digests and offset. There is no automatic final-speaker write. Failure returns a fixed reason without private exception text. Once insertion is attempted, a thrown store error returns `write-outcome-unknown`, retains the proposed count, and reports `inserted:null`: existing sequential upserts might already have persisted some rows. Pre-write failures report zero safely; retry/readback resolves the unknown outcome idempotently.

Security flags: authenticated tenant/session must be supplied by the caller; sidecar identity is comparison-only. Data writes are limited to suggested names using existing scoped store; human confirmation remains the only final identity path. No credentials, network/provider calls or external notifications.

Consumers inspected: `packages/index/src/pipeline/speaker-tile-suggestions.ts`, `packages/db/src/collections/speaker-suggestions.ts`, `packages/db/src/collections/speaker-suggestions.testdb.ts`, `apps/api/src/indexing/session.ts`, existing `speaker-suggest.ts`. Production hook edits are reserved to `/root/docker_runtime`. Required central patch: optional trusted capture resolver in IndexSessionDeps/buildIndexer; default-off tile suggestion flag; invoke adapter with scoped turns after successful indexing; expose its actual outcome. An absent registry/resolver must skip the hook; no origin can be guessed from transcript or request.

## Execution evidence

Root CPU lease explicitly granted by `/root/docker_checker`; released immediately after the focused command exited. The 12-case run passed on the final hashes above, exit 0, tool elapsed 2.8651266 seconds, test duration 2203.0303 ms. Exact output: `qa/evidence/t042-capture-clock-suggestions/maker-test.txt`. Dependency checks show `node_modules/tsx` and `.venv/Scripts/python.exe` present; node resolves to `C:\Program Files\nodejs\node.exe`. Command:

```
# cwd C:\Users\product\Desktop\KnowledgeBase\apps\api
node --test --test-concurrency=1 --test-timeout=30000 --import tsx src/indexing/tile-speaker-suggest.test.ts
```

Permission: `require_escalated` used directly for the scheduler-reported known tsx/esbuild subprocess sandbox restriction; automatic review approved and the focused command completed. Independent checker runs require their own CPU slot from `/root/docker_checker`; do not infer a lease from this historical maker grant. No full typecheck/build/validator/browser has been run by this maker. Root centrally owns broad checks once; their evidence remains a shared integration gate and is not represented as passed here.

Twelve focused tests passed, including exact 20s transformed time origin; 4-person synthetic capture -> actual tenant-scoped suggestion accessor on memoryDb -> review read -> explicit confirmation/aliases; agreement stays suggested; unchanged turns; idempotent human decisions; foreign session/media/capture/tenant refusal; populated foreign suggestion/final-speaker sentinels sharing session/label/person remain byte-identical; second-upsert partial failure followed by idempotent retry/readback; invalid context and source metadata; exact digest, duplicate metadata, out-of-order samples; confidence and recording-bound clipping; contradictory/weak/non-overlapping evidence; failure privacy and loader context mutation. This is synthetic/in-memory evidence, not a real database/platform run. No filed issue is the purpose of this unit; no ledger-corpus substitution.

Static review by independent checker requested the populated foreign sentinel and honest partial-write outcome probes. Both are implemented before the current cycle's READY submission; no verdict/test execution was implied by static feedback.

Resume audit (2026-10-14): own source/test/evidence hashes match; current immediate dependency and lock/package hashes are recorded in `qa/evidence/t042-capture-clock-suggestions/resume-hash-audit.txt`. The original maker run did not capture a complete dependency snapshot, so it remains historical proof and cannot certify unchanged transitive dependencies or the post-install runtime. Fresh independent checking after runtime installation is queued through `/root/docker_checker`. No new maker test was run on resume. Read-only caller search confirms only this adapter/test reference its exported caller: actual production indexing hookup and registry producer remain absent, centrally owned integration gaps.

Latest resume reconciliation: `qa/evidence/t042-capture-clock-suggestions/resume-current-pins.txt` records unchanged own source/test plus the changed current lock (`2AF3AADA...`, previously `376EB619...`) and current immediate producer/store/profile hashes. Fresh independently pinned execution is required. Shared `speaker-suggest.ts` now anchors its model-grounded blocks to turn IDs/transcript hash, but adds no tile registry authority or caller. U24 confirms unanchored tile suggestions may support a human-confirmed quoted identity, while they cannot grant numeric profile block claims. No model-style blocks are invented by this adapter; producer/profile integration remains a full-parent gate. Root runtime received the exact resolver/hook request, and checker was reactivated with current pin status.

## Remaining full-parent gates

No production hook is enabled or claimed here. The trusted capture registry and actual media/capture origin producer must exist before integration. No live selectors, Zoho adapter, four-panelist roster/turn reference, cadence/drift calibration, real Mongo persisted restart evidence, human confirmation on a real sample, or downstream live transcript/KB naming evidence is provided. Existing Zoho sample has three metadata names and cannot replace the four-panelist gate. Adapter PASS can close only this source slice; T-042 remains in_progress.

## Scoped checker close-out — cycle 0

Independent verdict `qa/verdicts/t042-capture-clock-suggestions.md` certifies **PASS — source/fixture adapter slice only**, `Cycle checked: 0`, matching this manifest's fix cycle. Verdict SHA256: `E5EF2C701BEA8FE4FD29183EEE62D32771EAE5EFA833D89B8068513C6F9B9A62`. Maker inspected the persisted verdict, broker receipt and raw stdout/stderr rather than inferring success from a report.

Fresh independent broker execution: `node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/indexing/tile-speaker-suggest.test.ts ../../qa/evidence/t042-capture-clock-suggestions/checker-probe.test.mts`, cwd `apps/api`, outer timeout 60,000 ms. Receipt `qa/evidence/goal-t051checker-broker-t042-independent.json` reports exit 0, 15/15 PASS, 0 FAIL/skipped/cancelled, elapsed 3462.4672 ms, timestamps `2026-10-14T20:55:33.806Z` to `2026-10-14T20:55:37.274Z`. Actual output includes three independent probes for caller/transcript mutation, fully simultaneous ambiguous highlights and acknowledgement loss after durable insertion. The four-person synthetic sample and immediate review/explicit-confirmation consumer pass.

Maker's final read-only check compared all 25 entries in the checker's expanded final pin snapshot: **25 match, 0 mismatches**. Evidence: `qa/evidence/t042-capture-clock-suggestions/maker-closeout-pins.json`. Own source/test hashes remain the candidate hashes above; contract, probe, relevant producers/consumers, current lock, package/runtime metadata and frozen-validator bytes also match. The snapshot covers the inspected dependencies rather than claiming a complete transitive graph. Shared frozen-validator receipt `qa/evidence/goal-t051checker-validator.json` remains applicable with matching validator/registry hashes; it passed vacuously because no frozen contracts exist.

Both handshake fields now read `checked-PASS`. No new test, source change, tracker edit, provider/browser/real database run, deployment or publication was performed during close-out. This completes only the clock-verified adapter slice. Full parent **T-042 remains in_progress / HOLD** for the production, trusted-registry, profile, human and live four-panelist gates above; broad integration checks remain centrally owned.
