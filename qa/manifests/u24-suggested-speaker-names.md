# u24-suggested-speaker-names

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: owner decision (D-141, pending append), not a ledger issue. Class: data write + tenancy (new collection, tenant-scoped confirm/reject): FULL ceremony. Verdict by the checker only.
Lane: lane/u24suggest. No ledger shard written (no issue fixed; no new issue filed). Cites "D-141 (pending append)": the entry did not exist when this was built; nothing here edits docs/DECISIONS.md or qa/contracts/.

## Scope (what D-141 asked, what was built)
- Model-proposed names that pass deterministic grounding (verbatim quote with the name, multi-name abstain, floor not contradicted) and get a verifier "yes" on SINGLE evidence are stored as SUGGESTED, each with its quote and kind. Never final until a human confirms; confirm -> final with provenance `human-confirmed`; reject stores the rejection so it is not suggested again. Auto-final stays: deterministic floor + independent-pair.
- Generation is behind an explicit option (`suggest: true`, default OFF). Nothing was wired into config/ai-routing.yaml or any indexing run (`extractSpeakersGrounded` still has no production caller). The only production wiring is the READ/DECIDE API (list/confirm/reject) in `composition/production.ts`.

## Design
1. **packages/index** `speakers-grounded.ts`: `extractSpeakersGrounded(..., { suggest, rejected })`. Final path unchanged (pair mode). When `suggest === true` a second `groundSpeakerProposals(..., "single-verified")` runs over the same proposer runs; `selectSuggestions` keeps only identities whose label and person are not already final, not in `rejected`, and that carry a quote. Result field `suggested` is absent unless asked for and is never merged into `resolved`. `speaker-suggestions.ts`: `suggestionId`, `buildSuggestionDocs` (pure; drops a suggestion with no quote).
2. **Persistence** (how speakers.ts provenance is stored): `ResolvedSpeaker.provenance` is in-memory only; `buildSpeakerDocs`/`speakers` rows persist `evidence` (turnId, sessionId) and drop quote/kind. So suggestions get their OWN collection rather than a state field on `speakers` (a `speakers` row is session-agnostic and a suggestion is per session+label, and a suggestion must be unreadable by every reader of final names). `schema/speaker_suggestions.schema.json` (+ fixtures, `schema/index.json` entry with a unique (tenantId, sessionId, speakerRef, personId) index, generated type, `migrations/20261013100000-speaker-suggestions.cjs` modelled on usage-events, NOT RUN). Checked: no contract or DECISIONS entry forbids a new collection; `schema/validate.py` 29/29; `gen-types --check` OK.
3. **packages/db** `speaker-suggestions.ts` (scopedCollection only): `insertSuggestionsIfAbsent` ($setOnInsert upsert: a row in any state is never reset, so a rejection is a durable tombstone), `listSessionSuggestions` (suggested + confirmed), `listRejected` (feeds `rejected`), `confirmSpeakerSuggestion` (status flip guarded on `status:"suggested"`, then upsert of the `speakers` row with `provenance:"human-confirmed"` and a `confirmations` entry; a repeat re-runs the speakers upsert so a crash between the two heals), `rejectSpeakerSuggestion`. Confirm after reject and reject after confirm are `conflict`.
4. **apps/api** `speaker-suggestions/`: `GET /sessions/:sessionId/speaker-suggestions`, `POST .../:id/confirm`, `POST .../:id/reject`. Scope `sessions` (no new scope minted). Tenant only from the verified key. Not found / other tenant / other session all 404 (no existence oracle). Repeat = 200 `changed:false`. Conflict 409. Malformed id 400. Store failure generic 503. Every response `Cache-Control: private, no-store`. A suggestion is served as `suggestedName` with `quotes`, never as `displayName`/`aliases`/`personId`.
5. **apps/web** `SpeakerSuggestions.tsx` in `SessionDetailPage`: "Suggested: <name>" + quote + kind, dashed amber frame, "unconfirmed" badge, Confirm and Reject buttons; confirmed rows read "Confirmed: <name>" + `human-confirmed` in a solid green frame. Text only (no innerHTML). Panel renders nothing if the endpoint fails.

