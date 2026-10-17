# u24-cloud-suggestion-routing

**Handshake status:** checked-PASS
**Status:** checked-PASS
Fix cycle: 0
Priority tier: 3 — U2.4 deployment integration under D-131/D-141.
Class: credential handling; full maker/checker ceremony. No issue closure claimed.
Base: `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`.

## Authorized scope
Add an explicit distinct-model Ollama Cloud route pair for speaker suggestions, with lazy
construction, required tenant-bound job accounting, fixed cloud destination, redirect refusal,
bounded cancellation, and failure redaction. Suggestions-only metadata never authorizes an
automatic final identity. Existing auto-final precision gate remains blocked.

## Candidate and packet
Only two new source paths (neither had a base file):
- `apps/api/src/speaker-routing/routing.ts`
- `apps/api/src/speaker-routing/routing.test.ts`

Packet: `qa/packets/u24-cloud-suggestion-routing.md`.
No active u24smart edits, production composition, provider adapter, index implementation,
schema, config, migration, data, contract or protected governance file changed.

## Evidence
Focused affected-stage + existing-verifier immediate downstream check:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/speaker-routing/routing.test.ts`
Exit 0; tests 9; pass 9; fail 0; cancelled/skipped/todo 0; duration 2233.9424ms;
wall 2.7136893s. Tests include tenant-bound success/failure ledger and actual llmVerifier consumption.
`git diff --check -- apps/api/src/speaker-routing`: exit 0 (new source is untracked).
No live providers, browser or database used. No mutation harness run.
Independent checker PASS cycle 0: `qa/verdicts/u24-cloud-suggestion-routing.md`.
Independent focused + downstream + adversarial check: 12/12 pass, exit 0; wall 2.390s.
`C:\Program Files\Python312\python.exe contracts/verify_contracts.py`: exit 0,
`no frozen contracts yet ... PASS by vacuity`; wall 0.141s.
Full command/output evidence: `qa/evidence/u24-cloud-suggestion-routing-check.json`.
Source hashes independently checked before/after and maker rechecked before close-out,
matching the packet. Only helper scope closes. Shared final API typecheck, production
integration, live suggestion/confirm/reject and whole-U2.4 acceptance remain separate.
