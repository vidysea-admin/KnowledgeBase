import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 08-replay.mts — fix cycle 1b: OFFLINE replay of recorded LLM proposals through the CURRENT
// acceptance path. No provider call, no network, no Mongo.
//
// Why this is a valid measurement: `extractSpeakers` is the only non-deterministic step's consumer.
// The model's output for every window call was recorded verbatim (post-JSON.parse) by
// 04-regate-eval.mts in raw-proposals.<tag>.jsonl, keyed by (session, outerRun, call index i). The
// windows are built by `buildSpeakerWindows`, which this cycle does not touch, so call i of a replay
// receives exactly the proposal call i received live. Everything after the provider call — the vote,
// shape/discourse filters, evidence binding, contradiction, block scoping — is deterministic.
// A call recorded as `unparseable` (61 of 2340 in c1, all truncated JSON or prose, none fenced) is
// replayed as its recorded text, which parseJsonLoose also rejects — the live outcome.
//
// Usage (worktree root): tsx <this> --from c1 --tag c1-replay
//   reads  raw-proposals.<from>.jsonl + run-results.<from>.jsonl (for the floor/turn metadata)
//   writes run-results.<tag>.jsonl; score with: 05-score.mjs --tag <tag> --raw-tag <from>
const { extractSpeakers, buildSpeakerWindows } = await import("../../../packages/index/src/pipeline/speakers-llm.ts");
const { resolveSpeakers } = await import("../../../packages/index/src/pipeline/speakers.js");

const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const args = process.argv.slice(2);
const arg = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const FROM = arg("--from") ?? "c1";
const TAG = arg("--tag") ?? `${FROM}-replay`;

const raw = readFileSync(join(OUT, `raw-proposals.${FROM}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const live = readFileSync(join(OUT, `run-results.${FROM}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const lines: string[] = [];
for (const L of live) {
  const calls = raw.filter((r) => r.session === L.session && r.outerRun === L.outerRun).sort((a, b) => a.i - b.i);
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", L.session, "turns.json"), "utf8"));
  const windows = buildSpeakerWindows(turns);
  if (calls.length !== windows.length * 3 || calls.length !== L.providerCalls) {
    throw new Error(`call-count drift ${L.session} run${L.outerRun}: recorded ${calls.length}, windows*3 ${windows.length * 3}, live ${L.providerCalls}`);
  }
  let n = 0;
  const replay = async () => {
    const c = calls[n++];
    const u = c.entries.find((e: { unparseable?: string }) => e.unparseable !== undefined);
    const text = u ? String(u.unparseable) : JSON.stringify(c.entries);
    return { text, json: undefined, usage: { inputTokens: 0, outputTokens: 0 }, provider: "replay", model: "qwen3:8b@500a1f067a9f(recorded)", costUsd: 0 };
  };
  const r = await extractSpeakers(turns, replay);
  if (n !== calls.length) throw new Error(`replay consumed ${n}/${calls.length} calls for ${L.session} run${L.outerRun}`);
  const floor = resolveSpeakers(turns);
  lines.push(JSON.stringify({
    session: L.session, outerRun: L.outerRun, turns: turns.length, windows: windows.length,
    providerCalls: n, ms: 0, degraded: r.degraded ? r.degraded.reason : null, replayOf: FROM,
    unresolved: r.unresolved,
    resolved: r.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, personId: s.personId, evidence: s.evidence, blocks: s.blocks })),
    floor: floor.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, evidence: s.evidence.map((e) => e.turnId), blocks: s.blocks })),
    floorTurnsCovered: floor.resolved.reduce((k, s) => k + s.evidence.length, 0),
  }));
  console.log(`[replay ${FROM} run ${L.outerRun}] ${L.session}: calls=${n}, resolved=${r.resolved.length}, unresolved=${r.unresolved.length}, degraded=${r.degraded ? r.degraded.reason : "no"}`);
  for (const s of r.resolved) console.log(`   ACCEPTED ${s.speakerRef} -> "${s.displayName}" ev=${s.evidence.map((e) => e.turnId).join(",")} blocks=${JSON.stringify(s.blocks)}`);
}
writeFileSync(join(OUT, `run-results.${TAG}.jsonl`), lines.join("\n") + "\n");
