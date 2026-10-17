# Approved TOC provider validation

The sole broker executed the first measured real stage on 2026-10-14 at 22:14 UTC. `one-call-sample.mjs --preflight` exited 0 in 331 ms; `--run` exited 0 in 2.583 seconds (child measurement 2.263 seconds). Exactly one Gemini 2.5 Flash request returned HTTP 200, STOP, 534 input tokens and 193 output tokens. The actual sample contained **five turns / 3,710 bytes**, not the 32-turn cap. The production summary parser accepted a 327-byte summary and real `buildTree` consumed it in one session node. Twelve source pins matched before/after and remain current.

Receipt `one-call-receipt.json` SHA256 `548a0b1de6e380849028811658c42a127823741e981fdc40ea9e917d2e701d9d`; actual broker receipt `../goal-t051checker-broker-live-toc-run.json` SHA256 `2549697c8f0e13a7d12304370c0def2d84827e0ccc4d9b89b12332114001953d`. The preflight receipt SHA256 is `6823bc5d26aa05f6733a746e16c7333e35163b84eccf5e96acc36a209ef6d97d`. No status-only repeat is planned.

Raw input/output remain in the existing ignored `.cache/provider-validation` directory; public evidence contains only approved source/proof hashes, model, timing, counts and fixed failures. Credential bytes never enter arguments, public receipts or output files. The original `.env` was not edited, and this stage used no database, telemetry or model fallback. Semantic acceptance is false.

## Next prepared stage, not yet executed

`strict-claims-sample.mjs --preflight`, then `--run` only after a green preflight, uses the **same five source turns** and binds the first immutable receipt. It invokes production `extractClaims` with `strictWebinar: true`, including its actual mandatory semantic-judge call. Maximum two generation calls, each 45 seconds and 1,500 output tokens; 3,000 total output tokens; outer child deadline 110 seconds. Literal evidence, source origin, extractive text and canonical claims schema must validate. Output remains an unpersisted, unverified, needs-review draft; no fake database or human gold is supplied.

`staging-read-only.mjs` is a separate prepared no-provider probe. It loads the existing connection privately, selects and asserts exactly `lkb_staging`, pings, then checks the approved tenant/session/source/turn tuples and actual current production visibility. Missing, changed or corrected source bytes are a truthful not-ready result. The probe neither seeds nor creates/migrates/writes a collection. A 45-second outer deadline bounds the owned child. Current-source and namespace proof must precede any later authorized staging write.

These artifacts do not close strict full indexing, independent model-family judgment, persisted claim visibility, cited Ask, actual useful outputs, human review, operational release or the forty-task goal. Source/schema drift or execution failure remains explicit evidence rather than a reason to fall back or weaken checks.
