// 13-replay-cycle2.mts -- U2.4 fix cycle 2 (D-132, pending append): OFFLINE replay of the LIVE re-gate's recorded
// proposals (Ollama Cloud, deepseek-v4-pro and gpt-oss:120b; whole-session proposer, 3 internal runs x 3 outer runs
// x 11 sessions) through the cycle-2 gate. NO provider call.
//
//   node --import tsx <this> --from oc-gpt-oss-120b --verifier oracle|pessimist --mode independent-pair|single-verified
//
// oracle    : answers from gold. yes iff the block under test carries gold person == the proposed name (UPPER bound: a
//             perfect verifier).
// pessimist : always yes (WORST case: a verifier that adds nothing; the deterministic layer alone must carry precision).
// Score with: node <dir>/05-score.mjs --tag <tag> --raw-tag <from>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { groundSpeakerProposals } = await import("../../../packages/index/src/pipeline/speakers-grounded.ts");
const { resolveSpeakers } = await import("../../../packages/index/src/pipeline/speakers.ts");
const { parseJsonLoose } = await import("../../../packages/ai/src/json.ts");

const OUT = "qa/evidence/u24-smart-cycle2-2026-10-12";
const args = process.argv.slice(2);
const arg = (k: string, d: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1]! : d);
const FROM = arg("--from", "oc-gpt-oss-120b");
const VERIFIER = arg("--verifier", "pessimist");
const MODE = arg("--mode", "independent-pair") as "independent-pair" | "single-verified";
const TAG = `${VERIFIER}-${MODE === "independent-pair" ? "pair" : "single"}-${FROM.replace(/^oc-/, "")}`;
const POSITIONAL = /^spk:\d+$/;

const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8")).sessions as { session: string; blocks: { block: number; person: string | null }[] }[];
const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const sub = (a: string[], b: string[]) => { for (let i = 0; i + a.length <= b.length; i++) if (a.every((x, k) => b[i + k] === x)) return true; return false; };
const pm = (a: string, g: string | null) => { if (!g) return false; const x = norm(a).split(" "), y = norm(g).split(" "); return sub(x, y) || sub(y, x); };
const OVERRIDE: Record<string, string> = { "2026-07-30-in-focus-3-t071": "Shithij" };

type T = { _id: string; speakerRef: string; text: string };
const raw = readFileSync(join(OUT, `raw-proposals.${FROM}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const groups = new Map<string, any[]>();
for (const r of raw) { const k = `${r.session}|${r.outerRun}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }

const lines: string[] = [];
let verifierCalls = 0;
for (const [k, rs] of groups) {
  const [session, outer] = k.split("|") as [string, string];
  const turns: T[] = JSON.parse(readFileSync(join("data/toc-migrated", session, "turns.json"), "utf8"));
  // block index -> gold person, blocks defined exactly as the pipeline does
  const blocks: { label: string; s: number; e: number }[] = [];
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]!.speakerRef ?? "";
    if (!POSITIONAL.test(ref)) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.label === ref && last.e === i - 1) last.e = i; else blocks.push({ label: ref, s: i, e: i });
  }
  const g = gold.find((x) => x.session === session)!.blocks;
  const personAt = (start: number): string | null => { const bi = blocks.findIndex((b) => b.s === start); return bi < 0 ? null : (OVERRIDE[turns[start]!._id] ?? g[bi]?.person ?? null); };

  rs.sort((a, b) => a.internalRun - b.internalRun);
  const runs = rs.map((r) => { try { return parseJsonLoose(r.text); } catch { return null; } });
  const verifier = VERIFIER === "oracle"
    ? async (q: { name: string; blockStart: number }) => { verifierCalls++; return { verdict: pm(q.name, personAt(q.blockStart)) ? "yes" as const : "no" as const }; }
    : async () => { verifierCalls++; return { verdict: "yes" as const }; };
  const r = await groundSpeakerProposals(turns as any, runs, verifier, { corroboration: MODE });
  const floor = resolveSpeakers(turns as any);
  lines.push(JSON.stringify({
    session, outerRun: +outer, turns: turns.length, windows: 1, providerCalls: 0, ms: 0, degraded: null, replayOf: FROM, verifier: VERIFIER, mode: MODE,
    unresolved: r.unresolved,
    resolved: r.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, personId: s.personId, evidence: s.evidence, blocks: s.blocks, provenance: s.provenance })),
    floor: floor.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, evidence: s.evidence.map((e) => e.turnId), blocks: s.blocks })),
    floorTurnsCovered: floor.resolved.reduce((n, s) => n + s.evidence.length, 0),
  }));
}
writeFileSync(join(OUT, `run-results.${TAG}.jsonl`), lines.join("\n") + "\n");
console.log(`${TAG}: ${lines.length} session-runs, simulated verifier calls=${verifierCalls}; score with: node ${OUT}/05-score.mjs --tag ${TAG} --raw-tag ${FROM}`);
