# T052 cycle 2 fixture repair checkpoint

Status: building; broker-requested. No PASS or ready-for-check claim.
Canonical existing unit: source-delivery-registration-retry. Base 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; active pinned policy and all historical costs/receipts retained. This continuation documents fix cycle 2 without editing canonical central manifest.
Root broker observed original selected state node 0/1: confirmation fixture lacked receivedAt, so freshRegistrationConfirmation returned false and confirmed was undefined. Exact source confirms this cause.
Changed only packages/meeting-bot/src/calendar/state/schedule-state.test.ts: positive fixture gets receivedAt: checkedAt, preserving message/thread/organizer/interval. Added missing/stale/future receipt refusals to existing corpus; all prior lineage, tenant, baseline and malformed-evidence assertions retained. No production changes.
Raw before bytes: cycle-2-schedule-state.before.raw. Exact before/after hashes and phase timestamps: cycle-2-phase.json. Original request retained: broker-request-cycle-1.json.
Rerun ORIGINAL selected node using broker-request.json; it covers receipt persistence and freshness boundaries together. Existing 16 Node / 1 Python green receipts are unaffected and need no repetition.
No own tests, reviewer, browser, provider, DB or external registration. Independent verification and full T052 live gates remain open. Actual tokens/cost/total active time unknown.
