# ARCHITECTURE — current ground truth (as of: 2026-10-28, last change: D-199)

<!-- Lab Protocol STATE file. Mutable, but SURGICALLY: only sections listed in an
     authorizing DECISIONS entry's Changes-authorized field may change, and only
     during /landplane. Section numbering matters: the session-start hook injects
     sections 1-3 + 6. Hard cap: 150 lines (D-003). -->

## 1. System in one paragraph

**Living Knowledge Base** is a hosted, database-backed "brain" — the same router shape as
Vidysea's own `/brain` (operating-brain `INDEX.md` → deep pages → raw transcripts), moved from
markdown-on-disk into MongoDB with an API. It ingests session recordings, documents, and
messages (starting with TOC community webinars, then WhatsApp expert groups), transcribes and
attributes every fact to a speaker + timestamp, indexes every source type vectorless (provenance-
bound trees + keyword retrieval + graph, D-173), and answers questions through a CRAG-style
router that trusts internal knowledge first and falls back to the web only when internal
coverage is insufficient, always citing sources separately. Output = a queryable, cited
knowledge base served via a Developer API, and ultimately an **AI virtual counsellor** built as
a client of that API — with the long-range goal of beating top human counsellors head-to-head.
Read next: `docs/HLD.md` (pipeline stage status, deployment) and `docs/LLD.md` (data model, API, flows).

## 2. FROZEN CONTRACTS (machine-checked — do not edit here)
The authoritative versions live in contracts/contracts.json and are enforced by
contracts/verify_contracts.py. This section only lists them:

- *(none yet — hypotheses live in §3 until they meet the graduation gate)*

## 3. WORKING HYPOTHESES (current best understanding; may change via /landplane)

- **H1 — Vectorless for every source type.** Provenance-bound trees (PageIndex pattern), keyword
  retrieval over turns/chunks and graph relationships, with bounded LLM navigation; no embedding
  step on ingest (`retrievalMode: "vectorless"`). Vector code stays dormant. D-173 superseded the
  original two-index split (D-000, D-021).
- **H2 — Internal-first, web-fallback, CRAG-shaped.** tree-search → retrieval evaluator (score
  per candidate) → internal answer, or Tavily web search → refine → merged answer when coverage is
  insufficient (`insufficient_coverage`), web sources cited separately. Since D-000.
- **H3 — No fact without provenance.** Every claim carries `evidence[]` pointing to a turn
  (speaker, timestamp, session). LLMs write knowledge; deterministic code validates schema
  before it lands. New claims land `needs-review`; answers/outputs may cite them with a visible
  unverified label (D-199 ruling; implementation pending). Since D-000; basis of a future frozen
  contract (D-002).
- **H4 — Speaker identity is alias-based, never a single string.** Mirrors
  `sources/whatsapp_msg/src/wa/identity.ts`'s LID/PN alias pattern. Since D-000.
- **H5 — MongoDB, matching the existing stack.** New collections extend the Mongo + per-tenant
  scoping that `sources/whatsapp_msg/` already runs. Since D-000. Live DB `lkb_prod` (D-186).
- **H6 — Sub-projects are sources, not separate products.** `raw/TOC/` (data) and
  `sources/whatsapp_msg/` (submodule with its own Lab Protocol) feed one root knowledge base.
- **H7 — The counsellor is a client of the API, not a separate brain.** Since D-000.
- **H8 — Provided-first capture.** Per source, capture order is organizer-provided recording →
  public recording → attendee notes/live transcript → silent capture ONLY when no alternative
  exists. Silent full capture stays a supported capability (default `consent_policies` row
  `silent-full`) but is the last resort. Every captured fact is diarized and cited (who / when /
  which session). Since D-002, reworded by D-008.
- **H9 — Pluggable STT.** `packages/ai/stt` seam (`transcribe(audio, opts) → turns[]`); Gemini
  is the active transcriber (audio-capable adapter), Whisper remains a supported alternative.
  Since D-004, current per D-173 and `config/ai-routing.yaml`.
- **H10 — Multi-provider AI chain.** Five adapters from day one (gemini, anthropic API-key +
  OAuth/Claude-Code modes, openai, ollama, claude-code), each exposing `listModels()` for a
  per-provider model dropdown; the chain per jobKind is a user-editable ordered list (len ≥ 1) in
  `config/ai-routing.yaml`. Current: transcribe → gemini; summarize/claims/decisions/ask →
  ollama-cloud (D-173); speakers → local ollama. No single-AI dependency. Since D-005.

## 4. Directory map (D-003 monorepo tree — pnpm workspaces, ONE working tree, never a 2nd checkout)

