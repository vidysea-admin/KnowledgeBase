# Verdict - t039-send-bot-now-planner

VERDICT: FAIL
Cycle checked: 0
Checked commit: a3696bc (lane/t039). Checker launch 2026-10-10T18:45Z (first command timestamp).

Scope / remaining gates: planner only (`packages/meeting-bot/src/send-now.ts` + test). T-039 stays open (no entry point; 60 s clause unmeasured, honestly not claimed). No contract exists for this unit and none was required: acceptance is the T-039 slice in the manifest plus the security-class URL handling; no qa/contracts file written.

## Commands (all under timeout, shared CPU, no full suite)
- `timeout 120 node --import tsx --test src/send-now.test.ts src/platform.test.ts src/strategy.test.ts` -> tests 31, pass 31, fail 0 (14 s).
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> tsc-exit=0 (27 s).
- Probe script (scratchpad t039check/p.mts, ~110 inputs, no network) -> exit 0, never threw.
- Mutation harness (scratchpad t039check/mut.mjs): per-mutation byte backup, restore in `finally` + SIGINT/SIGTERM handlers, 90 s spawn timeout.

## Checks
1. Scope: `git show --stat a3696bc` = send-now.ts (+136), send-now.test.ts (+149), manifest (+61). No existing file edited. OK.
2. Host validation: done by BOTH. `detectPlatform` (platform.ts) uses `new URL().hostname.toLowerCase()` then exact equality or `.endsWith("." + domain)`: dot-bounded, so look-alikes (`zoom.us.evil.tld`, `evilzoom.us`, `meet.google.com.evil.tld`) do not match; Zoho is an anchored regex. No pre-existing defect found in platform.ts. send-now.ts adds https-only, credentials (incl. raw `@` in authority), port, backslash/control/whitespace refusal, redirect checks before it, and does not add its own exact-host check (relies on detectPlatform, which is sound). No look-alike host got an ok plan.
3. embedded-redirect: refuses any query key matching redirect/return/next/continue/url/goto/dest/target/callback, or any value that after up to 3 percent-decodes starts with `scheme:`, `//` or `\`. Caught: `target=https%253A...`, `%25252F%25252Fevil.tld`, `javascript:`, `?url`, `?next`, `launcher.html?url=`. Passed (host still zoom.us, harmless): `//evil.tld` in the path, `#https://evil.tld` fragment, `r=%u0068ttps://evil` (non-standard encoding, not decoded). Heuristic by key name; a provider redirect under an unlisted key with a bare-host value would pass. Low.
4. Stored URL: the user's trimmed RAW string, not the parsed/normalised form. Validation and the browser use the same WHATWG parser so destination is equal, but quirks survive into the request: `HTTPS://Zoom.US:443/j/12345678?pwd=A`, `https://zoom%2eus/j/12345678`, `https:///zoom.us/j/12345678`, `https://zoom.us:/j/...` are ok plans with those exact strings; a non-WHATWG downstream parser (vendor API) could resolve them differently. Low: recommend storing `u.href`.
5. Identity: Meet/Zoom spellings all collapse (see table). Meet case, trailing slash, authuser/hl/pli, fragment -> `meet:abc-defg-hij`; Zoom /j /w /s /wc/join/ID /wc/ID/join, regional subdomain, zoom.com, pwd, utm, fragment, trailing slash -> `zoom:12345678901`. Zoom ids of 8/9/10 digits distinct; `/my/<name>` kept apart from numeric ids (not collapsible, acceptable). DEFECTS: Meet `lookup/abcdef` and `lookup/abcdeg` both -> `meet:lookup` (false collision, wrongly refuses a different real meeting) -> ISS-T039-001; `/landing`, `/new` and bare root also yield ok plans. Teams non-dedupe pairs: `teams.live.com/meet/9876543210?p=abc` vs without `p`; `meetup-join/...?context={"Tid"..,"Oid"..}` vs reordered context vs none -> different keys, second bot admitted. Judged a defect not an acceptable gap: `p` is a passcode (cheap to drop), and the unit's whole purpose is refusing a duplicate -> ISS-T039-002.
6. Live statuses: scheduler `Operation.status` values (schedule-state.ts:63) are queued, recording, processing, failed, ready, action_required; set {queued, joining, recording} covers every in-flight job status there (processing is post-meeting). Capture controller states (starting, recovering) are not job statuses. Unknown/malformed/missing/differently-cased status ("Recording", " recording", undefined, null, "waiting-room", "starting", "retrying") -> NOT live (fail-open). Acceptable for the real status set today but fail-open for a double-bot guard is a design risk (low, noted). Malformed `liveJobs` (null, {}, "x", [null], [{}]) are ignored without throwing; job URLs with whitespace, `HTTP://`, regional subdomain still match by identity.
7. `now`: Invalid Date, "garbage", number, null, undefined, {} -> typed `invalid-clock`; no throw; no Invalid Date in request. Accepted: "2026-10-10" (UTC midnight), "1900-01-01T00:00:00Z", year +275760 and -271821 dates, locale string "2026-10-10 10:00 PST". Far past/future and engine-parsed strings are not refused (low).
8. Mutations on send-now.ts: see table. 
9. Manifest matches observation (18 tests pass, tsc 0); its "Not delivered" list is accurate, but it understates the Teams gap and does not mention the Meet non-code-path collision.

