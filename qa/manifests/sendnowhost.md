# sendnowhost (ruling 6, ISS-SENDNOWAPI-004)
Status: checked-PASS
Fix cycle: 1
Base: 9e55b642
Candidate: see commit on lane/w17-sendnowhost

## Changed paths
- apps/api/src/join-rules/send-now.ts (message text only, unavailableSendNowRouter)
- apps/api/src/join-rules/send-now.test.ts (new test)
- docs/docker-deployment.md, docs/meeting-bot-roadmap.md (send-now host docs)

## Behaviour
Plain apps/api start mounts unavailableSendNowRouter: scoped key -> 503 {error:"send_now_unavailable", message:"send-now is served by the join-rules API host; no bot was sent"}; unscoped key -> 403. Composition untouched.

## Checks
cd apps/api && node --test --import tsx src/join-rules/send-now.test.ts -> tests 13, pass 13, fail 0.
Replay ISS-SENDNOWAPI-004 (qa/issues.sendnowapi.jsonl:4): "start API plain, POST /calendar/send-now with send-now key -> 503 send_now_unavailable": 1/1 reproduced as intended behaviour (test "ruling 6 ..." plus existing "no launcher injected").
Resolvable by ruling 6 (status flip left to orchestrator).
