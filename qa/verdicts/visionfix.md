# Verdict - visionfix
**Cycle checked:** 0
**Commit checked:** ef55b13e
**VERDICT:** FAIL
**ISSUES-WRITTEN:** ISS-VISIONFIX-001 (medium), ISS-VISIONFIX-002 (medium), ISS-VISIONFIX-003 (low)

Single blocking defect: the lint-loc aggregate gate fails (ISS-VISIONFIX-001, a one-line manifest fix). The code itself holds up; ISS-VISIONFIX-002 (quadratic extractor) is medium and should ride the same fix cycle.

## Evidence
- packages/ai `"src/**/*.test.ts"`: tests 241 / pass 241 / fail 0. packages/core `src/keyframes/*.test.ts`: pass 30 / fail 0. ALL 17 scripts/webinar `*.test.*` files: tests 170 / pass 170 / fail 0 (none opens a browser, Mongo or the network). tsc --noEmit packages/ai exit 0, packages/core exit 0.
- `node scripts/lint-loc.mjs --all`: `lint:structure stage=tracker exit=1`, `FAIL (10 stages, 1 failed)`: "G4 ambiguous issue ref: qa/manifests/visionfix.md cites ISS-001, ISS-002 bare". The manifest's "OK (10 stages, 0 failed)" claim is false.
- Abort proven on the socket (fake localhost server that never answers): real apps/api `realTransport` with an AbortSignal rejects with AbortError after 1030 ms and the server sees the connection close. Through the chain with test transports: 3 backends, deadline 5000 ms, 3000 ms each => wall about 5057 ms, 2 closes, third backend skipped ("vision deadline exceeded before this backend was tried"); deadline 20000 => 3 closes at 9.1 s.
- D-015 reproductions, defaults untouched: ISS-OLLAMAFIRST-001 (never-responding backends, no env): wall 90148 ms (was 360 s), a and b time out at 45000 / 44968 ms, gemini skipped, 2 sockets closed => 1/1 fixed. ISS-OLLAMAFIRST-002 (reply "The user wants me to analyze..." prose): tally/log error is the fixed "vision reply contained no valid JSON object", no reply text, no key => 1/1 fixed. Both rows record a single reproduction each (not a corpus).
- extractJsonObject: fenced JSON, prose + stray braces, string containing "}" and "{{{", first-invalid-then-valid, two valid (first returned) all OK; extra key, `__proto__` payload, no-object all throw after the strict validateVision. Strict schema IS still enforced on every candidate. Note (low): a rejected outer object lets a valid INNER object be returned (`{"wrap":{...valid...}}` => inner); validator still passes it, so harmless but not "first object". ReDoS: no regex backtracking, but scanning is quadratic (ISS-VISIONFIX-002: 32000 "{" = 4683 ms).
- Logs: errors/tally/logs carry no reply text, base64 or key (checked above; key sentinel absent).
- Live (1 call, main-tree .env, LKB_VISION_ROUTED=1, order deepseek then glm, real transport, key never printed): deepseek-v4.1-flash served in 2494 ms, attempts 1, readable true, ocrText 638 chars, visualDescription 287 chars, fallbacks 0, failures [].
- Mutation (17, per-mutation backup, 240 s timeout, restore in finally, HEAD-fidelity `git hash-object` == `git rev-parse HEAD:<file>` for chain.ts and ai-transport.ts at end): KILLED 13 (abort removed, signal not sent to ollama / gemini, remaining budget not passed, deadline skip removed, deadline default 900 s, extractor skips accept, reply echoed in error, format json-only, think removed, validateJson ignored, empty-ollama guard, empty-gemini guard). SURVIVED 4 (ISS-VISIONFIX-003): backend default 45 s -> 120 s, outer-signal abort, string-aware brace tracking, apps/api httpTransport `signal` pass-through.

---
# Cycle 1
**Cycle checked:** 1
**Commit checked:** f82a5977
**VERDICT:** PASS
**ISSUES-WRITTEN:** none

## Evidence
- `node scripts/lint-loc.mjs --all` ends `lint:structure stage=tracker exit=0` ... `lint:structure: OK (10 stages, 0 failed)`; `tracker-audit: OK (gate G1,G4,G5)` (only non-gating advisories remain). ISS-VISIONFIX-001 closed.
- Suites: packages/ai tests 246 / pass 246 / fail 0; core keyframes pass 30 / fail 0; all 17 scripts/webinar test files tests 170 / pass 170 / fail 0; apps/api ai-transport.test.ts pass 18 / fail 0; tsc ai exit 0, core exit 0.
- ISS-VISIONFIX-002 (quadratic): the same 32000-char inputs now take 1 ms ("{" x32000, `{"a":` x6400, `{"` x16000), 3 ms balanced-nest; 250000 chars 3-44 ms. Fenced JSON, prose + braces, braces/escaped quotes inside strings, first-of-two, invalid-then-valid, stray "{" in prose: first valid object returned. Extra key, `__proto__` payload and no-object throw after the strict validateVision (schema still enforced).
- Cap: a valid object entirely after 256 KB, an object straddling the cap, and a huge string straddling it all THROW the fixed message; nothing truncated into an object (only balanced spans parse). Valid object inside the cap followed by junk past it is returned (a prefix, acceptable).
- Mutants (per-mutation backup, 240 s timeout, restore in finally, HEAD hash equal): the 4 prior survivors now KILLED except one sub-case: backend default 120 s KILLED, string tracking removed KILLED, api httpTransport signal removed KILLED (hangs, killed by timeout), outer-abort pre-aborted branch SURVIVED (listener branch killed via "no reject on abort"). New-code: cap removed, accept skipped, quote-unconditional, abort-no-reject KILLED; SURVIVED (low, notes only): candidate cap removed, sort removed, listener not removed, timer not cleared.
- Leak check with real httpTransport against a never-answering server and timeoutMs 60000: outer abort at 500 ms rejects at 509 ms ("aborted"), pre-aborted rejects immediately, server saw 1 close, active resources afterwards contain no Timeout and no socket, process exited at once.
- Notes (low, not filed): a `{` in prose followed by a quote (e.g. `He said "hi {" and {good}`) now desyncs string state and the reply is rejected (fails safe to the next backend; the old scanner accepted it). Timer-clear and listener-removal have no test (verified manually above).
