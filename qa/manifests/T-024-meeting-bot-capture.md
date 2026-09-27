# Manifest — T-024 meeting-bot-capture

**Contract:** `qa/contracts/meeting-bot-capture.md`
**Goal task:** T-024
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

Filled in the `packages/meeting-bot` placeholder (T-016) end to end:

- `src/platform.ts` (C1) — `detectPlatform(url)`, pure, real URL-hostname matching for
  meet/teams/zoom/webex, `unknown` for everything else (incl. unparseable URLs).
- `src/strategy.ts` (C2) — `selectJoinStrategy(platform)`. **Amends the contract's original
  guess** based on a live check of Vexa's actual docs (see "Vexa platform-support finding"
  below): `vexa` for `meet`/`teams`/`zoom` (all three are Vexa's verified native platforms),
  `browser` for `webex` (not supported by Vexa), `system-audio` for `unknown`.
- `src/joiner.ts` (C3) — the `Joiner` interface (`join`/`stop`), `JoinOpts`/`JoinResult`, opaque
  `MediaSource` (TODO(T-024b) for a real shape).
- `src/joiners/vexa-joiner.ts`, `browser-joiner.ts`, `system-audio-joiner.ts` (C3) — three
  stubbed `Joiner`s, each ≤300 LOC (75/36/36 LOC), each behind an injected transport/launcher/
  capture-fn param, each with a `TODO(T-024b)` comment marking the real implementation as
  follow-up work. `vexa-joiner.ts` mirrors T-019's `Transport`-injection pattern (own local
  `VexaTransport` type — see dependency note below) rather than reimplementing raw fetch calls.
- `src/capture.ts` (C4) — `capture(url, opts, deps)`: `detectPlatform -> selectJoinStrategy ->
  Joiner.join -> packages/ingest's recording Source.fetch/toTurns (imported, not reimplemented)
  -> assertProvidedFirst` (D-008 soft gate, runs BEFORE join) `-> {source, session, turns,
  warnings}`. No concrete joiner or `@lkb/ai` import — everything arrives via `deps`. `session`
  is assembled locally against `@lkb/core`'s generated `Sessions` type (no ingest "session
  adapter" exists yet to reuse).
- `src/cli.ts` (C5) — `lkb capture <meeting-url> [--consent-note ...] [--capture-mode ...]
  [--tenant ...] [--recorded-by ...] [--confirmed-no-alternative] [--fixture-path ...]
  [--whisper-url ...] [--fake-transcribe]`. Wires a **real** `@lkb/ingest` `createRecordingSource`
  (real SHA-256 hasher via `node:crypto`, real file reader via `node:fs/promises`) and the three
  real `joiners/*.ts` factories (given injected fake transport/launcher/capture functions that
  resolve to a local fixture file — no live Vexa/browser/OS-audio, per T-024's explicit
  non-goals). Prints `sessionId` / `capture mode` / `turn count` / `warnings`.
