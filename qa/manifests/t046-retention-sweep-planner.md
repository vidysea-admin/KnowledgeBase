# Manifest — t046-retention-sweep-planner (T-046, retention half)

Lane: T046 (branch `lane/t046`, base 8c8429d). Tier: roadmap task T-046 (tier 3). Touches data-write
adjacent logic (decides purge candidates) so full ceremony applies; the code itself writes nothing.
Round cap: 1 prior PASSed verdict names this seam (`qa/verdicts/purge-retention-policy.md`, T-026); cap is 2, so proceeding.

## What changed

New files only:
- `packages/ingest/src/retention-sweep.ts` — `planRetentionSweep(input): RetentionPlanResult`.
  Pure, read-only, no I/O, no clock read (`now` is a parameter). Eligibility comes from
  `isPurgeEligible` in `@lkb/core` (single copy); windows from `deriveEvidenceClipWindows`.
- `packages/ingest/src/retention-sweep.test.ts` — 16 tests.

Signature: `planRetentionSweep({tenantId, media, claims, turns, now, params:{minAgeAfterProcessedMs, clipPaddingSeconds}})`
returns `{ok:false, errors}` or `{ok:true, plan:{tenantId, items:[{mediaId, decision:"keep"|"purge-eligible", reason, retainWindows}], purgeEligibleIds, tenancyViolations}}`.
Both thresholds are required, finite and > 0; no defaults. Media must carry `processedAt` (ISO string).

Fail-closed cases (all KEEP with a reason): non-object record; missing `_id`/`tenantId`/`kind`/`sourceRef`/`retention`/`turnRefs`;
unknown kind; evidence-clip; `purgedAt` already set; duplicate `_id`; missing/unparseable/future `processedAt`;
age under threshold; unreadable claim anywhere in the input (blocks all); malformed claim citing the media's turns;
a citing claim with an evidence turn not resolvable among this tenant's turns; policy says no; policy throws;
eligible but zero retainable windows. Other-tenant media goes to `tenancyViolations` only and is absent from `items` and `purgeEligibleIds`.
Other-tenant claims and turns are ignored (neither block nor satisfy).

