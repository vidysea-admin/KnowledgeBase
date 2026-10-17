# t039send - T-039 Send bot now, fix cycle 1 of unit t039next

Status: ready-for-check
Fix cycle: 1
Base SHA: a9fac545
Candidate SHA: see `git log -1` of lane/w16-t039send (the commit that adds this file)
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t039send (branch lane/w16-t039send)

## Changed paths
- scripts/webinar/send-now-host.test.ts (2 lines: wait for the fixture child's argv dump instead of reading it at the 202)
- qa/manifests/t039send.md

## Findings at base a9fac545
- ISS-T039NEXT-001 (fake "T0" start time): already fixed at base. The host takes `liveProbes` (send-now-host.ts:43,90) and the status tests inject the same probes that seeded the claim; the foreign-tenant assertion is its own test. Re-measured here: mutant `tenantId !== tenant` -> `false && ...` in status() is KILLED (16 pass, 1 fail).
- ISS-T039DUPES-002 (untagged job fixture): already fixed at base (job-1.json carries tenantId tenant-a).
- New red found: "launch: 202 ..." failed 4/4 runs under load. livenessMs 400 does not guarantee the child wrote LKB_ARGV_DUMP before the 202. Fixed by polling (<=10 s) for the dump. 17/17 pass on 3 consecutive runs after.
- ISS-T039DUPES-006: NOT changed. The surviving mutants are in claimLiveRecording (packages/meeting-bot/src/live-recording/live-recording.ts); killing them deterministically needs a contender-injection seam in that file plus a test in packages/meeting-bot, outside this unit's paths and a second package.
- ISS-SENDNOWAPI-004: no edit. scripts/webinar/join-rules-api-host.ts already injects createManagedSendNowDeps(); apps/api/src/index.ts cannot import scripts. Needs the owner's decision that join-rules-api-host.ts is the one supported API host (see report).

## Checks a checker must run
- cd <lane>; node --test --import tsx scripts/webinar/send-now-host.test.ts (expect 17 pass, 0 fail; repeat 3x)
- mutate status() tenant check in send-now-host.ts: must fail the "tenant ... forbidden" status test.

## Evidence
- before: ℹ pass 16 ℹ fail 1 (x4); after: ℹ pass 17 ℹ fail 0 (x3)
- tenant mutant: ℹ pass 16 ℹ fail 1; file restored (cmp ok, git hash-object == HEAD blob)
