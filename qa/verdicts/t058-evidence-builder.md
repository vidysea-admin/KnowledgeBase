# t058-evidence-builder — independent cycle 0

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

Scope: bounded literal evidence-output foundation, clauses 1–8 of `qa/contracts/t058-evidence-builder.md`. This is not AI FAQ/summary/decision synthesis or a production feature. T-058, T-056, T-059 and catalogue C10/C11/C12 remain unaccepted; no API/UI/persistence/export/live-user acceptance is claimed. Caller authentication and authorized session selection must be supplied by future integration.

## Checked bytes and provenance

Both manifest fields were ready-for-check and packet cycle 0 READY at 2026-10-14T08:55:05.9644332Z. Source/test pins matched before commands and again at 08:56:16.8239078Z before verdict. Complete new source and tests, generated Claims/Turns, ARCHITECTURE H3/tenancy, current catalogue and relevant unchanged SessionDetailPage consumer seams were reviewed. No source or provider changes were made by checker.

- `packages/core/src/knowledge-outputs/evidence-builder.ts`: SHA256 `A2E344390C8DA421076FD9869F69CC9B440BACC265C50DA3611465DD46ECA291`
- `packages/core/src/knowledge-outputs/evidence-builder.test.ts`: `FA002FF46E5D055FD88A06EF63FDBE8556CDA99837DD2339919E4CFDC02A8123`
- Submitted manifest: `3FE61C05D09FED03BAABD63F18883D6962E971B28956E92B526BBB8487722990`
- Submitted packet: `6555CF9FB25FDDA0DF0F939427FA57BF72F2823732B9F9917DA7C12723507EAC`
- Checker-owned contract: `FC1C97382A7BAB35D8691DB2C541D4DA6F078F12A6ED7FD6AC2D7B84C0F643E9`
- Generated Claims dependency: `84D6B5612E7085A3BEDA89C5BAC9B7640407AAB70EFF4B703334B543D051E97E`; Turns dependency: `B4969CB780F97AC1579D753F271C4E4F7A69F95FCAC9FD76BA8D792F082D0205`.
- Existing SessionDetailPage consumer: `6B68632434AC46D3871C79C67600DDB20B5C148523940737770297E441C14FFF`.

Dependency hashes were recorded at final review; only candidate source/test pins are claimed to have been validated both before and after execution. All candidate files were newly added/untracked relative to packet base `4f449b27`.

## Independent checks

17/17 test-run entries passed: 16 focused source tests plus one independent harness. The harness exercised successful exact multiline literal output, JSON consumption and Unicode/path/Markdown metacharacter links; executed the exact small existing SessionDetailPage hash-decoder and DOM-id bodies extracted from its unchanged source; and checked 11 refusals (status, case-sensitive fabricated quote, mixed good/missing evidence, wrong authorized session, wrong turn session, reversed/nonfinite timing, duplicate identities and unreferenced foreign claim/turn rows). It does not mount React or prove live browsing. Actual TOC sample contained 3 needs-review claims and 51 turns: all 3 claims withheld, zero excerpts, unavailable coverage. Source tests independently verify sample bytes unchanged. No sample status was promoted or factual interpretation invented.

Direct review confirms whole-input tenant refusal with fixed error text; only verified claim selection; all-evidence source/quote resolution before any claim excerpt; finite ordered source ranges and stable speaker references; document/URL character units; explicit empty/partial/unavailable coverage; and escaped literal Markdown with internally derived real links. Claim text never supplies factual output. No network/database/providers/persistence occur. The exposed API still relies on a trusted authenticated caller, which is a remaining integration gate rather than a supplied auth implementation.

No filed issue-fix corpus applies. New seam had zero previous PASSes. No mutation runs or broad suites were performed.

## Commands and receipts

1. Exact argv: `["C:\\Users\\product\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe", "--test", "--test-isolation=none", "--test-concurrency=1", "--test-timeout=30000", "--import", "./.cache/coordination/safe-test-runtime/register.mjs", "packages/core/src/knowledge-outputs/evidence-builder.test.ts", "C:\\Users\\product\\Desktop\\KnowledgeBase\\.cache\\coordination\\t058-independent-cycle-0\\probe.ts"]`; cwd repo root. Outer subprocess timeout 120s. Start `2026-10-14T08:55:13.274356Z`, end `08:55:14.212272Z`, elapsed `0.9381649s`, exit 0, 17/17, no skips. Output `.cache/coordination/t058-independent-cycle-0/focused-and-independent.log`, SHA256 `4ede693f1a7e07e2df627c6f80a90bbe9a67f1153f4ef1118427354e5a51843a`; exact receipt `focused-command.json` in that directory.
2. `.venv/Scripts/python.exe -B contracts/verify_contracts.py`; cwd repo root. Start `2026-10-14T08:55:42.0272260Z`, end `08:55:42.1969334Z`, elapsed `0.1567229s`, exit 0. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Output `contracts.log`, SHA256 `81494EDFFC921EE45DA0965775DB137B8CF18B0643F776D736A7F513799120B8`; receipt `contracts-command.json`. This required check proves no frozen stage behavior because the registry is empty.

The combined Python harness exited 1 *after* the successful Node process because cp1252 stdout could not print a checkmark. The original Node log and exact receipt printed before the wrapper exception were retained. Checker recovered the receipt verbatim, fixed only its ignored evidence runner's stdout handling, and ran the outstanding validator directly. No product test failed or was omitted; no product tests were unnecessarily repeated. This wrapper failure is disclosed, not counted as passing end-to-end harness execution.

Attributed maker evidence: packet reports 16/16 focused tests, vacuous validator, and isolated strict TypeScript invocation exit 0 in 1.7111071s: `node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2023 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck --types node packages/core/src/knowledge-outputs/evidence-builder.test.ts`. Typecheck was against final implementation but before one test string expectation changed; it was not independently rerun and is not represented as a final-test-byte typecheck receipt. Independent behavioral evidence above is complete for this scoped contract.

## Timing and explanation

Actual dispatch/launch time was not sampled: UNKNOWN. First measured source-review checkpoint was `2026-10-14T08:42:11.9253415Z`; initial consumer/catalogue review checkpoint `08:43:48.1366162Z`. Much work occurred before maker READY; runtime coordinator serialized local commands and checker awaited maker receipts/READY. Exact queue-start and slot-grant delivery timestamps were not independently sampled: UNKNOWN. No user escalation was required. READY/hash review checkpoint `08:55:05.9644332Z`; command intervals above; final hash checkpoint `08:56:16.8239078Z`. Draft-start was not independently sampled: UNKNOWN. Persist confirmation and measured first-checkpoint-to-persist elapsed are recorded immediately after this verdict exists in `.cache/coordination/t058-independent-cycle-0/persist-receipt.json`; launch-to-verdict cannot be derived from an unknown launch. No claim of the 120–180s efficiency target is made. Waiting for candidate readiness/serialized CPU execution and the small wrapper-output repair explain necessary continuation; no interval is falsely assigned by subtraction.

EXPLANATION: Scoped foundation is correct under the contract; issue-free verification is complete. Real authenticated wiring, AI synthesis, persistence/export/UI, browser acceptance and whole-task/catalogue completion remain open. Maker may close only this cycle for unchanged source bytes.
