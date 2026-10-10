# Contract — r1-attention-alerts (written by checker, cycle 0)

Ground truth for the WIRING unit that will connect `attention-alerts.ts` to a sender. The maker must not edit this file.

## The wiring unit MUST supply
1. `timeZone`: explicit IANA zone from config (e.g. Asia/Kolkata); never the machine zone.
2. `now` (ISO) from the tick clock.
3. `startTimes` keyed by sessionKey for every skipped item (SkippedItem has no start time). Without it the alert says "start time unknown" and past-start items are not filtered.
4. For `untrusted-sender`: the alert cannot name the sender. To be actionable the wiring must pass a sender DOMAIN (validated hostname shape, not an address, not title text) through a separate field, or accept an alert saying only "an unapproved sender". Never splice raw sender text into the body.
5. Only module-controlled session keys (`cal:<id>`, `gmail:<id>`, `webinar-<hash>`, job ids) until ISS-R1ALERTS-002/004 are fixed; validate before calling.
6. Persist the `keys` returned by `selectNewAlerts` between ticks (the module keeps no state).

## The wiring unit MUST NOT
1. Add a meeting link, registration URL, or any job-row field other than those the module reads (status, reason, title, startTime) to alert text.
2. Send title/body through a `parse_mode` sender until ISS-R1ALERTS-001 is fixed and the residual characters `& ( ) . ! - = + ' " , : ; @ / ?` are handled (MarkdownV2 treats `. ! - = + ( )` as special; HTML needs `&` escaped).
3. Double-alert. The existing generic line in `scripts/webinar/run-pipeline-deps.mjs` (`notifyOperation` via `createOperationNotifications`, fingerprint `status:reason`) already fires for operation rows with status action_required and reasons needs-registration, overlap-lost, unsafe-join-link, retry-limit, etc. The new alert for the same job row has a different fingerprint (`attn:...`), so both would send. Wiring must suppress the generic send for the reasons this module handles (or send only the new one) and use the new path for skipped-only cases (untrusted-sender, no-join-link) that have no operation row.
4. Send an unbounded batch per tick (suggest <= 20, remainder summarised in one line). With more than 500 live situations the evicted keys re-alert every tick (verified: 100 fresh per tick, repeatedly).
5. Treat `ignored` as silent: log its counts.

## Acceptance for the checker of the wiring
- The ISS-R1ALERTS-001 evidence corpus re-run verbatim against the wired output: 0 leaks.
- One sent message per situation across ticks and across the generic plus new path.
