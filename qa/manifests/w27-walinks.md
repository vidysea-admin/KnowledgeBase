# w27-walinks: WhatsApp-shared meeting link discovery (agent-buildable parts, flag OFF)

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-walinks (branch lane/w27-walinks)
Base: a9b202b4 (origin/master)
Candidate: see `git log -1` of the lane branch (this manifest is part of the single commit)

## Scope
Umesh (2026-10-19): daily webinar links are posted in WhatsApp groups; the bot should join them. This unit builds ONLY the
parts that need no owner decision. NO DECISIONS entry. NO API route. NO real message fetcher (arrives with the decision on the
new read path). Feature flag `LKB_WA_DISCOVERY=1` is OFF by default.

## Changed paths
- packages/meeting-bot/src/calendar/whatsapp-discovery/whatsapp-link-extractor.ts (+ .test.ts)
- packages/meeting-bot/src/calendar/whatsapp-discovery/whatsapp-candidate-loader.ts (+ .test.ts, which also covers merge and tick)
- packages/meeting-bot/src/calendar/whatsapp-discovery/whatsapp-merge.ts (dedup + tick hook body)
- packages/meeting-bot/src/calendar/schedule-tick.ts (+1 optional dep `loadWhatsappCandidates`, +1 line wiring, +1 line merge call)
- packages/meeting-bot/src/calendar/schedule-loaders.ts (+1 re-export line of `dedupeWhatsappCandidates`)

Deviation from the brief: files live in `calendar/whatsapp-discovery/`, not directly in `calendar/`, because `calendar/` already holds
29 files and lint-dirsize caps a directory at 30. Not touched: the calendar lock module (locktake lane), schedule-withdraw files, core, api.

## Behaviour
1. Extractor (pure): `{text, ts, groupId, messageId?}` -> `[{url, ts, groupIdHash, messageIdHash, needsRegistration}]`. Providers: zoom /j /w /wc/join,
   meet code, teams, webex, webinar.zoho.*/meeting.zoho, airmeet, streamyard, youtube /live + watch?v + youtu.be, registration/forms (zoom register, Google Forms,
   forms.gle, typeform, jotform, eventbrite, tally, zoho forms) marked needsRegistration. Tracking params stripped (utm_*, fbclid, gclid, igshid, mc_*, ref, si,
   feature, source, from ...); meeting ids, `pwd`, `tk`, `MTID`, `key` kept. Hash = sha256 hex[0:16]. Text and sender never appear in output.
2. Loader (injected fetcher): reads only groups in the allow-list (`WA_DISCOVERY_GROUPS`, comma/semicolon/newline separated raw ids; empty = nothing fetched) and drops
   groups whose consent is `false` (`WA_DISCOVERY_CONSENT_FALSE` env list in production wiring; injected `consentFor` in tests) BEFORE extraction. Maps to the candidate input
   with `source:"whatsapp"`, `senderAuthenticated: undefined`, `status:"pending"`, empty sender fields. D-178 ruling 1: unknown = needs-approval (scheduler returns `needs-review`);
   only an owner approval (status approved) promotes it. A candidate carries NO start/end unless an injected `windowFor` supplies one (a chat link has no time), so by default it is never scheduled.
3. Dedup (`dedupeWhatsappCandidates`): key = canonical meeting id (zoom:<id>, meet:<code>), else normalized URL. Calendar and Gmail rows win; repeat WhatsApp posts collapse to the earliest.
4. Tick hook: `ScheduleTickDeps.loadWhatsappCandidates?`. `buildRealScheduleTickDeps` sets it via `createWhatsappLoaderFromEnv`, which returns `undefined` unless `LKB_WA_DISCOVERY === "1"`.
   Flag off or hook absent: `candidates` is the same array, so the tick is byte-identical. A loader failure is logged and ignored.

## Immediate consumers
`runScheduleTickOnce` -> `selectAutoRecordItems` (auto-join.ts, unchanged), `createTopicLookup(aj, events, candidates)`, `recordSkipped`.
Known limit: `AutoRecordItem.source` stays `"calendar" | "gmail"` (core type unchanged), so a promoted WhatsApp row gets `source:"gmail"`, `sessionKey` = webinar hash in every-webinar mode.

## Checks a checker must run (from packages/meeting-bot, node on PATH per maker-common-rules)
- `node --test --import tsx src/calendar/whatsapp-discovery/whatsapp-link-extractor.test.ts src/calendar/whatsapp-discovery/whatsapp-candidate-loader.test.ts`
- `node --test --import tsx src/calendar/schedule-tick.test.ts src/calendar/schedule-tick-rules-integration.test.ts src/calendar/auto-join.test.ts`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`
- `node scripts/lint-loc.mjs --all` (repo root)
- Mutations (D-020 + 2026-09-28 amendment; per-mutation backup/trap; hash == index blob after): script at C:\Users\product\Desktop\KnowledgeBase-lanes\w27-walinks-mut.sh

## Evidence (real output)
- New tests: `ℹ pass 31 / ℹ fail 0` (run file: ..\w27-walinks-run1.txt)
- Consumers: `ℹ pass 61 / ℹ fail 0` (schedule-tick, rules-integration, auto-join; w27-walinks-run2.txt)
- tsc meeting-bot: exit 0
- lint-loc --all: stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker all exit 0; `dependencies` exit 1310 =
  1310 `no-unresolvable-workspace-import` (`@lkb/*` unresolvable through the lane's node_modules junctions, e.g. packages/ingest/src/watched/schedule.ts -> @lkb/core);
  0 of them mention whatsapp-discovery. Environmental to junction lanes; not reproduced on a real install (not run in the main tree here).
- Mutations (all killed, all restored, hash == index blob):
  - leak-text (add `text: input.text` to extractor output): `ℹ fail 1`
  - ignore-allowlist (delete the allow-list check): `ℹ fail 2`
  - ignore-consent (consent check forced false): `ℹ fail 1`
  - dedup-no-calendar (calendar rows not taken into the dedup set): `ℹ fail 3`

## D-015
No filed issue is fixed by this unit; n/a.

## Left open / for the orchestrator
- Real fetcher, API route, owner approval of the new read path, DECISIONS entry, enabling the flag, and a time source (`windowFor`) for links with no calendar/Gmail twin.
- `AutoRecordItem.source` has no `"whatsapp"` value (needs a core type change, out of this unit's package).
