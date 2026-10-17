#!/usr/bin/env node
/**
 * Multi-model consensus AI drafts for the T-022 calibration review (30 pairs) and the U2.2 extraction review (72 claims).
 * Authority: D-163 (AI drafts allowed, "clearly marked as AI drafts and never as humanGold"), D-164 (spend approved; Ollama
 * GLM/DeepSeek first, Gemini last). Every output is labelled "derived, not humanGold". This tool NEVER sets humanGold, never
 * records an approval, never writes the authoritative calibration store and never edits the hash-bound review packets:
 * drafts go to NEW sidecar files under data/eval/derived-drafts/ (refused if the file exists), keyed by the packet item ids
 * and input hashes so the review UI/builders can merge them without breaking the packet bindings.
 *
 * Usage (from repo root; keys are read from the process env or a --env-file, never printed):
 *   node scripts/eval/derived-drafts.mjs t022 --max-calls 120 [--env-file <abs .env>] [--out <new file>] [--data-root <byte-exact tree>]
 *   node scripts/eval/derived-drafts.mjs u22  --max-calls 300 [--env-file <abs .env>] [--out <new file>] [--data-root <byte-exact tree>]
 * Models (D-164 order): ollama glm-5.3-flash, ollama deepseek-v4.1-flash, then gemini (tie-break only, on disagreement).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT_DIR = "data/eval/derived-drafts";
export const DRAFT_LABEL = "derived, not humanGold";
export const DRAFT_STATUS = "AI_DRAFT_REQUIRES_INDIVIDUAL_UMESH_APPROVAL";
/** D-164 order. Gemini is the LAST resort and only breaks ties / fills a missing vote. */
export const DEFAULT_MODELS = [
  { provider: "ollama", model: "glm-5.3-flash" },
  { provider: "ollama", model: "deepseek-v4.1-flash" },
  { provider: "gemini", model: "gemini-2.5-flash" },
];
export const SUPPORT_LABELS = ["supported", "partially_supported", "unsupported", "unavailable"];
export const SCORE_AGREEMENT_SPREAD = 0.2;

const round = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** votes: [{model, score:number|null, rationale}] ; null/NaN/out-of-range scores (fallbacks, failures) are not votes. */
export function consensusScore(votes) {
  const valid = votes.filter((v) => typeof v.score === "number" && Number.isFinite(v.score) && v.score >= 0 && v.score <= 1);
  const flags = [];
  if (valid.length < votes.length) flags.push("invalid-or-failed-vote");
  if (valid.length < 2) {
    flags.push("insufficient-models", "needs-full-human-score");
    return { score: null, agreement: "insufficient", spread: null, validVotes: valid.length, flags };
  }
  const scores = valid.map((v) => v.score), spread = Math.max(...scores) - Math.min(...scores);
  const agreed = spread <= SCORE_AGREEMENT_SPREAD + 1e-9;
  if (!agreed) flags.push("models-disagree", "look-closely");
  return { score: round(median(scores)), agreement: agreed ? "agree" : "disagree", spread: round(spread), validVotes: valid.length, flags };
}

/** votes: [{model, label, rationale}] with label in SUPPORT_LABELS; unknown labels are not votes. */
export function consensusLabel(votes) {
  const valid = votes.filter((v) => SUPPORT_LABELS.includes(v.label));
  const flags = [];
  if (valid.length < votes.length) flags.push("invalid-or-failed-vote");
  if (valid.length < 2) { flags.push("insufficient-models", "needs-full-human-review"); return { label: null, agreement: "insufficient", tally: {}, validVotes: valid.length, flags }; }
  const tally = {}; for (const v of valid) tally[v.label] = (tally[v.label] ?? 0) + 1;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1] || SUPPORT_LABELS.indexOf(a[0]) - SUPPORT_LABELS.indexOf(b[0]));
  const unanimous = ranked.length === 1, strictMajority = ranked[0][1] > valid.length / 2;
  if (!unanimous) flags.push("models-disagree", "look-closely");
  if (!strictMajority) { flags.push("no-majority"); return { label: null, agreement: "disagree", tally, validVotes: valid.length, flags }; }
  return { label: ranked[0][0], agreement: unanimous ? "agree" : "majority", tally, validVotes: valid.length, flags };
}

const basis = (votes) => votes.map((v) => ({ model: v.model, ...(v.score !== undefined ? { score: v.score } : { label: v.label }), rationale: String(v.rationale ?? "").slice(0, 400) }));

export function t022Draft(item, votes) {
  const c = consensusScore(votes);
  return { id: item.id, inputSha256: item.inputSha256, humanGold: false,
    aiDraft: { label: DRAFT_LABEL, status: DRAFT_STATUS, score: c.score, agreement: c.agreement, spread: c.spread, flags: c.flags, validVotes: c.validVotes,
      rationale: c.score === null ? "Fewer than two valid model votes; no draft score. Score from scratch." : `Median of ${c.validVotes} model scores (${votes.map((v) => `${v.model}=${v.score ?? "n/a"}`).join(", ")}).`,
      perModel: basis(votes) },
    humanReview: { score: null, rationale: null, approvedBy: null, approvedAt: null } };
}

