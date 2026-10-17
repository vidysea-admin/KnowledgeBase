# Operations schedules

The protected `/operations` workspace consumes tenant source counts, watcher state, session worklists, queue activity, notifications and `/operations-integrations`. Its integration controls save real durable daily/weekly configurations and explicitly request a run; saving alone is not delivery evidence.

`createOperationsTickHost` in `host.ts` is a one-shot callback for the existing supervisor. It verifies the configured service key on each invocation and derives its tenant/key identity. It has no timer or daemon. The central host must register and invoke it for automatic scheduling; a disabled/unregistered host does not establish scheduled-digest completion. `LKB_OPERATIONS_WORKER_ENABLED` defaults off, and `LKB_OPERATIONS_WORKER_KEY` is a server-only existing API credential with current `hosting` + `operations` scopes and an admin/owner role.

Destinations are configured on the server, not accepted from API/UI bodies:

- `LKB_OPERATIONS_APPROVED_TENANT`, `LKB_OPERATIONS_EXTERNAL_ENABLE=1`, and `LKB_OPERATIONS_APPROVAL_REF` bind external execution to the recorded exact deployment authorization. An environment string alone is not evidence of Umesh's authorization.
- `LKB_OPERATIONS_DIGEST_RECIPIENT` and the absolute executable `LKB_OPERATIONS_GWS_BINARY` select the approved recipient/account. Gmail send is followed by a sent-message ID/header/body receipt check. The email contains bounded session counts, no titles/transcripts/source locations.
- `LKB_OPERATIONS_SHEETS_ID` and the server-only `LKB_OPERATIONS_GOOGLE_ACCESS_TOKEN` select the approved Sheet/account. Sync writes only the dedicated `Knowledge Bank Export` tab, range `A1:E502`, using `RAW` and verifies exact readback. The fixed range includes a run identifier and clears older rows in that range. An existing dedicated tab and exact destination/range approval are required. No new Sheet is silently created.

The bounded metadata export contains at most 500 session IDs, titles, recorded dates and stage statuses, with truncation reported. An export over 1 MiB is refused before delivery. It excludes summaries, full transcripts, speaker details and raw source locations; it does not establish a full knowledge-bank export, coverage score or semantic quality.

Schedules and append-only audit entries share an atomic tenant-bound Mongo CAS. Reads do not create schedules. Current composition passes a false production-write gate: it refuses new schedule writes to `lkb` until a separate exact production target is authorized. Neither generic D-150 nor external destination configuration changes that gate.

Before possible delivery, a durable run intent and secret lease are stored, then a second intent binds the actual bounded payload, attempt/revision and approved target/reference into the run fingerprint. Actual role/account eligibility is rechecked at each durable transition and executor initialization; the role journal lock is released before waiting for external work. Transport is bounded, receipts are checked, and raw errors/targets/credentials/lease tokens stay out of public status.

Possible delivery failure, expired processing lease or receipt ambiguity yields `uncertain`, disables the schedule and prevents automatic retry. The explicitly confirmed receipt-check action queries the approved destination without sending again; it verifies the persisted content/target fingerprint. A proven receipt records success but leaves the schedule disabled until separately enabled. Absence/failure of receipt verification stays uncertain; there is no blind reset/resend shortcut. Source-read failure before external execution is a truthful failure and may be scheduled again. Audit capacity is never silently trimmed, and space for both intents/completion is reserved before external work.

This source unit has no real delivery, Sheet, browser, host-registration or production-write evidence. Those gates remain separate from hermetic adapter/role/store/UI tests.
