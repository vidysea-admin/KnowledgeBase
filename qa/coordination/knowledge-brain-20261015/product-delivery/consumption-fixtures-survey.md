# Consumption fixture survey

Read-only survey, 2026-10-15. No tests, builds, browser, provider, live database or source edits performed.

## Narrow proposed gap

T-056 C8/C11 requires review-to-answer downstream consumption. `apps/api/src/answer-policy/answer-router.test.ts` covers default-denied synthetic HTTP review, preference and usefulness submissions, including 503 `human_review_unavailable`, unchanged stored review state and no feedback. `apps/web/src/pages/answer-policy/PolicyAskPage.test.tsx` exercises candidate review only with a mocked successful `resolveAnswerReview`; it does not consume the authority-unavailable response through the real authenticated client.

Proposed unique source lease: `apps/web/src/pages/answer-policy/TrustedHumanRefusalConsumption.test.tsx`. Exercise actual client/apiFetch with hermetic fetch responses: mounted review retains pending candidate after a 503 refusal, reports failure and never reports successful publication; usefulness submission similarly never displays a saved-feedback notice. No synthetic authority may be described as real human acceptance.

Broker-only command: `pnpm --filter @lkb/web test -- src/pages/answer-policy/TrustedHumanRefusalConsumption.test.tsx`.

## Existing bounded collection consumption

No extra collection fixture justified: `CuratedCollections.test.tsx` already has parameterized preserve/remove tests for saved members outside bounded member choices, including actual serialized PUT membership; `collectionsClient.test.ts` checks exact saved update identity/members. API `collections.test.ts` exercises concrete storage/router CRUD, reload and tenant membership boundaries. Duplicating these would mirror the focused maker tests.

No source lease granted yet. This is a gap proposal, not test evidence or a checker verdict. Whole-parent live/runtime/human gates remain open.