## Evidence (node from the toolchain; no Mongo, no browser, no network)
```
packages/index  speaker-suggestions.test.ts ℹ pass 9 ; with speakers-grounded/speakers/speaker-docs tests ℹ pass 80 ℹ fail 0
packages/db     speaker-suggestions.test.ts ℹ pass 13 ℹ fail 0
apps/api        speaker-suggestions.test.ts ℹ pass 9 ; with server.test.ts + production.test.ts ℹ pass 19 ℹ fail 0
migrations      speaker-suggestions.migration.test.mjs ℹ pass 2 ℹ fail 0
apps/web (vitest) src/pages/sessions + src/api/speakerSuggestions.test.ts: 5 files, 22 tests passed
schema/validate.py: PASS 29 collection schema(s); scripts/gen-types.mjs --check: OK 29 files
tsc --noEmit with a TEMPORARY tsconfig paths mapping (@lkb/core, db, index -> this worktree; deleted afterwards): packages/index, packages/db, apps/api, apps/web all clean
```
Required tests: tenant B cannot list/confirm/reject A's suggestions (db + api, incl. a body naming A's tenant); confirm -> final with `human-confirmed` (suggestion row + `speakers` row); a rejected name is not re-suggested (db `insertSuggestionsIfAbsent` returns 0 and the row stays rejected; index `rejected` option); a suggestion never appears as final: no `speakers` row is written by suggest/list/reject, and /sessions, /sessions/:id, /search, /ask responses never contain the suggested name (unique token), list rows carry no `finalProvenance` until confirmed.

Mutations (harness in the worktree, deleted before commit; per-mutation byte backup restored in `finally`; `git hash-object` equal to the written blob afterwards): 10 mutations run, 10 killed (mutation 1 needed a stronger variant, below).
1 load() ignores session binding: first run SURVIVED because the in-code belt (`row.sessionId === sessionId`) also guards it; removing filter AND belt: KILLED (pass 12 / fail 1). 2 confirm drops `finalProvenance`: KILLED. 3 re-suggest uses `$set` (overwrites a rejection): KILLED. 4 list reads another tenant's scope: KILLED. 5 reject-after-confirm no longer a conflict: KILLED. 6 `rejected` filter removed: KILLED. 7 suggest flag defaults ON: KILLED. 8 suggestions allowed for an already-final label/person: KILLED. 9 POST loses no-store: KILLED. 10 tenant taken from the body: KILLED.

## Not delivered / not verified
- Migration not applied; no real Mongo (the fake Db has no tenant logic: the real `scopedCollection` runs on top, but real index/unique behaviour is unverified).
- No caller generates or persists suggestions in any run (by instruction). `insertSuggestionsIfAbsent` + `listRejected` + `buildSuggestionDocs` are the pieces a later wiring unit joins; wiring and an ai-routing entry need the Approver.
- `packages/core` was touched minimally and additively because the schema convention demands it: new `generated/speaker_suggestions.ts` (generated) and one `export` line in `src/index.ts`. No other core file.
- `scripts/lint-dirsize.mjs` already failed at HEAD with 6 violations; this lane adds one: `schema/` 31 files (budget 30; one schema file per collection is the convention and the generator requires it). `structure.config.json` was not edited.
- Rejection key is (session, speakerRef, personId): rejecting "Priya" on spk:1 does not suppress her on another label or session.
- Suggestions are served with scope `sessions`; confirm/reject use the same scope (no separate write scope exists in the key model).
- Existing `scripts/sync-speakers`/`writeSpeakerDocs` delete-then-insert by personId would drop the `provenance`/`confirmations` fields of a human-confirmed row if re-run. Not changed here; a checker may want that filed.
