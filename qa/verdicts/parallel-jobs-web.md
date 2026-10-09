# Verdict — parallel-jobs-web

Cycle checked: 1
Verdict: PASS
ISSUES-WRITTEN: none

## Independent acceptance

- C1 PASS: real apiFetch/Bearer client, default50/max100, complete strict envelope,
  requested-limit equality, row bound/truncation consistency. Focused client cases pass.
- C2 PASS: exact required/optional summary whitelist, literal statuses and explicit
  calendar/date-time validation; malformed/poisoned whole payloads fail closed.
- C3 PASS: actual provider audit metadata stays React text; pipeline limitation and
  dedicated jobs permission disclosed; fixed401/403/generic messages conceal raw errors.
- C4 PASS: distinct loading/populated/empty/no-match/error, local exact AND filters,
  literal status options, deterministic unique kinds, returned-only counts/truncation.
- C5 PASS: current-key refresh hides old rows, fetches again and can recover from an
  error; pending refresh disabled, no added client cache, API row order retained.
- C6 PASS: immediate key/generation render guard plus cancellation; real AuthProvider
  tests prove B-positive, late A success/rejection/401 refusal and logout no-fetch.
- C7 PASS: actual client -> apiFetch -> endpoint-shaped fake fetch -> JobsPage path;
  positive, malformed, error, markup, filtering/refresh and race cases exercise it.
- C8 PASS for this isolated web slice: independent frozen-source focused test run
  50/50, one worker, exit0; independent web typecheck exit0; source hashes unchanged.

EXPLANATION: Scope is the new read-only T-057 provider-audit web consumer under
Umesh-approved NORMAL mode with independent checker. Existing common acceptance
remains intact. App/nav mounting, full Express/accessor/store composition, browser,
live database and broad checks remain deferred; this is not full common C8, T-057
or release PASS. Contract validator reports only PASS by vacuity. Commands, output,
hashes, source review and scope limits are in qa/evidence/parallel-jobs-web-checker.md.
Only the matching builder manifest may now close to checked-PASS.

## Cycle 1 independent recheck

Historical cycle 0 scoped PASS and its 50/50 evidence remain retained in
qa/evidence/parallel-jobs-web-checker.md. Root reopened the same unit for valid
lowercase RFC3339 t/z compatibility; the current verdict applies to frozen cycle 1.

C9 PASS: t-only, z-only and both-lowercase markers in createdAt AND updatedAt
are accepted without normalization. Three client and three real-client/page cases
assert exact literals. Source change is the date regex /i flag; strict calendar/time,
status, envelope, optional-field and poison refusals remain. JobsPage application
hash is unchanged from cycle 0; old key/late error/401/logout isolation still passes.

Independent final tests: 56/56 (40 client +16 UI), one worker, terminal exit0.
Independent frontend typecheck: terminal exit0, no diagnostics. Four frozen source
hashes verified before and after execution, matching manifest. No new issues.
Exact command/output/hashes: qa/evidence/parallel-jobs-web-checker-cycle1.md.
All previous slice boundaries remain: App/nav and full HTTP/store composition are
separate integration; no browser/live DB/provider/full-suite or release PASS claimed.
Builder may close only the ready-for-check Fix cycle 1 manifest to checked-PASS.
