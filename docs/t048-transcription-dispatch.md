# Recording transcription dispatch

The long recording CLI supports an opt-in whole-file Gemini attempt followed by chunk fallback:

```powershell
$env:LKB_SINGLE_CALL_PATH = '1'
$env:GEMINI_STT_MODEL = 'gemini-3.8-flash'
node scripts/transcribe-long-session.mjs <sessionId>
node scripts/webinar/validate/validate-session.mjs <sessionId>
```

`GEMINI_API_KEY` must already be configured privately. Do not paste it into commands or logs.
`LKB_TRANSCRIPT_QA=1` additionally publishes generation-bound timestamp and hallucination QA.

The recording's actual duration is probed before requests. At 5400 seconds inclusive and with
the configured `gemini-3.8-flash` model, the initial strategy makes exactly one whole-recording
transcription request. Upload and readiness polls are separate protocol calls. An error,
malformed output, invalid timing, internal gap, empty result or incomplete tail discards that
initial result and enters the existing bounded chunk retry/tail-recovery strategy. Initial
results never contribute to fallback turns. Each chunk permits three attempts and at most
three recursive tail splits; a provider failure after the chunk attempt bound refuses publication.
Final unresolved gaps or tail shortfall refuse publication unless `--allow-partial` is explicit.
`--range` uses chunking directly.
Requests read a private immutable snapshot of the recording. The snapshot's duration and hash
are checked, and any source-byte change during processing refuses publication.

Above 5400 seconds, with another/unset model, or with the single-call flag absent, existing
chunk routing is preserved. The adapter's default remains `gemini-3.5-flash`. No provider byte
limit is established; a real provider rejection follows the failure path. The watcher keeps
its previous duration routing unless the same opt-in flags are set.

When the single-call flag is on, `transcription-path.json` records requested/actual strategy,
model, probed duration, audio SHA-256, committed turns SHA-256, transcription attempts and
separate upload/poll/generate protocol request counts. It contains fixed failure codes,
not provider error bodies or URLs. QA evidence selects the exact accepted span attempt IDs;
rejected single/retry attempts remain audit evidence. Its hash binds the actual committed
`turns.json` bytes, and the downstream QA gate refuses a stale generation.

Provider/coverage failures before publication preserve prior turns and sidecars. A filesystem
failure during publication still fails the CLI; generation hashes let downstream validation
refuse mixed turns/QA files. Derived knowledge is marked stale by the existing transcript writer.
Opt-in publication first replaces validation with a failed/pending verdict. Run the independent
validator above and require its passed result before seeding or indexing this generation.

D-162 requires this feature to remain off by default. Full T-048 acceptance still requires a
paired real TOC comparison, recorded authorization for default promotion and isolated real
downstream indexing/citation evidence. Fake provider CLI checks do not satisfy those gates.