export function u22Draft(entry, votes) {
  const c = consensusLabel(votes);
  const best = votes.find((v) => v.label === c.label && v.rationale);
  return { claimId: entry.claimId, claimRecordSha256: entry.claimRecordSha256, sourceBindingSha256: entry.sourceBindingSha256, humanGold: false,
    aiDraft: { label: DRAFT_LABEL, status: DRAFT_STATUS, literalCitationSupport: c.label, agreement: c.agreement, tally: c.tally, flags: c.flags, validVotes: c.validVotes,
      literalRationale: c.label === null ? "No usable model majority; rate from the cited passages directly." : (best?.rationale ?? ""),
      replacementCitationSupport: null, replacementRationale: null, factualTruth: "unknown", omissions: "unknown", topicPrecision: "unknown", personPrecision: "unknown",
      reviewBasis: "Multi-model rating of the current literal source passages only; no factual check. Replacement proposals are not rated here.", perModel: basis(votes) },
    humanReview: { status: "unreviewed", approvedBy: null, approvedAt: null, decision: null, sourcePacketSha256: null }, bindingThresholds: null };
}

/** Throws if any value anywhere claims human gold or a human approval. The last gate before any write. */
export function assertNoHumanGold(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoHumanGold(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/^humanGold(Verified)?$/.test(k) && v !== false) throw new Error(`refused: ${path}.${k} must be false`);
      if (["approvedBy", "approvedAt", "decision"].includes(k) && v !== null) throw new Error(`refused: ${path}.${k} must be null`);
      if (k === "status" && v === "approved") throw new Error(`refused: ${path}.status approved`);
      assertNoHumanGold(v, `${path}.${k}`);
    }
  }
}

export function safeOutPath(out, root = ROOT) {
  const target = resolve(root, out ?? ""), rel = relative(resolve(root, OUT_DIR), target);
  if (!out || rel.startsWith("..") || isAbsolute(rel) || !rel.endsWith(".json")) throw new Error(`refused: output must be a .json file inside ${OUT_DIR}/`);
  if (existsSync(target)) throw new Error("refused: output exists; drafts never overwrite a file");
  return target;
}

export function writeSidecar(path, doc) {
  assertNoHumanGold(doc);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return path;
}

/** Runs the models for one item in D-164 order; Gemini only when the first two disagree or one is missing. Cap-checked before each call. */
export async function gatherVotes(item, judges, budget, kind) {
  const votes = [];
  const run = async (j) => {
    if (budget.used >= budget.max) { budget.capReached = true; return; }
    budget.used++;
    try { votes.push({ model: `${j.provider}/${j.model}`, ...(await j.judge(item)) }); }
    catch (e) { votes.push({ model: `${j.provider}/${j.model}`, [kind === "score" ? "score" : "label"]: null, rationale: `call failed: ${String(e?.message ?? e).slice(0, 120)}` }); }
  };
  const primary = judges.filter((j) => j.provider === "ollama"), last = judges.filter((j) => j.provider === "gemini");
  for (const j of primary) await run(j);
  const c = kind === "score" ? consensusScore(votes) : consensusLabel(votes);
  if (last.length && (c.agreement === "disagree" || c.agreement === "insufficient" || c.agreement === "majority")) for (const j of last) await run(j);
  return votes;
}

// ---- real providers (only constructed in the live CLI) ----
export function parseEnvFile(text, wanted = ["OLLAMA_API_KEY", "GEMINI_API_KEY"]) {
  const env = {};
  for (const line of text.split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && wanted.includes(m[1])) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
  return env;
}

const SUPPORT_PROMPT = [
  "You are rating literal citation support for an extracted claim. You see the claim and the transcript passages it cites.",
  "supported = the cited passages establish the claim; partially_supported = a material component is not established;",
  "unsupported = these passages do not establish it; unavailable = no cited passage is shown.",
  "Judge ONLY the displayed passages; do not use outside knowledge. Respond with ONLY JSON: {\"support\":\"supported|partially_supported|unsupported|unavailable\",\"rationale\":\"<one sentence>\"}.",
].join(" ");

export function u22Prompt(entry) {
  const passages = entry.literalCitationContexts.map((c, i) => {
    const m = c.current?.available ? c.current.matches?.[0]?.record : null;
    return m ? `[${i + 1}] speaker ${m.speakerRef} @${m.tStart}s: ${m.text}` : `[${i + 1}] (cited turn ${c.turnId} is not available)`;
  });
  return `Claim: ${entry.persistedClaim.text}\n\nCited passages:\n${passages.join("\n") || "(none)"}`;
}

