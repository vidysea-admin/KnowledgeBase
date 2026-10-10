# Verdict — t037-join-rules-persistence

VERDICT: PASS
Cycle checked: 0
Scope: maker commit 1e3e911 (store + test + manifest only; T-037 not claimed complete). Contract `qa/contracts/t037-join-rules-persistence.md`. Security class, full ceremony, uncapped.

## Independent results

Commands run from `packages/meeting-bot`, portable node, each under `timeout`:
- `node --test --import tsx src/calendar/join-rules-store.test.ts` -> tests 12, pass 12, fail 0
- `... join-rules.test.ts` -> tests 24, pass 24, fail 0
- `... schedule-state.test.ts` -> tests 18, pass 18, fail 0
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (meeting-bot only, 5 s) -> exit 0
- `git show --stat --format= 1e3e911` -> join-rules-store.ts (130), join-rules-store.test.ts (131), qa/manifests/t037-join-rules-persistence.md (54). Nothing else. Manifest counts match.

Throwaway probes in the scratchpad against temp dirs only:
1. Fail closed. PASS. Missing file -> empty (tested through the engine: no `join`). Corrupt JSON, empty file, BOM-prefixed JSON, 100000-deep `[` -> `corrupt`. `__proto__` envelope key, unknown key inside `state`, `allow` rule with empty matcher, `domain:"*"` rule -> `invalid`. Embedded tenant number 5 or `"FZ"` -> `tenant-mismatch`. A hardlink `beta.json` to acme's file -> `tenant-mismatch`; a later save of beta replaced the link and left acme's bytes alone. A junction in place of the file: load and save both `not-a-file`, nothing written into the target. (Real file symlinks could not be created without privilege, EPERM; the junction exercises the same `lstat` path and the code rejects any non-regular entry.) Record helpers over corrupt/mismatch files: refused, bytes unchanged (maker's tests plus mutation M4).
2. Tenant isolation. PASS. 42 hostile ids (`..`, `../x`, `..\x`, `a/b`, `a\b`, `C:\x`, `C:x`, `\\?\C:\x`, `\\server\s`, NUL, `\n`, `acme\n`, `acme `, `acme.`, `nul.json`, `con`, `CON`, `NUL`, `com1`, `lpt1`, `a:b`, `a:b:$DATA`, `ACME~1`, `ACME`, Cyrillic a, fullwidth a, soft hyphen, combining dot, `\u2028`, empty, space, 65 chars, `5`, `{}`, `[]`, `["acme"]`, null, undefined, true, an object whose toString returns "acme") through path/load/save: all `bad-tenant`, 0 accepted, nothing created. Exhaustive fuzz of all strings of length 1-4 over a 17-symbol hostile alphabet: 468 accepted, 0 violations (every accepted id is `[a-z0-9_-]+`, resolves to exactly `<stateDir>/join-rules/<id>.json`). JS `$` without the `m` flag does not accept a trailing newline (confirmed `acme\n`).
3. Atomic write. PASS. Failed injected rename leaves bytes identical and no `.tmp` (test and probe); temp name `<file>.<uuid>.tmp` can never equal a loadable `<id>.json`. A getter-backed value that changes between validation and serialisation could not smuggle an allow-all rule (the store serialises its validated copy): `getter saved allow-all: false`.
4. Validators reused. PASS. Only `validateJoinRuleSet`/`validateJoinRuleState` from the engine; no copy. Save of `state:null` -> `invalid`; unknown rule field -> `invalid`; extra top-level key or `__proto__` key on the value is dropped, not written (`SAVED ... includes zzz: false`), so nothing is laundered.
5. Scope. PASS (see stat above).
6. Test strength. PASS for the behaviours mutated below.
7. Evidence. PASS: all counts match the manifest.

## Mutation table (join-rules-store.ts; per-mutation byte backup, 90 s timeout, restore in finally + SIGINT/SIGTERM handler, hash check after each)

| Mutation | Result |
|---|---|
| M1 drop tenant-mismatch check (`parsed.tenantId !== tenantId` -> `false`) | KILLED (1 failure) |
| M2 weaken tenant-id pattern (`/^.+$/`) | KILLED (1) |
| M3 skip validation before write (`clean = value`) | KILLED (1) |
| M4 corrupt JSON treated as empty | KILLED (1) |
| M5 drop size cap on load | KILLED (1) |

5/5 killed, 0 survived, 0 timeouts. (The first runner attempt hit a transient Windows `open` error on a restore write; the file was byte-correct afterwards and the runner was rerun with retrying restore.) Final HEAD-fidelity: `git hash-object packages/meeting-bot/src/calendar/join-rules-store.ts` = `git rev-parse HEAD:...` = 08ae92bd9792d4467358cc4bfec2719a0cd71e80; join-rules-store.test.ts (not mutated) = d254f070c9c4688b5cd06a84b0ea91520e89304f both ways. `git status --short` clean before my files.

ISSUES-WRITTEN: none

EXPLANATION:
Maker's known limits, ruled:
- Symlinked parent of `stateDir` not rejected: acceptable, note only. `stateDir` is operator/process configuration, not tenant input; an attacker who can plant a link in the operator's state tree already owns the state. `schedule-state.ts` has the same shape: `writeWebinarOperationState` does a bare temp+rename with no parent walk (the parent walk exists only in `webinarCompletionState`, a read of a source file). Not a regression.
- Unlocked read-modify-write: acceptable for this slice, note for wiring. `schedule-state.ts` is equally unlocked and the package assumes one scheduler process. Within one Node process the helpers are fully synchronous so they cannot interleave. Cross-process, a lost update could drop an opt-out (fail-open for that meeting); whoever wires the API and scheduler must ensure a single writer or add a lock before switch-over.
Low observations, not filed:
- `saveJoinRules` (the explicit full-replace path) overwrites an existing corrupt or wrong-tenant file with caller-supplied validated data (probe: `save over corrupt: OVERWRITTEN`). Only the record helpers refuse, as the maker documented. No trust expansion (data is engine-validated and written to the caller's own tenant path), and it is the only repair route, but a future rule-editor that saves `{newRules, emptyState}` over a corrupt file would silently drop opt-outs and approvals; the editor should load first.
- A non-string or empty `stateDir` throws a plain TypeError or resolves relative to cwd; caller error, not tenant input.
