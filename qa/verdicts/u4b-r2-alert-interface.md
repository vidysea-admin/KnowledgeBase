# Verdict — `u4b-r2-alert-interface`

**Cycle checked:** 0
**VERDICT: PASS**
**SCOREBOARD:** schema/validate.py 27/27 (incl. watch_heartbeat) · pnpm -r typecheck 10/10 clean ·
packages/core test 14/14 · apps/api test 213/213 · meeting-bot test 272/272 (full package; the two
named notifyWatchSilent cases both pass) · depcruise 0 violations (379 modules, 1192 deps) ·
lint-codex-hooks 6/6 OK · lint-dupes OK · lint-migrations OK · lint-loc 5 FAIL (4 baseline +
1 attributed-to-master-merge, none this unit's) · lint-dirsize 1 FAIL (apps/api/src 32/31,
pre-existing, 0 files added by this unit) · lint-root 1 FAIL (17/15, pre-existing) · snapshot --check
stale (pre-existing, diff contains nothing from this unit's files) · tracker-audit 6 findings, none
citing this unit · test:lint 111/112 (1 fail = the same pre-existing SNAPSHOT staleness).
**CAPABILITY-COVERAGE:** R2 alert-delivery path fully exercised end-to-end (detector -> sink ->
HTTPS transport), missing-credential / send-failure / redaction / never-throws / never-a-Promise all
covered by tests I re-ran; depcruise boundary re-verified AND falsified (a deliberate forbidden edge
goes red, then restored clean). Not covered by this unit and correctly not charged to it: /health
scheduling (U6) and the heartbeat write leg (no Mongo test exists anywhere).
**ISSUES-WRITTEN:** ISS-U4BR2-001 (high, non-blocking) — lane shard `qa/issues.u4br2.jsonl`
**EXECUTOR:** worktree-agent-a7e885f3597d16f27 (builder) — this check ran fresh-context, read-only,
`self != executor`.

---

## Trial-merge

Master has advanced to `eb3c60b` (includes D-054, correcting D-053's `Changes-authorized` file name)
since this branch was built from `095585d`.

```
$ git merge-tree --write-tree eb3c60b 5e3a602
ae67b61edb25aa71a028eeee08cfd52d422aa3c9
(exit 0 — clean, no conflict markers in output)
```

Extracted via `git commit-tree ae67b61 -p eb3c60b -p 5e3a602` -> `fd400b9`, checked out into a
throwaway `git worktree add --detach` copy under the session scratchpad (not this repo, not pushed,
not merged). `pnpm install --offline` succeeded (lockfile unchanged by either side). Every command
below ran against that trial-merged tree, i.e. with **both** D-054's correction and this unit's code
present together.

## Scope question — verified, not re-litigated

D-054 (current master, absent from this branch's base) retroactively corrects D-053's
`Changes-authorized` field: the real wiring target is `apps/api/src/production.ts:57`, not
`routes/health.ts`, because `health.ts` never held a concrete sink. The manifest's own disclosure
(section 1, "One naming/location deviation...") independently arrived at the identical fact before
D-054 existed, and disclosed it rather than hiding it. I verified this rather than took either
document's word:

```
$ git diff --name-status 095585d 5e3a602
M  apps/api/src/production.ts
A  packages/core/src/alerts/alert-sink.test.ts
A  packages/core/src/alerts/alert-sink.ts
M  packages/core/src/index.ts
A  qa/manifests/u4b-r2-alert-interface.md
A  schema/fixtures/watch_heartbeat/invalid.json
A  schema/fixtures/watch_heartbeat/valid.json

$ git diff 095585d 5e3a602 -- apps/api/src/routes/health.ts | wc -l
0
$ git diff 095585d 5e3a602 -- .dependency-cruiser.cjs | wc -l
0
```

`health.ts` is byte-for-byte untouched. `.dependency-cruiser.cjs` is byte-for-byte untouched. The
`production.ts` diff is exactly the one-line functional change the manifest describes (the
`console.error` body replaced by a call into `alertSink.notifyWatchSilent`, constructed once, lazily,
via `createTelegramAlertSink()`) plus an updated doc comment. Nothing else moved. Both standing
prohibitions hold. Not a finding against the unit — this section exists to show I checked rather than
accepted.

## Attack 1 — the duplication: do the two implementations actually agree?

Read both in full: `packages/core/src/alerts/alert-sink.ts` (new) against
`packages/meeting-bot/src/capture/telegram-channel.ts` + `telegram-alerts.ts` (untouched).

**Agree:** message wording is byte-identical (verified by reading both `notifyWatchSilent` bodies,
and by the unit's own hardcoded-string test, which I re-ran green). Transport shape is identical —
same `SEND_TIMEOUT_MS = 8_000`, same POST body/headers, same `res.resume()` drain, same
`statusCode >= 200 && < 300` success test, same `timeout`/`error` handling, same `redact()`
(`s.split(token).join("[REDACTED]")`). Missing-credential behaviour matches (one log line, never
sends). Never-throws/never-returns-a-Promise contract matches.

**Diverge — a real, current, verifiable defect, not a future risk:** `createTelegramAlertSink`
(core) has **no throttle at all**. `TelegramNotifier.notifyWatchSilent` (meeting-bot) routes through
`notify-channels.ts`'s `createNotifier`, which applies a **generic per-key 60s backstop throttle** to
every notify call, documented there as existing specifically "so a flapping connection... cannot
spam the phone." The caller on the apps/api side, `detectSilentWatchers`, also has no state-based
throttle of its own — it re-evaluates and re-alerts every stale source type on every single call.

I proved this live rather than by inspection alone: a throwaway `node:test` file
(`apps/api/src/routes/__probe_throttle.test.ts`, deleted after the run, HEAD-fidelity confirmed
below) called `detectSilentWatchers` twice in a row with one stale row and recorded exactly 2 separate
`notifyWatchSilent` calls — zero collapsing. With the real default `expectedSourceTypes` (3 types)
and only 1 row present, two calls produced **6** alerts, not 2, since a missing row is also "stale."

**Severity judgment:** filed HIGH, non-blocking — `ISS-U4BR2-001` in `qa/issues.u4br2.jsonl`. Not a
FAIL because the unit's actual claim ("R2 reaches 1/1 on alert delivery") is true and independently
verified; D-053 never made throttling part of this interface's contract; and nothing currently
schedules `/health`, so no live spam is possible in the deployed state today (per D-053/D-048, not
charged to this unit). It is HIGH rather than medium because the failure mode it opens — an operator
who gets paged on every poll while a watcher stays down mutes the channel — is the same class of
blindness D-046 built this feature to catch (Ashoka incident: silence nobody notices), and because
U6, the very next gated unit on this exact feature, is specifically "make something call `/health` on
a schedule," at which point this stops being latent. The maker should close this before or alongside
U6, not discover it live.

## Attack 2 — does the alert reach a human, on every path?

Traced the full chain: `health.ts`'s `router.get("/health")` -> `detectSilentWatchers` (only when
`db === "ok"`) -> `deps.notifyWatchSilent` -> `production.ts`'s closure ->
`alertSink.notifyWatchSilent` -> `send()` -> `defaultTelegramAlertSend` -> real `https.request` to
`api.telegram.org`. Confirmed nothing still lands in `console.error` — `git diff` above shows that
line replaced, not merely wrapped.

Failure paths, each re-run:
- **Missing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`:** `alert-sink.test.ts`'s "missing token/chatId
  disables the sink, logs once, never sends" — reran green, 0 send calls, 1 log line matching
  `/disabled/`.
- **Non-2xx (429/500 shape):** `defaultTelegramAlertSend`'s response handler rejects on any
  `statusCode` outside `[200,300)` with `Error("telegram sendMessage HTTP <code>")` — caught by
  `notifyWatchSilent`'s `.catch`, logged, never thrown. Exercised via the "a send failure is caught,
  redacted and logged" test (fake transport throws) — reran green.
- **Timeout:** `req.on("timeout", () => req.destroy(new Error(...)))` feeds the same `req.on("error",
  reject)` path — same catch, same guarantee. Code is byte-identical to meeting-bot's own
  `defaultTelegramSend`, which is likewise never exercised against a real timeout in either
  implementation's test suite (neither project unit-tests the real HTTPS transport function directly
  — "never call the real API from a test" is the standing rule here); read both to confirm the logic
  is sound rather than accept it on trust.
- **Detector-level backstop:** `health.ts:113-118` wraps the `notifyWatchSilent` call itself in
  try/catch. `health.test.ts`'s "R2: a throwing alert sink is swallowed" — reran green.

No path found that could take the detector down with the alert, and none that silently drops an
alert without at least one log line.

## Attack 3 — secret handling

`token` never appears in the Telegram message text (built only from tenant/sourceType/heartbeat
data). It is embedded only in the outbound HTTPS request path (`/bot${token}/sendMessage`), which is
correct per the Telegram Bot API and never logged as a URL. Every catch path in
`createTelegramAlertSink` runs the error message through `redact()` before logging —
`s.split(token).join("[REDACTED]")` — confirmed by test: `assert.doesNotMatch(lines[0],
/T-TOKEN-SECRET/)` + `assert.match(lines[0], /\[REDACTED\]/)`, reran green. No file write anywhere in
the module. This is the one thing that must not be wrong, and it is not wrong.

## Attack 4 — falsify the depcruise proof

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (379 modules, 1192 dependencies cruised)
```

Then, in the trial-merge throwaway copy, three escalating mutations of
`apps/api/src/production.ts` (each backed up and restored individually, never a shared/run-scoped
backup):

1. `import ... from "@lkb/meeting-bot/capture/telegram-alerts.js"` (subpath) ->
   `error no-unresolvable-workspace-import` (pnpm never symlinked a package `apps/api` doesn't
   declare as a dependency — a structural guard even stronger than the path rule). Exit 1.
2. `import ... from "@lkb/meeting-bot"` (bare, main entry) -> same
   `no-unresolvable-workspace-import`. Exit 1.
3. `import ... from "../../../packages/meeting-bot/src/capture/telegram-alerts.js"` (relative,
   bypasses package-declaration resolution entirely) -> **`error
   apps-only-ask-ingest-index-ai-db-core: apps/api/src/production.ts →
   packages/meeting-bot/src/capture/telegram-alerts.ts`**. Exit 1. This is the exact named rule
   D-053 declined to loosen, confirmed to actually fire on the exact forbidden edge this unit's
   design argument depends on being enforced.

Restored after each mutation, then confirmed clean:

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (379 modules, 1192 dependencies cruised)

HEAD blob:  a1cdde8f008b117db79c9b78277f41203b098d24
file blob:  a1cdde8f008b117db79c9b78277f41203b098d24
$ git status --short apps/api/src/production.ts   # no output
```

Same HEAD-fidelity check re-run after the throttle-probe file (added then deleted) for all four
files this session touched — all four hash-match HEAD, `git status --short` on the trial-merge tree
is empty.

## Baseline verified, not charged (all confirmed independently, not taken from the manifest)

- `scripts/lib/dispatch-state.test.mjs`'s lint-loc violation: `git diff 095585d 5e3a602 --
  scripts/lib/dispatch-state.test.mjs` is empty — confirmed present unchanged since before this
  unit's base commit, not authored here.
- `lint:structure`'s `&&` chain stops dead at the first failing stage (`lint-loc`, exit 1) — this
  repo's own sweep already flagged this (`420de90`, `cbab085`); I ran every downstream lint-*.mjs
  script individually rather than trust the chain, and every number matches the manifest's claims
  (`lint-dirsize` 32/31, `lint-root` 17/15, `lint-dupes` OK, `lint-migrations` OK (1424, vs the
  manifest's 1423 — master gained one migration file since; not this unit's), `lint-codex-hooks`
  6/6 OK, `tracker-audit` 6 findings none naming this unit, `snapshot --check` stale with a diff
  containing nothing from `packages/core/src/alerts/` or `schema/fixtures/watch_heartbeat/`).
- `apps/api/src` file count: `git diff --name-status 095585d 5e3a602 -- apps/api/src/` shows exactly
  one modified file (`production.ts`), zero added — the 32/31 dirsize violation is pre-existing, not
  this unit's.

## What I did not re-litigate

Nothing schedules `/health` (U6, separately gated) and the heartbeat write leg has never written a
row (no Mongo test exists anywhere in this repo) — both correctly excluded from this unit's scope per
D-053/D-048. I did not call the real Telegram API and did not write to any database.

## For the maker to carry forward

`ISS-U4BR2-001` (high): add a generic per-key backstop throttle to `createTelegramAlertSink`,
mirroring `notify-channels.ts`'s `DEFAULT_THROTTLE_MS` pattern, before or alongside U6 — once
something schedules repeated `/health` probes, the current code sends one live Telegram message per
probe per stale source type, indefinitely, with zero rate limiting.
