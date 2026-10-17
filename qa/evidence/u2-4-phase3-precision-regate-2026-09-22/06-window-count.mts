import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { register } from "tsx/esm/api";
register();
const { buildSpeakerWindows } = await import("../../../packages/index/src/pipeline/speakers-llm.ts");
const POSITIONAL = /^spk:\d+$/;
let total = 0;
// ISS-290: pinned, hash-verified list
for (const s of [...(await import("./corpus-lock.mjs")).verifyCorpus().sessions].sort()) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", s, "turns.json"), "utf8"));
  if (!turns.some((t) => POSITIONAL.test(t.speakerRef ?? ""))) continue;
  const w = buildSpeakerWindows(turns).length;
  total += w;
  console.log(`${s}: ${w} windows`);
}
console.log(`TOTAL windows per internal run: ${total} -> provider calls for 3 outer runs x 3 internal runs = ${total * 9}`);