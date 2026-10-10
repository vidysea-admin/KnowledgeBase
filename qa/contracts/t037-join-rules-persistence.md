# Contract — t037-join-rules-persistence (T-037, unit 2: persistence slice)

> Ground truth for `packages/meeting-bot/src/calendar/join-rules-store.ts`. Written by the checker; the maker never edits it.
> Not in scope (T-037 stays open): edit API/UI, scheduler switch-over, sender authentication (ISS-322/333), "next webinar with no click" end to end.

## Security property
Stored rule data can only make `evaluateJoinRules` return `join` if it was written through the engine's validators for that same tenant; any unreadable, foreign or malformed stored data yields an error (or empty rules), never permissive data. No tenant id reaches a file outside `<stateDir>/join-rules/<id>.json`.

## Criteria
1. Missing file -> empty rule set + empty state; engine returns no `join`.
2. Corrupt JSON, schema-invalid, unknown envelope field/version, oversized, directory/symlink/junction in place of the file, embedded tenant != requested: all throw; record helpers never overwrite such a file.
3. Tenant id is a closed charset; `..`, separators, drive/UNC/`\\?\` forms, NUL/control, trailing dot/space, device names, ADS colon, 8.3 forms, look-alikes, case variants, over-length, empty and non-string ids are refused with `bad-tenant` and touch nothing.
4. Writes are atomic: failure leaves the prior bytes identical and no temp file; content is validated by the engine's own validators before writing; save then load cannot turn invalid data into valid.
5. Scope: only the store, its test and the manifest change; no caller or trust code.
6. Tests assert 1-4 (mutation: dropping the tenant check, weakening the id pattern, skipping pre-write validation, corrupt-as-empty, dropping the size cap each fail the suite).
7. Manifest evidence matches reruns.
