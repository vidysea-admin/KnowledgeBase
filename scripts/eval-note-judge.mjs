#!/usr/bin/env node
/**
 * T-040 / D-144 live evaluation of the note judge against a REAL judge model. NOT run in the unit that added it.
 *
 *   node scripts/eval-note-judge.mjs                                  -> DRY RUN: prints the plan, makes no model call
 *   node scripts/eval-note-judge.mjs --live --max-cost-usd 0.50       -> live run through config/ai-routing.yaml `note-judge`
 *
 * Optional: --batch-size N (default 8), --out report.json, --chain claude-code,gemini (override the route for this run).
 * Corpus: every recorded ISS-T040GEN-* attack (labelled "different") plus faithful controls (labelled "same") from
 * packages/index/src/pipeline/notes/judge-corpus.ts. Reports per-id refusal counts, control false-drops, tokens and cost.
 * Cost cap: cost is read from each reply's costUsd and checked BEFORE every batch; once the running total reaches the cap the
 * remaining cases are NOT sent (reported as "not-judged"), so overshoot is at most one batch. --live without --max-cost-usd is refused. No Mongo, no job rows written.
 * The exit code is 0 even when the judge misses attacks: this is a measurement, thresholds are the Approver's call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { register } from "tsx/esm/api";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "..");

register();
const { ATTACKS, CONTROLS } = await import("../packages/index/src/pipeline/notes/judge-corpus.ts");
const { createLlmNoteJudge, makeJudgeContext, judgeCandidates } = await import("../packages/index/src/pipeline/notes/judge.ts");

const live = flag("--live"), batchSize = Number(val("--batch-size", "8"));
const cap = val("--max-cost-usd") === undefined ? undefined : Number(val("--max-cost-usd"));
const cases = [
  ...ATTACKS.map((a, k) => ({ key: `${a.id}#${k}`, id: a.id, label: "different", text: a.text, quote: a.quote })),
  ...CONTROLS.map((c, k) => ({ key: `CONTROL#${k}`, id: "CONTROL", label: "same", text: c.text, quote: c.quote })),
];
console.error(`corpus: ${ATTACKS.length} recorded attacks + ${CONTROLS.length} controls = ${cases.length} notes; batch ${batchSize}; ~${Math.ceil(cases.length / batchSize)} calls`);

if (!live) { console.error("DRY RUN (no --live): no model call made."); process.exit(0); }
if (!Number.isFinite(cap) || cap <= 0) { console.error("refused: --live requires --max-cost-usd <positive number>"); process.exit(2); }
if (!Number.isInteger(batchSize) || batchSize < 1) { console.error("refused: --batch-size must be a positive integer"); process.exit(2); }

// Live wiring, only reached with --live: the real providers behind the router, a no-op job writer (nothing persisted).
const { complete: routeComplete, parseRoutingYaml, GeminiProvider, ClaudeCodeProvider, OllamaProvider } = await import("../packages/ai/src/index.ts");
const { realTransport } = await import("../apps/api/src/ai-transport.ts");
const chains = parseRoutingYaml(readFileSync(resolve(root, "config/ai-routing.yaml"), "utf8"));
if (val("--chain")) chains["note-judge"] = val("--chain").split(",").map((s) => s.trim()).filter(Boolean);
if (!chains["note-judge"]?.length) { console.error("refused: no note-judge route configured"); process.exit(2); }
const providers = {
  gemini: new GeminiProvider(realTransport, { apiKey: process.env.GEMINI_API_KEY ?? "" }),
  "claude-code": new ClaudeCodeProvider(realTransport),
  ollama: new OllamaProvider(realTransport, { baseUrl: process.env.OLLAMA_BASE_URL }),
};
const routed = (job) => routeComplete("note-judge", job, { chains, providers, write: async () => {}, tenantId: "eval-note-judge" });

// One independent single-turn session per case, so every case is judged against only its own source.
const judge = createLlmNoteJudge(routed), jc = makeJudgeContext(judge, { maxCostUsd: cap, batchSize });
const verdictOf = new Map();
const byCase = cases.map((c) => ({ c, turn: { _id: c.key, tenantId: "eval", sessionId: "eval", speakerRef: "spk:1", tStart: 0, tEnd: 1, text: c.text } }));
const turns = byCase.map((x) => x.turn);
const keep = await judgeCandidates(jc, turns, byCase.map(({ c }) => ({ id: c.key, kind: "insight", note: c.quote, evidence: [{ turnId: c.key, sessionId: "eval", quote: c.quote }] })));
for (const e of jc.sidecar.entries) verdictOf.set(e.id, e);

const perId = {};
let controlFalseDrops = 0;
for (const { c } of byCase) {
  const row = (perId[c.id] ??= { cases: 0, refused: 0, shipped: 0, notJudged: 0 });
  row.cases++;
  const entry = verdictOf.get(c.key), notJudged = entry && /cost cap/.test(entry.reason);
  if (notJudged) row.notJudged++;
  else if (c.label === "different") keep.has(c.key) ? row.shipped++ : row.refused++;
  else if (!keep.has(c.key)) controlFalseDrops++;
}
const report = { model: jc.sidecar.models, route: chains["note-judge"], cap, perId, controlFalseDrops, cost: { usd: jc.sidecar.costUsd, inputTokens: jc.sidecar.inputTokens, outputTokens: jc.sidecar.outputTokens, calls: jc.sidecar.calls }, sidecar: jc.sidecar };
if (val("--out")) writeFileSync(resolve(val("--out")), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
