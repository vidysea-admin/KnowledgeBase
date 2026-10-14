#!/usr/bin/env node
/**
 * scripts/sync-speakers.mjs — U2.4 apply step. Resolves speakers from the real local transcripts
 * and writes them into the live Mongo `speakers` collection, which has been empty since the schema
 * was created (catalogue B3/B10 score MISSING on exactly that emptiness).
 *
 * Mirrors `sync-real-turns.mjs`: `--dry-run` never connects to Mongo, and is what the contract is
 * PASSed against. A live run is the separately-approved step.
 *
 * DETERMINISTIC ONLY. It calls `resolveSpeakers`, never `extractSpeakers`, so no provider is
 * contacted and no model output is trusted. That caps it at the measured 78/494 turns (15.8%) and
 * two speakers — which is the honest ceiling of what can be written today without a model call.
 * The LLM path exists and is checker-PASSed; wiring it here would mean writing model-proposed
 * human names into the knowledge base, and that deserves its own approval, not a side effect.
 *
 * Collisions are printed and, on a live run, BLOCK the write unless `--allow-collisions` is given.
 * A `personId` claimed by two sessions may be one person or two, and merging is an inference — see
 * `packages/index/src/pipeline/speaker-docs.ts`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { requireWorkDatabase } from "./lib/transcript-provenance.mjs";
import { register } from "tsx/esm/api";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_COLLISIONS = process.argv.includes("--allow-collisions");
const TENANT = "toc";

register();

async function main() {
  const { resolveSpeakers } = await import("../packages/index/src/pipeline/speakers.js");
  const { buildSpeakerDocs } = await import("../packages/index/src/pipeline/speaker-docs.js");

  const sessionIds = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const sessions = [];
  let positional = 0;
  let resolvedTurns = 0;

  for (const sessionId of sessionIds) {
    const turnsPath = join(DATA_DIR, sessionId, "turns.json");
    if (!existsSync(turnsPath)) continue;
    const turns = JSON.parse(readFileSync(turnsPath, "utf8"));
    const pos = turns.filter((t) => /^spk:\d+$/.test(t.speakerRef ?? ""));
    positional += pos.length;
    const { resolved } = resolveSpeakers(turns);
    if (resolved.length === 0) continue;
    // Segment-aware coverage (speaker-segment-identity gate, phase 1): a turn counts as
    // attributable ONLY when it lies inside a claimed block of its label's resolution — never
    // label-wide (494 positional turns form 240 blocks across 29 session/label pairs, so one
    // label can cover multiple people).
    const posIndex = new Map(turns.map((t, i) => [t._id, i]));
    for (const t of pos) {
      const idx = posIndex.get(t._id);
      if (idx === undefined) continue;
      if (resolved.some((r) => (r.blocks ?? []).some((b) => idx >= b.startTurnIndex && idx <= b.endTurnIndex))) resolvedTurns++;
    }
    sessions.push({ sessionId, resolved });
  }

  const { docs, collisions } = buildSpeakerDocs(TENANT, sessions);

  console.log(`sessions scanned: ${sessionIds.length}`);
  console.log(`positional turns: ${positional}; attributable by deterministic resolution: ${resolvedTurns} (${(100 * resolvedTurns / positional).toFixed(1)}%)`);
  console.log(`speaker documents to write: ${docs.length}`);
  for (const d of docs) {
    console.log(`  ${d.personId}  aliases=${JSON.stringify(d.aliases)}  confidence=${d.confidence}  evidence=${d.evidence.length} turn(s)`);
  }
  if (collisions.length > 0) {
    console.log(`\nCOLLISIONS (${collisions.length}) -- one personId claimed by several sessions:`);
    for (const c of collisions) console.log(`  ${c.personId} across ${c.sessionIds.join(", ")} as ${JSON.stringify(c.aliases)}`);
  } else {
    console.log("\nno cross-session collisions");
  }

  if (DRY_RUN) {
    console.log("\nNo Mongo connection attempted (--dry-run).");
    return;
  }
  if (collisions.length > 0 && !ALLOW_COLLISIONS) {
    console.error("\nRefusing to write: cross-session collisions present. Re-run with --allow-collisions once you have decided they are the same person.");
    process.exitCode = 1;
    return;
  }

  console.log("\nConnecting to Mongo for a live write (no --dry-run flag given)...");
  const { connect, close } = await import("../packages/db/src/client.js");
  const { speakers } = await import("../packages/db/src/collections/speakers.js");
  const { writeSpeakerDocs } = await import("../packages/index/src/pipeline/speaker-docs.js");

  const { url, dbName } = requireWorkDatabase(process.env); // no `lkb` default: isolated work DB required
  await connect(url, dbName);
  try {
    // The write itself lives in typechecked source (ISS-102/ISS-103). This entrypoint only wires
    // it up, so a call to an accessor method that does not exist is a compile error rather than a
    // TypeError discovered on a live run.
    const { before, written, after } = await writeSpeakerDocs(speakers(TENANT), docs);
    console.log(`speakers: before=${before} written=${written} after=${after}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
