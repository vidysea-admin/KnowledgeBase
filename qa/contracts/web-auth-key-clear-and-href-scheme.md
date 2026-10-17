# Contract: web-auth-key-clear-and-href-scheme

Authored by the CHECKER on 2026-10-10 from the unit brief. Status: proposed. Maker never edits this file.
Scope: apps/web only (security class: auth). Source-scope certification; live-browser validation owed under D-024.

## Criteria
- **[C1] Late 401 never deletes a newer stored key.** Stored B behind tab state A, 401 for A: storage still B.
- **[C2] A 401 for the tab's OWN key returns it to the login prompt without adopting a stored key, and LoginGate unmounts data-bearing children.**
- **[C3] A late 401 for an old key never logs out a tab that holds a different (newer) key**, whatever the storage state (working, empty, throwing on write).
- **[C4] Storage failures (get/set/remove throwing) never crash the provider.**
- **[C5] 403 clears nothing; explicit sign-out clears storage.**
- **[C6] The failing key is attributed per request at send time** (not read from state at failure time).
- **[C7] Only absolute http(s) URLs from API-supplied data become an `href`**; everything else renders as an inert text node. Applies to AskPage, AgendaView, EventDetail.
- **[C8] An anchor opening a new tab carries rel with noopener (noreferrer implies it).**
- **[C9] No unguarded API-data-to-URL sink remains in apps/web/src.**
- **[C10] D-015: each fix's recorded reproduction fails on pre-fix code and passes on the fix.**

## Invariants
- I1: no API, dependency, App.tsx, NavSidebar.tsx or pages/analytics change in the unit.
- I2: `tsc --noEmit` for apps/web exits 0.