async function makeRealJudges(models, env, kinds, stats) {
  const { createEvalComplete, createLlmScoreFn, redactor } = await import("./llm-eval.mjs");
  const { parseJsonLoose } = await import("../../packages/ai/src/index.ts");
  const redact = redactor([env.OLLAMA_API_KEY, env.GEMINI_API_KEY]);
  const judges = [];
  for (const m of models) {
    if (m.provider === "gemini" ? !env.GEMINI_API_KEY : !env.OLLAMA_API_KEY) continue;
    const complete = await createEvalComplete({ provider: m.provider, model: m.model, baseUrl: "https://ollama.com" }, env);
    const counted = async (job) => { stats.calls++; return complete(job); };
    if (kinds === "score") {
      const { scoreFn } = await createLlmScoreFn(counted, { maxCalls: 10 ** 6 });
      judges.push({ ...m, judge: async (item) => { const r = await scoreFn(item.query, item.node); return r.fellBack ? { score: null, rationale: "provider fell back to heuristic; vote discarded" } : { score: r.score, rationale: redact(r.reason) }; } });
    } else {
      judges.push({ ...m, judge: async (entry) => {
        const r = await counted({ kind: "evaluator", messages: [{ role: "system", content: SUPPORT_PROMPT }, { role: "user", content: u22Prompt(entry) }] });
        const p = parseJsonLoose(r.text);
        return { label: SUPPORT_LABELS.includes(p?.support) ? p.support : null, rationale: redact(String(p?.rationale ?? "")) };
      } });
    }
  }
  return judges;
}

export async function run(kind, { items, judges, maxCalls, now = () => new Date().toISOString(), extra = {} }) {
  const budget = { used: 0, max: maxCalls, capReached: false };
  const out = [];
  for (const item of items) {
    if (kind === "u22" && !item.literalCitationContexts.some((c) => c.current?.available)) {
      // Deterministic, no model call: nothing is displayed to rate.
      out.push(u22Draft(item, [{ model: "rule/no-current-passage", label: "unavailable", rationale: "No cited turn is available in the current source." }, { model: "rule/no-current-passage-2", label: "unavailable", rationale: "Deterministic rule, not a model." }]));
      continue;
    }
    const votes = await gatherVotes(item, judges, budget, kind === "t022" ? "score" : "label");
    out.push(kind === "t022" ? t022Draft(item, votes) : u22Draft(item, votes));
  }
  return { format: kind === "t022" ? "calibration-derived-drafts-v1" : "extraction-derived-drafts-v1", label: DRAFT_LABEL, status: DRAFT_STATUS, humanGold: false,
    generatedAt: now(), authority: "D-163 (AI drafts, never humanGold), D-164 (Ollama GLM/DeepSeek first, Gemini last)",
    models: judges.map((j) => `${j.provider}/${j.model}`), calls: { used: budget.used, max: budget.max, capReached: budget.capReached },
    note: "Sidecar only: the hash-bound review packet and the authoritative store are untouched. Each item is confirmed or edited individually by Umesh.",
    ...extra, items: out };
}

async function main(argv) {
  const [kind] = argv, dataRoot = resolve(argv.includes("--data-root") ? argv[argv.indexOf("--data-root") + 1] : ROOT), val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  if (!["t022", "u22"].includes(kind)) throw new Error("usage: derived-drafts.mjs t022|u22 --max-calls <n>");
  const maxCalls = Number(val("--max-calls")); if (!Number.isFinite(maxCalls) || maxCalls <= 0) throw new Error("refused: --max-calls <n> required");
  const date = new Date().toISOString().slice(0, 10), out = safeOutPath(val("--out") ?? `${OUT_DIR}/${kind}-derived-drafts-${date}.json`);
  const env = { ...parseEnvFile(val("--env-file") ? readFileSync(val("--env-file"), "utf8") : ""), ...Object.fromEntries(["OLLAMA_API_KEY", "GEMINI_API_KEY"].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
  let items, extra;
  if (kind === "t022") { const p = JSON.parse(readFileSync(resolve(dataRoot, "data/eval/calibration-human-review.json"), "utf8")); items = p.items; extra = { source: "data/eval/calibration-human-review.json", rubric: p.rubric }; }
  else { const { loadBundle } = await import("./extraction-review.mjs"); const b = loadBundle(dataRoot); items = b.entries; extra = { sourcePacketSha256: b.sourcePacketSha256, draftIndexSha256: b.draftIndexSha256 }; }
  const stats = { calls: 0 }, judges = await makeRealJudges(DEFAULT_MODELS, env, kind === "t022" ? "score" : "label", stats);
  if (judges.filter((j) => j.provider === "ollama").length < 2) throw new Error("refused: need both Ollama models (OLLAMA_API_KEY missing?); live run pending");
  const doc = await run(kind, { items, judges, maxCalls, extra });
  writeSidecar(out, doc);
  const flagged = doc.items.filter((d) => d.aiDraft.flags.length).length;
  console.log(JSON.stringify({ kind, out: relative(ROOT, out).split(sep).join("/"), items: doc.items.length, calls: doc.calls, flaggedForCloseLook: flagged, humanGold: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e.message ?? e).slice(0, 300)); process.exitCode = 2; });
}
