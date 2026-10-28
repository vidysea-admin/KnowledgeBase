# Installer cycle1 — exclusive handle repair

Status: staged-awaiting-broker. Global files untouched. Previous rollout-verdict.md FAIL remains unchanged, SHA194f69bd5c781add7bacad62c08f6af96930b4da0f5de6ab0edccd12b8294c0b. Failed original installer preserved as install-canonical-helper.cycle0.ps1. Approved helper36b165... and staged docs924f571... are unchanged.

## Repair and boundaries

The target is opened with FileShare.None before any target read/hash validation. Its exclusive read/write FileStream stays open through base verification, candidate write, durable Flush(true), same-handle readback and restoration after an own-attempt failure. No target rename, Move-Item or Copy-Item occurs after validation or release. File identity and ACL are retained. Lock acquisition or wrong base refuses before backup/write. Byte backup is exclusive CreateNew inside QA, flushed and verified while held. Already-current returns no writes. Main path still parses exact pinned helper PASS/cycle0/base/candidate.

This is not crash-atomic replacement. Process/OS interruption may leave partial bytes; durable backup remains for explicitly reviewed recovery. Unknown partial target bytes refuse automatic installation. A live write failure restores original bytes only during our own attempt while the exclusive handle is still held. No automatic overwrite follows release.

## Pins and broker plan

- Installer ba16241a88e32e0b64cec0ea3740708cc43574044c9e97ced00a382e135066be.
- Five-case isolated test204001b889e3e24c1e3eadef72aec632a458e1a61e4ff4c5ad5cbc688bec145f.
- Exact failed→repaired delta4f4b774fbe4748b87865b531b13150f49a276e01a6734fd5109f86a362775370.

Broker only: execute test-installer-lock.ps1 under existing PowerShell with outer20second timeout; preserve complete output/exit and before/after pins. Dot-source -DefinitionsOnly loads functions without global install. Fixtures stay in this directory's installer-fixtures/GUID and are retained, not recursively deleted. Cases: wrong base untouched; successful write/readback+backup; idempotent no-op; competing writer lock refusal; injected partial-write failure restoring original bytes. Main canonical installer must not be run during tests. No local tests were executed by maker.

Prospective implementation segment111.25seconds, explicit waits0; tokens/cost unknown. Evidence installer-cycle1-maker-start/end.json; not a total-maker usage claim. New independent review/rollout requires separate admission; prior FAIL and accounting remain retained.