## Probe table (selected; full run in scratchpad t039check/out.txt)
| Input | Result |
|---|---|
| https://zoom.us.evil.tld/j/1, https://evil.tld/zoom.us/j/1, https://meet.google.com.evil.tld/abc-defg-hij, https://evil.tld#meet.google.com/abc, https://evil.tld/#@zoom.us/j/1, https://evilzoom.us/j/1, https://webex.com.evil.tld/x, https://teams.microsoft.com.evil.tld/..., https://meeting.zoho.com.evil.tld/x | refused unsupported-host |
| https://meet.google.com@evil.tld/..., https://user@zoom.us/..., https://:@zoom.us/... | refused credentials-in-url |
| https://zoom.us\@evil.tld/j/1, https://zoom.us%40evil.tld/j/1, https://evil.tld%2f.zoom.us/j/1, tab/newline/NUL inside, `//zoom.us/...`, `zoom.us/j/..` | refused malformed-url |
| trailing-dot hosts (`zoom.us.`, `meet.google.com.`, `webex.com.`), Cyrillic `zооm.us`, punycode `xn--zom-8cd.us`, `zoom.us%2eevil.tld`, U+3002 dot | refused unsupported-host |
| http://, https:zoom.us/..., :8443 | refused not-https / unexpected-port |
| Leading/trailing whitespace, `HTTPS://ZOOM.US/j/12345678`, `Https://meet...`, `:443`, `https://zoom%2eus/j/12345678`, `zoom．us` (fullwidth dot), `https:///zoom.us/j/12345678` | ok, host really is zoom.us/meet (same destination under WHATWG) |
| `https://evil.tld．zoom.us/j/1`, `https://zoom.us.evil.zoom.us/j/1`, `https://evil.meet.google.com/abc-defg-hij` | ok: genuine subdomains of the provider domains (not look-alikes) |

Inputs that got an ok plan and are NOT a joinable meeting (ISS-T039-001): `https://meet.google.com/lookup/abcdef`, `https://meet.google.com/`, `https://zoom.us/`, `https://zoom.us/foo`, `https://meet.google.com/landing`. No look-alike host got through.

## Mutation table (send-now.test.ts; per-mutation backup)
| Mutation | Result |
|---|---|
| M1 accept http | KILLED (17 pass / 1 fail) |
| M2 skip credentials check | KILLED |
| M3 any/missing status counts as live | KILLED |
| M4 compare raw URLs instead of key | KILLED |
| M5 drop port check | KILLED |
Restoration: `git hash-object packages/meeting-bot/src/send-now.ts` = 5cb33bfb09b230fb7cec85ec2d5c39ea1e822c71 = `git rev-parse HEAD:` same; send-now.test.ts cf478276c1814a6912484e6df3872bcfcd0e8503 = HEAD blob. Working tree clean before writing this verdict.

ISSUES-WRITTEN: ISS-T039-001 (medium: Meet non-code first path segment collapses to one key, wrong refusal), ISS-T039-002 (medium: Teams/Webex/Zoho spellings of one live meeting do not dedupe, second bot admitted) in qa/issues.t039.jsonl.

EXPLANATION: The security-critical part is sound: exact/dot-bounded host matching, https-only, no userinfo, no port, backslash/control refusal, and no look-alike host reaches an ok plan. FAIL is solely on the dedupe criterion (no in-flight meeting may get a second bot; a real meeting must not be wrongly refused). Both defects are small and local to `meetingIdentity`. Low notes (not filed): request stores the raw string rather than `u.href`; unknown status is fail-open; far-past/future and locale-string `now` accepted; redirect detection is key-name based; ZWSP U+200B at the end of a path is accepted and yields a distinct key (host still genuine). Round cap: no prior PASS names this seam.

