VERDICT: FAIL
Cycle checked: 0
Unit: t046-retention-sweep-planner, commit c947689, branch lane/t046. Security class (tenancy + data destruction); not round-capped.
Scope / remaining gates: planner must never list a media item purge-eligible wrongly. Two inputs do. Web half of T-046, wiring, and Q6 retention values remain open (out of scope).
Date: 2026-10-10. Timing not measured per phase.

## Commands (all run from the lane worktree, node from the codex runtime, each under `timeout`)
- `timeout 120 node --test --import tsx src/retention-sweep.test.ts` (packages/ingest): tests 16, pass 16, fail 0.
- `timeout 120 node --test --import tsx src/domain/purge-policy.test.ts` (packages/core): tests 7, pass 7, fail 0.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ingest): exit 0, 16.7 s.
- Independent probe: scratchpad t046check/probe.ts (fail-closed table) and probe2.ts (seeded LCG generator written by checker, 6000 random cases, ~26 purge-eligible ids reached; every one verified against isPurgeEligible, tenant, processedAt age, purgedAt, resolved turns of citing claims; list equality and no duplicates): 0 violations. Density of eligible cases is low, so this is supporting, not primary, evidence.

## Points
1. Scope/purity: `git show --stat c947689` = retention-sweep.ts, retention-sweep.test.ts, manifest only. Only import is `@lkb/core` (no fs, net, db, child_process). Deep-frozen inputs run without throwing, so no input mutation. PASS.
2. Soundness: see probe2 above; 0 violations. PASS for generated space (generator does not produce prototype tenantIds or lenient date strings; those are in the table).
3. Fail-closed table (K = keep/excluded, E = ok:false, P = listed purge-eligible):
| Input | Result |
|---|---|
| other-tenant media | excluded to tenancyViolations |
| media tenantId "TOC" / "toc " | excluded (violation) |
| request tenantId "TOC" | media K |
| media tenantId undefined/null/""/5 | K |
| request tenantId undefined/null/""/5 | E |
| **media tenantId on prototype** | **P (ISS-T046-001)** |
| duplicate _id (same or cross tenant) | both K |
| processedAt undefined/null/""/number/array/object | K |
| processedAt "garbage"/"tomorrow"/"2026-09-26x" | K |
| **processedAt "1" / "0" / "12" / "2020"** | **P (ISS-T046-002)** |
| processedAt future; now before processedAt; now 0/-5 | K |
| now undefined/NaN/null/Infinity/string | E |
| each threshold undefined/0/-1/NaN/Infinity/"100"/null; params undefined | E |
| claims undefined / null | E (not treated as none) |
| claims [] | K ("no claim has cited this media yet") |
| turns undefined | E |
| claim cites turn not in turns; turns empty | K |
| turn other tenant / other session / start>end / negative start / string times | K (unresolvable) |
| unverified claim; one verified + one disputed; status "Verified" | K |
| null / no-evidence / bad-evidence claim anywhere | K for every media (blockAll) |
| other-tenant unverified claim citing t1 | ignored, media P (correct: not this tenant's claim; claim ids are tenant-scoped) |
| claim without tenantId/_id citing t1 | K |
| purgedAt "2020-01-01" / "" / 0 / false | K |
| evidence-clip kind; empty turnRefs | K |
Malformed-claim scope: an unreadable claim (not an object, no/empty evidence, bad evidence entry) blocks ALL media in that call; a claim malformed only in tenantId/_id/status blocks just media citing its turns. Conservative and sensible for a destructive plan, though one corrupt claim stalls the whole sweep. Note only.
4. Windows: fixture turns t1 [5,12], t2 [20,30], padding 10 gave t1 [0,22], t2 [10,40]: padding both sides, clamped to 0, overlapping windows kept separately (not merged, none lost), multi-turn claim keeps all. Windows are NOT clamped to media duration (media has optional tStart/tEnd only); retaining a longer window is safe. Note only.
5. `processedAt` is absent from schema/media.schema.json and generated Media type (grep of schema/ and packages/*/src finds it only in the new files). Production media carries no such field, so as built the planner KEEPS everything ("not processed: processedAt missing"): safe. It cannot treat absence as processed, and must not. Needs an owner schema decision (Q6), not a defect.
6. Dependency: `.dependency-cruiser.cjs` rule "ask-index-ingest-only-ai-db-core" allows ingest to core. depcruise not run (not available). PASS by reading.
7. Mutations (per-mutation byte backup, restore in finally, timeout 90 s, cmp + `git hash-object` vs HEAD after each):
| Mutation | Result |
|---|---|
| M1 skip tenant check | killed (2 fail) |
| M2 missing claims treated as none | killed (1 fail) |
| M3 ignore purgedAt | **SURVIVED** (ISS-T046-003) |
| M4 invert age comparison | killed (7 fail) |
| M5 drop unresolved-turn guard | killed (1 fail) |
| M6 skip isPurgeEligible | killed (2 fail) |
All restores cmp-identical and hash-equal to HEAD.
8. Manifest: 16 tests, tsc exit 0, 7 core tests all reproduced. "Not delivered" matches (no deletion, not exported from index.ts, processedAt not in schema). Manifest does not mention the two fail-open inputs.

## Wrong-purge inputs (verbatim in qa/issues.t046.jsonl)
Base: tenantId "toc"; claim {_id:"c1",tenantId:"toc",text:"x",status:"verified",evidence:[{turnId:"t1",sessionId:"s1"}]}; turn {_id:"t1",tenantId:"toc",sessionId:"s1",speakerRef:"a",tStart:100,tEnd:110,text:"x"}; now 1791633600000 (2026-10-10T12:00Z); params {minAgeAfterProcessedMs:604800000, clipPaddingSeconds:15}.
- Media with tenantId only on prototype (Object.create({tenantId:"toc"}) plus own fields, processedAt "2026-10-03T11:59:59.000Z") gives purgeEligibleIds ["m1"].
- Media {_id:"m1",tenantId:"toc",sourceRef:"s",kind:"recording",turnRefs:["t1"],retention:{purgeAfterVerified:false},processedAt:"1"} (also "0", "12", "2020") gives purgeEligibleIds ["m1"].

HEAD-fidelity: retention-sweep.ts 89dc2a4cdf3a6c061a9197ddd18f8cf105f4dd8a = HEAD blob; retention-sweep.test.ts d3522d04e6d100dbbfd43d873a7794eccb34b5e1 = HEAD blob.

ISSUES-WRITTEN: ISS-T046-001 (high), ISS-T046-002 (high), ISS-T046-003 (medium) in qa/issues.t046.jsonl

EXPLANATION: FAIL is driven by the brief's rule that no input may produce a wrong purge-eligible answer. Both defects are one-line fixes (own-property reads; strict ISO check). Neither is likely from JSON-decoded Mongo data (prototype tenantId) but lenient-date acceptance of a truncated timestamp is a plausible corruption path. Everything else (tenant scoping, missing claims, thresholds, now, unresolved turns, duplicates, purgedAt in code) fails closed. Fix cycle 1 should also add a purgedAt test (ISS-T046-003). No contract was authored: the checker skill does not require one and no qa/contracts file exists for T-046.


---

# Cycle 1 (fix cycle 1, maker commit db46699)

VERDICT: PASS
Cycle checked: 1
Unit: t046-retention-sweep-planner, HEAD db46699, branch lane/t046. Security class (tenancy + data destruction); not round-capped.
Scope / remaining gates: scoped acceptance is "no input yields a wrong purge-eligible answer"; met for every shape tried. Web half of T-046, wiring to a deleting job, Q6 retention values and a `processedAt` schema decision remain open (out of scope, unchanged from cycle 0).
Date: 2026-10-10. Timing not measured per phase.
Checked bytes (git hash-object = HEAD blob, before and after all mutation runs): retention-sweep.ts 27852c85ded9cc3350025034f5d728dec4854b0d; strict-record.ts 015d105e5af2e09257592c71bf5ff2e5473932f6; retention-sweep.test.ts d3522d04e6d100dbbfd43d873a7794eccb34b5e1; retention-sweep.strict.test.ts 97c675a06ba1b12c3b676f72bcc154bea7849eb7.

## Commands (lane worktree, node from the codex runtime, each under `timeout`)
- `timeout 120 node --test --import tsx src/retention-sweep.test.ts` (packages/ingest): tests 16, pass 16, fail 0.
- `timeout 120 node --test --import tsx src/retention-sweep.strict.test.ts`: tests 12, pass 12, fail 0.
- `timeout 120 node --test --import tsx src/domain/purge-policy.test.ts` (packages/core): tests 7, pass 7, fail 0.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ingest): exit 0, 14 s.
- Budgets by wc -l: retention-sweep.ts 232, strict-record.ts 92, strict test 275 (all at the stated caps).
- Probes (checker-written, scratchpad t046check2, deleted afterwards): probe.ts = about 190 named hostile inputs; prop.ts = seeded LCG generator.
- Imports: retention-sweep.ts imports only `@lkb/core` and `./strict-record.js`; strict-record.ts imports only `node:util` (`types.isProxy`, a pure type predicate). No fs, net, db or child_process.

## 1. D-015: the issues' own recorded inputs, replayed verbatim
| Issue | Recorded reproduction | Result |
|---|---|---|
| ISS-T046-001 | media = Object.assign(Object.create({tenantId:'toc'}), {_id:'m1',sourceRef:'s',kind:'recording',turnRefs:['t1'],retention:{purgeAfterVerified:false},processedAt:'2026-10-03T11:59:59.000Z'}); claim, turn, now, params as recorded | KEEP "malformed record (not a plain object)": 1/1 kept |
| ISS-T046-002 | same media with own tenantId 'toc', processedAt in "1", "0", "12", "2020" | each KEEP "malformed processedAt": 4/4 kept |
| ISS-T046-003 | mutation M1 below (`if (false) {` for the purgedAt guard) | tests fail 2 of 28 (survived 16/16 at cycle 0): killed, 1/1 |

## 2-3. Attack table (K = kept or ok:false, P = listed purge-eligible)
Every row not marked P was KEPT or returned ok:false. Shapes reaching P wrongly: none.
| Shape | Result |
|---|---|
| Media, claim or turn built with Object.create(proto) at depth 1 and 2; class instance; array with named props; Proxy; Proxy of Proxy | K (not a plain object; isProxy is true so no trap is ever invoked and no descriptor is read) |
| Object.create(null), frozen, sealed, hostile toJSON/valueOf/Symbol.toPrimitive on an otherwise clean record | P, correctly (clean records; plain copies are read by descriptor and the hostile methods are never called) |
| accessor tenantId; accessor returning a different value on a second read; non-enumerable tenantId; symbol-keyed tenantId; String, Boolean and Number wrappers for tenantId, kind, processedAt, purgeAfterVerified, now, request tenantId | K |
| field on both the object and its prototype | K (any prototype other than Object.prototype or null is rejected) |
| media tenantId with leading or trailing space, upper case, zero-width space, nbsp, Cyrillic o, full-width letters, trailing newline, NFD variant of the requested id | excluded to tenancyViolations (strict equality), never P |
| nested retention: proto-inherited, accessor, class, Proxy, wrapper; purgedAt on proto, accessor, non-enumerable | K (nested records use the same readFields) |
| purgedAt valid instant | K "already purged"; null: eligible (not purged); undefined, "", 0, false, {}, [], "garbage", date-only, number, Date: K malformed |
| turnRefs sparse, subclass, Proxy, non-string, String wrapper, accessor element, non-enumerable element, setPrototypeOf'd array, array-like object | K; an extra named property on an otherwise valid array is ignored and the indexed content is used (benign) |
| claim evidence: entry with inherited fields, class entry, Proxy array or entry, sparse, subclass; claim status inherited or String wrapper; claim tenantId inherited or wrapper; null claim | K (an unreadable claim blocks all media; status "verified " or "Verified" is not verified) |
| claims or turns undefined, null, Proxy, subclass | ok:false (never an empty plan); claims [] is K "no claim has cited"; sparse claims K |
| envelope class, Proxy, array, null; envelope tenantId on proto; params on proto, Proxy or accessor | ok:false |
| duplicate (session, turn) pair, identical or differing times | K "cannot be resolved" |
| timestamps K: date-only, +05:30, +00:00, lower t, lower z, 24:00:00, second 60, month 13, 30 Feb, 29 Feb 2021, year 10000, "-000001", "+002020", 1 and 4 fractional digits, leading or trailing space, trailing newline, hour 25, minute 60, full-width and Arabic digits, no Z, "1", "0", "12", "2020", numbers, Date, "" | all K "malformed processedAt" |
| timestamps accepted: 2026-10-03T11:59:59Z, 2020-01-01T00:00:00.000Z, 2020-02-29 (leap), 0000-01-01T00:00:00Z, 0001-01-01T00:00:00Z | P (well-formed instants; see EXPLANATION on year 0) |
| boundary | now-min-1ms and now-min exactly: P (age >= min); now-min+1ms: K; equal to now, future by 1 ms, 9999-12-31: K |
| now undefined, null, NaN, 0, -5, Infinity, "", numeric string, Date, Number wrapper | ok:false |
Trailing NUL: parseIsoInstant("2020-01-01T00:00:00Z" + NUL) returns null in the real code (V8 Date.parse alone accepts it, so the `$` anchor is load-bearing).

## 4. Declared deviation: extras ignored; schema versus declared fields
Read schema/media.schema.json, claims.schema.json and turns.schema.json (all `additionalProperties: true`) and packages/core/src/domain/purge-policy.ts; grepped schema/, packages/core/src and packages/db/src for hold, legal, doNotPurge, retention override, supersede, deletedAt, tombstone, pendingReview. No such field exists in Media, Claims or Turns.
| Collection | Schema fields | Declared by reader | Not declared |
|---|---|---|---|
| media | _id, tenantId, sourceRef, kind, turnRefs, path, tStart, tEnd, retention{purgeAfterVerified, purgedAt} | all of them (turnRefs required by the reader though optional in the schema: stricter) | none |
| claims | _id, tenantId, text, topicRefs, confidence, status, evidence[{turnId, sessionId}] | _id, tenantId, status, evidence | text, topicRefs, confidence: not inputs to isPurgeEligible or window derivation |
| turns | _id, tenantId, sessionId, speakerRef, tStart, tEnd, text | _id, tenantId, sessionId, tStart, tEnd | speakerRef, text: not decision inputs |
The only blocking decision fields are retention.purgedAt, retention.purgeAfterVerified, kind, status and evidence resolution, and all are declared and strictly read. Ruling: ignoring undeclared fields cannot flip a KEEP to P under the current schema, because no field outside the declared list can block a purge. The risk is forward-looking: a legal-hold or do-not-purge field added later would be silently ignored until the reader is updated (ARCHITECTURE Q6 retention values are still open). Probe: media with extras {legalHold:true, doNotPurge:true, top-level purgedAt} is P, correct under the current schema. Not a defect.

## 5. Audit fixes
Duplicate (session, turn) pairs: K, confirmed. Malformed-claim scope unchanged from cycle 0: an unreadable claim (null, no or empty evidence, bad evidence entry, bad tenantId) blocks every media in the call; a claim bad only in _id or status blocks media citing its turns; another tenant's claim is ignored. claims or turns undefined or null: ok:false, confirmed.

## 6. Independent property probe
Seeded generator, 5 seeds (1, 777, 424242, 99, 2026) x 4000 cases = 20000 cases, 472 purge-eligible ids; hostile shapes from point 2 mixed into media, claims and turns (inherited fields, accessors, Proxies, wrappers, bad timestamps, bad purgedAt and turnRefs, tenant look-alikes). Oracle per eligible id: source is a unique plain record (own data props, plain retention, exact tenant, valid processedAt old enough, no purgedAt, valid kind, plain turnRefs); isPurgeEligible true on an independently built clean copy; no unreadable claim anywhere in the call; every citing claim verified; every evidence entry resolved to exactly one valid own-tenant turn; at least one retained window. Result: 0 violations. (A first run showed 44 oracle-side false alarms: the oracle counted non-plain array records carrying the same _id as a plain sibling, and turns with tStart > tEnd. Corrected in the oracle and re-run; the planner was not changed.)

## 7. Mutations (per-mutation byte backup, restore in an EXIT/INT/TERM trap, timeout 90 s, then cmp and git hash-object = HEAD blob after each)
| Mutation | Result |
|---|---|
| M1 ignore purgedAt (ISS-T046-003) | killed (2 fail) |
| M2 plain access / `in` instead of own descriptor | killed (4 fail) |
| M3 accept accessors, data-property check dropped only | survived, equivalent (d.value is undefined so typed readers still reject) |
| M3c accept accessors for real (call the getter) | killed (2 fail) |
| M4 skip round-trip check | killed (2 fail) |
| M5 drop leading `^` | killed (1 fail) |
| M5b drop trailing `$` | SURVIVED (28/28 pass) |
| M6 nested retention read without strictness | killed (7 fail) |
| M7 malformed purgedAt treated as not purged | killed (2 fail) |
| M8 remove isProxy check | killed (1 fail) |
| M9 duplicate turns, last wins | killed (1 fail) |
M5b: Date.parse of a valid instant followed by a NUL character is valid in V8 and round-trips, so with the `$` anchor removed that string is accepted; no test pins a trailing character that Date.parse tolerates. The shipped code rejects it, so no wrong purge today; it is a test gap, filed as ISS-T046-004.

## 8. Purity and cycle-0 table
Deep-frozen nested input runs, plan returned, input JSON unchanged afterwards. A 3-million-length sparse turnRefs gives K in 0.96 s. Cycle-0 fail-closed table spot-checked (other-tenant media, tenant variants, missing tenant or processedAt, thresholds, now, claims or turns undefined, unresolved turns, unverified claims, purgedAt, evidence-clip kind): unchanged or stricter; the two cycle-0 failures are fixed.

ISSUES-WRITTEN: ISS-T046-004 (medium) in qa/issues.t046.jsonl. ISS-T046-001, -002, -003 set to verified in the same shard.

EXPLANATION: PASS because no constructed input yields a wrong purge-eligible answer (about 190 named shapes, 20000 generated cases, all three cycle-0 reproductions kept or killed) and no blocking schema field is ignored. The purgedAt guard is now pinned and killed by two tests. Notes, not backlog: (a) "0000-01-01T00:00:00Z" and 0001 are accepted as valid very old instants; a zeroed date column from a lossy export could look like that, so the Q6 owner may want a lower bound when `processedAt` joins the schema. (b) A sparse turnRefs with length near 2^32 would loop and allocate in readArray (availability only, no wrong purge; 3M took under a second). (c) A non-plain record carrying the same _id as a plain sibling is reported as `index:N` and the plain sibling is still judged on its own merits; unreachable from real database documents. (d) New decision fields added to the schema later need a reader update; the planner header does not say so. (e) Cycle-0 notes (one corrupt claim stalls the sweep; processedAt absent from the schema) stand.
