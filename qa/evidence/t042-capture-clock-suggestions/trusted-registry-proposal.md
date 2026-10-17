# T-042 next integration seam — proposal awaiting exclusive source lease

The checked-PASS adapter is preserved. A current read-only comparison found all 25 saved checker pins unchanged. Its fifteen tests are not repeated. This proposal does not establish a trusted clock producer, production hook or real webinar result.

## Proposed ownership

- New producer candidate: `packages/meeting-bot/src/capture/tiles/registry.ts` and `registry.test.ts`, only after root runtime grants the exact source lease.
- Existing sampler/recorder/finalizer changes: coordinate their actual source owners; none are edited by this maker.
- API resolver, `indexSession`, `buildIndexer`, shared result types, schema/Git: root runtime owns integration.
- U24 owns grounded profile anchors; no tile-derived model-style attribution block is fabricated.

## Actual current producer inputs

`capture/record-consent/context.ts` defines a validated durable receipt with tenant/session, immutable attempt generation, meeting hash and optional `mediaStartedAt`. Its comment explicitly says that the wall-clock origin does not assert frame/PTS calibration.

`capture/record-consent/finalizer-input.ts` and `capture/record-finalize.ts` bind the privacy-approved finalized media to receipt/public-video digests, measured duration and a sealed transcription-provider input containing exact audio/receipt/source digests plus attempt generation. These are useful existing authorities, but neither proves a calibrated tile/media first-sample timeline by itself.

`py/sb_join_tiles.py` records only raw `startedAtEpoch`, source and observations. It has no independent tenant/generation binding or clock calibration receipt. Reading its metadata cannot create those authorities.

## Required registration and resolution behavior

1. Obtain tenant/session and immutable capture generation from the server-owned capture invocation and validated private receipt store. No HTTP/body/sidecar fields can create the authority.
2. Obtain the actual decoded-media first-sample origin and sampler-instance origin from independently measured producer facts. Require a calibrated relationship that survives the finalized-media/transcription transformation. Process spawn time, file mtime, observed browser readiness and raw sidecar epoch are not substitutes.
3. Bind the exact accepted transcription/finalized media bytes, receipt/source bytes, capture instance/platform, measured duration and calibration identity. Handle remux, masking/trimming and selected effective transcript/index generation explicitly; an unrelated or superseded transcript must not inherit a capture clock.
4. Keep producer artifacts private, confined to configured physical local roots and authenticated tenant/session. Refuse symlinks/hardlinks/redirected paths, arbitrary loader paths, stale generations, altered digests, foreign source/instance and invalid calibration. A module callback is trusted only when composition binds it to the actual validated private producer.
5. Apply the same privacy-approved windows to tile intake. Release observations at private boundaries and prevent holds/lag from carrying private names into public evidence. Do not expose original raw recordings, private transcripts or tile logs. Hash-only provenance and clearly synthetic fixtures may be shared.
6. Produce the existing adapter's `TileCaptureContext` only after all proofs succeed. Missing proof returns a fixed unavailable/refusal outcome and no names. Do not manufacture `clockBasis: shared-host-epoch` from a claimed timestamp or Boolean.

Suggested server-only resolver boundary (interface to finalize with the central owner):

```
resolveTrustedTileCapture(authTenantId, selectedSessionId, committedEffectiveTranscriptBinding)
  -> verified { context: TileCaptureContext, readCapture: ReadTileCapture }
  | fixed unavailable/refusal reason
```

The selected binding must come from the actual committed index attempt and effective transcript; a client-provided hash/generation is comparison data rather than authority. Registration must be reachable from the actual recorder/finalizer invocation, not only a standalone validator or manually prepared JSON file.

## Central hook placement and result

Current `session.ts` invokes model suggestions before `finishIndexAttempt`. A tile hook must run only after a successful committed generation, using the selected effective transcript's scoped turns and verified resolver result. Default-off `LKB_TILE_SUGGEST` means no resolver/file/metadata/suggestion I/O and no new result key. The resolver must be bound in the real production factory, with no fixture fallback.

Call the preserved `suggestTileSpeakersForSession` only with authenticated tenant/session and the verified context. Expose fixed unavailable/failed states honestly; preserve `inserted:null` plus `write-outcome-unknown` after possible partial writes. Naming incompleteness must not be reported as successful identification. All tile or tile/introduction agreement results remain suggested until explicit human confirmation.

## New acceptance proof

An independently checked new unit must exercise a scripted actual producer -> private generation-bound registry -> committed production indexing hook -> existing suggestion consumer. Include mismatched owner/media/generation/source, missing/forged calibration, stale effective transcript, privacy boundaries, altered files/paths, off/no I/O, non-committed indexing and partial-write recovery. Obtain a fresh sole-broker CPU grant and current pre/post pins before execution.

Source/fixture integration evidence will not satisfy full T-042. Live selector/cadence/drift correctness, independently referenced real four-panelist naming, actual human confirmation and live downstream transcript/KB/profile attribution remain separate gates.