---

# Cycle 1 (fix cycle 1, commit dc1c7bf)

VERDICT: FAIL
Cycle checked: 1
Checked commit: dc1c7bf (lane/t039). Checker launch 2026-10-10 about 19:00Z (first command); total wall time and most per-command durations unmeasured. Environment note: the C: drive hit 0 bytes free at launch and the first test run failed with ENOSPC; checks resumed once about 60 MB was freed externally (I deleted nothing).

Scope / remaining gates: planner only; T-039 stays open (no entry point). FAIL is solely on "no non-meeting page is planned": one path-only fallback is left (cloudonair). The cycle-0 defects are otherwise fixed.

## Commands (all under timeout, no network, no full suite)
- `timeout 120 node --import tsx --test src/send-now.test.ts src/platform.test.ts src/strategy.test.ts` -> tests 39, pass 39, fail 0, exit 0 (2.3 s).
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> tsc-exit=0 (31 s).
- Probe (scratchpad t039check2/p.mts, q.mts; output out.txt) -> exit 0, never threw.
- Mutation harness (scratchpad t039check2/mut.mjs): per-mutation byte backup, restore in finally plus SIGINT/SIGTERM handlers, 90 s spawn timeout per run, byte comparison, then git hash-object.
- Budgets by the repo counter: send-now.ts 173 lines, send-now.test.ts 254 lines (as claimed).

## D-015 replay of each issue's own recorded reproductions, verbatim
ISS-T039-001: 8/8 (checker-replayed). lookup/abcdeg vs live lookup/abcdef -> ok:true (different meeting admitted); keys `meet:lookup:abcdef` != `meet:lookup:abcdeg`; `/new`, `/`, `/landing` (Meet) and `zoom.us/`, `zoom.us/foo` -> refused `not-a-meeting-url`.
ISS-T039-002: 7/7 (checker-replayed). teams.live.com/meet/9876543210 vs live `?p=abc` -> ok:false (duplicate); meetup-join with context A live and context B requested -> ok:false; no context requested -> ok:false; teams.microsoft.com vs teams.live.com host swap on /meet/<id> -> ok:false; unencoded raw-JSON context in either order -> one key.
Both rows are left at status open in the shard because the verdict is FAIL (set to verified only on PASS).

## Same-meeting table (each group collapses to ONE key; 11/11)
| Platform | Spellings tested | Key |
|---|---|---|
| Meet code | host case, code case, trailing slash, authuser/hl/pli/utm, fragment | `meet:abc-defg-hij` |
| Meet lookup | id case, trailing slash, `%61` encoding | `meet:lookup:abc123` |
| Zoom numeric | /j /w /s /wc/join/ID /wc/ID/join, us02web., www., zoom.com, pwd, utm, fragment, trailing slash, `%31%32` | `zoom:12345678901` |
| Zoom /my | subdomain, name case, pwd | `zoom:my:john.doe` |
| Teams meetup-join | `%3a`/`%3A`, `%40`/`@`, with/without `/0`, trailing slash, `p`, tenantId, context absent/A/B/raw JSON, teams.live.com vs teams.microsoft.com | `teams:thread:19:meeting_abc@thread.v2` |
| Teams /meet | `?p=`, fragment, trailing slash, either host | `teams:meet:9876543210` |
| Webex room | host case, name case, /meet vs /join | `webex:room:acme.webex.com:jdoe` |
| Webex MTID | MTID/mtid case, pwd, fragment | `webex:mtid:m123abc` |
| Zoho key / sessionId | KEY/key, utm, different path | `zoho:key:k123`, `zoho:session:s1` |
| cloudonair | host case, trailing slash, utm, fragment | `cloudonair:/events/foo` |

## Different-meeting table (every group distinct; 10/10, no false merge found)
Meet code off by one letter; Meet lookup abcdef/abcdeg; Meet code vs lookup of the same characters (`meet:abc-defg-hij` vs `meet:lookup:abc-defg-hij`); Zoom id off by one and numeric vs `/my/<same digits>` (`zoom:my:12345678901`); Teams threads differing by one character inside the encoded part, `thread.v2` vs `thread.v1`, thread vs `/meet/<id>`, two /meet ids; Webex same room name on acme vs beta host, jdoe vs jdoe2; Webex MTID off by one and MTID vs MK with the same value; Zoho key vs sessionId with the same value; cloudonair foo vs foo2; Zoom vs Meet.

