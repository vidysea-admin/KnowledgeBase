// D-015 probe for ISS-282 / ISS-289: replay the CYCLE-0 recorded model output (raw-proposals.jsonl,
// the run that shipped 8 wrong identity links) through the CURRENT acceptance path, offline.
// Passes only if none of the 8 recorded (session, run, label, name) links ships. Run from the repo root:
//   node --import tsx qa/probes/iss282-c0-replay.mts
import { readFileSync } from "node:fs";
import { join } from "node:path";
const { extractSpeakers, buildSpeakerWindows } = await import("../../packages/index/src/pipeline/speakers-llm.ts");
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const rd = (f: string) => readFileSync(join(OUT, f), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const raw = rd("raw-proposals.jsonl"), live = rd("run-results.jsonl");
let recorded = 0, stillShipped = 0;
for (const L of live) {
  const wrong = (L.resolved ?? []) as { speakerRef: string; displayName: string; evidence: { turnId: string }[] }[];
  if (wrong.length === 0) continue;
  const calls = raw.filter((r) => r.session === L.session && r.outerRun === L.outerRun).sort((a, b) => a.i - b.i);
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", L.session, "turns.json"), "utf8"));
  if (calls.length !== buildSpeakerWindows(turns).length * 3) throw new Error(`call-count drift ${L.session} run${L.outerRun}`);
  let n = 0;
  const replay = async () => {
    const c = calls[n++]!;
    const u = c.entries.find((e: { unparseable?: string }) => e.unparseable !== undefined);
    return { text: u ? String(u.unparseable) : JSON.stringify(c.entries), json: undefined, usage: { inputTokens: 0, outputTokens: 0 }, provider: "replay", model: "recorded", costUsd: 0 };
  };
  const r = await extractSpeakers(turns, replay);
  for (const w of wrong) {
    recorded++;
    const ships = r.resolved.some((s) => s.speakerRef === w.speakerRef && s.displayName === w.displayName);
    if (ships) stillShipped++;
    console.log(`${ships ? "SHIPS  " : "refused"} | ${L.session.slice(0, 32)} run${L.outerRun} | ${w.speakerRef} -> ${w.displayName} (was ev ${w.evidence.map((e) => e.turnId.split("-").pop()).join(",")})`);
  }
}
console.log(`--- ISS-282 recorded wrong links refused: ${recorded - stillShipped}/${recorded}`);
if (stillShipped > 0) process.exitCode = 1;
