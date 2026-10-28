# codexwave1 governance and integrity check (part B)

VERDICT: FAIL
Cycle checked: 0
Scope: read-only review of commit 46633f71 vs 4f449b27: D-166, qa/contracts, verdict integrity (7 sampled), TASKS/goal.json, security-class units. No tests run (checker A owns them).

## HIGH
1. D-166 self-asserted approval. It carries `**Approved-by:** Umesh` with Why/What stating Umesh "approved ... by asking to implement that plan". There is no quote, message or linked artifact of Umesh deciding the last-valid policy, the one-hour exclusive expiry, or the alert-to-email behaviour. Compare D-164/D-165, which quote Umesh's actual words. The script only enforces Approved-by on enforcement paths, so it did not catch this. Inferred consent is not explicit confirmation under .claude/CLAUDE.md. Action: Umesh must confirm D-166; until then treat last-valid as unapproved. Appending a superseding entry is the only fix path; do not edit D-166.

## Other findings
- D-166 format: correct header, sequential after D-165, all required fields present, additions only (8 lines added, 0 removed; no existing entry touched). Whether the script wrote it is unprovable from a single snapshot commit; the format is consistent with it.
- MED: t051 resolved. Cycle 0 verdict was FAIL (kept at qa/evidence/t051-windows-supervisor-install-cycle0-verdict.md); the current verdict is cycle 1 PASS and matches manifest Fix cycle 1. The manifest is still `ready-for-check`, QUEUE.md says "awaiting matching cycle verdict", and ISS-380 is still `fixed-pending-check`. The close-out is missing, so the PASS stands but is not closed. TASKS.md says "awaits its checker", which is stale.
- reuse-checked-corpus-tests manifest does have `Status: checked-PASS`; the survey was wrong.
- qa/contracts: 8 new contracts plus Amendment 5 appended to gmail-meeting-candidates-approval.md, labelled "checker-owned", scoped to t052-registration-child-lifecycle. It is additive and weakens nothing. Authorship cannot be verified from the snapshot (LOW).
- Verdicts: the 7 sampled have PASS with Cycle checked matching Fix cycle (t051:1, whatsapp:2, others:0), and the evidence files exist. Independence is self-attested only; all were produced in the same Codex session and several rely on "attributed maker evidence".
- TASKS.md and goal.json: only T-007, T-008, T-022, T-054, T-055, T-056 and T-058 moved pending to in_progress. Counts reconcile (in_progress 21 to 28, pending 19 to 12). Nothing was marked done, and notes state foundation-only scope. Justified.
- Security-class units: t037-least-privilege-tenant-signal (real HTTP spoof/refusal probes 5/5, replay of ISS recorded cases: adversarial, good), t037-last-valid, t040-grounded-content (13 hostile tenants, colliding ids, spoof), t057-ops-health-key-boundary (stale-key/401 race probes), whatsapp-review-foundation (ISS-377/378 replays by id), t052 and t051 (ISS-379/380 data-write replays). The adversarial coverage is adequate.
