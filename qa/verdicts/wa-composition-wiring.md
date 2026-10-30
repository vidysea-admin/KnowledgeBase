# Verdict (coordinator A) — wa-composition-wiring

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Base: d0416a8e  Head: 1726a3a5 (code head 90096ea5)  Tier: L (dual; auth trigger `apps/api/src/composition/integrations/routes.ts:91`, `whatsapp-admin` on `GET /whatsapp/events` and the admin decision routes)
Date: 2026-10-30  Bound root: D:/KnowledgeBase/.worktrees/wa-composition-wiring  Contract: none specific; plan.md W5/W6/W12, spec R-1..R-21 and R-40; no qa/contracts file.

VERDICT: PASS (cycle 0)

## Check plan (step 0)
Instruments: (1) re-run the manifest verify commands on a `git archive` copy of 1726a3a5 outside the bound root (junctioned node_modules, main-tree `packages/` equals base for this unit); (2) one named falsification per criterion, each in a second archive copy with a per-mutation byte backup, real `timeout 100`, no EXIT trap, `cmp` and `git hash-object` == `git rev-parse HEAD:<file>` after each run; (3) bypass probes through the real `createServer` perimeter (scratch tests in the copy, never committed); (4) a base-vs-head comparison of every red in the full apps/api suite.

## Results
- Re-run (copy): `whatsapp-wiring.test.ts` 2/2. The manifest's C3 command set (router, events-router, selection router, mounted-routes, production, events, service, wiring) -> 74 pass, 0 fail. (A first run on a partial archive showed 4 reds from missing `scripts/`; the re-run on a complete archive was green. Layout, not code.)
- Full `apps/api` suite on head (copy): 2693 tests, 2641 pass, 14 fail. All 14 reds are red on the base archive too, with an identical set: 9 files (`join-rules/sender-ascii`, `knowledge-outputs/repository-adapter`, `source-intake/jobs/privacy`, and 6 `*.mongo.test.ts`, no mongod) plus 4 data-layout tests (`raw/`, `qa/packets`, Python producer) that need directories this archive does not carry. The 14th (compose-requires-database) passes once `docker-compose.yml` is archived. None touches the 6 changed files. No new red.
- `tsc --noEmit -p apps/api`: one error, `repository-adapter.test.ts` cannot find a `qa/packets/*.json` fixture (not in the archive, unrelated file). Nothing in the changed files.
- `node scripts/lint-loc.mjs`: OK (routes.ts 115 lines, knowledge.ts 100).
- Diff scope: 6 files, all in the manifest's list. No consent code, no `.env`, no Dockerfile or compose edit, no router/service edit, no `packages/db` or `schema/` change, no event writer or event payload code touched (`events-router.ts` unchanged; the R-39 allowlist projection `toEventView` and the `candidate.created` per-batch ruling in gate `wa-candidate-created-granularity` are outside this diff).
- Construction is side-effect free: `buildWhatsAppLinks/Selection/Events` create no index and make no network call at build time; only the archiver client object is created. The invalid-config log names the setting, never a value (`knowledge.ts:41-43`). No webhook, registry or outbound sender added.

## Criteria
- C1 PASS. Configured (fake archiver env): anon 401 on events/links/groups; admin 200 on events with tenant-1 rows only; member and viewer 403 on events; member reads the notice (200), creates (201), lists (200); selection answers from the SELECTION SERVICE (409 `link_not_active`), not the 503 fallback. Falsification: remove `whatsappEvents: buildWhatsAppEvents(input.db)` from the spread -> `C1/C3 configured` red (KILLED).
- C2 PASS. Unconfigured, both env shapes (empty, invalid URL/token pair): every route answers 401 (anon) / 403 (wrong scope) / 503 `workflow_unavailable` (right scope), never 2xx, never 404 for an authed caller on a real path. Falsifications: (a) invalid-config gate returns true instead of false -> C2 red (KILLED); (b) events fallback loses `requireScope('whatsapp-admin')` -> C2 red (KILLED).
- C3 PASS. Scope and tenant behaviour unchanged: existing suites green; through the real composition member/viewer are 403 on approve/reject/suspend/revoke/resume and on the events feed; owner-only 403 for an admin-scoped key; tenant-2 admin 404 on a tenant-1 link. Falsifications: (a) owner scope removed from the fallback `PUT .../groups/:jid` -> C2 red (KILLED); (b) `heldAny` `some` -> `every` (catch-all demands both scopes) -> C2 red (KILLED).
- Brief items 3-5 (outside this diff): `candidate.created` granularity is already ruled per batch by gate `wa-candidate-created-granularity`, and this unit adds no writer. `emitBestEffort` (failed event write never breaks a transition) is unchanged. No webhook/outbound call in the diff.

