# Native dependency-cycle repair — maker checkpoint

Validation contract: managed-review/1. Unit native-import-cycle-repair, fix cycle 0. Status source-frozen, ready for broker checks; no checker PASS.
Root C:/Users/product/Desktop/KnowledgeBase. Candidate is the dirty byte-pinned source set in source-pins.json. Exact HEAD in head.txt. Before-edit raw bytes/base fingerprints in backups/ and base-pins.json.

Scoped broker diagnosis: qa/coordination/resume-20261015/broker/phase-b-import-cycles.log (9 reported cycles overall; this unit owns native causes only). Dependency-cruiser counts type-only edges, so changing import syntax alone would not resolve reciprocal ownership.

Changes (7 exact paths in pins)
- native-spool.ts imports its admission type directly from neutral native-archive-authority.ts, removing the upward type edge to the archive orchestrator and its provider/finalizer dependencies.
- NativeTabCaptureConfig extracted unchanged into native-media-types.ts. tab-browser and native-tab-receiver consume that neutral type. Receiver no longer imports its parent browser orchestrator.
- Three unchanged physical DTOs moved from tiles/registry.ts into NEW tiles/registry-types.ts. registry reexports the same public type names for compatibility. native-measurement's sole leased import line targets the neutral DTO module.

No runtime functions, branches, guards, issuer WeakMaps, private validation, actual measurement authority or file writes changed. No test files changed or deleted. No public arbitrary capability issuer introduced. Source line counts remain <=300 (spool296, media-types151, receiver155, browser270, registry207, measurement171, registry-types28). Counts are lightweight maker observations, not structure-checker verdicts.

Immediate consumers: browser receiver/config, archive/spool, registry/native measurement and all existing registry type consumers (compatible reexport retained).
Required checks, exclusively broker: exact combined dependency-cruiser command from phase-b-import-cycles-receipt.json; full meeting-bot typecheck; existing browser deferred lifecycle, native spool/archive/finalizer, native measurement and registry focused tests as risk/receipt reuse permits. Scoped structure and applicable mandatory contracts remain required. Existing prior bot/API typecheck PASS belongs to previous bytes, not this candidate. Other actors own workspace/API cycles and indexing relocation; this packet makes no claim about those paths.

Authority: root granted native/*.ts, tab-browser.ts, tiles/registry.ts plus exact tiles/native-measurement.ts import line and NEW tiles/registry-types.ts. Checker skill already loaded for maker policy. No tests/build/providers/DB/browser/decoder commands executed by this maker; only scoped reads, byte backups, edits, hashes and source counts. Actual token/time telemetry unknown (null), token_metric actual_total. Prior review costs/unknown telemetry must be retained; no efficiency claim.