## Case-folding, Teams context, refused shapes
- Lower-casing: Meet codes, lookup ids, Zoom /my names, Webex room names and Zoom ids are case-insensitive or numeric (safe). Teams thread ids (`19:meeting_<base64-like>@thread.v2`), Webex MTIDs and Zoho keys may be case-sensitive on the real platform; `AbC` and `abc` fold to one key (probe CASE group). I could not establish from the repo or offline whether they are case-sensitive. A false merge needs two real ids differing only in letter case, negligible for 20+ character random identifiers, and the failure direction is a refusal (safe). Low, not filed.
- Teams context ignored: one thread id can be reused by recurring meeting instances and channel meetings, so a second genuinely different live instance on the same thread would be refused (false refusal, not a second bot). More likely in practice: a `queued` job for a later occurrence of a recurring link blocks a manual send now to the current one (same for Zoom id and Meet code; a property of counting `queued` as live, not new). Safe-direction residual risk; not filed.
- Refused shapes: `/onstage/g.php?MTID=` is NOT refused (accepted through MTID). Refused: Webex `/j/<n>` (appears only as a mock fixture in joiners.test.ts, not a real invitation), Teams `/l/channel/...` and launcher pages, Zoom `/wc/<name>`, `/signin`, `/test`, `/j/<1-4 digits>`. The scheduler's own auto-join path (`isDirectWebinarJoin`, auto-record-policy.ts:220) accepts only Meet code, Zoom /j and /w digits, and Teams meetup-join; send-now accepts a superset of that, so there is no inconsistency. Not filed.

## Hostile inputs (re-checked)
All refused: `zoom.us.evil.tld`, `evilzoom.us`, `meet.google.com.evil.tld` (unsupported-host); `user@zoom.us`, `meet.google.com@evil.tld` (credentials-in-url); `:8443` (unexpected-port); backslash, NUL, tab (malformed-url); `?next=https://evil.tld`, double-encoded redirect, `?url=` (embedded-redirect); `http://`, `javascript:` (not-https).
Stored URL: `planSendNow("  HTTPS://ZOOM.US:443/j/12345678?pwd=A#f ")` -> meetingUrl `https://zoom.us/j/12345678?pwd=A#f`. Validation and `u.href` use the same `u` parsed from `trimmed`; `meetingIdentity(trimmed)` re-parses the same string with the same parser, so key and stored destination cannot diverge. OK.

## Status rule (fail-closed)
Refuse (live): queued, joining, recording, Recording, " recording", "", waiting-room, undefined, null, 5, {}, [], Ready, "ready ", FAILED, "processing\n". Admit (not live): exactly processing, ready, failed, action_required. Confirmed.
Drift guard (send-now.test.ts:141): reads schedule-state.ts, extracts the literal `["queued", ...].includes(row.status)` with a regex, and deepEquals the sorted set against TERMINAL plus queued/recording. A new in-flight status added to that array changes the set and fails the test; a new terminal status also fails (forces a deliberate decision). Parsing is brittle to reformatting, but brittleness fails loudly ("status literal not found"), not silently, so acceptable. Judged by reading; not mutation-run on schedule-state.ts (outside the unit).

## Defect found
cloudonair: `planSendNow("https://cloudonair.withgoogle.com/landing", now)` -> `ok:true`, key `cloudonair:/landing`; `/events` -> `cloudonair:/events`. The default branch of `meetingIdentity` still keys on the bare path (`id = path ? path : undefined`), the one path-only fallback left; the test only asserts `/` is refused. This is the cycle-0 non-meeting-page class on the one platform not converted. Filed ISS-T039-003 (medium); one-line fix: accept only `/events/<slug>`.

## Mutation table (send-now.test.ts, per-mutation backup, restore in finally)
| Mutation | Result |
|---|---|
| M1 restore path-plus-query fallback | KILLED (24 pass / 2 fail) |
| M2 unknown status treated as not live | KILLED (25 / 1) |
| M3 Teams key includes query (p) | KILLED (24 / 2) |
| M4 Meet lookup keyed by literal "lookup" | KILLED (24 / 2) |
| M5 path not lower-cased | KILLED (23 / 3) |
M1 was killed by tests on other platforms; no test asserts a cloudonair non-event path is refused, which is why ISS-T039-003 escaped.
HEAD fidelity after mutations: `git hash-object packages/meeting-bot/src/send-now.ts` = d565a7a5c17f990f48d9e494a5529f052947ca1f = `git rev-parse HEAD:` same; send-now.test.ts b9e6c6db61e51b732fc9e8aa431385bb12f297fa = HEAD blob. Harness reported restored-identical-to-original: true.

