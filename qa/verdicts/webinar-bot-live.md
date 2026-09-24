# Verdict — webinar-bot-live

**Date:** 2026-09-24
**Cycle checked:** 0
**Contract:** qa/contracts/meeting-bot-capture.md (T-024) — C1/C2 extended, C3 ruled SUPERSEDED
for the browser joiner (below). New draft contract proposed: qa/contracts/meeting-bot-live-capture.md
(T-024b, DRAFT — see its Status note; not yet binding ground truth).
**Mode:** A (unit check). Fresh subagent, no builder context. Project bound: `D:/KnowledgeBase`.
**Branch:** feat/webinar-bot, commits fd74864 + cfaf464 (base 4aa9d13).

## What I re-ran myself
- `pnpm --filter @lkb/meeting-bot test` → 43/43 pass (matches manifest).
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0 (matches).
- `node scripts/lint-loc.mjs` → OK 295 files (matches).
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → 0 violations, **311**
  modules (manifest said 310 — harmless drift, not investigated further; no violation either way).
- `node scripts/lint-dupes.mjs` → OK (matches).
- `node scripts/sync-webinar-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run`
  → turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges 94, byType identical to the manifest's
  pasted breakdown, no Mongo connection attempted (matches exactly).
- **Went beyond the manifest's own list** to the contract's full C7: `pnpm lint:structure` (the
  actual composite script, not the 3-of-9 subset the manifest ran) → **FAILS**:
  `lint-dirsize: FAIL — 1 violation(s)  scripts: 33 files (budget 32)`. Confirmed by
  `git ls-tree -r 4aa9d13` vs `HEAD` on `scripts/*.{mjs,py,ps1}`: 32 → 33, the only addition being
  this unit's own `scripts/sync-webinar-session.mjs`. `pnpm gen:types --check` → OK. `python
  schema/validate.py` → PASS, 24 collections. So of C7's five commands, four are clean and the
  fifth — the one the manifest never actually invoked — is a direct, self-inflicted regression.
  ISS-285.
- **Mongo read-back (read-only, tenant `toc`)**, via a throwaway script placed under
  `packages/db/` for module resolution and deleted immediately after: `graph_edges` count 94,
  `byType` identical to the dry-run and to D-028's claim; `spoke_in` weights devanshi 35 / anjum 27
  / sagar 16 (matches manifest exactly); **225/225 evidence `turnId`s resolve to a `turns` row of
  this session** (0 bad); **0 cross-tenant `graph_edges`/`turns` rows** sharing this
  `sessionRef`/`sessionId` under a different `tenantId`.
- `git diff 4aa9d13...HEAD --stat` (step 4c) — no existing function/export/test/route deleted;
  +5495/-8 lines, the 8 deletions being trivial package.json/version-bump lines. Some touched files
  are not named in the manifest's "What changed" (docs/meeting-bot-roadmap.md new,
  TASKS.md/.gitignore/docs/DECISIONS.md/package.json/pnpm-lock.yaml) — ISS-287, low.

## Security class (never capped)
- **Tenancy/deletion scoping of `sync-webinar-session.mjs`** — PASS. Read
  `packages/db/src/lib/tenantScope.ts`: `scopedCollection`'s `deleteMany`/`updateOne`/etc. always
  merge `{ tenantId }` into the filter before it reaches the driver (`withTenant`), and the raw
  handle is never exposed. The script's own deletes are additionally scoped by
  `{ sessionId }`/`{ sessionRef: sessionId }`, so a re-run can only replace **this session's** rows
  of **this tenant** — confirmed live against production data above (0 cross-tenant rows).
- **Credential handling** — PASS. `OBS_WS_PASSWORD` is read once from `.env`/`process.env` in
  `record-commands.ts` and passed only to `obs.connect(...)`/`createObsBrowserDeps({...})`; grepped
  every `console.log`/`console.error` in `obs-windows.ts` and `record-commands.ts` — none logs the
  password or the config object it lives in. `data/bot-profile/` (holds live login cookies) and
  `raw/webinars/` are in `.gitignore` (confirmed the actual lines).
- **`sb_join.py` auto-click list** — PASS on the specific ask. `JOIN_TEXTS` = join/continue/accept/
  listen-only style phrases only; it contains no `share`, `unmute`, `raise hand`, or `allow`/`enable`
  string. Matching is **exact equality** on trimmed, lowercased element text/aria-label (`CLICK_JS`:
  `wanted.includes(t)`), not substring, capped at `MAX_CLICKS=8` within the first 15 minutes, and
  native permission prompts (mic/camera/notifications) are denied at the Chromium-flag level
  (`--deny-permission-prompts`), never via a page click. Residual risk noted, not a finding: a
  bare "Continue" button on an unfamiliar page could in principle be something other than a join
  gate; the click budget and 15-minute window bound the blast radius.

## C3 ruling (explicit, as asked)
**SUPERSEDED for the browser joiner.** Original C3 specified a Playwright-shaped launcher stub with
real join/audio-track capture deferred to T-024b. This unit delivers that follow-up, but through a
**different real mechanism**: SeleniumBase-UC (not Playwright) on a persistent profile, captured via
OBS window + WASAPI process-audio capture (not an in-browser audio track). `browser-joiner.ts`
itself is untouched and its interface (`launch`/`stop` injected deps) is exactly what
`createObsBrowserDeps` now satisfies — so the *seam* C3 defined held; the *implementation family* it
predicted did not. `vexa-joiner.ts` and `system-audio-joiner.ts` remain the original stubs; C3 is
unchanged for them. I've proposed the successor criteria as a draft contract
(`qa/contracts/meeting-bot-live-capture.md`) rather than silently amending C3, per the criticality
gate on contract creation.

## Capability coverage
**0/N rows — no table present.** Per protocol step 4b this is an unenumerated claim and fails the
unit on its own; there is nothing for me to reproduce. Given the size of this unit (new real join
mechanism, new real capture mechanism, silence gate, recovery path, and a production data-writing
sync script) and this repo's severity gate mandating FULL ceremony for any data-writing unit, this
gap is significant on its own merits, independent of the lint:structure regression. ISS-286.

## Failure-path review (obs-windows.ts / record-commands.ts)
Reasonable, mostly-defensive code: `launch()` wraps window-confirm + OBS-connect + scene-prep +
StartRecord in try/catch, restoring only the inputs *this run* muted (tracked via the `mutedByUs`
array populated as `prepareScene` mutes them, so a partial failure still restores correctly) and
force-stopping the bot Chrome via a stop-file + kill fallback. `stop()`'s mute-restore/bot-teardown
runs in a `finally`, so a `StopRecord` throw (e.g. OBS crashed) still restores mutes; `runRecord`'s
own `finally` catches a `joiner.stop()` throw and falls back to scanning `RECORD_DIR` for the
newest `.mkv` — this is the actual mechanism that recovered the 16:30:56 controller death (D-027).
One real, not-yet-tested gap: `runFinalize`'s `--stop-obs` path has no try/catch around
`obs.connect`/`obs.call` — if OBS is *also* unreachable during recovery, the command throws
unhandled rather than falling through to the `--video`-flag manual path. Low-to-medium in practice
(the manual `--video` override still exists as an escape hatch), and it's the same seam T-032/T-047
already track — not filed as a new issue, folded into the EXPLANATION here since the manifest
already discloses "no unit tests for obs-windows.ts failure paths" as a known gap (T-033) rather
than claiming coverage it doesn't have.

## T-024b contract
Drafted: `qa/contracts/meeting-bot-live-capture.md` — 10 criteria covering real join, bounded
auto-click, per-process capture, silence gate, recovery, credential/profile handling, data-write
scoping, graph-edge provenance, tests, and full-suite no-regression; non-goals section explicitly
excludes T-029/T-030/T-032/T-047 (reliability follow-ups) and T-034 (tab-capture phase 2). Marked
DRAFT pending formal adoption, per the checker/SKILL.md criticality gate on new contracts.

## Goal / task wiring
`.goal`/TASKS.md task **U4.2** stays `in_progress` (no PASS → no close). No ledger `Issues addressed`
were claimed by the manifest to verify.

```
VERDICT: FAIL
SCOREBOARD: 5/7 criteria met, 2/2 invariants hold (C1, C2, C4[unchanged demo path], C5, C6 met; C3 SUPERSEDED not failed; C7 FAILS on lint:structure/lint-dirsize)
FAILURES (if any):
- [C7] sev: high · pnpm lint:structure fails (lint-dirsize: scripts 33/32) because of this unit's own new script; manifest's verify list never ran the full command · fix direction: raise the scripts override in structure.config.json with a documented reason, or shrink scripts/ back under budget, then re-run the FULL pnpm lint:structure · issue: ISS-285
- [process] sev: high · no Capability coverage table for a real-join/real-capture/data-writing unit — every real capability is an unenumerated claim per protocol 4b · fix direction: add a Capability coverage table with a falsifying-edit row per claimed capability (join succeeds, capture matches the right window, silence gate blocks transcription, recovery restores mutes/closes the bot, sync scoping) · issue: ISS-286
CAPABILITY-COVERAGE: 0/N rows (no table present) — unenumerated claim, see ISS-286
LIVE-BROWSER: not-applicable (no web-UI surface changed; live-run evidence is a CDP read of Zoho's own participant page + an OBS/Windows-Task-Scheduler run, not this repo's UI)
ISSUES-WRITTEN: ISS-285, ISS-286, ISS-287
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The core engineering is solid and independently re-verified — tests, typecheck, dependency-cruiser, lint-dupes, the dry-run's exact numbers, and a live read-only Mongo query all reproduced the manifest's claims exactly, including 225/225 graph-edge evidence turnIds resolving and 0 cross-tenant rows. Tenancy, credential handling, and the auto-click denylist ask all check out clean. What fails this unit is process, not the live-run engineering: the manifest's own "How to verify" list quietly narrowed the contract's C7 to 3 of the 5 required commands and missed the one that actually regresses (lint:structure/lint-dirsize, caused by this unit's own new file), and a unit this size with real writes to production Mongo shipped with no Capability coverage table at all. Both are fixable without touching the live-capture logic itself.
```
