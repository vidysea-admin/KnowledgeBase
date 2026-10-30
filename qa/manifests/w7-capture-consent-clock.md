# Manifest — w7-capture-consent-clock
**Contract:** C1 C2 C3 C4 (no qa/contracts file; criteria below; docs/REMAINING-PLAN-2026-10-28.md Wave 2 W7, approved by Umesh 2026-10-28)
**Goal task:** T-011/T-034/T-035
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
**Dual check:** no
Dual check reason: no trigger applies. The diff adds one fail-closed refusal at the top of finalizeRecordingWith (before any probe, extraction, provider call or source.json/turns write) and test code. It writes no stored data, changes no auth or tenancy logic and loosens no consent rule; every accepted input still takes the pre-existing path. A single checker is enough.
**Persona walk:** skip (capture finalizer, no UI)
**Issues addressed:** ISS-CAPTUREMAKER-002 (high, capture-original-private-eof-clock)
**Executor:** claude-sonnet-subagent (maker-builder)
**Executor rationale:** single-context M unit, file-disjoint from w6 (whatsapp approval CAS) and w9 (webinar notes)

## What changed
- packages/meeting-bot/src/capture/record-finalize.ts (finalizeRecordingWith, right after readRecordConsent): a capture with private windows whose `originalVideo ?? video` is a `.playable.webm` remux is refused with "Private capture requires its raw original, not a remux" before any duration probe, audio extraction, provider call or source/turn publication. The accepted fix already bound the clock to `original.file` (`if(consent.privateWindows.length)video=original.file`) and both callers already forward the pre-normalization original; the remaining hole was a caller that omitted originalVideo (or passed the remux as its own original), where the remux clock was silently trusted.
- packages/meeting-bot/src/capture/finalize-original-eof.test.mjs: (a) the ledger's retained corpus qa/evidence/t035-lean-video-measured-encode/eof-baseline-zeYvkn/stale-duration-source.mkv (sha256 d07c93e9...2f42de7) is untracked and absent on HEAD, so the file was 5/5 ENOENT. The test now uses the retained file when present with that SHA256 and otherwise rebuilds it from the recipe recorded in pre-eof-probe.mjs (12.221s H264/AAC, audible tail past 12s, Matroska Duration field patched to 12000ms) as a declared stand-in whose own SHA256 is printed; every assertion is unchanged. (b) scratch base falls back to the git-ignored <repo>/tmp when TEMP is on another drive than cwd (lean-video-ffmpeg regularLocalFile refuses cross-drive paths). (c) Two new cases: remux-as-original, with originalVideo omitted and with originalVideo equal to the remux.
- packages/meeting-bot/src/capture/workspace/record-stop-regression.test.ts: the injected normalize now returns a `.playable.webm` and the clean-stop case asserts the live caller hands the finalizer the remux as `video` and the exact pre-normalization path as `originalVideo` (arg 11). Before, the injected normalize returned its input unchanged, so a live caller that dropped originalVideo went undetected.
- qa/issues.w7.jsonl: ISS-W7-001 (low). No contracts, verdicts, evidence or other units' files touched.

## Acceptance criteria
- C1: The consent (private-EOF) clock is read from the ORIGINAL capture before any lean normalisation or remux: for the 12s original, private 9..12 yields a complete 12.202667s output whose decoded tail after 12s is <= -80 dB with the public prefix audible, and private 9..10 keeps an audible public tail (> -60 dB) with output > 12s (direct and via a raw->playable remux; validation.durationSec == 12).
- C2: A raw->playable remux never supplies a private clock: finalizeRecordingWith refuses a private capture whose original is a `.playable.webm` (omitted or explicit) before any probe/extraction/publication.
- C3: An unknown original duration refuses before extraction, provider or publication even when a measurable remux exists.
- C4: Every live and recovery caller forwards the exact pre-normalization original to the finalizer (live runRecord: the raw path normalize was given; recovery runFinalize: the raw .webm for a .playable.webm; foreign/mismatched/changed originals refuse).

