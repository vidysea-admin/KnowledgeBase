VERDICT: PASS
Cycle checked: 0
Unit: t045-youtube-source-adapter, commit a8472a4 (lane/t045). Scope: unregistered adapter, injected exec seam; never run against real yt-dlp (roadmap "one successful run per source" NOT satisfied by this unit; remains an open whole-task gate).
Contract: no new contract file needed; seam is governed by qa/contracts/ingestion-source-seam.md (C1 Source interface, C5 provided-first). Checker added none.

## Commands (node v24.19.0, all under timeout)
- git show --stat a8472a4: youtube.ts (+300), youtube.test.ts (+247), manifest (+47) only. registry.ts and package.json untouched; imports are node:child_process, node:path, @lkb/ai types, ../source.js, ./recording.js types.
- `timeout 120 node --test --import tsx src/sources/youtube.test.ts` (packages/ingest): tests 10, pass 10, fail 0.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, tsc-exit=0 (12.6 s).
- Probe script (scratchpad t045check/probe.mts, fake exec, no network, no yt-dlp).
- Line budget: structure.config.json loc.max 300 counts non-blank lines; youtube.ts is 300 physical but 276 non-blank, 24 lines of headroom (lint-loc does not list it among violations).

## URL validation (extractYoutubeVideoId): every ACCEPTED input
All accepted inputs yield a clean 11-char id; the argv URL is always rebuilt from it.
- https://YouTube.COM/watch?v=dQw4w9WgXcQ -> dQw4w9WgXcQ
- HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ -> dQw4w9WgXcQ
- https://%79outube.com/watch?v=dQw4w9WgXcQ -> dQw4w9WgXcQ (WHATWG decodes host to youtube.com; genuine host)
- https://\uff59outube.com/watch?v=dQw4w9WgXcQ (fullwidth y) -> dQw4w9WgXcQ (URL normalises to youtube.com)
- https://youtube\u3002com/watch?v=dQw4w9WgXcQ (ideographic full stop) -> dQw4w9WgXcQ (normalises to youtube.com)
- https://youtube.com/watch?v=dQw4w9WgXcQ&v=AAAAAAAAAAA -> dQw4w9WgXcQ (first v wins)
- https://youtube.com/watch?v=AAAAAAAAAAA&v=dQw4w9WgXcQ -> AAAAAAAAAAA (first wins; same value validated and used)
- https://youtube.com/watch?v=-abcdefghij and https://youtu.be/-abcdefghij -> -abcdefghij
- https://youtube.com/watch/../watch?v=dQw4w9WgXcQ -> dQw4w9WgXcQ (URL normalises to /watch)
- https://youtube.com/watch?v=dQw4w9WgXcQ#x ; ...&list=PLx ; https://youtu.be/dQw4w9WgXcQ?t=5 -> dQw4w9WgXcQ
- https://youtube.com/watch?v=%64Qw4w9WgXcQ -> dQw4w9WgXcQ (percent-decoded id, still validated)
- https://youtube.com/watch?%76=dQw4w9WgXcQ -> dQw4w9WgXcQ
- https://youtube.com/shorts/dQw4w9WgXcQ ; /live/dQw4w9WgXcQ -> dQw4w9WgXcQ
REJECTED (all else, 29 probes incl.): youtube.com.evil.tld; youtu.be@evil.tld; evil.tld/?x=youtube.com/...; userinfo; ports 8443 and 443; http:; javascript:; file:; protocol-relative; trailing-dot hosts; Cyrillic e look-alike; xn-- punycode; %77atch path; backslash host; trailing \n, embedded \t, trailing NUL, leading space, %00; 12-char and 10-char ids; /watch/..//; 5028-char input; //watch; %26--exec; U+2028; U+00A0; V=; /Watch; music.youtube.com; /embed/.