## Evidence

Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` on PATH; lane `node_modules` junctions into main tree
(root, packages/ingest, packages/core), so `@lkb/core` resolves to the main tree source.

`cd packages/ingest; timeout 120 node --test --import tsx src/retention-sweep.test.ts` →
`ℹ tests 16 / ℹ pass 16 / ℹ fail 0` (includes the 300-iteration seeded property test: no item purge-eligible when `isPurgeEligible` says no; both outcomes exercised).

`cd packages/ingest; timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` → exit 0, no output.

`cd packages/core; timeout 120 node --test --import tsx src/domain/purge-policy.test.ts` → `ℹ tests 7 / ℹ pass 7 / ℹ fail 0`.

`node scripts/lint-dirsize.mjs` → `lint-dirsize: OK (109 dir(s) within budget)`.
Dependency rule: `.dependency-cruiser.cjs` allows `ingest → core`; `gap-tracking.ts` already imports `@lkb/core`. depcruise itself was not run (no npx on this machine).

## Not delivered

- No deletion, no purge job, no scheduler, no wiring to Mongo or the filesystem; the plan is data only.
- Not exported from `packages/ingest/src/index.ts` (left untouched on purpose; import by path).
- The concrete retention values remain undecided: ARCHITECTURE Q6 needs the owner's decision on `minAgeAfterProcessedMs` and what "processed" means. `processedAt` is a field this planner requires on media but the Media schema does not define it; a schema/contract decision is needed before any real caller exists.
- `retention.purgeAfterVerified` is validated for type only, not used as a gate.
- The "blocking malformed claim" heuristic is conservative and un-reviewed by a checker.
- Web UI half of T-046 is not touched.

## Fix cycle 1

**What failed (verdict FAIL, cycle 0).** ISS-T046-001 (high): a media record whose `tenantId` was inherited from its
prototype passed the tenant check and was listed purge-eligible. ISS-T046-002 (high): `processedAt` "1", "0", "12", "2020"
passed `Date.parse` and the age check. ISS-T046-003 (medium): mutation "ignore purgedAt" survived all tests.

**Root cause.** The planner trusted the shape of its input: it read fields with plain `raw.x` (own, inherited and getter alike)
and validated a timestamp with the lenient `Date.parse`. Two spellings were found; the class was "any input shape".

**Fix.** New `packages/ingest/src/strict-record.ts`, the one strict reader. A record is accepted only if it is a plain object
(prototype `Object.prototype` or null; not a Proxy via `util.types.isProxy`; not an array or class instance). Each declared field
is read ONCE through `Object.getOwnPropertyDescriptor`; it must be an own, enumerable DATA property (accessors, inherited and
non-enumerable fields are malformed) of exactly the expected primitive type, and is copied into a null-prototype object. Only the
copy is used afterwards (the policy gets a freshly built plain `Media`/`Claims`, not the raw record). Arrays are copied through
own descriptors (Array.prototype only, no holes/accessors, no Proxy). Applied to the input envelope, every media, claim and turn,
and the nested `retention`, `params` and `evidence` records. Malformed means KEEP with a reason, never purge-eligible; an
unreadable claim blocks (all media, or the media citing its turns), as before.
Undeclared fields are ignored and never copied (not rejected): the generated schemas set `additionalProperties`, real Mongo
documents carry extra bookkeeping fields, and none of them can influence a decision. This is a deliberate deviation from the
brief's "unknown fields make the record malformed".

**Timestamps.** No existing strict ISO validator in the repo (only a prefix test in meeting-bot), so: one anchored regex
`^YYYY-MM-DDTHH:MM:SS(.sss)?Z$`, then `new Date(Date.parse(v)).toISOString()` must equal the input (fraction defaulted to
`.000`), which rejects month 13, 30 Feb, 24:00:00 and leap seconds. Offset forms (`+05:30`) are REJECTED on purpose: one
canonical spelling (what `toISOString` writes), no zone arithmetic on a deletion path. Numbers, numeric strings, date-only,
local times, fractions other than 3 digits, and surrounding whitespace are rejected. `processedAt` after `now` stays KEEP.
`purgedAt` must be null, absent, or a valid instant, else malformed (KEEP); a valid `purgedAt` is KEEP "already purged".
`now`, `minAgeAfterProcessedMs`, `clipPaddingSeconds`: finite numbers, > 0, else `{ok:false}`.

**Decision-field table** (all read via the strict reader; failure = KEEP unless noted)

| Field | Used for | Validation |
|---|---|---|
| input.tenantId | tenant scope | own non-empty string, else `{ok:false}` |
| input.media/claims/turns | records | real Array (no Proxy, holes, accessors), else `{ok:false}` |
| input.now | age, future check | own finite number > 0, else `{ok:false}` |
| params.* | age, padding | own finite number > 0, else `{ok:false}` |
| media._id | identity, duplicate count | own non-empty string; bad = KEEP as `index:N` |
| media.tenantId | tenant match | own non-empty string, strict `===`; other tenant = violation; bad = KEEP |
| media.kind | evidence-clip, policy | own, one of recording/audio/video/evidence-clip |
| media.sourceRef | required | own non-empty string |
| media.turnRefs | claim citation | own real array of non-empty strings (empty is policy-KEEP) |
| media.retention.purgedAt | already purged | own; null, absent or strict ISO instant, else malformed |
| media.retention.purgeAfterVerified | not a gate | own boolean (type only) |
| media.processedAt | age gate | absent = KEEP "not processed"; present must be strict ISO, else "malformed processedAt" |
| media.path/tStart/tEnd | none | if present, string / finite number (no decision effect) |
| claim._id/tenantId/status | policy | own non-empty strings; bad tenantId or evidence blocks all, other bad blocks cited turns; other-tenant claim ignored |
| claim.evidence | citation, windows | own non-empty real array of plain {turnId, sessionId} non-empty strings |
| turn._id/tenantId/sessionId | resolve evidence | own non-empty strings, own tenant only |
| turn.tStart/tEnd | windows | own finite numbers, 0 <= tStart <= tEnd |

**Other findings fixed in the audit.** Duplicate (sessionId, turn _id) turns are now dropped so ambiguous evidence cannot
resolve (was last-one-wins). Claims and turns, not only media, were read with plain property access. Any non-null non-string
`retention.purgedAt` (e.g. `0`, `{}`, `true`) was treated as purged only by accident of `!== undefined`; it is now explicitly
malformed. A getter on `evidence`, `status` or `tEnd` can no longer change between reads. Behaviour note: a
prototype-inheriting record is now "malformed record (not a plain object)" rather than "missing tenantId" (stricter, still KEEP).

### Evidence (cycle 1)

PATH includes the node dir from cycle 0. All from `packages/ingest`.

`timeout 120 node --test --import tsx src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` ->
`ℹ tests 28 / ℹ pass 28 / ℹ fail 0` (the 16 cycle-0 tests unchanged and passing; 12 new, including a 3000-case seeded hostile
property test over 12000 media records with inherited fields, accessors, Proxies, numeric-string/offset/impossible dates and wrong
types, asserting every purge-eligible id is a plain own-typed record, tenant `toc`, strict ISO `processedAt` old enough, no
purgedAt). The same 12 new tests run against the cycle-0 planner source: 11 fail, only the sanity test passes, so they bite.

D-015 counts against each issue's own recorded reproductions (verbatim from `qa/issues.t046.jsonl`):
- `ISS-T046-001: 1/1` refused (exact `Object.assign(Object.create({tenantId:'toc'}), {...})` record -> KEEP, not in purgeEligibleIds).
- `ISS-T046-002: 4/4` refused ('1','0','12','2020' -> KEEP "malformed processedAt"); the 3 already-kept values (garbage, tomorrow, 2026-09-26x) still 3/3 KEEP.
- `ISS-T046-003: 1/1` killed (its recorded mutation M3, `if (false) {` replacing the purgedAt guard, now fails 2 tests: 26 pass / 2 fail; file restored byte-identical, `sha1sum -c` OK), plus a valid purgedAt is never eligible and 9 malformed purgedAt values are KEEP.
No recorded reproduction is left open.

`timeout 120 node --test --import tsx ../core/src/domain/purge-policy.test.ts` -> `ℹ tests 7 / ℹ pass 7 / ℹ fail 0`.
`timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (109 dir(s) within budget)` (before and after).
Sizes: retention-sweep.ts 232 lines, strict-record.ts 92, retention-sweep.test.ts 231, retention-sweep.strict.test.ts 275.

Not verified: depcruise (unavailable); no DB or full suite run (shared CPU).

Status: checked-PASS
Checked: qa/verdicts/t046-retention-sweep-planner.md (cycle 1, 09e8443)
Fix cycle: 1