## Ledger floor (D-015): ISS-CAPTUREMAKER-002 recorded reproductions, count by id
- ISS-CAPTUREMAKER-002 repro 1 (exact corpus, private 9..12, tail <= -80 dB, public prefix audible): 2/2 run, PASS on a REGENERATED STAND-IN, tail -91 dB, output 12.202s (direct + remux). Open on the exact bytes: the retained d07c93 file is not on disk anywhere searched (main tree, .worktrees, D:/KnowledgeBase-lanes), so the exact-SHA replay is NOT RUN. The stand-in is built from the corpus's own recorded recipe (ISS-W7-001), not byte-identical (encoder build differs: ffmpeg 8.1.1 here vs 9.0.2 then).
- repro 2 (private 9..10, public tail > -60 dB, output > 12s): 2/2 run, PASS on the stand-in, tail -17.8 dB, output 12.202s. Exact-SHA replay NOT RUN (same reason).
- repro 3 (both cases after actual lossless Matroska remux under raw.webm -> raw.playable.webm; finalizer uses the owned original 12s): 2/2 run, PASS on the stand-in (the remux is asserted to expose > 12s). Exact-SHA replay NOT RUN.
- repro 4 (unknown original duration refuses; foreign/mismatched/changed originals refuse; caller forwarding preserves the source): unknown-duration 1/1 PASS; original-capture.test.ts 2/2 PASS (confinement, remux relation, changed bytes, recovery forwarding); live forwarding now asserted (record-stop-regression 4/4 PASS). New beyond the floor: remux-as-original 2/2 PASS.
- Left open, named: only the exact-bytes replay of repro 1-3 against SHA256 d07c93e9...2f42de7. Real Chrome MediaRecorder timelines (no duration) and live host capture remain NOT VERIFIED.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L — consent/privacy boundary on an uncapped high issue; the diff adds only a refusal, so a single checker (reason above)
Round: 3 files, 4 criteria, est 25 min — one guard, three test files, mutation floor
Base / checked state: base 021bdea0, code SHA 53b498e4 on branch wave/w7-capture-consent-clock (worktree .worktrees/w7-capture-consent-clock)
Gate answers: none (Wave 2 approved in docs/REMAINING-PLAN-2026-10-28.md)
Affected tests / full-suite trigger: none; no lockfile, config or shared-fixture change. Also green: record-commands.test.ts 22/22, record-backend.test.ts 5/5, native-capture-runtime.test.ts 6 pass 0 fail (2 platform skips), tsc --noEmit -p packages/meeting-bot clean (0 errors).
Tests[C1]: packages/meeting-bot/src/capture/finalize-original-eof.test.mjs::"actual finalizer preserves exact original12s clock: private-eof / closed-private-public-tail / raw-remux-private-eof / raw-remux-closed-public-tail" — real ffmpeg decode of tail and prefix peaks on the 12s corpus, direct and via remux
Tests[C2]: packages/meeting-bot/src/capture/finalize-original-eof.test.mjs::"private capture never takes its clock from a raw->playable remux" (omitted + explicit) — red before the guard, green after
Tests[C3]: packages/meeting-bot/src/capture/finalize-original-eof.test.mjs::"private raw clock unavailable refuses before encoder/extraction even when a remux exists" — NaN original clock with a remux present
Tests[C4]: packages/meeting-bot/src/capture/workspace/original-capture.test.ts (recovery forwarding, confinement) and packages/meeting-bot/src/capture/workspace/record-stop-regression.test.ts::"parity: a clean tab stop..." — recovery forwarding and confinement; live forwarding via the new originalVideo asserts
Falsification[C1]: copy-mutant in packages/meeting-bot/src-mut (removed after): record-finalize.ts `if(consent.privateWindows.length)video=original.file;` -> `if(false)...` -> finalize-original-eof.test.mjs exit 1, 3 red (raw-remux-private-eof, raw-remux-closed-public-tail, unknown-clock) -> restored; git hash-object 6b79b469c47f == HEAD blob 6b79b469c47f
Falsification[C2]: golden finalize-original-eof.test.mjs red-before/green-after (both new cases failed with ENOENT, i.e. ran on to extraction, before the guard; 7/7 after) plus copy-mutant: guard `if(consent...&&` -> `if(false&&` -> exit 1, 2 red (the 2 new cases) -> restored; hash-object 6b79b469c47f == HEAD blob 6b79b469c47f
Falsification[C3]: copy-mutant: `if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) {` -> `if (false) {` -> finalize-original-eof.test.mjs exit 1, 1 red (unknown-clock) -> restored; hash-object 6b79b469c47f == HEAD blob 6b79b469c47f
Falsification[C4]: copy-mutants in src-mut/capture/record-commands.ts: recovery `...,originalVideo);}` -> original dropped -> original-capture.test.ts exit 1, 1 red; live `originalVideo,gate.admission` -> `undefined,gate.admission` -> first run original-capture.test.ts exit 0 (SURVIVED: not covered), then after adding the live asserts record-stop-regression.test.ts exit 1, 1 red -> restored; hash-object 10679716f79f == HEAD blob 10679716f79f
mutant-cap-raise: 6 mutation runs = the 4-criterion floor plus the C4 live survivor re-run (policy .8-4); no extra mutants beyond that.
Falsification note: each mutant ran in a throwaway copy (packages/meeting-bot/src-mut, no node_modules inside, removed after), with a per-mutation byte backup restored in a finally block (no trap-EXIT, no run-scoped backup); the bound tree was never mutated and each restore was verified with git hash-object against HEAD.
Pre-check[C1]: 53b498e4 cd packages/meeting-bot && node --test --import tsx src/capture/finalize-original-eof.test.mjs -> exit 0 (7 tests pass, stand-in corpus) t=27
Pre-check[C2]: 53b498e4 cd packages/meeting-bot && node --test --import tsx src/capture/finalize-original-eof.test.mjs -> exit 0 (7 tests pass, incl. the 2 remux-clock refusals) t=27
Pre-check[C3]: 53b498e4 cd packages/meeting-bot && node --test --import tsx src/capture/finalize-original-eof.test.mjs -> exit 0 (7 tests pass, incl. unknown-clock refusal) t=27
Pre-check[C4]: 53b498e4 cd packages/meeting-bot && node --test --import tsx src/capture/workspace/original-capture.test.ts ; node --test --import tsx src/capture/workspace/record-stop-regression.test.ts -> exit 0 (2 + 4 tests pass, two invocations) t=30
Metrics: start=2026-10-28T15:05:00Z end=2026-10-28T16:05:00Z wall_min=60 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0 builder_min=60
Status: checked-PASS (qa/verdicts/w7-capture-consent-clock.md, 4622c6a9, cycle 0)
