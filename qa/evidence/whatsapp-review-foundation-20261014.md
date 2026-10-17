# WhatsApp review foundation — maker evidence, cycle 1

All commands ran from `C:\Users\product\Desktop\KnowledgeBase`. Fixture data only; no live DB/source/provider connections.

## Focused affected-stage and HTTP downstream tests

Command:
```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/whatsapp/review/detection.test.ts apps/api/src/whatsapp/review/store.test.ts apps/api/src/whatsapp/review/router.test.ts apps/api/src/whatsapp/review/validation.test.ts
```
Exit 0; tool elapsed 2.1130009 seconds; runner 1758.3073 ms. Output:
```text
tests 21
suites 0
pass 21
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1758.3073
```
Coverage: six detection cases, eight actual Mongo-adapter/transaction-fixture cases, five actual Express HTTP consumer cases, two canonical-schema validation cases. Exact evidence, tenant refusal, hostile client principals, immutable decisions, opposite decisions, per-candidate publication, publisher rollback and missing publisher/evidence were exercised. Transaction fixture serializes calls and rolls back its row snapshot; this is not a real Mongo concurrency/persistence proof.

After this run, validation.ts received a TypeScript cast/reference-only repair from `candidateSchema as Rule` to `canonicalRule` via `unknown`. The final candidate's compiler check below passed; independent checker must verify final bytes. No behavior change is claimed from that repair.

## Scoped compiler, final source

Command:
```powershell
node --input-type=module -e "import {spawn} from 'node:child_process'; const p=spawn(process.execPath,['qa/evidence/whatsapp-review-foundation-20261014-typecheck.mjs'],{stdio:'inherit'}); const t=setTimeout(()=>{p.kill();process.exitCode=124},120000); p.once('exit',c=>{clearTimeout(t);process.exitCode=c??124})"
```
Exit 0; elapsed 3.2057219 seconds. Output:
```json
{"scope":"WhatsApp review source/tests with actual API options and transitive dependencies","roots":9,"sourceFiles":258,"diagnostics":0}
```
First scoped attempt exited 1 in 3.1065823 seconds: two TS2352 diagnostics on canonical-schema imported JSON casting; corrected before final check. Initial global API tsc exited 1 in 9.184265 seconds: one fixture ObjectId inference error (fixed) plus six concurrent discovery diagnostics in `gws-calendar.ts`/`youtube-calendar.test.ts`. No global typecheck PASS is claimed.

## Schema and frozen contracts

`.venv/Scripts/python.exe schema/validate.py`: exit 0, elapsed 2.2581897 seconds. Every collection emitted OK; final output `PASS: 30 collection schema(s) validated correctly.` New WhatsApp fixture: one valid passes; one invalid personal-excluded approval is refused.

`python contracts/verify_contracts.py`: exit 0, elapsed 0.4370607 seconds. Output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

An initial `python schema/validate.py` exited 1 in 0.4876744 seconds with missing `jsonschema`. Existing `.venv` had that dependency, so it was used without installation or network calls.

Integrator independently ran `node scripts/gen-types.mjs`: 30 collection types, two files generated (`whatsapp_candidates.ts` plus shared core index). Generator drift verification and global CI are integrator-owned.

## Cycle 2 — independent FAIL repairs and verbatim replay

Cycle-1 checker FAIL remains in `qa/evidence/whatsapp-review-foundation-checker-cycle1.json`; cycle-1 packet is preserved at `qa/evidence/whatsapp-review-foundation-20261014-cycle1-packet.md`.

Two narrow fixes: explicit personal/private medical detail labels (including plural details and qualified labels) are excluded; complete outgoing decision row is canonical-schema validated before the conditional status update or publisher effects. Two standing tests were added.

Exact unchanged independent corpus: `qa/evidence/whatsapp-review-foundation-checker.test.ts`, SHA256 `CFC47D33E4044ADDA0FC76008F625476D51CCAA0ECF53C579D8F53A8E4C1010A`.

Command:
```powershell
node --input-type=module -e "import {spawn} from 'node:child_process'; const p=spawn(process.execPath,['--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import','./.cache/coordination/safe-test-runtime/register.mjs','apps/api/src/whatsapp/review/detection.test.ts','apps/api/src/whatsapp/review/store.test.ts','apps/api/src/whatsapp/review/router.test.ts','apps/api/src/whatsapp/review/validation.test.ts','qa/evidence/whatsapp-review-foundation-checker.test.ts'],{stdio:'inherit'}); const t=setTimeout(()=>{p.kill();process.exitCode=124},120000); p.once('exit',c=>{clearTimeout(t);process.exitCode=c??124})"
```
Exit 0; tool elapsed 2.1825909 seconds; runner 1682.1411 ms. Output: `tests 32; pass 32; fail 0; cancelled 0; skipped 0; todo 0`. Includes all 23 standing tests and the unchanged nine checker tests.

Original finding-1 reproductions: `Personal medical details: password=abc123` and `Private medical details` — 2/2 excluded from publication, no publisher invocation. Original finding-2 reproduction: injected clock `2026-02-30T10:00:00Z` — 1/1 refused before status write, original pending state remains. No recorded case omitted or substituted. Checker had ledger ownership withheld; parent allocation of canonical issue IDs was requested and remains pending at this receipt's creation.

Final cycle-2 scoped compiler command is the same bounded typecheck invocation above: exit 0; elapsed 3.1023783 seconds; output `roots:9, sourceFiles:258, diagnostics:0`. Schema/type file unchanged, so prior schema validation remains applicable. Source freezes and final hashes are in the current cycle-2 packet.

Canonical ledger allocation subsequently confirmed by `/root/security_priority`: **ISS-377: 2/2 original exclusion reproductions refused; ISS-378: 1/1 original invalid audit-clock transition refused.** Both high data-write class. Original probe file/hash/inputs are unchanged, and all nine original independent tests ran in the 32-test replay above. Allocation changed no source or contracts.
