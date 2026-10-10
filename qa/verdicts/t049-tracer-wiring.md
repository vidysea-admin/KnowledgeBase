# Verdict: t049-tracer-wiring
VERDICT: FAIL
Cycle checked: 0
Commit checked: fdb8bf2 (lane/t049wire, base 6c5d800). Checker: independent. Scope: OFF identical, ON result-identical and no content leak, sink cannot harm the call path or fill the disk. One medium defect (unbounded write queue); everything else passes. Round cap: second unit on the AI tracing seam; non-security findings after this are file-don't-fix. The defect is filed because the brief names unbounded memory growth as a medium finding.

## Commands (node v24.19.0, all under timeout; probes in scratchpad t049wirecheck, deleted afterwards)
- `git show --stat fdb8bf2`: only packages/ai/src (index.ts, router.ts, trace*.ts + tests) and the manifest. No stt/, apps/, other packages, package.json.
- `git diff 6c5d800 fdb8bf2 -- packages/ai/src/router.ts`: the import line plus `return withTracing(provider);` instead of `return provider;`. Nothing else.
- packages/ai `node --test --import tsx` trace, trace-registry, trace-file-sink, provider, providers, router, jobs, routing-config: tests 60 / pass 60 / fail 0.
- packages/ai `tsc --noEmit -p tsconfig.json`: exit 0 (30 s). apps/api `tsc --noEmit -p tsconfig.json`: exit 0 (56 s, run independently; the maker had not).
- apps/api tests: none import `@lkb/ai` or packages/ai source (grep), so no apps/api test file runs through `route()`; none run.
- `node scripts/lint-dirsize.mjs`: OK (111 dir(s) within budget).

## OFF identity (probe: spies on fs, fs/promises, process.stderr.write, and a Proxy over process.env)
| TELEMETRY_ENABLED | route() returns same object | fs/fsp calls | stderr | env keys read |
|---|---|---|---|---|
| unset, "", "false", "0", "no" | yes (===) | none | 0 lines | TELEMETRY_ENABLED only |
A provider method was then called: result unchanged. The flag is read on EVERY `route()` call (not at import): setting it after import takes effect for later route() calls; a test that sets it late sees tracing from then on, and unsetting it mid-run returns to identity. Already-routed Proxies stay wrapped. "TRUE" and " true " also enable (case-insensitive, trimmed; same as the first unit).

