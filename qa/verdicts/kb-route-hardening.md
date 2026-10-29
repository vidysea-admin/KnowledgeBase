# Verdict — kb-route-hardening
**Cycle checked:** 0
**VERDICT: FAIL**
**Checker:** A (fresh, blind dual; bound to D:/KnowledgeBase, worktree .worktrees/kb-route-hardening)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** be9c8608..8e0263d1 (code commit 419b198e; 8e0263d1 adds only the manifest)
**Scope note:** consent behaviour is out of scope per D-210 (Approver directive). Consent-only checks (C1 consent half, C4 consent projection pin, M1) are marked "out of scope per D-210": neither passed nor failed here.

## Independent evidence (re-run by checker, one file per invocation, timeout, bound tree untouched)
- route-router.test.ts 16/16, route-store.test.ts 20/20, bm25-router.test.ts 16/16, search-cache.test.ts 15/15, search-store.test.ts 21/21, routes/search.test.ts 11/11; packages/ai providers.test.ts 26/26, router.test.ts 9/9. Identity matches the manifest's Pre-checks.
- vectorless-routing.test.ts 3/4: the one failure ("Compose requires an explicit database...") is a docker-compose.yml `bot:` service naming GEMINI_API_KEY/OLLAMA_API_KEY; docker-compose.yml is not in the diff, so pre-existing and unrelated. The D-207 test passes.
- `tsc --noEmit -p apps/api/tsconfig.json` exit 0, no diagnostics.

## Per criterion
- C1 non-consent half (any other visibility change, very next call): PASS. Fingerprint bound into /route cache; mutant "never read the fingerprint" -> 6 fail. Consent half: out of scope per D-210.
- C2 index failure: PASS. sessions projection without `status` -> route-router.test.ts 1 fail (e2e index test).
- C3 fail-safe + WA never cached: PASS. constant fingerprint on read failure -> 1 fail; cache WA results -> 1 fail.
- C4 projection-honouring fake: PASS for the session-status pin (above). Consent projection pin: out of scope per D-210.
- C5 CONFIDENCE_MARGIN: PASS. 1.25->1.2: 2 fail; ->1.3: 2 fail.
- C6 abort: the abort mechanics PASS (see mutants), but the hard-deadline guarantee is regressed, see F1. FAIL.
- C7 maxTimeMS: PASS on presence (drop maxTimeMS: route-store 2 fail, search-cache 1 fail; /search store unwrapped: 1 fail). Gap: see F2.
- C8 flash-lite route chain: PASS. chain `route`->`ask`, thinkingLevel minimal->high, yaml `route: [gemini]`, model 3.5->2.5: each +1 failure in vectorless D-207 test; gemini.ts drops thinkingConfig: 1 fail.
- C9 docs: FAIL in part. docs/api/route-endpoint.md line 40 states 503 route_timeout is "never a hang"; F1 shows a path introduced by this diff that hangs.

## Falsification (copy under scratchpad chk/, junctioned node_modules; per-mutation byte backup, restored, `git hash-object` == `git rev-parse HEAD:<file>` verified for every mutant: all OK; bound tree never mutated)
20 mutants, 19 killed. Killed: C5 x2, C2, C3 const-on-failure, C3 WA caching, C1 fingerprint-not-read, C6 request-abort in router catch, C6 step-B timeout no abort, C6 check() ignoring signal, C6 router keeps trying providers, C6 gemini drops signal, C7 no maxTimeMS (route), C7 no maxTimeMS (search-cache), C7 /search store unwrapped, C8 x5.
Survived: C7c (`Math.min(options.maxTimeMS, cap)` -> `options.maxTimeMS`): see F2.

## Adversarial hunt (auth / tenancy / data-write)
- Tenant isolation: cache bucket and fingerprint both keyed by the verified `req.auth.tenantId`; fingerprint rows scope-checked against tenantId; no cross-tenant path found. No data-write added.
- ABA/race: a visibility change between the fingerprint read and compute caches under the OLD fingerprint, so the next call recomputes. No stale-serve found.
- F1 probe (probe in scratchpad, not product): `fingerprint: () => new Promise(() => {})` with default deadline -> the HTTP client gave up after 8013 ms with no response (a stalled `route()` gives 503 at the deadline, existing test line 67). The fingerprint await at route-router.ts:38 sits before the `Promise.race` timer starts and before the `try`.
- F1b probe: `createRouteDeps` without a connected db -> `fingerprint` arrow evaluates `getDb()` synchronously, throwing outside the handler's try -> 500 `internal_error` (base behaviour: 503 `route_unavailable`). Fails closed, no leak.

## Findings
- F1 (criteria C6/C9): the visibility-fingerprint read added to the /route handler (route-router.ts:38) runs outside the hard-deadline race and outside the try. A Mongo network stall or outage (driver server selection, no client-side bound; maxTimeMS is server-side only) hangs the request beyond the 3 s deadline; a synchronous `getDb()` throw returns 500 instead of 503 `route_unavailable`. Contradicts docs line 40 ("never a hang"). Fix direction: start the deadline timer before the fingerprint read (race it, treat timeout as cache bypass or 503) and make the `fingerprint` dep async so a sync throw becomes a rejected promise.
- F2: no test pins that a lower maxTimeMS on a call wins over the deadline cap, so the clamp for search-reader's own per-read maxTimeMS is unguarded (mutant C7c survived).

ISSUES-WRITTEN: none (dual check: checker A writes no ledger rows)
PROPOSED-ISSUE: medium | availability/deadline | apps/api/src/route/route-router.ts:38 | /route fingerprint read is outside the hard-deadline race and the try: a stalled or unreachable Mongo hangs the request past 3 s (probe: no response in 8 s) and a sync getDb() throw gives 500 internal_error instead of 503 route_unavailable; docs/api/route-endpoint.md:40 "never a hang" is false for this path
PROPOSED-ISSUE: low | test-coverage | apps/api/src/search-cache/search-cache.ts (withReadDeadline) | mutant `Math.min(options.maxTimeMS, cap)` -> `options.maxTimeMS` survives all route and search-cache tests; the lower-wins clamp over search-reader's own maxTimeMS is unpinned

## Metrics
Metrics: start=2026-10-29T00:00:00Z end=2026-10-29T00:00:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=20 cycle=0 resumes=0 tokens=unavailable builder_min=150 check_min=35 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 mutants=20 defects_unit=1 defects_6c=0
