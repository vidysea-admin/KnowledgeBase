# Contract - t039-send-now-status-polling

Scope: existing authenticated SendNowForm consumes the existing flag-gated process-status GET. No backend activation, recorder cancellation, production-host acceptance, or measured meeting admission is claimed. T-039 remains in progress until the real request-to-observed-admission 60-second criterion and supported production-host path are independently verified.

## Acceptance

1. A valid accepted POST launch triggers GET `/calendar/send-now/:jobId` through the shared client with the same owning API key. POST body remains exactly `{meetingUrl, until}`; tenant is never provided by the UI. Missing key or invalid job-id shape causes no status request.
2. GET responses must match the requested job id, contain only a recognized process-state value (`launching`, `running`, `not-running`), and report `joined: "unknown"`. A malformed or mismatched response cannot be shown as a confirmed state.
3. Every polling state describes recorder-process status and explicitly leaves meeting admission unknown. `not-running` cannot claim finished versus failed. A disabled/absent status route and unreadable state are shown honestly without claiming that no bot was launched.
4. Polling is sequential, spaced 2 seconds after each completed nonterminal response, capped at 60 requests, and has a 10-second logical request deadline. A terminal state, rejected/malformed response, network error, or deadline stops further automatic requests.
5. Key/job replacement, new submission, and unmount cancel owned timers and suppress old GET/POST results. No replacement key is used to poll the former key's job. Outstanding HTTP may finish after logical cancellation; this limitation is explicit and does not constitute recorder cancellation.
6. Key and meeting URL are never echoed in status text. Polling errors do not display server/network detail. Existing shared-client 401 session invalidation and 403 non-signout behavior remain intact; scoped GET never bypasses the shared authorization client.
7. Required evidence covers actual hook/client lifecycle and real-form POST-to-GET consumption, the immediate MeetingBotPage consumer, web TypeScript checking, and the frozen-contract validator. An equivalent local ReactDOM/jsdom harness is acceptable when its source/import transformations and checked candidate bytes are recorded; mocked hook-only evidence is insufficient.

Checker-owned ground truth. No maker edits. No filed issue repair is claimed by this unit.