## Argv safety
buildYtDlpArgs("-abcdefghij","C:\work\a") =
["--ignore-config","--no-playlist","--no-progress","-x","--audio-format","m4a","--no-simulate","--print","after_move:filepath","-o","C:\work\a\yt--abcdefghij.%(ext)s","--","https://www.youtube.com/watch?v=-abcdefghij"]
--ignore-config first; only user-derived value is the id, in the URL after `--`; the -id is also inside an absolute -o value (consumed as the -o argument, never an option). No --exec, --config-location, cookies, --batch-file. Rebuilt URL charset is [A-Za-z0-9_-] plus `:/.?=`: no cmd.exe metacharacter. Default exec: spawn(cmd,args,{shell:false,windowsHide:true}), fixed name "yt-dlp" unless the CALLER passes ytDlpCommand (a dep, not user text). Windows shim: probed spawn of an explicit yt-dlp.cmd with shell:false on Node 24 -> synchronous EINVAL (CVE-2024-27980 hardening), which inside the Promise executor becomes an exec-failed rejection; cmd.exe is never entered.
%(ext)s is the only template field; workDir is caller-supplied and not escaped for `%` (low, see below).

## Output path (fake exec) and failure handling
| Case | Result | exec calls |
| good in-workDir path | OK | 1 |
| C:\Windows\x.m4a | path-escape | 1 |
| C:\work\a\..\b.m4a | path-escape | 1 |
| workDir itself | path-escape | 1 |
| empty stdout | no-output | 1 |
| empty file | empty-output | 1 |
| last line outside, first inside | path-escape | 1 |
| first line outside, last inside | OK (only last line is checked) | 1 |
| exit 1 / exit null | non-zero-exit | 1 |
| timedOut:true | timeout | 1 |
| exec throws | exec-failed | 1 |
| exec never resolves | timeout (race) | 0 recorded |
| reader throws | no-output | |
| 1 MB stderr; 1M-line stdout | OK, no crash | 1 |
isInsideDir: `..`, sibling prefix (ab), other drive, UNC, relative, `C:f`, directory, case and `/` separators all handled as expected (case-insensitive on win32 flavour, case-sensitive on posix).
Errors are typed YoutubeSourceError; no document is returned on any failure.

## Consent (H8, ARCHITECTURE.md:46)
Enforced first in fetch(), before parse and exec: every refusal row shows exec calls 0. Refused: given "true", 1, {}, false; recordedBy {length:1}, ["x"]; captureMode notes, silent (even with confirmedNoAlternative), "PUBLIC"; null; bad URL + bad consent (consent error wins). Accepted: provided, public. Reading is right: a YouTube video is a public recording; stricter than recording/url/document adapters, which do no consent validation.

## Documents
Source doc: required fields all present; kind "url" and captureMode within enums; consent.given boolean, recordedBy string; extra key `sourceMeta` allowed (schema additionalProperties: true), so it validates. Media doc kind audio with sourceRef = hash.

## Mutations (per-mutation byte backup, finally + SIGINT/SIGTERM restore, 120 s timeout each, then git hash-object)
| Mutation | Result |
| drop `--` marker | KILLED (2 fail) |
| URL not rebuilt (extra query appended) | KILLED (3 fail) |
| skip inside-workDir check | KILLED (1 fail) |
| consent check moved after exec | KILLED (1 fail) |
| host check loosened to endsWith | KILLED (1 fail) |
5/5 killed. HEAD fidelity: youtube.ts hash-object 509b0868b09386635afa284e7b925b0fb5b7158c == HEAD blob; youtube.test.ts 9dd58422d5f498742bcb843efae707a39523360e == HEAD blob.

ISSUES-WRITTEN: none
EXPLANATION: No hostile input reaches argv or escapes workDir; consent precedes exec. Low observations (not backlog): (1) isInsideDir is lexical; symlinks/junctions inside workDir are not realpath-resolved and `f.m4a:ads` passes, exploitable only by someone who already controls the work directory or the exec seam. (2) Multi-line stdout: only the last line is validated; earlier lines are ignored rather than refused (yt-dlp with --no-playlist prints one). (3) Whitespace-only recordedBy passes consent. (4) workDir containing `%(` would be read as a yt-dlp template; caller-controlled. (5) The `--print after_move:filepath` stdout contract and ffmpeg need for m4a are unverified against a real binary; a live run with a pinned yt-dlp remains required for the T-045 exit criterion. (6) Manifest says 300-line budget leaves no room; budget counts non-blank lines (276), so 24 remain.
