import "dotenv/config";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { register } from "tsx/esm/api";
register();

// 04-regate-eval.mts — U2.4 phase-3 precision RE-GATE.
// Runs the REAL shipped extractSpeakers (2-of-3 window agreement, ISS-255 handover-direction rule,
// verbatim/shape/discourse/contradiction filters, block scoping) over the 240-block hand-labelled
// corpus with the frozen local qwen3:8b digest. NO Mongo, NO job writer, NO schema touch.
// One JSONL line flushed after every (outer run, session) so partial completion is measurable.
// Raw window proposals are captured per (session, outerRun, internalRun) so ISS-255's recorded
// reproductions (multi-name-per-label inside one run; run-to-run instability) are measurable.

const { extractSpeakers, buildSpeakerWindows } = await import("../../../packages/index/src/pipeline/speakers-llm.ts");
const { resolveSpeakers } = await import("../../../packages/index/src/pipeline/speakers.js");

const BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = "qwen3:8b"; // frozen digest 500a1f067a9f (per qa/manifests/speaker-llm-windows.md)

async function complete(job) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, stream: false, messages: job.messages, think: false, options: { temperature: 0, seed: 42, num_predict: 300 } }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS), // fix cycle 1: a hung call fails the window, never the run
    }).catch((e) => ({ ok: false, status: String(e?.name ?? e) }) as unknown as Response);
    if (res.ok) {
      const j = await res.json();
      return { text: j.message?.content ?? "", json: undefined, usage: { inputTokens: j.prompt_eval_count ?? 0, outputTokens: j.eval_count ?? 0 }, provider: "ollama", model: MODEL, costUsd: 0 };
    }
    if (attempt === 3) throw new Error(`ollama ${res.status} after 3 attempts`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("unreachable");
}

const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
// CLI: --run N (single outer run) | --runs 1,2,3 (sequential, one process) · --only <substr,...>
//      --tag <t> (fix cycle 1: writes run-results.<t>.jsonl / raw-proposals.<t>.jsonl, leaving the
//      cycle-0 files untouched) · --timeout-ms N (per provider call, default 180000)
const args = process.argv.slice(2);
const arg = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const RUNS = (arg("--runs") ?? arg("--run") ?? "1").split(",").map(Number);
const only = arg("--only")?.split(",") ?? null;
const TAG = arg("--tag");
const CALL_TIMEOUT_MS = Number(arg("--timeout-ms") ?? 180000);
const RAW = join(OUT, TAG ? `raw-proposals.${TAG}.jsonl` : "raw-proposals.jsonl");
const RES = join(OUT, TAG ? `run-results.${TAG}.jsonl` : "run-results.jsonl");

// ISS-284: the corpus is PINNED to the gold-labelled session list, never re-discovered from
// data/toc-migrated (a later ingest -- the 2026-09-24 Zoho webinar -- silently grew it to 12).
const SESSIONS: string[] = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8")).sessions.map((g) => g.session);
// Resumable: a (run, session) already flushed to RES is skipped, so a killed process restarts clean.
const DONE = new Set(existsSync(RES) ? readFileSync(RES, "utf8").trim().split("
").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.outerRun}|${j.session}`; }) : []);
let runNo = RUNS[0];

let calls = 0;
let windowLabels: string[] = [];
let windowsPerRun = 0;
const instrumented = async (job) => {
  const r = await complete(job);
  const i = calls++;
  const internalRun = windowsPerRun > 0 ? Math.floor(i / windowsPerRun) + 1 : 0;
  const wIdx = windowsPerRun > 0 ? i % windowsPerRun : 0;
  let parsed;
  try { parsed = JSON.parse(r.text); } catch { parsed = r.text; }
  const entries = Array.isArray(parsed)
    ? parsed.filter((e) => e && typeof e === "object").map((e) => ({ speakerRef: String(e.speakerRef ?? ""), displayName: String(e.displayName ?? ""), turnIds: Array.isArray(e.turnIds) ? e.turnIds.map(String) : [] }))
    : [{ unparseable: String(r.text).slice(0, 120) }];
  appendFileSync(RAW, JSON.stringify({ session: CURRENT.session, outerRun: runNo, i, internalRun, windowIdx: wIdx, windowLabel: windowLabels[wIdx] ?? "?", entries }) + "\n");
  return r;
};

let CURRENT = { session: "" };

for (runNo of RUNS) for (const session of SESSIONS) {
  if (only && !only.some((o) => session.includes(o))) continue;
  if (DONE.has(`${runNo}|${session}`)) { console.log(`[run ${runNo}] ${session}: already flushed, skipped`); continue; }
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", session, "turns.json"), "utf8"));
  const windows = buildSpeakerWindows(turns);
  windowLabels = windows.map((w) => w.label);
  windowsPerRun = windows.length;
  CURRENT = { session };
  const floor = resolveSpeakers(turns);
  calls = 0;
  const t0 = Date.now();
  const r = await extractSpeakers(turns, instrumented);
  const ms = Date.now() - t0;
  const line = {
    session, outerRun: runNo, turns: turns.length, windows: windows.length,
    providerCalls: calls, ms, degraded: r.degraded ? r.degraded.reason : null,
    unresolved: r.unresolved,
    resolved: r.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, personId: s.personId, evidence: s.evidence, blocks: s.blocks })),
    floor: floor.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, evidence: s.evidence.map((e) => e.turnId), blocks: s.blocks })),
    floorTurnsCovered: floor.resolved.reduce((n, s) => n + s.evidence.length, 0),
  };
  appendFileSync(RES, JSON.stringify(line) + "\n");
  console.log(`[run ${runNo}] ${session}: ${ms}ms, calls=${calls}, resolved=${r.resolved.length}, unresolved=${r.unresolved.length}, degraded=${r.degraded ? r.degraded.reason : "no"}`);
  for (const s of r.resolved) console.log(`   ACCEPTED ${s.speakerRef} -> "${s.displayName}" ev=${s.evidence.map((e) => e.turnId).join(",")} blocks=${JSON.stringify(s.blocks)}`);
  for (const s of floor.resolved) console.log(`   FLOOR ${s.speakerRef} -> "${s.displayName}" ev=${s.evidence.map((e) => e.turnId).join(",")}`);
}