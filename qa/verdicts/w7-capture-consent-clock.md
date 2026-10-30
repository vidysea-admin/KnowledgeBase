# Verdict - w7-capture-consent-clock

**Cycle checked:** 0
**Verdict:** PASS
**Checked state:** code SHA 53b498e4 (HEAD 7d5884b0 adds only manifest + qa/issues.w7.jsonl, verified by `git diff 53b498e4 HEAD --stat`); base 021bdea0; coordinator A
**Policy-Version:** proportional-verification/2026-10-19.17 (single checker, no dual trigger: diff adds one fail-closed refusal and test code)

## Independent evidence (re-run by checker, one file per invocation, timeout 280s, cwd packages/meeting-bot)
- C1 finalize-original-eof.test.mjs: 7 tests, 7 pass, 0 fail (corpus = regenerated stand-in sha 6bc26dcd..., retained d07c93 absent). Covers private-eof, closed-private-public-tail, raw-remux-private-eof, raw-remux-closed-public-tail with real ffmpeg decode.
- C2 same file: 2 new remux-clock refusals pass (omitted and explicit originalVideo).
- C3 same file: unknown-clock refusal passes.
- C4 original-capture.test.ts 2/2 pass; record-stop-regression.test.ts 4/4 pass.
- Direct probe (throwaway script, deleted): runFinalize with --video X.playable.webm forwards video=X.playable.webm and originalVideo=X.webm (arg 11). Recovery .playable behaviour is correct in code.

## Falsification (copy src-mut, per-mutation byte backup, restored, git hash-object == HEAD blob after each; src-mut removed; bound tree never touched)
- C2 guard -> `if(false)throw`: 2 red (the two new cases). KILLED. hash 6b79b469 == HEAD.
- C1 `if(consent.privateWindows.length)video=original.file;` -> `if(false)...`: 3 red. KILLED. hash 6b79b469 == HEAD.
- C3 finite/positive duration check -> `if (false)`: 1 red. KILLED. hash 6b79b469 == HEAD.
- C4 live: forwarded `originalVideo` -> `video` in record-commands.ts: record-stop-regression 1 red. KILLED. hash 10679716 == HEAD.
- C4 recovery: forwarded `originalVideo` -> `undefined`: original-capture 1 red. KILLED.
- C4 recovery: forwarded `originalVideo` -> `video`: original-capture 2/2 pass. SURVIVED (no test drives recovery with a `.playable.webm` --video; the only recovery caller test uses original.mkv with identity normalize, so video === originalVideo). Not fatal: for a private capture the new C2 guard refuses a remux original at the finalizer (fail-closed), non-private captures never use the original clock, and the code is correct today (probe above).

## Adversarial hunt (consent/privacy path)
- Guard is a case-insensitive suffix test on `overrides.originalVideo ?? video`; superset of the case-sensitive `.endsWith(".playable.webm")` the remux writer and callers use, so case games and omitted originalVideo are covered. bindOriginalCapture still confines the original to the slot, rejects symlink/alias/hardlink/changed bytes and non-matching remux.
- The guard runs before probe, extraction, provider and source.json/turns writes (test asserts probes=[], extracted=false, no source.json, corpus bytes unchanged).
- Residual, filed not fixed: a remux written under a name not ending `.playable.webm` would not be recognised by the name test. No product path produces one (normalizeCapture is the only remux writer and always uses that suffix).
- No new write, auth or tenancy surface; no consent rule loosened.

## Ledger floor (D-015)
ISS-CAPTUREMAKER-002 repro 1-3: 6/6 run on the declared stand-in (exact d07c93 bytes still absent on disk; named open as ISS-W7-001, low, accepted). repro 4: 3/3 plus 2 new remux cases. Real Chrome MediaRecorder timelines and live host capture: NOT VERIFIED, as the manifest states.

## Notes
- Metrics: check_min=14 checker_runs=3 tests mutations=6 (4-criterion floor + C4 recovery variants) src_mut_removed=true restored_verified=true
- PROPOSED-ISSUE: [medium] test gap, capture-original-private-eof-clock: no test drives runFinalize (record-commands.ts:293) with a `.playable.webm` --video and asserts finalize arg 11 is the raw `.webm`; mutant `originalVideo -> video` at the recovery call (record-commands.ts:297) survives. Fix direction: extend original-capture.test.ts recovery case with raw.webm + raw.playable.webm and assert calls[0][11] is the raw path. Fail-closed at runtime for private captures, so not blocking.
- PROPOSED-ISSUE: [low] consent guard in record-finalize.ts:179 is name-based (`.playable.webm`); consider also relating it to bindOriginalCapture's remux relation so a differently named remux cannot be offered as its own original. No current producer.

ISSUES-WRITTEN: none (proposed lines above for the maker to file)
