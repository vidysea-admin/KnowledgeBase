# Verdict: iss-schedstatesafe-002-state-tenant-tag-skipped-sessions

VERDICT: PASS
Cycle checked: 0
Commit checked: 57a6376e (base 4ec51c83)

EXPLANATION:
- Diff read line by line (test-only, no production change). No assertion weakened or removed. The single exclusion (skipped-sessions.json rows from the unchanged-tree check) applies only to the "untagged-job" case, is exact-name (`startsWith("skipped-sessions.json|")`), so `.tmp`, `.lock`, `.corrupt-*` and any stray file still fail the tree comparison; it is paired with an assertion that the file exists and its tenantId equals the tick tenant. Refusing cases still compare the whole tree.
- "Code correct" is true: skipped-state.ts tags the file and every entry, reader runs assertTenantTag (refuses untagged/bare-map/other tenant), recordSkipped refuses before any write, requireStateTenant guards bad tenants, same discipline as schedule-state.json.
- Bad-tenant loop (undefined, "", "../b") retained, now one test per case; all 3 present. Coverage added for skipped-sessions (file+entry tag, untagged/bare/other refused byte-identical, bad tenants, tick logs refusal, two-tenant tag).
- Mutations on skipped-state.ts (per-mutation byte backup, restored, hash == HEAD blob each time): drop file tag -> 3 fail; drop reader assertTenantTag -> 3 fail; drop entry tag -> 1 fail; extra stray untagged file written during tick -> 1 fail (tree check still catches other writes). All caught.
- state-tenant-tag.test.ts 15/15 here; main tree still 8/9 (confirms the red). tsc --noEmit clean. Calendar suites (schedule-state, -safety, -tick, state-tenant-tag, task-scheduler, auto-join, webinar-policy, trusted-sender, sender-authentication): 152/152. No browser/OBS/Mongo/network tests run.

ISSUES-WRITTEN: none
