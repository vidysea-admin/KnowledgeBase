# T036 — complete Gmail, Calendar and public-organizer discovery

Status: building
Fix cycle: 0
Task: T-036
Backlog tier: 3 — next unblocked roadmap task, explicit all-forty authorization.
Contract: qa/contracts/goal-t036.md (checker-owned full parent contract).

## Authorized maker paths

- apps/api/src/gws/public-webinars.ts
- apps/api/src/gws/public-webinars.test.ts
- apps/api/src/gws/gws-gmail.ts
- apps/api/src/gws/gws-gmail.test.ts
- packages/ingest/src/sources/node-transport.ts
- packages/ingest/src/sources/node-transport.test.ts

ROOT granted these exclusive source leases; shared schema, persistence, routes, composition, generated files, trackers and decisions remain central-owned.

## Implemented behavior

Public organizer Event JSON-LD acquisition is bounded to ten operator-configured HTTPS sources, a per-source three-second caller deadline including DNS, 512 KB response cap and three same-host redirects. Reuse of the existing guarded fetcher and pinned native transport retains private/mixed-DNS refusal. Invalid/missing publisher event coverage produces explicit sanitized gaps. Future relevant events carry literal timestamp/source/event-URL evidence, stable link+time deduplication and `reviewRequired: true` / `personalJoinVerified: false`. Only literal registration-shaped URLs additionally carry `registrationUrl` and `registrationOnly: true`; an ordinary event information page is never labelled a registration form. Public evidence cannot become personal admission proof. The connected-feed factory binds server-configured sources to the configured operator tenant.

Gmail discovery adds Webex and uses the existing canonical meeting recognizer for join eligibility and ambiguity. Spoofed hosts, host-start links and embedded redirects cannot clear the registration-only boundary. Actual HTML anchor URLs are preserved even when plaintext is preferred; the established 100,000-character/200-link recognizer budgets refuse incomplete mail acquisition rather than silently truncate. Canonical YouTube watch evidence is separate from personal meeting links; conflicting video IDs have an explicit ambiguity and no selected target, and future literal-time invitations retain upcoming classification. Optional `receivedAt` comes solely from a valid non-future provider `internalDate` decimal epoch value; absent/invalid metadata stays absent. No Date-header or scan-time fallback exists. Two existing positive scanner fixtures used noncanonical placeholder Zoom/Zoho links; their URL values were corrected to valid equivalents while preserving titles and assertions.

## Required integration and full-parent evidence still outstanding

Central writer must mount the public scanner, bind and configure operator-approved sources, preserve public provenance/coverage and registration-only semantics, and preserve Gmail receipt evidence through storage and confirmation correlation. Current source implementation is not a full T036 acceptance claim.

Independent static review found that the shared native transport inactivity timeout did not guarantee active socket cancellation when the guarded fetch caller deadline expired during slow streaming. ROOT granted the maker a narrow transport/test lease; an absolute deadline now destroys the owned request, with timer cleanup on response end/error/close and request close/error. A real ephemeral loopback slow-drip regression was authored to verify server-observed socket closure before test cleanup. This correction has not yet run under the CPU lease; complete cleanup proof remains pending.

Focused tests have been authored but NOT RUN; CPU lease is pending. No actual connected Gmail/Calendar/alias/public-source acquisition, mounted scheduler/rules consumption, dashboard/email delivery, deployment/restart or independent final-byte full-parent proof has been supplied by this packet. All C1–C10 requirements remain in the unchanged full-parent contract; checker HOLD is appropriate until those pass.

## Evidence

Source changes were applied through authorized file patches only. No provider call, external message, browser, database write, schema edit, contract edit, shared integration edit, commit or test run occurred in this maker step.

Separate shared-egress security checkpoint: qa/manifests/t036-ssrf-documentation-prefix.md is checked-PASS at cycle 0, matching independent qa/verdicts/t036-ssrf-documentation-prefix.md. Genuine broker guard suite passed 42/42 with ISS-T036GUARD-001 original cases 8/8; independent address boundaries 3/3 and actual public caller redirected mixed-DNS refusal 1/1 passed. These attributed source-security results do not execute or satisfy the separately queued Gmail/public/native three-file suite or the full T036 acceptance contract. All six maker-owned source hashes still match the source checkpoint.