## ON: Proxy findings (fake with a #private field used by complete, embed, an extra method and a getter)
- Result object identity kept; same Error instance rethrown; `this` correct for known and unknown methods and getters (#private works); `instanceof` true; `Object.keys` and `JSON.stringify` equal the original's; writes (`p.name = ...`, new property) land on the ORIGINAL; `"complete" in p` true.
- A new Proxy is created on every `route()` call (p !== p2) and each function property read returns a fresh bound function. Grep of packages/apps/scripts: `route()` is consumed only inside router.ts `complete`/`embed` (iterate, call, read `.name`, `canEmbed`); no `===`, Map, WeakMap or Set keyed on a Provider, and no `instanceof XProvider` on routed providers. No identity-keyed cache exists, so nothing is broken.
- Providers in packages/ai/src/providers: anthropic, claude-code, gemini, ollama, openai use TS `private` only (no JS `#`). The interface has no streaming or async-iterator method; unknown methods (listModels) run bound to the original.

## Leak table (end to end: route() with TELEMETRY_ENABLED=true and TELEMETRY_TRACE_FILE; file bytes searched for each sentinel and its base64)
| Sentinel carried in | In trace file? |
|---|---|
| prompt, system prompt, 2nd message, tools, schema | no |
| embed texts (strings and a Buffer) | no |
| completion text, result.json | no |
| thrown error message, cause, custom property | no |
| provider apiKey field, headers.authorization | no |
Written (metadata by design): operation, jobKind, provider name, model, startedAtMs, latencyMs, inputChars, outputChars, token counts, costUsd, retries, outcome, errorClass, correlationId, tenantId (null today: nothing sets a trace context). The file path comes only from env TELEMETRY_TRACE_FILE (or the explicit option); no request data reaches it. `provider` is read live from `provider.name`.

## Sink stress and failure (probe)
- 200 concurrent record(): 200 lines, all parseable, 200 unique, none interleaved, 0 warnings.
- Directory path (EISDIR), missing drive Q:/ (ENOENT), invalid chars (ENOENT), parent is a file (ENOTDIR), ENOSPC via stubbed appendFile: failures == dropped == N, exactly ONE warning each (error code only), nothing thrown, 0 unhandledRejection events (listener attached); results unaffected. Throwing, rejecting and never-settling sinks: call returns in 0 ms.
- Size guard, maxBytes 1000: stops at 774 bytes (never over), 47 dropped, 1 warn; 5 more records afterwards: still 774, still 1 warn (never resumes). A new sink on the existing 774-byte file (restart): writes 0, stoppedBySize at once, so a restart cannot blow past the limit. maxBytes 0 writes nothing. Garbage env max ("abc", "-5", "0", "") falls back to the 50 MiB default; every write goes through `append`, so no path skips the guard. The directory is created (mkdir) before the first size check; low.
- Memory is NOT bounded: 100,000 record() calls against a never-settling appendFile gave heap +63.2 MiB, written 0, dropped 0 (linear, no cap). Filed ISS-T049WIRE-001 (medium). The trigger is a stalled or slow disk; failing disks reject fast and are counted.
- Process exit: queued records are lost silently (acceptable for telemetry; stated, not filed).

## Registry and usage
- Default `getTraceSink()` is the no-op; `setTraceSink` swaps at any time (first sink 1 record, second sink 1 record); `null` restores the default. Tracing on, no sink, no path: exactly ONE stderr line over 20 calls.
- Usage: missing, null, `{}`, NaN, Infinity, string-typed "12"/"0.5": tokens and cost null, no NaN in the in-memory record. Negative numbers (-5, -0.3) are recorded as given (low). `{}` with costUsd 0 records cost 0 (the provider's value).

## Mutation table (per-mutation byte backup, restore in finally, timeout 150 s, byte compare true after each; tests: trace, trace-registry, trace-file-sink, router)
| Mutation | Result |
|---|---|
| wrap even when flag off (guard removed, flag forced) | KILLED (2 fail) |
| unknown methods bound to the proxy | KILLED (1 fail) |
| error message returned as errorClass | KILLED (3 fail) |
| size guard disabled | KILLED (1 fail) |
| sink awaited on the call path | KILLED (1 fail; first attempt was a CRLF pattern miss, redone) |
| registry warns on every call | KILLED (1 fail) |

HEAD fidelity (`git hash-object` equals `git rev-parse HEAD:`): router.ts 0d4f303c823d5a3ae50668673339f522004c8c4c, trace.ts def0027f462657f67e0f1f39667f7cac456f6ea9, trace-registry.ts b297e02e5ff5f95268ea92689570cbbfd7ba85b4, trace-file-sink.ts 31c476075e3a035b725aa92c636d3034349d24a4, index.ts 377963e63ace3daf9c5fb6abb160f9dd6884da8e. Worktree clean after mutations.

## Manifest accuracy
Evidence (60/60, tsc, dirsize) reproduced. "Not delivered" is accurate: scripts/gen-golden-set.mjs:174 (GeminiProvider built directly) and scripts/lib/toc/toc-embedding-backfill.mjs:233 (`provider.embed`) bypass route() and are untraced; no Langfuse sink; ids null. apps/api tsc, not run by the maker, is green.

ISSUES-WRITTEN: ISS-T049WIRE-001 (medium, qa/issues.t049wire.jsonl)
EXPLANATION: Everything else holds: OFF is the identical object with no fs, stderr or extra env access; ON preserves results, errors and `this`, and no sentinel reaches the file. FAIL is solely the unbounded pending-write queue (a pending cap that drops and counts is a small fix). Lows: negative usage recorded verbatim, mkdir before the size check, per-call Proxy and fresh bound functions, flag read per route() call. No contract added: no clause in qa/contracts covers this internal seam.
