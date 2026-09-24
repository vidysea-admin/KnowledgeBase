import "dotenv/config";
import { readFileSync, appendFileSync, readdirSync } from "node:fs";
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
    });
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
const RAW = join(OUT, "raw-proposals.jsonl");
const RES = join(OUT, "run-results.jsonl");

const SESSIONS = readdirSync("data/toc-migrated", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  .filter((s) => {
    const t = JSON.parse(readFileSync(join("data/toc-migrated", s, "turns.json"), "utf8"));
    return t.some((x) => /^spk:\d+$/.test(x.speakerRef ?? ""));
  });

// CLI: --run N (outer run number, default 1) --only <substring,...> (resume chunking)
const args = process.argv.slice(2);
const runNo = Number(args[args.indexOf("--run") + 1] ?? 1);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : null;

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

for (const session of SESSIONS) {
  if (only && !only.some((o) => session.includes(o))) continue;
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
  for (const s of r.resolved) console.log(`   ACCEPTED ${s.speakerRef} -> "${s.displayName}" ev=${s.evidence.map((e) => e.turnId).join(",")}`);
  for (const s of floor.resolved) console.log(`   FLOOR ${s.speakerRef} -> "${s.displayName}" ev=${s.evidence.map((e) => e.turnId).join(",")}`);
}