# Verdict: t039-send-now-web-button

VERDICT: PASS
Cycle checked: 0
Commit checked: bdd7e59 (lane/sendnowweb, base 9e24d1f)
Scope: T-039 web half only (apps/web); jsdom with mocked fetch; no live API, browser or OBS. T-039 as a whole stays open.

## EXPLANATION

- API match (re-derived from HEAD:apps/api/src/join-rules/send-now.ts): POST `/calendar/send-now` via shared `apiFetch` (Bearer), body exactly `{meetingUrl, until}` (router rejects any other key with 400; web sends none). 202 `{jobId,status:"launching",...}` read as jobId/status; 202 lacking either is shown as an error. Error text read from `message` (what apiFetch parses); statuses 400/403/409/502/503 are the ones the router emits; 401 comes from requireScope/auth. `until` format HH:MM or ISO matches; length caps (2048/64) mirrored by maxLength.
- 401/403: apiFetch calls `invalidateAuth` only for 401, so 403 never signs out; 401 still signs out as everywhere (message "Sign in again"). 403 disables the form; rest of MeetingBotPage still renders (tested).
- Escaping: outcome rendered as a React text child; no dangerouslySetInnerHTML in the changed files; server text sliced to 300 chars, jobId to 80. A crafted reason cannot inject markup.
- URL never rendered: the success/error text never echoes the URL; the input keeps the user's value after submit (it is not cleared), so a retry after 502 needs no retyping. Sensible UX; note only.
- Measured: vitest meeting-bot + MeetingBotPage + App.routes 5 files, 55/55 passed; web tsc --noEmit exit 0.
- Mutations (3, per-mutation byte backup in finally, harness deleted): wrong body field name KILLED (1 red); sign-out dispatched on 403 KILLED (1); ref guard removed for double submit KILLED (1). Hash of both files equals HEAD blob after each; both trees clean.
- Finding: the API also returns 403 for "host serves another tenant"; the web labels every 403 as a missing scope (ISS-SENDNOWWEB-002, low, filed not fixed). ISS-SENDNOWWEB-001 (low) stands: scope learned on first submit.

ISSUES-WRITTEN: ISS-SENDNOWWEB-002 (low)
