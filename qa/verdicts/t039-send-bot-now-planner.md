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
