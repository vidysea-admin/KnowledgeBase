# Verdict: iss-t045intake-001-tenant-scoped-source-id

VERDICT: PASS
Cycle checked: 0
Commit checked: 24e44243 (lane/t045tenantid)

EXPLANATION:
1. Collision: tenantSourceId = encodeURIComponent(tenant) + ":" + hash. encodeURIComponent encodes ":" (%3A), so the first ":" always splits tenant from hash; the mapping is injective whatever the hash contains. Concatenation of the encoded tenant (not a hash of it) is correct here. Media id `<sourceId>-media` lives in a separate collection and stays injective. Note (low, not filed): a tenant string with a lone surrogate makes encodeURIComponent throw URIError inside the adapter; fails closed.
2. Consumers: grep of apps/api, packages/index, packages/ask, scripts, schema found no code that parses source/media _id as a bare hash. sessions.sourceId and sources._id are opaque strings (schema type string, no pattern); brain.ts compares them by equality; chunks.sourceRef holds the session id, not the source id, so citations and /citations/:claimId are unaffected. The three changed adapters and intakeFromSource are used only inside packages/ingest (index.ts exports), so no dependant needs re-type-checking beyond the widened IntakeErrorCode union, which nothing outside ingest switches on. I did not run a dependants tsc with a paths mapping for that reason.
3. unscoped-source: no current caller. intake has no API wiring. The url adapter (apps/api ingest-store.ts) and whatsapp store do not go through intakeFromSource, so they are unaffected. Still-bare adapters would be refused if later routed through intake: tracked by ISS-T045TENANTID-001 (open, high), correctly a blocker for the wiring unit.
4. Replay of ISS-T045INTAKE-001 (same bytes, tenant-a and tenant-b, tenant-ignoring sink with a global-unique _id): youtube PASS, cloudonair PASS, zoom-recording PASS: both tenants created, distinct session/source ids, no sink-failed, no already-ingested for B; same-tenant re-ingest is already-ingested. ISS-T045INTAKE-001: 3/3 adapters resolved (for the three adapters it covers; the other four are ISS-T045TENANTID-001).
5. Mutations (own harness, per-mutation byte backup, restore in finally, 120s timeout, harness deleted, git hash-object equals HEAD blob for all four touched files): no-encode KILLED, drop-tenant KILLED, scope-check-off KILLED, hosted bare _id KILLED, youtube media sourceRef bare KILLED, refusal-not-thrown KILLED. 6/6.
6. Tests: intake + youtube + onair + zoom-recording + gap-tracking: 47 pass, 0 fail. tsc --noEmit (packages/ingest) exit 0. gap-tracking.test.ts imports only node:test, assert, ./gap-tracking.js and testUtils; it uses an in-memory GapStore; no network, yt-dlp, ffmpeg or child_process.
Wording note for the Approver: D-135 says "content-hash source _id"; the _id is now derived from (tenant, hash).

ISSUES-WRITTEN: none
