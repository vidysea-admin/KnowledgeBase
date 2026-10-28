# T036 full-parent candidate — cycle 0

Parent status: building / HOLD; not ready for parent acceptance.
Source status: frozen and ready for focused verification; no tests executed yet.
Maker: /root/docker_dependency_review
Checker: /root/docker_dependency_review/checker_t036
Manifest: qa/manifests/goal-t036.md
Full contract: qa/contracts/goal-t036.md

## Current maker-owned source pins

| Path | SHA256 |
|---|---|
| apps/api/src/gws/public-webinars.ts | 7D2DCA798771C2D5CBFBBE3A30B6117C213F53F70AECF51D6F7BBB6BECC2B170 |
| apps/api/src/gws/public-webinars.test.ts | 176D6DAB72140D8D172B90184505A5219787939651CD97A9170AA75A9C16187B |
| apps/api/src/gws/gws-gmail.ts | 81385D2E023C40BF9E5B75FD592BBF901327FFF08A985CEC160281D42E28C455 |
| apps/api/src/gws/gws-gmail.test.ts | 2968351325291E8D6FFBD091BE25126B6A6D607526063363F72DA9155D615CB7 |
| packages/ingest/src/sources/node-transport.ts | 61D0C702BEAFC166B8111F53C5E6B639B55B48642C863854B2CEE8A97B2BEA10 |
| packages/ingest/src/sources/node-transport.test.ts | AF3B464B384344022CFF67CC061FA58333E64FE934DD6FBA6005D36AC3F09CBB |

Pins are a source checkpoint, not a test receipt. Tests have NOT RUN. Focused maker command is queued with /root/docker_checker:

`node --test --import tsx --test-name-pattern '^(?!resolveAll rejects).*' apps/api/src/gws/gws-gmail.test.ts apps/api/src/gws/public-webinars.test.ts packages/ingest/src/sources/node-transport.test.ts`

52 declared tests; expected 51 executed and the existing public-resolver `.invalid` negative excluded to comply with no public network during testing. Native transport proof uses only a real ephemeral loopback HTTP server; bounded-DNS tests inject owned resolver methods without external DNS. Outer process cap: 120 seconds. No broad typecheck/validator run; those are central integration checks.

## Actual call and boundary map

- Actual production composition creates `createMeetingCandidatesDeps`; server mounts `createMeetingCandidatesRouter`. Its scoped Gmail scan calls `scanGmailForMeetingCandidates`, checks connected owner/work database, and conditionally retains receivedAt, youtubeWatch, youtubeWatchIssue and meetingLinkIssue through the explicit store allowlist. The current schema/generated row, route DTO and schedule loader preserve these fields. This is static source presence, not a storage/runtime receipt. Existing messageId rows return false before metadata refresh; receipt/auth provenance cannot yet be refreshed on old rows. Canonical recognizer reconciles body/plain/HTML/snippet evidence; YouTube evidence remains separate.
- New operator-owned `createPublicWebinarDiscovery(owner, sources)` binds tenant before acquisition. `discoverPublicWebinars` -> existing guarded fetcher -> remaining-budget, owned cancellable DNS -> pinned native request -> structured publisher Event parser. Public output always requires review and never proves personal admission. Central mounting/configuration and durable source/provenance/coverage are pending.
- Native `httpRequest` retains unchanged request arguments, host/SNI verification and byte cap; adds absolute socket deadline and terminal timer cleanup. New optional `resolveAll` bounded options preserve legacy no-options OS lookup and provide cancellation for the public scanner. T045 consumer was notified.

Current dependency checkpoint: qa/evidence/goal-t036-dependency-pins.json records sixteen auth/export/canonical-link/calendar/guard/schema/store/route/server/composition/loader hashes. It is explicitly byte-only and awaiting runtime final freeze; broker/independent checks must capture the final dependencies after central edits settle. Current production/index/server/composition and run-pipeline-deps searches contain no public discovery factory mount. Its central source-owner configuration, durable provenance/coverage and downstream integration remain missing, not inferred complete from Gmail retention.

## Independent static findings and repairs

The paired checker identified domain-only host-start/redirect trust, caller-only slow-stream deadlines, conflicting YouTube IDs, lost HTML-only hrefs and snippet-over-body conflict precedence. These were corrected in source and standing regressions added. Source review is not runtime verification. Two old positive scanner URL placeholders were made canonical where that test intends an actual join; the generic non-join Zoho page remains generic in the snippet-priority test. Existing test titles/assertions remain.

## Mandatory full-parent gates

All C1–C10 remain unchanged and outstanding until independently evidenced. In particular: central mounted/source-owner integration and canonical persistence, complete actual ordinary/alias/label Gmail+Calendar+public acquisition, actual downstream rules/scheduler outcomes, dashboard and real approved delivery, restart and host/platform proof. No provider call, browser, database mutation, message, activation or parent PASS is asserted by this packet. The current independent full-parent HOLD remains appropriate.

## Separate scoped source-security receipt

The exact shared 3fff::/20 refusal is independently checked-PASS, cycle 0, in qa/manifests/t036-ssrf-documentation-prefix.md and qa/verdicts/t036-ssrf-documentation-prefix.md (verdict SHA256 BA47AD2BD849CF46A35C03A0374394E836EBCDA644F5E3E41A9F8B72A95E43F4). Sole-broker guard regression passed 42/42, including original ISS-T036GUARD-001 cases 8/8. Independent probe passed three address boundaries and actual public caller redirected mixed-DNS refusal with no second request. All current source/caller pins match. This scoped proof is distinct from the still-unexecuted three-file discovery/native maker command above and does not change parent HOLD.
