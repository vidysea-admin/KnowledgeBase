#!/usr/bin/env node
/**
 * scripts/lib/audit-closed-class.mjs — ISS-104CC-1 (checker verdict on
 * iss-104-closed-class-function-words, cycle 0): the manifest's headline claim — "406 words
 * enumerated, 277 absent from NEVER_A_PERSON, all 277 shipped a fabricated person; after: 0/406"
 * — had no committed script or word-list, so no checker could re-derive it independently. This
 * script and its data file (../../packages/index/src/pipeline/closed-class-audit-words.json) are
 * that missing artifact.
 *
 * Re-deriving the enumeration from scratch (rather than reusing the uncommitted cycle-0 numbers)
 * gives 409 words (299 SET A + 110 SET B), not 406 — see the data file's own header for the exact
 * method (parse NEVER_A_PERSON, drop the 12 collective-address words, which are neither a closed
 * grammar class nor one of [C2b]'s four role sets). The manifest is corrected to this real number
 * rather than bent to match the old one — a corrected number is the honest outcome here.
 *
 * Offline, no network, no LLM: exactly the `replies()` fake-completion pattern the test suite uses.
 * Usage:
 *   node scripts/lib/audit-closed-class.mjs                 — AFTER only (current tree)
 *   node scripts/lib/audit-closed-class.mjs --base <gitRef>  — AFTER + BEFORE (historical compare)
 * Exit: 0 if AFTER is 0 live bypasses, 1 otherwise (BEFORE is informational, never gates exit).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";

register(); // let dynamic import() of .ts sources resolve, same pattern as scripts/eval-recall.mjs

const HERE = dirname(fileURLToPath(import.meta.url)); // scripts/lib
const ROOT = join(HERE, "..", "..");
const PIPELINE_DIR = join(ROOT, "packages", "index", "src", "pipeline");
const WORDLIST_PATH = join(PIPELINE_DIR, "closed-class-audit-words.json");

function turn(id, speakerRef, text) {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}
function completion(text, json) {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}
const repliesFor = (json) => async () => completion("", json);

/**
 * Does `word` ship as a fabricated person through the recorded ISS-104 shape?
 *
 * The candidate is capitalised (`Word`, not `word`) — `looksLikeAName` requires an initial capital
 * (transcripts capitalise nearly every sentence start; that shape check is what makes fabricated
 * candidates plausible in the first place). The word list stores lowercase entries because that's
 * how `NEVER_A_PERSON` itself is cased (`isDiscourseOnly` lowercases before the membership test),
 * so capitalising only the candidate here, not the list, matches both guards' real casing.
 */
async function shipsAsPerson(extractSpeakers, word) {
  const candidate = word.charAt(0).toUpperCase() + word.slice(1);
  const text = `I am ${candidate} sure about that.`;
  const { resolved } = await extractSpeakers(
    [turn("t1", "spk:0", text)],
    repliesFor([{ speakerRef: "spk:0", displayName: candidate, turnIds: ["t1"] }]),
  );
  return resolved.length > 0;
}

async function probeCurrent(words) {
  const { extractSpeakers } = await import(pathToFileURL(join(PIPELINE_DIR, "speakers-llm.ts")).href);
  const bypasses = [];
  for (const { word } of words) {
    if (await shipsAsPerson(extractSpeakers, word)) bypasses.push(word);
  }
  return bypasses;
}

/**
 * Historical BEFORE count: swap in `speaker-name-rules.ts` as it existed at `ref`, keeping the
 * CURRENT `speakers-llm.ts` as the harness (it is unchanged in this unit's diff — [I2] holds for
 * `speakers.ts` too), so the only variable under test is NEVER_A_PERSON's membership. A scratch
 * copy lives one level under the real pipeline dir so its relative imports still resolve against
 * the real, untouched `speakers.ts` and this worktree's own node_modules — no second `pnpm
 * install` needed.
 */
async function probeBase(words, ref) {
  const scratchDir = join(PIPELINE_DIR, ".audit-closed-class-base-scratch");
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });
  try {
    const baseRules = execFileSync("git", ["show", `${ref}:packages/index/src/pipeline/speaker-name-rules.ts`], {
      cwd: ROOT, encoding: "utf8",
    });
    writeFileSync(join(scratchDir, "speaker-name-rules.ts"), baseRules, "utf8");
    const harness = readFileSync(join(PIPELINE_DIR, "speakers-llm.ts"), "utf8")
      .replace('from "./speakers.js"', 'from "../speakers.js"');
    writeFileSync(join(scratchDir, "speakers-llm.ts"), harness, "utf8");

    const { extractSpeakers } = await import(pathToFileURL(join(scratchDir, "speakers-llm.ts")).href);
    const bypasses = [];
    for (const { word } of words) {
      if (await shipsAsPerson(extractSpeakers, word)) bypasses.push(word);
    }
    return bypasses;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

async function main() {
  const baseRef = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : null;
  if (!existsSync(WORDLIST_PATH)) throw new Error(`audit-closed-class: missing ${WORDLIST_PATH}`);
  const { words, totals } = JSON.parse(readFileSync(WORDLIST_PATH, "utf8"));
  console.log(`enumeration: ${totals.words} words (SET A ${totals.setA} + SET B ${totals.setB})`);

  const afterBypasses = await probeCurrent(words);
  console.log(`AFTER  (current tree): LIVE BYPASSES: ${afterBypasses.length} / ${words.length}`);
  if (afterBypasses.length > 0) console.log("  " + afterBypasses.join(", "));

  if (baseRef) {
    const beforeBypasses = await probeBase(words, baseRef);
    console.log(`BEFORE (${baseRef}):    LIVE BYPASSES: ${beforeBypasses.length} / ${words.length}`);
    const notAllShipped = beforeBypasses.length < words.length
      ? words.filter((w) => !beforeBypasses.includes(w.word)).map((w) => w.word)
      : [];
    if (notAllShipped.length > 0) {
      console.log(`  already refused at ${baseRef} (${notAllShipped.length}): ${notAllShipped.slice(0, 20).join(", ")}${notAllShipped.length > 20 ? ", ..." : ""}`);
    }
  }

  process.exitCode = afterBypasses.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
