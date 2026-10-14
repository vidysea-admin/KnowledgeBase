# iss-webhigh-002-003-sender-validator-parity

**Handshake status:** checked-PASS
Fix cycle: 1
Tier: ledger issues ISS-WEBHIGH-002 (medium) and -003 (low), requested explicitly by orchestrator. Class: data-write gate (join-rules API) -> full ceremony.
Lane: lane/senderfix, branched from main HEAD 16d20ec9. Ledger rows (qa/issues.webhigh.jsonl) NOT changed here; checker closes.

## What was wrong
- 002: apps/api `isPrintableAsciiSender` restated only `/^[!-~]+$/`; engine `parseStrictEmail` also rejects length > 320 and any of `<>(),;:"\`. No test pinned the two together.
- 003: sender-ascii tests only put the bad email in a one-rule set; `rules.slice(0,1)` in `ruleEmailMatchers` survived.

## Change
- `qa/fixtures/sender-validation.json` (new): 23 rows {name,value,accept}: plain, mixed-case+tag, 2 punycode, exactly 320, 321, U+200B x2, U+202E, U+0430 x2, NBSP, BOM, and each of `< > ( ) , ; : " \` plus a display-name form. Rows are otherwise-valid emails so both validators must agree. ASCII-whitespace-trim tolerance (API-only; engine normalizeEmail trims upstream) is deliberately not a row.
- `apps/api/src/join-rules/sender-ascii.ts`: gate now also requires trimmed length <= 320 and none of `<>(),;:"\`.
- `apps/api/src/join-rules/sender-ascii.test.ts`: fixture parity test (unit + over HTTP on PUT and approvals) and a later-rule test (bad email in rule 2 / rule 3, clean rule 1).
- `packages/meeting-bot/src/calendar/join-rules/sender-fixture.test.ts` (new): `parseStrictEmail` vs the same fixture. Both read the file via fs; no cross-package import.
- No engine change. Engine accepts nothing the API now rejects (no STOP condition): every fixture accept row passes both.

## Reproductions
ISS-WEBHIGH-002: no recorded exact strings beyond the ledger's class list (U+200B, U+202E, U+0430, NBSP, BOM, punycode, `<>(),;:"\`, 321-char); all are rows: 23/23 on API gate, 23/23 on parseStrictEmail. ISS-WEBHIGH-003: recorded mutation rules.slice(0,1) now killed. None left open.

## Evidence
```
apps/api: tsc --noEmit -p tsconfig.json                         exit 0
apps/api: node --test --import tsx src/join-rules/sender-ascii.test.ts   tests 8 pass 8 fail 0
apps/api: all src/**/*.test.ts                                  tests 804 pass 803 fail 1
  the 1 fail = real Python producer + Mongo binding test (same pre-existing environment failure as the webhigh2 manifest); untouched
packages/meeting-bot: tsc --noEmit                              exit 0
packages/meeting-bot: join-rules/*.test.ts + sender-authentication + trusted-sender   tests 155 pass 155 fail 0
```
Mutations (each: backup per mutation, restored in finally, hash-object == HEAD blob afterwards), 9 run, 9 killed:
api drop length check; api length 321; api drop forbidden-chars check; api drop colon; api first-rule-only (003); engine length 321; engine drop colon. (2 further pattern-miss attempts were re-run as the colon mutants.)

## Fix cycle 1 (ISS-WEBHIGH-004)
Checker FAIL cycle 0: the fixture "backslash" row was written `a\b@...` (JSON escape for U+0008), so no row tested U+005C; no empty-string row. Fixed: value is now `a\b@x.example` (parsed: U+005C), added row "empty string" (reject); 24 rows. Every row's decoded non-alphanumeric code points were listed and checked: all as intended, no other escape errors.
Mutants dropping backslash from the forbidden class: API killed, engine killed. Parity tests: api sender-ascii 8/8, meeting-bot sender-fixture 1/1; tsc 0 in both. Hashes of mutated files == HEAD after run.
