# Prepared tiny Ollama smoke — not executed

Root authorizes paid existing-key use; execution still belongs to the sole broker after successful live metadata and its finite separate budget. Production source remains frozen.

From root, pinned Node command:

`node --import tsx qa/evidence/ollama-live-preflight/smoke.mts --metadata-proof <safe-metadata-stdout.json> --metadata-sha256 <its-SHA256>`

Broker must impose an outer 50-second timeout. Script also applies a 50-second total AbortController, a 20-second provider deadline and HTTP deadline per call, and a 64-KiB streamed response cap. Import/setup is included in the outer broker wall limit. No request is retried or automatically substituted.

Read the root `.env` privately with `dotenv.parse`, selecting only the existing Ollama key. Require a hash-pinned metadata output proving each exact bare model ID listed before that model can receive a call. Missing/unknown listing means refusal. The script itself makes no metadata request. At most one call each to `glm-5.3-flash` and `deepseek-v4.1-flash`, using the existing cloud provider and hardened HTTP transport, `num_predict:32`, temperature 0, and only `Respond with OK only.` No private corpus, source, PII, embeddings, audio, training, database calls or output files.

Stdout contains only the two model IDs, success/refusal class, actual token counts where the provider returns them, and `costStatus:unknown`. Response text, keys, headers, URLs, arbitrary errors and bodies are never emitted. Exit 0 means both successes; exit 2 means at least one refusal. Availability is not inferred from failure. A bounded smoke does not establish product/retrieval quality or production readiness.

Script SHA256 `F3B6BD98B650C2E62C085E528DEEFF6E8331E0046CC1C65D2E03AA47BB4F697F`.