## Falsification (copy; 5 runs, all restored, cmp equal, HEAD-fidelity OK each)
| Crit | Mutant (mine, not the builder's) | Result |
|---|---|---|
| C1 | knowledge.ts: drop `whatsappEvents` from the configured spread | KILLED (configured test red) |
| C2 | knowledge.ts: invalid archiver config -> `whatsAppMultiUserConfigured` returns true | KILLED (unconfigured test red) |
| C2 | routes.ts: events fallback without `requireScope('whatsapp-admin')` | KILLED (unconfigured test red) |
| C3 | routes.ts: fallback `PUT groups/:jid` without the owner scope | KILLED |
| C3 | routes.ts: `heldAny` `some` -> `every` | KILLED |

## Bypass hunt (scratch tests through the real `createServer`, never committed)
- 33 paths x 5 methods, anon: configured and unconfigured, all 401. Principal with an unrelated scope (`read`): only 403/404. Viewer session: never 2xx. Paths included case variants (`/WhatsApp/Events`, `/WHATSAPP/LINKS`, `/links/NOTICE`), trailing slash, percent-encoded verb (`%61pprove`), `//`, `..%2f`, extra segments after `/people`, and PATCH/DELETE.
- Unconfigured, authed members/admins/keys: never 2xx on any of them. `/whatsapp//links` is 404 for authed callers (same as base; nothing opens).
- Differential, 136 requests (17 real routes x 8 principals), configured vs unconfigured: the 401/403 scope verdict is identical for every route and principal. The only 8 differences are a key holding `whatsapp-link` (no user principal): configured, the SERVICE refuses with 403 `not allowed for this caller` after the scope passes; unconfigured answers 503. That direction is safe (the unconfigured answer is the less informative one).
- Partial composition (links wired, selection not, as `linksRig` can build): `/whatsapp/links/:id/groups` is a bare 404 HTML page for member and viewer, not a scope check and not 503. Not open; see P2. `buildKnowledgeIntegrations` never produces that shape.

## Open points judged
- H-11 notice path: confirmed `Dockerfile` has no `COPY docs`, so `docs/whatsapp/notice.md` is absent in the image; link creation answers 503 `notice_unavailable` (fails closed). `docker-compose.yml` forwards `WHATSAPP_MONGO_*` but none of `WHATSAPP_ARCHIVER_API_URL/TOKEN/ALLOW_PRIVATE_HTTP` or `WHATSAPP_NOTICE_PATH`, so a container is "not configured" and all three surfaces answer 503 after scope. Declared by the builder; DevOps owns it (`Approved-by` per H-11). Not a defect of this unit.
- Events gated on the archiver env: confirmed (admin 503 with no archiver env, member 403). Fails closed. See P1 (product call).
- Mirrored fallback route table: complete for all 17 real routes today (differential above). Drift is unguarded; see P2.

## PROPOSED-ISSUE (coordinator A; no ledger rows written)
- P1 (low, product decision, availability): the events feed (Mongo-only) is gated on the archiver service API config, so with `WHATSAPP_ARCHIVER_API_*` unset an admin cannot read events that writers are already filling, and the H-13 in-app admin notification path would show nothing. Fails closed, not a leak. Needs Umesh's call: gate events on Mongo only, or accept the coupling.
- P2 (low, test gap): `mountWhatsAppUnavailable` hand-mirrors the router paths with no drift guard, and the three deps are independently optional on `IntegratedWorkflows`. A new route added to a router silently falls into the any-of-link/admin catch-all (still 503; a member could get 503 where the real answer is 403). Wiring only links, not selection, leaves the groups path a bare 404 (the `routes.ts:95` comment says the fallback covers it, true only when links is also unwired). Suggest a differential test over the router stacks (the scratch differential used here is the shape) and either make the three deps one optional bundle or mount the groups fallback whenever selection is absent.
- P3 (info): `buildKnowledgeIntegrations` logs the invalid archiver config three times (multi-user gate, links, selection). Cosmetic; no value is logged.

## Metrics
reruns 3 (wiring, C3 set, full apps/api suite); falsification mutants 5 (5 killed); bypass requests ~1.4k anon/authed plus 136 differential; files changed 6; base-vs-head reds compared 14 (all pre-existing); tier L dual; cycle 0; ledger rows written 0.
