# Workspace cycle repair — FROZEN, cycle 1

Owned paths:
- packages/meeting-bot/src/capture/workspace/capture-workspace-types.ts (new)
- packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts
- packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts

CaptureWorkspace moved byte-for-byte to neutral types module. Readiness imports it directly; workspace imports and re-exports it, keeping existing consumer imports compatible. The former type-only back edge still counted under dependency-cruiser's tsPreCompilationDeps policy; extraction removes that edge. No runtime code, authority, validation, acceptance checks, tests, dependencies, contracts or enforcement changed.

Base SHA and raw byte fingerprints: pins.json. Raw pre-edit backups: backups/. Existing unrelated dirty files untouched. Candidate source bytes are frozen by pins.json; exact combined candidate SHA remains parent/broker responsibility. No local commit: checks not yet available. Maker actual tokens/active usage unknown; no efficiency claim. No PASS claim.

Required remaining gates: structural cruise on combined candidate, scoped readiness/workspace behavior checks and meeting-bot typecheck via broker; independent checker verdict on resulting pinned candidate. Maker executed only read/status/diff/hash operations and this narrowly scoped edit; no tests/build/DB/provider/browser commands.
