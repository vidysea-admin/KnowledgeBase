# Verdict — t045-zoom-recording-source-adapter

VERDICT: FAIL
Cycle checked: 0
Commit checked: cf985c7 (branch lane/t045next, base 8520fa8)
Scope: pure URL recognition; unverified against the live site; unregistered; T-045 stays in_progress.

## Round-cap ruling
Not capped. Rule relied on: the table row "Everything else ... Capped at 2 PASSes on that seam. Further **findings** are filed `file-don't-fix` and never become units", plus "count prior PASSed verdicts naming the same seam" before pulling a non-security unit. The cap governs follow-up FINDINGS on a seam. A new platform adapter is the next slice of roadmap task T-045 (backlog tier 3, "not optional and not last"), and Zoom is a different platform from the two PASSed adapters. The manifest's reading stands.

## EXPLANATION
Mechanics are sound. Zoom tests 8/8, youtube 10/10, onair 6/6 unchanged; `tsc --noEmit -p tsconfig.json` exit 0; nothing registered; 3 files added (sources dir 22 files, within its own budget; the packages/index/src/pipeline dirsize failure is unrelated and not counted). Line budgets fine (117 / 239).

Hostile probe (102 inputs of my own, covering every class in the brief): 13 accepted, all safe. Every acceptance had https, default port, no userinfo, host matching `^([a-z0-9-]+\.)?zoom\.us$`, no query or fragment, and a canonical URL that re-parses to the same id. Refused: zoom.us.evil.example, evilzoom.us, userinfo, `#@`, backslashes, %2F/%40/%00/%2e, tab/newline/space/NUL/U+2028/lone surrogate, trailing dot, any port, IP/IPv6/decimal literals, fullwidth and U+FF61 look-alikes, punycode, a.b.zoom.us, leading/trailing hyphen, underscore, empty label, zoomgov.com, us02web.zoomgov.com, zoom.com.cn, zoom.com, zoom.cn (real Zoom-operated domains; refusal is the safe choice, noted), http, protocol-relative, javascript:/data:/file:/ftp:, `/rec/share/../play/x`, `//rec/share/x`, `/rec/share//x`, `/rec/share/x/y`, empty token, `%` tokens, 257/300-char tokens, `=`/`+`, leading `-`/`_`/`.`. Never throws on non-strings; 1 MB inputs bounded (0 ms). Accepted-and-dropped: `?pwd=`, `#frag`, `?`, `#`, `?x=1#y`, `?a=%2F` all yield the bare canonical.

Cross-adapter and join paths: zoom fixtures are not accepted by youtube or onair. Join links `/j/<id>`, `/j/<id>?pwd=`, `us02web.../j/`, `/my/`, `/wc/<id>/join`, `/s/<id>` are all refused here (`path-not-supported`). Reverse: `planSendNow` on `/rec/share/...` and `/rec/play/...` returns `not-a-meeting-url`, so a recording link is not joinable.

Mutations (own harness, lane-unique, absolute paths, byte backup per mutation, restore in finally, 200 s SIGKILL timeout, deleted afterwards; `git hash-object` equals `git rev-parse HEAD:` = 9e05ca7e...): 6/6 killed. Host built from input: KILLED (accepts-supported-forms, property). Harmless query kept: KILLED (property test only, a single killer). Multi-label subdomain: KILLED (hostile table). Token length bound removed: KILLED (hostile table, idempotence). `/rec/` kind made optional: KILLED, and `/j/` accepted: KILLED, both as whole-file failures (weak but real kills).

## Ruling on canonicalising to bare zoom.us and the unverified forms
FAIL on this point, because current behaviour can mislead a downstream consumer.
(a) Correctness: `acme.zoom.us/rec/share/T` and `us02web.zoom.us/rec/play/T` return `ok:true` with canonicalUrl `https://zoom.us/rec/...`. The repo cannot show the bare host serves a tenant or regional recording, and the manifest admits it. A future fetcher treats canonicalUrl as "the only URL ever passed onward", so it would get a silently dead source with no signal. Keeping the validated lower-cased host is stricter, loss-free, and still round-trips to the same id.
(b) Identity: the id is the token alone, host dropped, so identical token strings on different tenants collapse. Practically negligible for random tokens, but an invented identity rule that keeping the host avoids.
(c) Security: rebuilding on the constant host never turned a refused input into an accepted one (all 13 acceptances re-validated). Not a security failure.
Unverified forms: `/rec/play/` and subdomain hosts are ungrounded in the repo (only the `/rec` prefix and the `.zoom.us` family are). In a PASSed unit they must not be indistinguishable from the grounded `/rec/share/` on `zoom.us`. Required: refuse them with a typed `unverified-shape` reason until the owner supplies a real sample, or accept them with an explicit `verified:false` marker AND keep the original host.

## Bearer-token sensitivity
The share token is a bearer secret and the adapter must put it in `recordingId` and `canonicalUrl`. The manifest says downstream code "must not log it" but names only `recordingId` (canonicalUrl carries the same token) and says nothing about alerts or UI. Required manifest addition: ids and canonical URLs for this platform are sensitive and not to be logged or shown in alerts/UI without redaction. A grep for logging or display of youtube/onair source ids or canonical URLs outside `packages/ingest/src/sources/` found nothing, and no adapter is registered, so no existing consumer logs them; no downstream issue filed.

ISSUES-WRITTEN: ISS-T045NEXT-001 (medium) in qa/issues.t045next.jsonl

## Merge conditions (cycle 1)
1. canonicalUrl keeps the validated lower-cased host (not the constant); tests re-pin subdomain round-trips.
2. `/rec/play/` and subdomain hosts either refused with typed `unverified-shape`, or returned with `verified:false`; only `/rec/share/` on `zoom.us` is verified.
3. Manifest: state that recordingId and canonicalUrl are bearer secrets, not to be logged or shown without redaction; correct the "canonical rebuilt on bare zoom.us" wording.
4. Re-run the three adapter tests and tsc; add a test that kills the "harmless query kept" mutation by name (currently one killer).
Not to be merged as it stands. Manifest status not flipped; TASKS.md untouched.
