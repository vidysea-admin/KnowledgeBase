// 09-replay-grounded.mts -- U2.4 model-judged attribution (D-132, pending append): OFFLINE replay of the recorded
// D-131 proposals (qwen-class cloud models) through the NEW grounding gate. No provider call, no network.
//
//   node --import tsx <this> --from oc-gpt-oss-120b --mode strict|synthetic
//
// strict    : the recorded entries as they are. They carry NO evidenceQuote/evidenceKind, so the new contract
//             refuses every one (abstain). This is the honest replay: the old proposals cannot be graded by a gate
//             that requires a quote they never made.
// synthetic : STRESS TEST, not a model measurement. Each recorded (label, name, turnIds) entry is given the quote a
//             cooperative model would most plausibly attach: the sentence containing the name in the cited block
//             (kind self-intro), else in the turn right before it (called-on), else right after it (thanks). It
//             shows what the grounding gate does with the recorded proposals (including the wrong third-party ones)
//             when they ARE quoted. Upper bound on recall, honest test of the gate's precision rules.
// Each outer run's three internal runs become three whole-session runs (all windows' entries unioned).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { groundSpeakerProposals } = await import("../../../packages/index/src/pipeline/speakers-grounded.ts");
const { resolveSpeakers } = await import("../../../packages/index/src/pipeline/speakers.ts");
const { containsNameVerbatim } = await import("../../../packages/index/src/pipeline/speaker-name-rules.ts");

const OUT = "qa/evidence/u24-smart-offline-2026-10-12";
const args = process.argv.slice(2);
const arg = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const FROM = arg("--from") ?? "oc-gpt-oss-120b";
const MODE = arg("--mode") ?? "strict";
const TAG = `${MODE}-${FROM.replace(/^oc-/, "")}`;
const POSITIONAL = /^spk:\d+$/;

const raw = readFileSync(join(OUT, `raw-proposals.${FROM}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const live = readFileSync(join(OUT, `run-results.${FROM}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));

type T = { _id: string; speakerRef: string; text: string };
function blocksOf(turns: T[]) {
  const out: { label: string; s: number; e: number }[] = [];
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]!.speakerRef ?? "";
    if (!POSITIONAL.test(ref)) continue;
    const last = out[out.length - 1];
    if (last && last.label === ref && last.e === i - 1) last.e = i; else out.push({ label: ref, s: i, e: i });
  }
  return out;
}
const sentenceWith = (text: string, name: string): string | null => {
  const at = text.indexOf(name);
  if (at < 0) return null;
  const s = Math.max(text.lastIndexOf(".", at - 1), text.lastIndexOf("?", at - 1), text.lastIndexOf("!", at - 1)) + 1;
  const ends = [".", "?", "!"].map((c) => text.indexOf(c, at + name.length)).filter((x) => x >= 0);
  const e = ends.length ? Math.min(...ends) : text.length;
  const q = text.slice(s, e).trim();
  return q.split(/\s+/).length >= 3 ? q : text.trim();
};

function synthesize(turns: T[], entry: { speakerRef: string; displayName: string; turnIds: string[] }) {
  const blocks = blocksOf(turns);
  const idx = new Map(turns.map((t, i) => [t._id, i]));
  const mine = new Set<number>();
  for (const id of entry.turnIds) {
    const i = idx.get(id) ?? idx.get(id.replace(/^id:/, ""));
    if (i === undefined) continue;
    blocks.forEach((b, bi) => { if (b.label === entry.speakerRef && (i >= b.s - 1 && i <= b.e + 1)) mine.add(bi); });
  }
  const cands: { k: number; kind: string }[] = [];
  for (const bi of mine) { const b = blocks[bi]!; for (let k = b.s; k <= b.e; k++) cands.push({ k, kind: "self-intro" }); }
  for (const bi of mine) { const b = blocks[bi]!; cands.push({ k: b.s - 1, kind: "called-on" }); }
  for (const bi of mine) { const b = blocks[bi]!; cands.push({ k: b.e + 1, kind: "thanks" }); }
  for (const c of cands) {
    const t = turns[c.k];
    if (!t || !containsNameVerbatim(t.text ?? "", entry.displayName)) continue;
    if (c.kind !== "self-intro" && t.speakerRef === entry.speakerRef) continue;
    const q = sentenceWith(t.text, entry.displayName);
    if (q) return { label: entry.speakerRef, name: entry.displayName, evidenceQuote: q, evidenceKind: c.kind };
  }
  return { label: entry.speakerRef, name: entry.displayName, evidenceQuote: "", evidenceKind: "address" };   // nothing to quote: the model would have had to invent one
}

const lines: string[] = [];
const stat = { entries: 0, quoted: 0 };
for (const L of live) {
  const turns: T[] = JSON.parse(readFileSync(join("data/toc-migrated", L.session, "turns.json"), "utf8"));
  const calls = raw.filter((r) => r.session === L.session && r.outerRun === L.outerRun);
  const runs = [1, 2, 3].map((ir) => calls.filter((c) => c.internalRun === ir).flatMap((c) => c.entries)
    .filter((e: { unparseable?: string }) => e.unparseable === undefined)
    .map((e: { speakerRef: string; displayName: string; turnIds: string[] }) => {
      stat.entries++;
      if (MODE === "strict") return { speakerRef: e.speakerRef, displayName: e.displayName, turnIds: e.turnIds };
      const s = synthesize(turns, e);
      if (s.evidenceQuote) stat.quoted++;
      return s;
    }));
  const r = groundSpeakerProposals(turns, runs);
  const floor = resolveSpeakers(turns);
  lines.push(JSON.stringify({
    session: L.session, outerRun: L.outerRun, turns: turns.length, windows: L.windows, providerCalls: 0, ms: 0, degraded: null, replayOf: FROM, mode: MODE,
    unresolved: r.unresolved,
    resolved: r.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, personId: s.personId, evidence: s.evidence, blocks: s.blocks, provenance: s.provenance })),
    floor: floor.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, evidence: s.evidence.map((e) => e.turnId), blocks: s.blocks })),
    floorTurnsCovered: floor.resolved.reduce((k, s) => k + s.evidence.length, 0),
  }));
  for (const s of r.resolved) console.log(`[${TAG} run ${L.outerRun}] ${L.session} ACCEPTED ${s.speakerRef} -> "${s.displayName}" kind=${s.provenance?.map((p) => p.evidenceKind).join(",")} blocks=${JSON.stringify(s.blocks)}`);
}
writeFileSync(join(OUT, `run-results.${TAG}.jsonl`), lines.join("\n") + "\n");
console.log(`${TAG}: recorded entries=${stat.entries}, given a synthetic quote=${stat.quoted}; score with: node ${OUT}/05-score.mjs --tag ${TAG} --raw-tag ${FROM}`);
