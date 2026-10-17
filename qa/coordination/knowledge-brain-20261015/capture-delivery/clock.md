# Sampler clock witness slice — integrated source, broker checks pending

Maker: /root/capture_delivery_coordinator/clock_gaps. Tier 3, T-042 remaining producer work. Fix cycle 0. Base HEAD: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`; candidate working tree, not committed. Usage tokens/cost and exact active seconds unknown; no measured checker ratio claimed.

Granted six source paths: `packages/meeting-bot/py/sb_join_tiles.py`, `py/test_sb_join_tiles.py`, new `src/capture/tiles/sampler-clock.ts`, new `sampler-clock.test.ts`, `src/capture/tiles/registry.ts` (all under meeting-bot) and `qa/evidence/t042-trusted-registry/fixture.ts`. Central explicit extension, relayed by coordinator, supersedes prior registry/fixture freeze for this narrow candidate. Actual registry ingestion is now wired; no test has been executed locally.

Actual producer path: `py/sb_join.py` calls `tile_clock`; existing `src/capture/reconnect-gaps.ts:129-130` forwards managed `LKB_CAPTURE_CONTROL_GENERATION`. Sampler validates that UUID, derives host digest, generates unique sampler instance, measures epoch-before/monotonic/epoch-after, and derives tSec from monotonic elapsed. Backward monotonic or >0.25s epoch discrepancy permanently poisons stream with an invalidation marker. Missing managed generation disables tile evidence without affecting recording. Disabled capture returns the same time object before witness work. Display names remain untrusted suggestions. No screenshot export or media files changed.

`ingestSamplerClock` validates the complete stream against independently supplied generation/host/instance, epoch interval and uncertainty/drift limits. Witness fields are stripped from returned observations. It does not certify decoded sample zero. Actual consumer: registry `publicSidecar`, before privacy filtering, called from enabled `resolve` only after independent decoded measurement and budget validation. Older witness-free raw inputs now honestly refuse; existing accepted adapter receives only derived public rows and needs no edit. Synthetic fixture now emits matching witnesses. Native decoded authority/committed hook and full T-042 remain HOLD.

Contract: `qa/contracts/t042-trusted-registry-integration.md` R2/R3/R4/R8/R11/R14; existing contract unchanged. Relevant consumers: registry publicSidecar -> existing tile adapter -> suggestion review/human confirmation. No auth change or DB write. Private raw artifact validation and privacy filtering remain registry-owned.

Base SHA256: Python sampler `9984E9A700497E57A2B8944DAB25CE82843A9A735C66F79DFD59DA58D1387A8A`; Python tests `624D58CB2A145B54F842F9AA74F4F46C2E6C74639FF194FEBC1F7482FCF73298`. New TS files had no base. Requested consumer originals: registry `E274FD2848178CB041A1ED663E33C5CE1D6E66974F8AB71230AFA0D596DF548C`; fixture `3B3C7C19833D72CB067B9644A4B35593628C444FDD53B2DF15BE86031482F3B0`.

Required bounded broker check: preflight existing interpreter/import containment and writable basetemp. Supply absolute `LKB_SAMPLER_TEST_PYTHON` for Node test's actual standard-library Python emission subprocess (`-B -c`, 5s timeout, no browser). Run Python `py/test_sb_join_tiles.py`; run Node `sampler-clock.test.ts` plus registry and existing registry downstream probe in one bounded ordinary grant. No local test/typecheck/build/validator/provider/browser/native DB run was launched. Authored cases cover monotonic cadence, backward/forward jumps, irreversible invalidation, unique instances, missing authority, foreign identities, forged elapsed and missing witnesses; registry privacy check and native-missing-authority refusal are required. `git diff --check` on the two tracked Python edits exited 0 (no output); this is formatting evidence only.

Frozen candidate SHA256:

```
packages/meeting-bot/py/sb_join_tiles.py 1A7436579A6BFADE1C9C6AD94F5E47E6C04CD8779A90BAF8A993729A039FA7FD
packages/meeting-bot/py/test_sb_join_tiles.py 8716A26C2F9C72A7CDBA1057F39234D6486976F3359AF95917D80EC234B5500E
packages/meeting-bot/src/capture/tiles/sampler-clock.ts 3F583A0B203A5A6358019D39F97B0773471BE51F32A1CAD536105528168C6480
packages/meeting-bot/src/capture/tiles/sampler-clock.test.ts 56DE6A8E9FF76B47544C5F2EA2718C36AAF75973A222C0AB77352A947007C4D4
packages/meeting-bot/src/capture/tiles/registry.ts B7E5DA4983192FBE4E029D35D36A523CC2D454EC25439B173F3CC3157B18F1A2
qa/evidence/t042-trusted-registry/fixture.ts 7802CF755EC8839814E320BFFC36E4EEF600294605911FB8E59F3930B901A827
```

Affected receipts: old `qa/manifests/t042-trusted-registry.md` registry/fixture hashes describe the previous candidate, so its pending source/fixture evidence cannot certify these changed bytes. Existing original adapter verdict remains scoped and unchanged; no rerun or new native proof inferred. Central owner must reconcile registry handshake and broad coherence receipts. No checker verdict is issued here.
