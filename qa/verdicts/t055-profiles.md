# Verdict: t055-profiles

Verdict: FAIL
Cycle checked: 0
Commit checked: 933ea3f2 (lane/t055-profiles)
ISSUES-WRITTEN: ISS-T055PROFILES-001, ISS-T055PROFILES-002, ISS-T055PROFILES-003, ISS-T055PROFILES-004

## Findings
1. **G1 is fatal on real shapes (high).** `apps/api/src/indexing/promote-entities.ts` writes `claims.topicRefs` as `entityId(tenantId, slug)` = `<tenant>:<slug>` (e.g. `toc:visas`); `GET /graph` topic nodes are `topic:<slug>` with `ref:<slug>` (apps/api/src/fixtures.ts:194). `profileModel.ts` matches `c.topicRefs.includes(node.id)`, so no claim can ever match. Browser run (mock of the real shapes: claim `topicRefs:["toc:visas"]` vs node `topic:visas`, desktop and 375px) shows "No claims are tagged with this topic id" - the claim is not shown. Topic profiles never list claims in practice. Fix is web-side: match the segment after the last `:` of each topicRef to `node.ref` / the node-id slug (claims are tenant-scoped by the API, so no cross-tenant risk).
2. **Claim rows lack quote, speaker and timestamp (high).** Topic-profile claim rows (ProfileViews.tsx) render text, status and a link only. The required quote/speaker/timestamp are not shown (quotes are only fetched for graph evidence rows).
3. **Highlights render claims with no evidence (high).** ProfileHighlights.tsx renders `claims[]` with `evidence: []` ("A claim with NO evidence at all" showed with "No evidence attached."). The only evidence-required guard (`isRow` in apps/web/src/api/claims.ts, outside this lane) covers the claims list, not grounded-content.
4. **Misleading 8-session cap message (medium).** With 12 sessions, evidence rows for the 4 skipped sessions show "Quote unavailable: turn not found in session." The aggregate note ("first sessions only; 4 more") is accurate but vague, and the per-row text is wrong. No data silently dropped.

## Checked and OK
- Links: `/sessions/<id>#turn-<turn>` correct and encoded; open-in-directory link correct.
- 375px and 1280px: scrollWidth == innerWidth on topics/empty/speaker/highlights/collections; long quote clipped at 400 chars.
- States: graph 404 keeps sessions with explicit note; 500 shows error; unauthenticated no request (per tests); loading status present. Speaker page disclaims identity/counsellor role.
- Dev-leaking copy: "see API gap" appears in user-facing empty text (cosmetic, with finding 1).

## Mutation (evidence-required guard)
Per-mutation byte backup, try/finally restore, restored hash == original, tracked tree clean afterwards.
- M1 drop `evidence.length > 0` in `apps/web/src/api/claims.ts` isRow: **SURVIVED** (13 files / 122 tests pass). No test pins "claim without evidence is not rendered".
- M2 break `#turn-` anchor in sessionHref: killed (2 failures).
- M3 remove `topicRefs.includes` filter: killed (1 failure) - but it encodes the exact-id behaviour that is wrong on real data.

## Commands
- apps/web `vitest run`: 82 files pass, 1 fail; 824/826 pass (2 SearchPage failures, inherited from codexwave1, unrelated).
- web `tsc --noEmit -p tsconfig.json`: exit 0.
- `node scripts/lint-loc.mjs --all`: 1 violation, pre-existing `packages/meeting-bot/py/test_sb_join_ownership.py:408`; stale docs/SNAPSHOT.md (generated, pre-existing). No knowledge file flagged.
- Browser (D-024): Playwright fresh headless context, lane Vite dev server (port 5199, stopped by PID), mocked API at 127.0.0.1:3300 mirroring real shapes, throwaway harness entry (deleted). No bot-profile, no port 9333.

## Required for cycle 1
Normalise the tenant namespace in topic-claim matching with a test using `toc:visas` vs `topic:visas`; render quote/speaker/timestamp on claim rows; refuse claims with no evidence in highlights (and test it, killing M1-class mutants); fix per-row text for skipped sessions.
