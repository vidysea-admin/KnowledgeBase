import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";
import { register } from "tsx/esm/api";
register();
// 09-suggest-regate.mts -- U2.4 re-measure of the CURRENT suggestion path (w17-u24regate). EVALUATION ONLY:
// no Mongo, no job writer, no schema touch. Runs the production extractSpeakersGrounded({ suggest: true }) per pinned
// session with Ollama Cloud (glm-5.3-flash first, deepseek-v4.1-flash fallback). The key is read from the MAIN
// checkout's .env and never printed. Output goes ONLY to new files opened with 'wx'. A hard call cap stops the run.
//   tsx 09-suggest-regate.mts --tag <t> --runs 1,2,3 [--cap N] [--only a,b] [--dry]
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const args = process.argv.slice(2);
const arg = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const TAG = arg("--tag") ?? "";
if (!/^[a-z0-9-]+$/.test(TAG)) throw new Error("--tag required ([a-z0-9-])");
const RUNS = (arg("--runs") ?? "1").split(",").map(Number);
const CAP = Number(arg("--cap") ?? 700);
const only = arg("--only")?.split(",") ?? null;
const ENV_FILE = process.env.KB_ENV_FILE ?? "C:/Users/product/Desktop/KnowledgeBase/.env";
(await import("dotenv")).config({ path: ENV_FILE, quiet: true } as never);
const KEY = process.env.OLLAMA_API_KEY?.trim();
if (!KEY && !args.includes("--dry")) throw new Error("OLLAMA_API_KEY missing");
// glm with think:false leaks its reasoning into content (measured 2026-10-17 ping); "low" returns clean JSON.
const MODELS = ["glm-5.3-flash", "deepseek-v4.1-flash"]; // Ollama first, Gemini deliberately not used
const { extractSpeakersGrounded } = await import("../../../packages/index/src/pipeline/speakers-grounded.ts");
const { resolveSpeakers } = await import("../../../packages/index/src/pipeline/speakers.js");
(await import("./corpus-lock.mjs")).verifyCorpus(); // fail before any provider call if the pinned corpus drifted
const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8"));
const SESSIONS: string[] = gold.sessions.map((g: { session: string }) => g.session);

const RES = join(OUT, `run-results.${TAG}.jsonl`), CALLS = join(OUT, `call-log.${TAG}.jsonl`);
const resFd = openSync(RES, "wx"), callFd = openSync(CALLS, "wx"); // wx: never overwrite evidence
let calls = 0, capped = false;
const byModel: Record<string, number> = {}, failures: Record<string, number> = {};

async function post(model: string, messages: unknown) {
  const res = await fetch("https://ollama.com/api/chat", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, stream: false, think: model.startsWith("glm") ? "low" : false, messages, options: { temperature: 0, seed: 42, num_predict: 4000 } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json() as { message?: { content?: string } };
  if (!j.message?.content?.trim()) throw new Error("empty");
  return j.message.content;
}
let CUR = "";
const complete = async (job: { messages: unknown }) => {
  if (calls >= CAP) { capped = true; throw new Error("call cap reached"); }
  calls++;
  const t0 = Date.now();
  let lastErr = "";
  for (const model of MODELS) for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await post(model, job.messages);
      byModel[model] = (byModel[model] ?? 0) + 1;
      writeSync(callFd, JSON.stringify({ session: CUR, n: calls, model, attempt, ms: Date.now() - t0, chars: text.length, text: text.slice(0, 6000), asks: String((job.messages as any[]).at(-1)?.content ?? "").slice(0, 60) }) + "\n");
      return { text, json: undefined, usage: { inputTokens: 0, outputTokens: 0 }, provider: "ollama-cloud", model, costUsd: 0 };
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); failures[lastErr] = (failures[lastErr] ?? 0) + 1; await new Promise((r) => setTimeout(r, 1500)); }
  }
  writeSync(callFd, JSON.stringify({ session: CUR, n: calls, failed: lastErr, ms: Date.now() - t0 }) + "\n");
  throw new Error(lastErr);
};

const shape = (s: any) => ({ speakerRef: s.speakerRef, displayName: s.displayName, personId: s.personId, evidence: s.evidence, blocks: s.blocks, provenance: s.provenance });
for (const run of RUNS) for (const session of SESSIONS) {
  if (only && !only.some((o) => session.includes(o))) continue;
  if (capped) break;
  CUR = session;
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", session, "turns.json"), "utf8"));
  const ordered = [...turns].sort((a: any, b: any) => a.tStart - b.tStart || a._id.localeCompare(b._id)); // as speaker-suggest.ts does
  const reordered = ordered.filter((t: any, i: number) => t._id !== turns[i]._id).length; // visa: 118 (tStart order != file order); scorer re-derives blocks from this order
  const before = calls, t0 = Date.now();
  if (args.includes("--dry")) { console.log(`[dry] ${session}: ${ordered.length} turns`); continue; }
  const out = await extractSpeakersGrounded(ordered, complete as never, { suggest: true });
  const floor = resolveSpeakers(ordered);
  const line = { session, outerRun: run, turns: ordered.length, reordered, providerCalls: calls - before, ms: Date.now() - t0, degraded: out.degraded?.reason ?? null,
    resolved: out.resolved.map(shape), suggested: (out.suggested ?? []).map(shape), unresolved: out.unresolved,
    floor: floor.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, blocks: s.blocks })) };
  writeSync(resFd, JSON.stringify(line) + "\n");
  console.log(`[run ${run}] ${session}: calls=${line.providerCalls} ms=${line.ms} final=${line.resolved.length} suggested=${line.suggested.length} degraded=${line.degraded ? "yes" : "no"}`);
}
console.log(JSON.stringify({ totalCalls: calls, cap: CAP, capped, byModel, failures }));
closeSync(resFd); closeSync(callFd);
