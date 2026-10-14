// Lane-local criterion-8 mutation harness (deleted before commit).
// Safer shape: the tracked detection.ts is NEVER modified. Each mutant is a throwaway copy
// (detection.wamut.ts) exercised by a copy of detection.test.ts that imports it.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dir = "src/whatsapp/review/";
const mutations = [
  ["topic detection removed", 'if (/\\b(?:topic|subject|agenda)', 'if (false && /\\b(?:topic|subject|agenda)'],
  ["decision detection removed", 'if (/\\b(?:decided', 'if (false && /\\b(?:decided'],
  ["sensitive flag removed", 'flags.push({ kind: "sensitive"', 'void ({ kind: "sensitive"'],
  ["personal/excluded flag removed", 'if (/\\b(?:(?:private|personal)', 'if (false && /\\b(?:(?:private|personal)'],
  ["duplicate flag removed", 'if (duplicateOf) flags.push', 'if (false && duplicateOf) flags.push'],
  ["evidence attachment corrupted", 'quote: turn.text, occurredAt', 'quote: "x", occurredAt'],
];
const src = readFileSync(dir + "detection.ts", "utf8");
const test = readFileSync(dir + "detection.test.ts", "utf8").replace('"./detection.js"', '"./detection.wamut.js"');
const control = spawnSync(process.execPath, ["--test", "--import", "tsx", dir + "detection.test.ts"], { encoding: "utf8", timeout: 180000 });
console.log(`control (unmutated) exit ${control.status}`);
let killed = 0;
try {
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) { console.log(`NOT-APPLIED ${name}`); continue; }
    const mutated = src.replace(from, to);
    if (mutated === src) { console.log(`NOT-APPLIED ${name}`); continue; }
    writeFileSync(dir + "detection.wamut.ts", mutated);
    writeFileSync(dir + "detection.wamut.test.ts", test);
    const r = spawnSync(process.execPath, ["--test", "--import", "tsx", dir + "detection.wamut.test.ts"], { encoding: "utf8", timeout: 180000 });
    const failed = r.status !== 0;
    if (failed) killed++;
    console.log(`${failed ? "KILLED  " : "SURVIVED"} ${name} (exit ${r.status}, ${r.signal ?? "no signal"})`);
  }
} finally {
  rmSync(dir + "detection.wamut.ts", { force: true });
  rmSync(dir + "detection.wamut.test.ts", { force: true });
}
console.log(`killed ${killed}/${mutations.length}`);
