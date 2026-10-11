# Manifest — t045-onair-source-adapter

**Goal task:** T-045 (Google Cloud OnAir half, URL recognition only), tier 3 roadmap pull. TASKS.md row T-045 lists "OnAir on-demand, YouTube via yt-dlp, Meet/Teams/Zoom via browser bot"; YouTube is done (t045-youtube-source-adapter, PASS), so OnAir is the next platform named. Round cap: no PASSed verdict names an OnAir seam.
**Roadmap exit criterion (docs/meeting-bot-roadmap.md:76):** "one successful run per source". NOT claimed by this unit.
**Date:** 2026-10-11 · **Lane:** T045ONAIR (no issues filed; `qa/issues.t045onair.jsonl` not created)
**Files (new only):** `packages/ingest/src/sources/onair.ts` (89 non-blank lines), `packages/ingest/src/sources/onair.test.ts` (179), this manifest.

## Scope
Pure URL recognition and normalisation: `parseOnairUrl(input) -> {ok,platform,eventId,canonicalUrl} | {ok:false,reason}`, `extractOnairEventId`, `canonicalOnairUrl`, and a descriptor `onairAdapter {name, host, detect, parse, canonicalUrl}`. No fetch, download, HTML parsing, process, or DB. It is deliberately NOT a `Source` (no `fetch`/`toTurns`): there is no recorded-media access path to implement without the live site.

## Accepted forms and evidence
| Form | Evidence in repo | Status |
|---|---|---|
| `https://cloudonair.withgoogle.com/events/<slug>` | `packages/meeting-bot/src/platform.ts:34` (host), `platform.test.ts:39`, `send-now.ts:120-122` (`/events/<slug>`, slug `[a-z0-9][a-z0-9._~-]*`), `send-now.test.ts:33,191,267` | grounded in repo (assumption about the live site) |
| host case-insensitive (`CLOUDONAIR.withgoogle.com`), path lower-cased to the slug, optional trailing `/` | `send-now.test.ts:191,267` | grounded |
| query / fragment ignored (`?utm_a=1`, `#a`, `?tk=2`) | `send-now.test.ts:191,267,269` | grounded |
| Gmail scanner pattern `cloudonair.withgoogle.com` anywhere (`gws-gmail.ts:55,60`) | read-only | host only; gives no path shape |

UNVERIFIED: that `/events/<slug>` is the on-demand (recorded) page rather than the live page; the repo never distinguishes them. No `/on-demand`, `/watch`, locale-prefixed, or other path form is accepted because the repo evidences none. Nothing was checked against the live site.

## Decisions on the security points
https only (case-insensitive scheme); exact host `cloudonair.withgoogle.com` (no subdomains, no `www.`, no suffix match, no trailing dot); any `@` in the authority, any `:` (port, even 443) refused; any char outside printable ASCII (controls, whitespace, DEL, non-ASCII, lone surrogates, IDN look-alikes) and any `\` refused; `%` anywhere in the path refused; dot-only slugs, extra segments and empty slug refused; input <= 200 chars, slug <= 100. Query allow-list `ONAIR_QUERY_ALLOW` is EMPTY: no query parameter and no fragment is ever carried into the canonical URL or id. The canonical URL is rebuilt from the validated slug. Refusal reasons: not-a-string, empty, too-long, bad-characters, not-https, credentials, port, unparseable, host-not-allowed, path-not-supported, bad-event-id. Never throws.

## Registration
NOT registered. `youtube.ts` is not exported from `packages/ingest/src/index.ts` and not in `registry.ts` either, and onair is not a `Source`; nothing existing changed.

## Evidence
Node on PATH from the codex runtime; node_modules junctioned to the main tree.

`cd packages/ingest && timeout 120 node --test --import tsx src/sources/onair.test.ts`
```
✔ accepts supported forms: id and canonical URL, query/fragment dropped
✔ refuses every hostile or unsupported input with the right reason
✔ never throws on hostile garbage
✔ canonical URL is idempotent and refuses a bad id
✔ empty id is never accepted
✔ property (seeded): any accepted input has allow-listed host, https, no stray query, no userinfo
ℹ tests 6 / pass 6 / fail 0
```
Hostile table: 61 cases (non-strings, empty, oversize, http/ftp/javascript/file/protocol-relative/schemeless, userinfo variants, ports, trailing dot, `.evil.example` suffix, prefix, subdomain, www, punycode, Cyrillic homoglyph, backslash host/path, encoded slash/dot/letter, dot segments, whitespace/NUL/DEL/U+2028/lone surrogate/non-ASCII, wrong paths), each asserted to the exact reason. Property test: seeded LCG (seed 45), 4000 generated inputs, 36+ accepted, every accepted canonical URL checked for https, exact host, no userinfo/port/query/fragment.

`timeout 120 node --test --import tsx src/sources/youtube.test.ts` -> `ℹ tests 10 / pass 10 / fail 0` (unchanged).
`cd packages/ingest && timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, `tsc-exit=0`.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`.

## Mutations (per-mutation byte backup, restored in trap/finally, 120 s timeout each; HEAD fidelity after each: `git hash-object` = `git rev-parse HEAD:` = ad80660ca53d63fbc053ad0d79ee24621b51c836)
| Mutation | Result | Killing test |
|---|---|---|
| host suffix match (authority AND hostname checks) | KILLED | refuses every hostile... |
| allow http (drop scheme check) | KILLED | refuses every hostile... |
| keep query in canonical URL | KILLED | accepts supported forms; property (seeded) |
| skip userinfo check | KILLED | refuses every hostile... |
| accept empty id (`[^/]*`) | KILLED | refuses every hostile... |
| case-sensitive host | KILLED | accepts supported forms; canonical idempotent; property |
Honest note: mutating ONLY the authority suffix check survived (0 failures) because the second `url.hostname` check independently refuses the host (defence in depth, equivalent mutant); mutating both was killed. Dropping the `%` path check also survived: the slug regex rejects `%` independently (equivalent mutant, redundant guard).

## Not done
- No fetch, download, transcription, HTML parsing; no `Source` implementation; nothing verified against the live site; the "one successful run per source" clause is not met; the login step ("after a one-time login") is untouched.
- T-045 stays `in_progress`: still needs OnAir media acquisition (browser/login path), a live yt-dlp YouTube run, Meet/Teams/Zoom runs, and registration of the adapters.

Status: ready-for-check
Fix cycle: 0
