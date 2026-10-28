// corpus-lock.mjs -- ISS-290: pin the corpus the phase-3 gate measures against.
// The pinned set is gold-labels.json's session list; corpus.lock.json holds a sha256 of each pinned
// session's turns.json (CRLF-normalised). verifyCorpus() throws on any mismatch or missing session, so
// a re-measure over drifted data fails BEFORE spending provider calls. Positional sessions that appear
// in data/toc-migrated but are NOT pinned (a later ingest) make verifyCorpus THROW (ISS-290 fix_direction: fail
// loudly), so the measured corpus can never silently exclude data.
//   write the lock:  node qa/evidence/<dir>/corpus-lock.mjs --write   (deliberate act; review the diff)
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const sha = (p) => createHash("sha256").update(readFileSync(p, "utf8").replace(/\r\n/g, "\n")).digest("hex");
const pinned = () => JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8")).sessions.map((g) => g.session);

export function verifyCorpus() {
  const lockPath = join(OUT, "corpus.lock.json");
  if (!existsSync(lockPath)) throw new Error("ISS-290: corpus.lock.json missing -- the corpus is not pinned");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")).sessions;
  const sessions = pinned();
  const bad = sessions.filter((s) => !lock[s] || !existsSync(join("data/toc-migrated", s, "turns.json")) || sha(join("data/toc-migrated", s, "turns.json")) !== lock[s]);
  const stale = Object.keys(lock).filter((s) => !sessions.includes(s));
  if (bad.length || stale.length) throw new Error(`ISS-290: corpus drift -- changed/missing: [${bad}] lock-only: [${stale}]`);
  const unpinned = readdirSync("data/toc-migrated", { withFileTypes: true }).filter((d) => d.isDirectory() && !sessions.includes(d.name) &&
    existsSync(join("data/toc-migrated", d.name, "turns.json")) &&
    JSON.parse(readFileSync(join("data/toc-migrated", d.name, "turns.json"), "utf8")).some((t) => /^spk:\d+$/.test(t.speakerRef ?? ""))).map((d) => d.name);
  if (unpinned.length) throw new Error(`ISS-290: ${unpinned.length} unpinned positional session(s) in data/toc-migrated: [${unpinned.join(", ")}] -- pin them (gold + corpus-lock.mjs --write) or remove them; refusing to measure a corpus that silently excludes them`);
  return { sessions, unpinned };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--write")) {
  const sessions = Object.fromEntries(pinned().map((s) => [s, sha(join("data/toc-migrated", s, "turns.json"))]));
  writeFileSync(join(OUT, "corpus.lock.json"), JSON.stringify({ pinnedBy: "gold-labels.json", sessions }, null, 2) + "\n");
  console.log(`corpus.lock.json written: ${Object.keys(sessions).length} sessions`);
}
