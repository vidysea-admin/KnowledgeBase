# Maker manifest — vectorless-retention-proof

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 0
Task: T-046, priority tier 3 (approved vectorless roadmap). Retention eligibility/data-write and tenant safety class; uncapped.
Authority: D-173/D-174 and root's exclusive exact-file lease. No deletion or host activation authorized or performed by this unit.
Contract: qa/contracts/goal-t046.md C1, C2, C7; checker-owned vectorless adaptation pending. Maker never changes ground truth.

## Scoped candidate and boundaries

The processedAt eligibility writer accepts a generation/hash/identity-bound explicit vectorless v4 proof. v4 requires caller retrievalMode vectorless, proof retrievalMode vectorless, lexical done, provenance passed and semanticSupport not-required. Summary/claims/chunks/tree done, strict true, matching positive turn count, source/input hashes, tenant/source/session/workDb/generation, current transcribe/index status, locks and immutable snapshots remain required. Legacy v3 still requires semanticSupport passed and cannot carry vectorless mode. An absent caller mode accepts only legacy v3; it never downgrades a vectorless run.

Actual caller coordination: pipeline_maker owns scripts/webinar/index-proof.mjs and sync-session.mjs; it emits v4 only after persisted lexical/provenance readiness and passes expected.retrievalMode vectorless iff completion explicitly reports vectorless. This manifest does not claim those independently owned files are verified.

No retention policy, 90-day media floor, indefinite text preservation, consent, opt-out, clip-before-delete, purge/execution flag or scheduled task changed. No DB, browser, provider or real media operation.

## Changed files and pins

Both source files were clean at start; base HEAD 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Only these leased source files are changed:

| File | SHA-256 |
|---|---|
| packages/ingest/src/retention/production/retention-processed-proof.ts | 6a5bfe289f0d234f8bdd9f313401d446e0ee7c273dd5245cfa8c65e5f64e0e6c |
| packages/ingest/src/retention/production/retention-processed-proof.test.ts | 42d214e2e452341a1c8fc750bf93959ec7f0bb4a07960bc239c117fe1a4d4f7d |

Changed symbols: ProcessedProofBinding adds optional semantic/vectorless retrievalMode; markSessionProcessedFromProof checks optional mode data descriptor, mode-specific version and readiness. Existing atomic processedAt write and snapshots remain unchanged. Immediate downstream consumer gatherState is exercised by a new vectorless fixture that sees the genuine stamped processedAt/indexed status. Tests also check idempotent rerun, eighteen malformed/missing readiness/hash/generation variants, cross-mode receipts, and an accessor binding that must not execute.

Security flags: tenancy yes (proof identity), writes yes (atomic session metadata), destructive actions no, auth/credentials no new interface. Test fixtures only use fresh disposable temp directories.

## Evidence and pending gates

Requested root broker command (cwd repository):

```powershell
node --import tsx --test --test-timeout=30000 --test-concurrency=1 packages/ingest/src/retention/production/retention-processed-proof.test.ts
```

Execution NOT yet run by maker; no PASS claimed. Root broker serializes CPU use. Require actual command receipt and independent checker of final pinned files before ready-for-check. No filed issue is claimed fixed by this new roadmap behavior. Whole T-046 still requires its actual host, clip extraction, scheduler, real page and separate deletion authorization gates. Root's contracts verifier is required separately; currently empty frozen registry provides no frozen-stage coverage.
