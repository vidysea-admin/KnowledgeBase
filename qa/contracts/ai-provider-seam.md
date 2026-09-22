# Contract — ai-provider-seam (T-019)

> Ground truth for the multi-provider AI backend decided in D-005/D-008 (plan §6c.0/§6c.3, grill
> Q5/Q6: "no single-AI dependency… rotate kar paayen… jis provider ko choose kiya uske saare
> models ke versions dropdown mein aa jaayen"). Drafted by the maker; /checker adopts or amends on
> first check.

## Scope
`packages/ai` gains a provider interface, five adapters (gemini, anthropic, openai, ollama,
claude-code), a `listModels()` seam per adapter, a user-editable ordered routing chain per
`jobKind`, a `jobs` ledger write on every call, and an STT sub-seam (`packages/ai/stt`) with
whisper (default) + gemini adapters. No live network calls are required to PASS — every adapter's
HTTP/process-spawn call is behind an injectable transport so the contract is testable offline with
fakes, matching the pattern already used in `packages/ask` (injectable `score_fn`) and
`packages/index` (injectable `summarize`).

## Criteria (each machine-checkable)

1. **One `Provider` interface** (`packages/ai/src/provider.ts`):
   `complete(job: {kind: string, messages: Message[], tools?, schema?, maxCost?}) => Promise<{text,
   json?, usage: {inputTokens, outputTokens}, provider: string, model: string, costUsd: number}>`
   and `listModels(): Promise<{id: string, label: string}[]>`. Exported as a TS interface, one
   definition, imported by every adapter (no re-declared shape per adapter).
2. **Five adapters exist**, each implementing `Provider`, each in its own file ≤300 LOC:
   `packages/ai/src/providers/{gemini,anthropic,openai,ollama,claude-code}.ts`. Each adapter's
   HTTP/CLI call is behind an injected `transport` parameter (constructor or factory arg) so tests
   never make a real network call. `anthropic.ts` supports both an API-key mode and an
   OAuth/Claude-Code-login mode per D-008 (may delegate the OAuth mode to `claude-code.ts`
   internally — one implementation, not two).
3. **`listModels()` is real per adapter**, not a stub returning `[]`: gemini/openai/anthropic
   return a hardcoded-but-labeled current model list (documented as "static manifest, refresh via
   provider docs" since a live API call isn't required for PASS); ollama's `listModels()` calls its
   local `/api/tags`-shaped transport (injectable, testable with a fake); claude-code's returns a
   static manifest of Claude model aliases usable via `claude -p --model <alias>`.
4. **`config/ai-routing.yaml`** declares, per `jobKind`, an **ordered array** of provider names
   (length ≥ 1, user-editable, no hardcoded max) — e.g. `transcribe-namemap: [gemini, ollama,
   claude-code]`. `packages/ai/src/router.ts` exports `route(jobKind, config) => Provider[]`
   (resolves names to adapter instances in order) and `complete(jobKind, job, config) =>` tries
   each in order, returning the first success, throwing a typed `AllProvidersFailedError` (never a
   silent empty result) if every provider in the chain fails.
5. **`jobs` ledger write on every call**, success or failure: `packages/ai/src/jobs.ts` exports
   `recordJob(entry)` writing to the `jobs` collection shape from `schema/jobs.schema.json`
   (T-018) — `{tenantId, kind, status, provider, model, costUsd, createdAt, error?}`. Injectable
   `write` function (no live Mongo needed to test — matches the `packages/db` accessor pattern).
6. **STT sub-seam** (`packages/ai/src/stt/`): `transcribe(audio, opts) => Promise<Turn[]>`
   interface, `whisper.ts` (default, local) and `gemini.ts` (used when a Gemini key is configured
   and preferred, per H9) implementations, both behind injectable transport.
7. **Parity contract test**: `packages/ai/src/provider.test.ts` runs the SAME fixture job through
   at least 2 of the 5 adapters using fake transports that return canned-but-realistic responses,
   and asserts both produce a `complete()` result matching the shared `Provider` return shape
   (same keys, same types) — proving the interface is actually uniform, not just declared uniform.
   Also tests: `router.complete()` tries providers in order and stops at first success (fake
   transport #1 fails, #2 succeeds → result is from #2, #1 was attempted); `router.complete()`
   throws `AllProvidersFailedError` when every provider in the chain fails; `recordJob` is called
   exactly once per `complete()` attempt (success or failure) with the injectable `write`.
8. **No regression:** `pnpm -r typecheck`, `pnpm -r test` (existing suites unaffected, new
   `packages/ai` tests green), `pnpm gen:types --check`, `python schema/validate.py`,
   `pnpm lint:structure` all clean.

9. **Embedding sub-seam** (plan §10 U1.1, added by amendment 2026-09-08 after the
   `embed-provider-seam` check): `embed?(job: EmbedJob) => Promise<EmbedResult>` is an **optional**
   method on `Provider`, declared once in `provider.ts` alongside `EmbedJob`/`EmbedResult`, with a
   `canEmbed(p)` narrowing helper so callers test capability instead of duck-typing. Adapters that
   have an embedding endpoint (gemini via `batchEmbedContents`, ollama via `/api/embed`) implement
   it over the **existing** `Transport` — no second seam. Each implementation MUST:
   - send **one transport call per batch** of N texts (not N calls), and **zero** calls for
     `texts: []`, returning an empty result rather than throwing — an empty array must never reach
     a paid endpoint;
   - **refuse rather than pair by index** when the response carries a different number of vectors
     than there were texts (short OR long), and refuse a **ragged** set whose vectors differ in
     length. A silently mispaired batch attaches one chunk's meaning to another chunk's id and
     corrupts every later similarity search invisibly, so these are throws, not warnings;
   - preserve input order, one vector per text.
   `router.embed(jobKind, job, config)` reuses `route()` and the same ledger, with one deliberate
   difference from `complete`: a chain member **without** `embed()` is **skipped, not failed** (a
   skip is not a job and is not written to the ledger), while a chain with **no** capable member
   throws `AllProvidersFailedError` — never an empty result, which would be indistinguishable from
   an empty corpus. An unknown provider NAME still throws in `route()` before capability is
   consulted, so a typo cannot be absorbed as a skip.
   Observed by the checker 2026-09-08 against the live API: `gemini-embedding-001` returns
   **3072 dims**; `purpose: "query"|"document"` maps to `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT`
   (unset ⇒ document). U1.2's schema must match that width.

## Non-goals for T-019
- No real API keys are called. No HTTP server/routes (T-009). No cost-budget enforcement /
  throttling (explicitly dropped per D-005/D-008 — "no budget-guard work now"). No web-search
  provider for CRAG (folds into `ask-router` v2, a separate unit, T-005b) unless trivially reusing
  this same `Provider` shape — if so, note it in the manifest but don't block T-019 on it.

## Invariants
- **[I1] No live network call is ever required to pass.** Every adapter's HTTP/process-spawn call
  sits behind an injectable transport, so the contract stays testable offline with fakes (Scope).
- **[I2] One `Provider` interface, one definition.** No adapter re-declares its own return shape;
  all five import the same `packages/ai/src/provider.ts` interface (C1).
- **[I3] Every `complete()` attempt is logged.** Success or failure, each call writes to the
  `jobs` ledger via the injectable `write` function — a silent, unlogged call is a violation
  (C5, C7).

- **[I4] A batch is never silently mispaired.** No `embed()` implementation may return vectors it
  cannot pair one-to-one, in order, with its input texts. Count mismatch and ragged lengths are
  throws; an empty input is the only case that legitimately returns an empty result, and it costs
  zero transport calls (C9).

## Amendment log
- 2026-09-03 · routine · checker adopts this maker-drafted contract as-is (T-019 cycle-1 check) ·
  verified faithful to D-005 (Gemini-first, Claude via OAuth not API keys, Anthropic Messages API
  optional/flagged, jobs ledger with maxCost, no budget-guard work) and D-008 (multi-provider
  chain, five adapters + listModels() + STT seam) and plan §6c.3 — no wording changes needed.
- 2026-09-08 · routine · added `## Invariants` section (I1-I3), derived from this contract's own
  already-stated Scope/Criteria text (injectable-transport-only, single Provider interface, every
  call logged) — no new requirement introduced, only structure per the checker SKILL's "Contract
  file shape" · ISS-007 housekeeping
- 2026-09-08 · routine · added C9 (embedding sub-seam) + [I4] (a batch is never silently mispaired),
  after the `embed-provider-seam` cycle-1 PASS · the contract predated the embedding seam and said
  nothing about it, so U1.2-U1.5 — which all depend on it — would have been checked against a
  contract blind to their foundation. Every clause records behaviour the checker verified itself
  (nine mispairing refusals across both adapters, 1 call per batch / 0 for an empty batch,
  skip-not-fail with typo'd names still throwing in route(), and 3072 dims observed live from
  gemini-embedding-001). Additive only; nothing weakened. Deliberately NOT added: a `dims > 0`
  floor — that gap is real and filed as ISS-096, but writing a criterion for the purpose of failing
  the unit in front of the amendment would distort the gate as surely as softening one would; it
  becomes a criterion when U1.3 wires embed() into indexing.
- 2026-09-22 · routine (record confirmation) · inbox 2026-09-03T11:02 Umesh: "humko tho system
  adaptive banana hai … koi bhi api key chal jaaye … easy fallback se" — folded as a **design
  confirmation**, no criterion change: five provider adapters behind one `Provider` interface,
  `config/ai-routing.yaml`'s ordered per-jobKind chain and `complete()`'s try-in-order with
  `AllProvidersFailedError` are exactly that design (D-005/D-008, verified in U1.x checks).
  Entry had sat unmarked since 2026-09-03 · Mode B sweep fold-in, qa/feedback-inbox.md
