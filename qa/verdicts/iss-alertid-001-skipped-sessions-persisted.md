# Verdict: iss-alertid-001-skipped-sessions-persisted

VERDICT: PASS
Cycle checked: 0
Commit checked: f9287b07 (lane/alertwho)

EXPLANATION:
- Tenant isolation: probed tenant B asking tenant A's alert id against the shared state dir. B gets exit 1, "refusing skipped-sessions.json: tagged for a different tenant", no time or source. The A-id and a nonexistent id produce identical output apart from the echoed id, so there is no existence oracle. The refusal never names tenant A. This matches the ISS-ALERTID-006 tag discipline (same assertTenantTag/requireStateTenant). Writes by tenant B also refuse a foreign or untagged file before any write.
- Persisted data: sessionKey, start, recordedAt, source, tenantId only. No title or URL, no secret. Mode 0600 is applied only at creation and is meaningless on Windows (POSIX bits ignored); the doc and manifest do not say so. Filed low, ISS-ALERTWHO-002.
- Write safety: NOT atomic (plain writeFileSync), read-modify-write races under concurrent ticks, and a corrupt or partial file is read as {} and then overwritten, dropping accumulated rows (probe: 4 rows to 0). Not a security issue, and it matches the schedule-state.json precedent. Filed medium, ISS-ALERTWHO-001, for the owner.
- D-134: matches (one record per skipped item keyed by sessionKey, no URL, 30-day prune on start, tenant-tagged, alert-id computation untouched). The recordedAt aging for start-less rows is an addition D-134 does not list. It is consistent with the "bounded" intent and does not contradict it. Owner to note.
- alert-who-production.test.ts: label expectations changed from "operations" to "skipped-sessions, operations" for the two webinar-identity kinds, and the scheduled-job source line gained skipped-sessions. These are legitimate consequences of the new source being resolved. The job-alert assertion was loosened from equality to /(^|, )operations$/, which still requires operations as a source. Not a weakening of the protection.
- Mutations (byte backup per mutation, restored, git hash-object == HEAD blob after each, harness deleted): M1 drop tenant tag on read KILLED; M2 drop pruning KILLED; M3 persist title/url KILLED; M5 swallow foreign-file refusal on write KILLED; M6 start-less rows never age KILLED; M7 retention 60d KILLED; M4 recordedAt reset every tick SURVIVED (filed as ISS-ALERTWHO-002).
- Runs: alert-who-skipped 6/6, alert-who-production 4/4, alert-who-command 19/19, schedule-tick 14/14, schedule-state 18/18, tsc clean. No network, browser or MongoDB used.

ISSUES-WRITTEN: ISS-ALERTWHO-001 (medium), ISS-ALERTWHO-002 (low)