ISSUES-WRITTEN: ISS-T039-003 (medium: cloudonair path-only identity plans non-meeting pages) in qa/issues.t039.jsonl.

EXPLANATION: The per-platform identity work is sound: 11/11 same-meeting groups share one key, 10/10 different-meeting groups stay distinct, both cycle-0 issues replay clean (8/8, 7/7), hostile hosts are all refused, status handling is fail-closed. The unit fails the stated PASS rule on exactly one remaining path-based plan (cloudonair). Fix: restrict cloudonair to `/events/<slug>` and add a refusal test. Low notes (not filed): possible false merges from lower-casing case-sensitive Teams/Webex/Zoho ids (safe direction); recurring-link false refusals; far-past/locale `now` strings still accepted (carried from cycle 0).

---

# Cycle 2 (fix cycle 2, commit bd96833)

VERDICT: PASS
Cycle checked: 2
Checked commit: bd96833 (lane/t039). Checker launch 2026-10-10 (times of individual commands unmeasured).

Scope / remaining gates: planner only; T-039 stays open (no entry point; 60 s clause unmeasured). Round cap: no prior PASS names this seam.

## Commands (timeouts used; no network, no full suite)
- `timeout 120 node --test --import tsx src/send-now.test.ts src/platform.test.ts src/strategy.test.ts` -> tests 41, pass 41, fail 0.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> tsc-exit=0.
- Probes (scratchpad c2/p.mts, q.mts, r.mts): about 60 paths on each of 6 platform hosts, plus replay script; never threw.
- Budgets (wc -l): send-now.ts 180, send-now.test.ts 293 (as claimed).

## D-015 replay of each issue's recorded reproductions, verbatim (checker-run)
- ISS-T039-001: 8/8 (lookup/abcdeg admitted against live lookup/abcdef and keys distinct; same URL still duplicate; /new, /, /landing on Meet and zoom.us/, zoom.us/foo refused not-a-meeting-url).
- ISS-T039-002: 7/7 (Teams /meet with/without p; meetup-join context A live vs B / absent; live.com vs microsoft host; raw-JSON context order; encoding; /0 suffix).
- ISS-T039-003: 8/8 (`/landing`, `/events`, `/events/`, `/events/foo/bar` refused not-a-meeting-url; `/events/foo` = `/events/Foo/?utm_x=1` = `CLOUDONAIR.../events/foo#x` -> `cloudonair:/events/foo`; duplicate refused; different slug admitted).
Earlier-established properties spot-checked (3 each): same-meeting collapse (Meet case/authuser/fragment, Zoom wc/join + regional host -> `zoom:12345678901`, Webex), distinct meetings (zoom id off by one, webex acme vs beta host), host validation (`zoom.us.evil.tld` unsupported-host, `user@zoom.us` credentials-in-url, `http://` not-https), status rule ("Recording", "", "waiting-room", undefined all live = refuse). No regression.

## Structure review (meetingIdentity, PLATFORM_EXTRACTORS, each extractor)
- One key-building site: `id ? platform:id : undefined`; no default branch, no path-plus-query fallback. Callers refuse undefined as not-a-meeting-url.
- Type guarantee is real: `Platform` is imported from platform.ts, the same type `detectPlatform` returns; the record is `Record<Exclude<Platform,"unknown">, Extractor>` so a new platform fails to compile. Test HOSTS is typed likewise, and the test deepEquals `PLATFORMS` (calendar/join-rules.ts:34, typed `readonly Platform[]`, so it cannot hold a non-Platform) against HOSTS and PLATFORM_EXTRACTORS keys, so a Platform omitted from PLATFORMS fails the test.
- Lookup guard: there is no own-property check, and none is needed: `PLATFORM_EXTRACTORS[platform]` is reached only after `platform === "unknown"` returns, with `platform` produced by detectPlatform, which can only return the six literals. "constructor"/"__proto__" cannot arrive. `extract?.` is a harmless extra. `meetingIdentity` takes only a URL string, so no caller supplies a platform. Low (defence in depth absent), not filed.

