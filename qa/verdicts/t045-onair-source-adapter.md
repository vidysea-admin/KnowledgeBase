VERDICT: PASS
Cycle checked: 0
Unit: t045-onair-source-adapter, code commit 2d06139, manifest 62f35fb (lane/t045onair, base f016d4c).
Scope: pure URL recognition; unverified against the live site; unregistered; T-045 stays in_progress (no media access, no "one successful run per source").

## Commands (node v24.19.0)
- `git diff f016d4c 62f35fb`: onair.ts, onair.test.ts, manifest only. No other file changed; not exported or registered anywhere.
- onair.test.ts: tests 6 / pass 6 / fail 0. youtube.test.ts: tests 10 / pass 10 / fail 0 (file untouched).
- `tsc --noEmit -p tsconfig.json` (packages/ingest): no output, exit 0. `node scripts/lint-dirsize.mjs`: OK (112 dirs). onair.ts 89 non-blank lines, test 179 (limit 300).

## 1. Grounding and consistency
Host and `/events/<slug>` match platform.ts:34 (host equality), send-now.ts cloudonair extractor (`^/events/([a-z0-9][a-z0-9._~-]*)$`, path lower-cased) and their tests. The slug regex is identical. Manifest marks the form UNVERIFIED against the live site: confirmed.
Probe of 109 URLs against detectPlatform. No URL is accepted by the adapter that detectPlatform calls non-cloudonair. detectPlatform calls cloudonair on some URLs the adapter refuses (http, ftp, javascript://, :443, userinfo, whitespace, fullwidth/IDNA host, `%63`, `//` in path). It checks only the hostname, so the adapter is the stricter side. That is the right side for an intake gate. send-now collapses `//` in paths while the adapter refuses them: stricter, safe.
Lower-casing: send-now already treats slugs case-insensitively by design. Whether two real events differ only by case cannot be checked offline. Low note: the manifest does not flag slug case-folding as an unverified assumption.

## 2. Hostile URLs (109, plus 12 non-string inputs)
No hostile URL accepted. All 109 inputs listed in the task were covered: host suffix/prefix, `@`, `#@`, `\@`, backslashes, `%2F/%40/%00`, tab/LF/CR, whitespace, case, trailing dot, ports 443/8443/empty port, IPv4/IPv6, punycode and Cyrillic, fullwidth and U+3002/U+FF61, http/protocol-relative/javascript/data/file, empty userinfo, `//`, dot segments, extra segments, empty slug, 100/101/2000-char slugs, unicode and percent slugs. Query and fragment never survive.
Idempotence: every accepted canonical URL re-parses to the same id and canonical URL (https, exact host, no port/userinfo/query/fragment).
Accepted odd-but-harmless slugs: `a..b`, `a~b.c-d_e`, `ab-c_`.

## 3. Totality and time
No throw for any string or non-string input (null, symbol, function, bigint, objects with toString, arrays, String objects). Every 1 MB input (7 shapes) returns too-long in 0 ms because of the 200-char cap.

## 5. Mutations (per-mutation byte backup, restore in finally, HEAD hash match every time)
- MAX_ID_LENGTH 100 to 1000: KILLED (hostile table, idempotence test)
- drop authority ":" check: KILLED (hostile table; `:443` is invisible to url.port so this is not masked)
- drop bad-characters check: KILLED (hostile table)
- scheme check made case-sensitive: KILLED (supported forms, idempotence)
- drop slug lower-casing: KILLED (supported forms, idempotence, property)
Score 5/5. A sixth, dropping the dot-only `/^\.+$/` guard, did not apply as written; reading the code, it is redundant with EVENT_ID (first char must be alphanumeric). The maker's two surviving mutants (authority suffix check, `%` path check) are the same kind: intentional defence in depth on a security gate, not dead code worth removing.

## EXPLANATION (notes only)
- Low: manifest should name slug case-folding as unverified.
- Low: `/^\.+$/` guard is unreachable behind EVENT_ID; harmless.
ISSUES-WRITTEN: none