```
D:\KnowledgeBase\
  ARCHITECTURE.md   docs/DECISIONS.md   docs/goal.md (vision transcript)   docs/adr/NNNN-*.md (≤60 lines each)
  package.json · pnpm-workspace.yaml · tsconfig.base.json · pnpm-lock.yaml · .gitmodules
  structure.config.json (ALL budgets) · .dependency-cruiser.cjs (§5 dependency rules)
  schema/       one <collection>.schema.json each · fixtures/ · validate.py — SOURCE OF TRUTH
  migrations/   migrate-mongo, one change each — the ONLY place shape/index changes (T-018)
  scripts/      gen-types.mjs (schema → packages/core/src/generated) · append_decision.ps1 · lint-*.mjs + lib/walk.mjs (T-017)
  packages/
    core/         src/generated/<collection>.ts (GENERATED, never edited) · src/domain/ pure fns, NO I/O
    db/           src/collections/<coll>.ts — coll(tenantId).find(); tenant-less query = type error
    ai/           provider.ts · providers/{gemini,anthropic,openai,ollama,claude-code}.ts · stt/ · router.ts
    ingest/       source.ts · sources/{recording,document,url,whatsapp,meeting-bot}.ts
    index/        src/tree/{build,search}.ts (port of tree_index/) · vector/ · graph/
    ask/          src/{evaluator,router}.ts (port of ask_router/)
    meeting-bot/  {profile,join,record,consent}.ts — Playwright persistent context
  apps/api/       routes/<resource>.ts (one per resource) · server.ts (<80 LOC)
  workers/transcribe/  Python ML worker; reads schema/ directly; talks via job queue only
  sources/whatsapp_msg/  git submodule (own .git, ARCHITECTURE, DECISIONS — referenced, never duplicated)
  raw/TOC/        data, not code (23 webinar sessions, KNOWLEDGE-BANK.md, transcripts)
  qa/             maker-checker contracts · manifests · verdicts · issues ledger
  contracts/      frozen, machine-checked invariants (§2)      reference/  deck screenshots (gitignored)
```

| Path | Owns | Must NOT contain |
|---|---|---|
| `docs/goal.md` | Vision transcript (CEO call) — immutable reference (moved from root by T-017: root `.md` line cap) | Anything else |
| `Living-Knowledge-Base-Architecture.html` | Piloted TOC-slice architecture, consistent with this file | — |
| `schema/` | JSON Schemas + fixtures + Python validator | Hand-written TS types (they are generated) |
| `packages/*` | Application logic, one exported symbol per concept | Data, media, probes, `.py` app logic |
| `raw/`, `sources/` | Data and source repos | Application/API code |

## 5. Cross-cutting rules & hard budgets

- **Tenancy:** every knowledge-layer row carries `tenantId`; no handler accepts a tenant id from
  the client — session/auth-derived only. Every index leads with `tenantId`.
- **Idempotency:** all knowledge writes are upserts keyed on stable natural ids.
- **Never silently drop:** a source that fails is logged as a gap row; seen-vs-processed reconcile.
- **No fact without a citation** (H3) — enforced at the schema-validator layer.
- **Schema-first, one definition:** `schema/*.schema.json` is the only place a collection's shape
  is written; TS types are generated (`pnpm gen:types`, drift caught by `--check`); Python
  validates the same files. No hand-copied field lists anywhere.
- **Dependency rules (downward only):** `apps → packages/{ask,ingest,index,ai,db,core}`;
  `ask/index/ingest → ai, db, core`; `ai, db → core`; `core → nothing`; `meeting-bot → ingest
  (source interface), core`; `workers` import nothing (queue contract only).
- **Budgets (D-003, CI-enforced by T-017):** every number (LOC per file, files per dir, root loose
  files, root `.md` / `ARCHITECTURE.md` / README line caps, migration-script location) lives ONLY in
  root `structure.config.json`; `scripts/lint-*.mjs` read it, `pnpm lint:structure` enforces it, and
  `.dependency-cruiser.cjs` enforces the dependency rules above. Also: one exported symbol per concept
  · onboarding = README + this file only · build artefacts, probes, media never in repo root.
- **Provenance + purge gate (D-008):** a recording may be purged only when every claim citing it
  is verified; a ±15 s evidence clip per cited turn is retained permanently.
- **Structure holds iff:** `pnpm install` · `pnpm -r typecheck && pnpm -r test` · `pnpm gen:types
  --check` · `python schema/validate.py` · `pnpm lint:structure` · `pnpm test:lint` (= `.github/workflows/ci.yml`).

## 6. OPEN QUESTIONS (deliberately undecided — the agent must NOT resolve these
unilaterally; they resolve only through /checkpoint verdicts)

- **Q1:** Product name — keep "Living Knowledge Base" (from the deck) or rename?
- **Q2:** ~~Hosting stack~~ **CLOSED by D-003:** TS pnpm monorepo (this tree); `whatsapp_msg`
  is a workspace source (submodule), not the product shell.
- **Q3:** Who are the "top counsellors" for the championship, and who judges? Needed before the
  eval-harness work (T-012) starts. Question bank sources fixed by D-007.
- **Q4:** ~~Consent rule~~ **CLOSED by D-002 → D-008:** provided-first capture (H8); silent
  capture last resort; provenance frozen. Legal exposure recorded once in D-002 and accepted.
- **Q5:** ~~Dedicated vector DB?~~ **CLOSED by D-021, then moot by D-173:** retrieval is
  vectorless; the brute-force cosine retriever in `packages/index/src/vector/` is dormant.
- **Q6 (gated purge level):** what "processed to a defined level" means before media purge —
  D-008 fixes the gate (all citing claims verified + retained ±15 s evidence clips); the
  concrete retention values and purge job design are T-026, not yet decided.