## Non-meeting inputs per platform (host root, /landing, /new, /foo, empty path, each also with trailing slash and ?utm_source=x; 6 hosts)
All refused not-a-meeting-url on every platform, including the extra generic segments /events, /events/, /join, /meet, /j, /my, /wc, /lookup, /lookup/, /l/meetup-join; empty-after-decoding ids (/j/%20, /events/%2F, /meet/%00, /meet/%20, /join/%20, /my/%20, /wc/join/%20, /l/meetup-join/%20, /lookup/%20); `/j/1234` (too short); empty-valued ?key=, ?mtid=, ?mk=, ?sessionid=; cloudonair /events/a%2Fb, /events/.., /events/%2e%2e, /events/%2e%2e/x, /events/-, /events/.x, /events/~, /events/x%20. Identifier only in a query on a path-keyed platform (e.g. zoom /landing?mtid) is ignored; identifier only in the path on a query-keyed platform (zoho /events/x) is refused.
Accepted (identifier present, so by design): zoom /j/12345 (5 digits) -> zoom:12345; zoom /j/%31%32%33%34%35 -> zoom:12345; teams /l/meetup-join/19:x@thread.v2 -> teams:thread:19:x@thread.v2; webex /?mtid=m1 and /landing?mtid=m1 -> webex:mtid:m1 (mtid is the identifier); webex /meet/abc?mtid=m -> room key; zoho /?key=k1 and /events?key=k1 -> zoho:key:k1 (key is the identifier); cloudonair //events/x, /events//x, /events/x/ -> cloudonair:/events/x; 1.5 KB slug accepted under the 2048 URL cap.
Accepted but arguably not real identifiers (punctuation-only segment where the platform's pattern allows it, low): meet /lookup/--- and /lookup/___ -> meet:lookup:---; zoom /my/--- , /my/___ , /my/..x -> zoom:my:...; webex /meet/--- , /join/___ , /meet/... (and %2e%2e%2e) -> webex:room:acme.webex.com:...; webex /meet/- . cloudonair rejects these. They cannot be told from an unusual vanity name without the platform, and the failure direction is one extra join attempt on a page that would fail, not a duplicate bot. Not filed (low).

## cloudonair
- Real links in the repo: `rg -i cloudonair`: only /events/<slug> shapes (send-now.test.ts:33,191,210,260-269; platform.test.ts:39 `/events/weeklies-x`). No fixture, doc, raw/ sample or QA evidence contains a cloudonair link with a sub-path (apps/api/src/gws-gmail.ts:55,60 matches the host only). Refusing `/events/foo/bar` is acceptable; no defect.
- Dedupe: query, fragment, trailing slash, host case, double slashes all collapse to `cloudonair:/events/<slug>`.

## Mutation table (send-now.test.ts, per-mutation byte backup, restore in finally, 90 s timeout)
| Mutation | Result |
|---|---|
| M1 default-style fallback `?? (path \|\| undefined)` after extractor | KILLED (24 pass / 4 fail) |
| M2 Meet lookup regex `+` -> `*` (empty id valid) | SURVIVED; equivalent mutant: the path is normalised without trailing slash, so `/lookup/` becomes `/lookup` and never matches `^/lookup/(...)$` |
| M3 cloudonair `/events/` made optional | KILLED (25 / 3) |
| M4 cloudonair allows sub-path segments | KILLED (26 / 2) |
Own-property guard mutation: not applicable (no such guard exists; see above).
HEAD fidelity after mutations: `git hash-object packages/meeting-bot/src/send-now.ts` = 258b60df1ae1d983b0864fa3b97dc968072fd058 = `git rev-parse HEAD:` same; send-now.test.ts 3acb68fd4304d831d952b954ef94269661f89384 = HEAD blob. Harness reported restored-identical: true (both runs).

ISSUES-WRITTEN: none. ISS-T039-001, -002, -003 set to verified in qa/issues.t039.jsonl.

EXPLANATION: The cycle-1 failure class is closed structurally: every key now comes from one typed table of extractors and an extractor that finds no identifier yields a refusal, so a recognised host with no meeting or event identifier cannot produce ok:true on any of the six platforms (probed about 60 shapes each). All 23 recorded reproductions replay clean and the earlier properties hold. Low notes (not filed): punctuation-only vanity segments accepted on Meet lookup, Zoom /my and Webex while cloudonair rejects them; no runtime own-property guard (unreachable today); case-folding of case-sensitive ids and recurring-link false refusals carried from cycle 1; far-past/locale `now` strings accepted.
