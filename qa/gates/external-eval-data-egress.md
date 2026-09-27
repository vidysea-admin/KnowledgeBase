# HUMAN_GATE — external-eval-data-egress

**Question:** May these two bounded validation payloads be sent to Google's Gemini API?

1. T-021: the 92 internal golden-set questions, for query embeddings compared with existing
   `toc` chunk vectors.
2. U3.1: one generic Ask question plus the internal tree and retrieved candidate context needed to
   generate a real answer with citations in the live browser.

**Why this is a gate:** both checks can be made Mongo-read-only, but Gemini still receives internal
evaluation or retrieval context. The environment safety reviewer rejected transmission because the
specific payloads and destination were not explicitly approved. The privacy-safe local alternative
is currently unavailable: Ollama is running, but `nomic-embed-text` is not installed and its model
registry DNS lookup fails.

## Options

- **A — approve both bounded Gemini checks:** allow both payloads above. The evaluator's jobs
  writer is disabled, and every browser run must use an explicit `MONGO_WORK_DB`; neither check may
  write production/default Mongo.
- **B — local only:** send neither payload externally. Keep both final checks parked until a local
  embedding/generation route is available.
- **C — approve Ask only:** allow the single U3.1 browser question/context submission, but keep the
  92-question T-021 embedding run parked.

**Answer format:** `external-eval-data-egress: A`, `external-eval-data-egress: B`, or
`external-eval-data-egress: C`.

**Blocks:** the semantic embedding leg of T-021 condition 4 and U3.1's final real-answer plus
citation-link browser proof. It does not block U2.4 or other local-only catalogue work.

**Opened:** 2026-09-09T16:39:45+05:30 by maker after two measured failures: Gemini/live-vector
execution rejected by the environment safety reviewer; local `nomic-embed-text` pull failed on
`registry.ollama.ai` DNS.

## Local-only preflight completed — 2026-09-09T18:07+05:30

No provider was called. Existing `toc` chunk rows were read from the read-only source database and
idempotently copied into the explicit work database `lkb_codex_work_20260909`; source jobs delta and
work jobs delta were both zero. The resulting preflight found:

- 92 questions; question ids and texts unique; all 23 expected sessions exist;
- exact outbound embedding payload size 9,920 bytes, SHA-256
  `0e00f22840b14d2317fd81cbdddb4947f7448b5a035d9a1da4f98909042e5cf5`;
- 1,452 work-database chunks, all finite and internally dimension-consistent;
- one dimension (`3072`) and one stored corpus model (`gemini-embedding-001`);
- work-database jobs before/after `0/0`; no provider call and no score claimed.

This discharges the local preparation only. It does not answer the gate and does not prove semantic
sibling ambiguity; that still requires the bounded provider run or a later local embedding route.

**Answered:** 2026-09-21 — **A (both)**. Umesh approved both bounded payloads — the U3.1 live-browser
Ask question (question + internal tree/retrieved candidate context → Gemini) and the T-021
92-question golden-set embedding leg (exact outbound payload as preflighted 2026-09-09: 9,920 bytes,
SHA-256 `0e00f22840b14d2317fd81cbdddb4947f7448b5a035d9a1da4f98909042e5cf5`) — via a plan-mode
approval question in the live-browser trust-check session (recorded as what actually happened).
Runs must still use the explicit work database (`MONGO_WORK_DB`); production/default Mongo stays
read-only. The T-021 semantic leg is unblocked but remains queued for the maker/eval flow, not run
in this trust-check session.

**Gate status:** ANSWERED — recorded inline: 2026-09-21 — **A (both)**. Umesh approved both bounded payloads — the U3.1 live-browser
