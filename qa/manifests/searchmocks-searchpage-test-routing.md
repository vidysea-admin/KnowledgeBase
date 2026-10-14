# searchmocks-searchpage-test-routing

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: main-red fix (tests only). Class: test-only, no auth/tenancy/data write. Lane: lane/searchmocks. Ledger shard `qa/issues.searchmocks.jsonl` (ISS-SEARCHMOCKS-001, cites ebca1cea).

## What was wrong
Commit ebca1cea (U2.4) added `<SpeakerSuggestions>` to `SessionDetailPage`, one extra GET `/sessions/:id/speaker-suggestions`. Two tests in `apps/web/src/pages/search/SearchPage.test.tsx` used ordered `mockResolvedValueOnce` queues, so the extra call consumed a queued response: (1) App/Nav seam: "expected spy to be called 2 times, but got 3"; (2) session navigation: "Unable to find 'New session source'".

## Change (test file only; no production code touched)
- New helper `routeSuggestions(inner)`: routes by URL pathname; `/sessions/<id>/speaker-suggestions` returns `{suggestions: []}` and is recorded; everything else goes to the original ordered mock.
- Seam test: all original assertions kept; call count stays `toHaveBeenCalledTimes(2)` on the inner (session/transcript) spy; added assertion that suggestions was called once with `/sessions/s%2F1/speaker-suggestions`.
- Session navigation test: original assertions kept; added `inner` called 2 times and the suggestions call for `/sessions/old` happened.

## Evidence
```
apps/web: node node_modules\vitest\vitest.mjs run  -> Test Files 66 passed (66); Tests 703 passed (703)
apps/web: tsc --noEmit -p tsconfig.json -> exit 0
```
## Not verified
Other tests in the file still use ordered mocks; they pass today.
