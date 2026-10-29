# User-accounts role table

**Status:** APPROVED by Umesh, D-207 (2026-10-29). Proposed by unit `ua-session-core` (D-206, spec UA-9). The table in code
(`apps/api/src/user-accounts/roles.ts`) must match this file; a test asserts the structural rules below.

## Role to scope

A session's scopes are derived from the user's **current** role on every request. They are never stored in the session
row, so a role change applies on the very next request. Scope names are the ones `requireScope(...)` enforces
(`scripts/lib/mint-scopes.mjs` is the catalogue).

| Role | Scopes |
|---|---|
| `viewer` | `ask`, `search`, `citations`, `sessions`, `graph`, `gaps`, `calendar`, `sources` |
| `member` | everything `viewer` has, plus `ingest`, `whatsapp`, `whatsapp-link` (new) |
| `admin` | everything `member` has, plus `user-admin` (new), `whatsapp-admin` (new), `join-rules`, `registration:approve`, `answer-policy:read`, `answer-policy:write` |

New scope names `user-admin`, `whatsapp-link`, `whatsapp-admin` were added to `EXTRA_SCOPES` in
`scripts/lib/mint-scopes.mjs` together, so no later unit edits that file.

## What no role ever holds

`hosting`, `keys`, `jobs`, `operations:write`, `automation:read`, `automation:write`, `automation:operate`, `send-now`,
`webhooks`, `gmail`. These stay API-key (operator) scopes. `apps/api/src/user-accounts/principal.test.ts` asserts that
none of them appears in any role.

## Other account states

| User status | Principal |
|---|---|
| `active` with a valid role | scopes from the table above |
| `pending` | scopes `[]`; every route except `/auth/*` answers 403 `account_not_active` |
| `unverified`, `rejected`, `disabled`, or `active` without a role | no principal; the request is 401 `session_revoked` |

## Viewer is read-only by construction (UA-9a)

A `viewer` session is refused with 403 `read_only_role` on any method other than GET, HEAD, OPTIONS, except the exact
allowlist kept in `apps/api/src/user-accounts/viewer-guard.ts` (`READ_LIKE_POSTS`):

- `POST /ask`
- `POST /citations/native/resolve`

`POST /search` does not exist today; if it is added it must be classified here and in that file. The generated
route-enumeration test (`viewer-guard.test.ts`) fails when a mounted write route is not behind the guard.

## Two role systems

Hosting roles (per API key, `PUT /hosting/roles/:keyId`) and user roles coexist and never merge in v1.
A key never acts as a user and a session never carries a `keyId`.

## Approval

Approver: Umesh. Approved by D-207 (2026-10-29); the table above is unchanged since the proposal.