- `fixtures/sample-recording.wav` — tiny fixture file (not real audio bytes; the recording
  adapter only reads/hashes bytes, it doesn't decode audio) used by the CLI's default fake
  joiners for the required end-to-end demo run.
- Tests: `platform.test.ts`, `strategy.test.ts`, `joiners/joiners.test.ts`, `capture.test.ts`
  (19 tests total), reusing `packages/ingest`'s `assertProvidedFirst` test pattern for the
  silent-without-confirmation warning case, plus `testUtils.ts` which **imports** (does not
  redeclare) `TENANT`/`FIXED_NOW`/`baseConsent` from `@lkb/ingest/src/testUtils.js` — a first
  attempt redeclared them and `lint:structure`'s dupe-checker correctly caught it (see "Issues
  found & fixed" below).
- `package.json` — added `@lkb/ingest` workspace dependency, `test`/`cli` scripts, `tsx` devDep.
- `src/index.ts` — re-exports platform/strategy/joiner/capture/joiners (not `cli.ts`, which is a
  script entry point, run directly).

## CLI location decision (C5)

Put the CLI at `packages/meeting-bot/src/cli.ts`, not `apps/cli`. Reasoning (documented in the
file header too): `apps/api` exists only as an empty T-016 placeholder, so there's no live
apps-vs-packages precedent either way — the decisive fact is `.dependency-cruiser.cjs`'s
`apps-only-ask-ingest-index-ai-db-core` rule, which does **not** include `meeting-bot` in what
`apps/*` may import. An `apps/cli` could never call `@lkb/meeting-bot`'s `capture()` without
breaking `pnpm lint:structure`. The CLI has to live inside `packages/meeting-bot` to call its own
`capture()` at all.

## A second dependency-rule consequence, surfaced honestly

The same wall (`meeting-bot -> ingest, core` only, ARCHITECTURE §5) means `src/cli.ts` — which
lives inside `packages/meeting-bot` — **cannot statically import `@lkb/ai`** either, even though
contract C5 asks the CLI to wire "real `packages/ingest` + `packages/ai`". Resolution used:
`cli.ts`'s default (non-`--fake-transcribe`) `transcribe` makes the *same* wire-shape HTTP call
`packages/ai/src/stt/whisper.ts` makes (`POST {WHISPER_URL}/transcribe`) — hitting a real
self-hosted whisper worker at runtime, matching ARCHITECTURE's `workers/transcribe/` — without a
static import of `@lkb/ai`, so the dependency-cruiser rule stays green. This is a local mirror of
T-019's shape (same pattern the joiners mirror for Vexa/browser transport), not a duplicate
*package* — `@lkb/ai`'s own `whisper.ts` is still the canonical adapter used elsewhere. Since no
`workers/transcribe/` process is running in this environment, the required demo run below uses
`--fake-transcribe` (a small deterministic built-in), which is what T-024's non-goals expect
anyway ("no real OS audio capture... this unit is the orchestration skeleton").

## Vexa platform-support finding (required pre-check, done before writing strategy.ts)

Fetched `github.com/Vexa-ai/vexa`'s README directly (WebFetch) and cross-checked with a web
search on the repo. Findings:
- GitHub repo description: "Open-source meeting transcription API for **Google Meet, Microsoft
  Teams & Zoom**. Auto-join bots, real-time WebSocket transcripts, MCP server for AI agents."
- README's bot-creation API documents a `platform` request parameter with enum `google_meet |
  teams | zoom | jitsi` (Jitsi noted as "offline-proven, live validation pending").
- **Webex does not appear anywhere in Vexa's supported-platform list.**

This means the contract's original C2 guess ("`vexa` for `meet`/`teams` ... `browser` for
`zoom`/`webex`") was wrong on Zoom (Vexa natively supports it) and right that Webex isn't
covered. `strategy.ts` follows the verified facts: `vexa` for meet/teams/zoom, `browser` for
webex, `system-audio` for unknown. Cited in `strategy.ts`'s file header, not invented.

## Issues found & fixed during this cycle

1. `pnpm lint:structure`'s `lint-dupes` check FAILed on first pass — `testUtils.ts` redeclared
   `TENANT`/`FIXED_NOW`/`baseConsent`, already declared in `packages/ingest/src/testUtils.ts`.
   Fixed by importing them (`@lkb/ingest/src/testUtils.js`, a deep subpath import — `@lkb/ingest`
   has no `exports` map so this resolves via plain Node package resolution) and re-exporting,
   instead of redeclaring. Re-ran `pnpm lint:structure` clean after the fix.
2. Initial `tsc --noEmit` run failed with `Cannot find module '@lkb/ingest'` — the workspace
   dependency was added to `package.json` but `pnpm install` hadn't re-linked it yet. Fixed by
   running `pnpm install` (confirmed via the `node_modules/@lkb/ingest` symlink), then typecheck
   passed clean.

## How to verify

**C1 — platform.ts, pure, real URL matching:**
```
cd packages/meeting-bot && node --test --import tsx src/platform.test.ts
```
Actual output:
```
✔ detects meet.google.com URLs (0.9445ms)
✔ detects teams.microsoft.com URLs (0.1819ms)
✔ detects zoom.us URLs (0.1112ms)
✔ detects webex.com URLs (0.0921ms)
✔ falls back to unknown for an unrecognized platform (0.0998ms)
✔ falls back to unknown for an unparseable URL (0.1383ms)
✔ matches bare zoom.com and subdomains too (0.1319ms)
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

**C2 — strategy.ts, cited Vexa support:**
```
cd packages/meeting-bot && node --test --import tsx src/strategy.test.ts
```
Actual output:
```
✔ routes meet, teams, and zoom to vexa (verified native support) (0.8083ms)
✔ routes webex to browser (not in Vexa's supported-platform list) (0.1735ms)
✔ routes unknown to system-audio (universal fallback) (0.122ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

**C3 — three Joiner implementations, stubbed + injected:**
```
cd packages/meeting-bot && node --test --import tsx src/joiners/joiners.test.ts
```
Actual output:
```
✔ vexa-joiner: join posts to {baseUrl}/bots via the injected transport and returns sessionHandle (1.2251ms)
✔ vexa-joiner: throws when the transport reports a non-2xx status (0.5384ms)
✔ browser-joiner: join delegates to the injected launcher (1.3955ms)
✔ system-audio-joiner: join/stop delegate to the injected capture functions (0.64ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

**C4 — capture.ts composition + dependency-rule compliance:**
```
cd packages/meeting-bot && node --test --import tsx src/capture.test.ts
cd D:\KnowledgeBase && depcruise --config .dependency-cruiser.cjs packages apps workers
```
Actual output:
```
✔ capture() end-to-end: detects platform, joins, fetches + transcribes, returns non-empty turns (1.6643ms)
✔ capture() routes an unknown platform to the system-audio joiner (0.4376ms)
✔ capture() warns (does not throw) when captureMode is silent without confirmation (0.2466ms)
✔ capture() does not warn when captureMode is silent with confirmedNoAlternative (0.1514ms)
✔ capture() stops the joiner even when the ingest fetch throws (0.4448ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0

✔ no dependency violations found (98 modules, 245 dependencies cruised)
```

**C5 — CLI entry, real end-to-end run against a fixture Meet-shaped URL with fake joiners:**
```
cd packages/meeting-bot && npx tsx src/cli.ts capture "https://meet.google.com/abc-defg-hij" --consent-note "T-024 fixture demo run" --fake-transcribe
```
Actual output (verbatim):
```
sessionId: 332ff63786aa2dd489f21773090bc74ed095c9b2456eda61eb636e0621993cb1-session
capture mode: provided
turn count: 1
warnings: (none)
```
Second run demonstrating the D-008 warning path end-to-end via the CLI:
```
cd packages/meeting-bot && npx tsx src/cli.ts capture "https://acme.webex.com/j/12345" --capture-mode silent --fake-transcribe
```
Actual output (verbatim):
```
sessionId: 332ff63786aa2dd489f21773090bc74ed095c9b2456eda61eb636e0621993cb1-session
capture mode: silent
turn count: 1
warnings: captureMode is 'silent' but the caller did not confirm a provided/public/notes alternative was checked first (D-008 provided-first ordering, H8) — silent capture is meant to be the last resort.
```
(Same sessionId both runs because both hash the same fixture file's bytes — `_id` is
content-hash-derived by the recording adapter, as designed in T-020.)

**C6 — full package test suite (19 tests):**
```
cd packages/meeting-bot && node --test --import tsx "src/**/*.test.ts"
```
Actual output:
```
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**C7 — no regression, full repo:**
```
pnpm -r typecheck
pnpm -r test
pnpm gen:types --check
python schema/validate.py
pnpm lint:structure
```
Actual output (tails):
```
$ pnpm -r typecheck
packages/meeting-bot typecheck: Done
(all 9 workspace projects: Done, 0 errors)

$ pnpm -r test
packages/meeting-bot test: ℹ tests 19 / pass 19 / fail 0
(all other packages: ai 23/23, ask 18/18, ingest 15/15, index 4/4 — all pass, 0 fail)

$ pnpm gen:types --check
OK: 19 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 19 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (87 file(s) within budget)
lint-dirsize: OK (53 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (145 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (493 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (105 lines, budget 200)
✔ no dependency violations found (98 modules, 245 dependencies cruised)
```
`pnpm test:lint` also re-run clean (14/14 pass) after these changes.

## File sizes (budget: 300 LOC source, 400 LOC test)
```
  93 src/capture.ts        87 src/capture.test.ts
 188 src/cli.ts             (script entry, no test-max applies; well under 300)
  29 src/joiner.ts
  33 src/platform.ts       40 src/platform.test.ts
  37 src/strategy.ts       23 src/strategy.test.ts
  64 src/testUtils.ts
  36 src/joiners/browser-joiner.ts
  36 src/joiners/system-audio-joiner.ts
  75 src/joiners/vexa-joiner.ts
  68 src/joiners/joiners.test.ts
  12 src/index.ts
```
All within budget; `lint-loc` confirms.

## Criteria not fully met

None — all 7 contract criteria (C1-C7) verified above. Two honest amendments are called out
explicitly rather than silently applied: (a) C2's platform→strategy mapping corrects the
contract's Zoom/Webex guess against verified Vexa docs; (b) C5's "real packages/ai" wiring is
satisfied via a same-wire-shape local HTTP mirror rather than a static import, because
`ARCHITECTURE §5`'s `meeting-bot -> ingest, core` dependency rule (enforced by
`.dependency-cruiser.cjs`, confirmed clean above) forbids `packages/meeting-bot` — including its
own `cli.ts` — from importing `@lkb/ai` at all. Both are flagged here for `/checker` to adopt or
amend.

## Status: checked-PASS
Verdict: qa/verdicts/T-024-meeting-bot-capture.md (Cycle checked: 1, commit e2a8136) — 7/7 criteria met; Vexa platform mapping + wire-shape approach both confirmed.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
