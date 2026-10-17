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
/** Legacy reply shape (rule-gated extractor, kept as extractSpeakersRuleBased). */
async function shipsAsPersonLegacy(extractFn, word) {
  const candidate = word.charAt(0).toUpperCase() + word.slice(1);
  const { resolved } = await extractFn(
    [turn("t1", "spk:0", `I am ${candidate} sure about that.`)],
    repliesFor([{ speakerRef: "spk:0", displayName: candidate, turnIds: ["t1"] }]),
  );
  return resolved.length > 0;
}

/**
 * Reply shape the probe speaks. "new" is the production contract {label, name, evidenceQuote, evidenceKind}. "legacy" exists ONLY
 * so the audit can prove it notices a broken probe (--mutate-probe, and the second half of --self-test): ISS-U24SMART-004.
 */
let PROBE_SHAPE = "new";
function replyFor(candidate, sentence) {
  return PROBE_SHAPE === "legacy"
    ? [{ speakerRef: "spk:0", displayName: candidate, turnIds: ["t1"] }]
    : [{ label: "spk:0", name: candidate, evidenceQuote: sentence, evidenceKind: "self-intro" }];
}

/**
 * ISS-U24SMART-002/-004: the PRODUCTION extractor (extractSpeakers = the grounded gate, D-132) reads the new contract shape and
 * silently drops the legacy one, so a legacy-shaped probe can never report a bypass. The recorded ISS-104 sentence is the default;
 * the control passes its own sentence builder but goes through THIS function, so a broken probe breaks the control too.
 */
async function shipsAsPerson(extractFn, word, sentenceOf = (c) => `I am ${c} sure about that`) {
  const candidate = word.charAt(0).toUpperCase() + word.slice(1);
  const sentence = sentenceOf(candidate);
  const { resolved } = await extractFn([turn("t1", "spk:0", sentence + ".")], repliesFor(replyFor(candidate, sentence)));
  return resolved.length > 0;
}

/** Non-vacuity control: a genuine self-introduction MUST ship through shipsAsPerson itself, or the audit is blind. */
async function controlShips(extractFn) {
  return shipsAsPerson(extractFn, "Priya Nair", (c) => `My name is ${c}`);
}

async function probeCurrent(words, extractors) {
  const mod = extractors ?? await import(pathToFileURL(join(PIPELINE_DIR, "speakers-llm.ts")).href);
  if (!(await controlShips(mod.extractSpeakers))) throw new Error("audit-closed-class: probe is vacuous (a genuine self-introduction did not ship through the probe)");
  const bypasses = [];
  for (const { word } of words) {
    if ((await shipsAsPerson(mod.extractSpeakers, word)) || (mod.extractSpeakersRuleBased && (await shipsAsPersonLegacy(mod.extractSpeakersRuleBased, word)))) bypasses.push(word);
  }
  return bypasses;
}

/**
 * Prove the audit can FAIL. (1) An extractor seeded with one bypass that only plants it when the REPLY SHAPE is the new contract
 * must be caught. (2) With the probe mutated back to the legacy shape the audit must notice it is blind (the control throws).
 */
async function selfTest() {
  const real = await import(pathToFileURL(join(PIPELINE_DIR, "speakers-llm.ts")).href);
  const seeded = async (turns, complete) => {
    const out = await real.extractSpeakers(turns, complete);
    const reply = await complete({ kind: "speakers", messages: [] });
    const newShape = Array.isArray(reply.json) && reply.json.some((e) => typeof e?.evidenceQuote === "string");
    if (newShape && turns.some((t) => /\bSeeded\b/.test(t.text))) return { ...out, resolved: [{ speakerRef: "spk:0", displayName: "Seeded", personId: "person:seeded", evidence: [], blocks: [] }] };
    return out;
  };
  const words = [{ word: "seeded" }, { word: "to" }];
  const caught = await probeCurrent(words, { extractSpeakers: seeded });
  const ok1 = caught.length === 1 && caught[0] === "seeded";
  console.log(`self-test 1: seeded bypass ${ok1 ? "CAUGHT" : "MISSED"} (reported: ${caught.join(", ") || "none"})`);
  const saved = PROBE_SHAPE;
  PROBE_SHAPE = "legacy";
  let ok2 = false;
  try { await probeCurrent(words, { extractSpeakers: seeded }); } catch (e) { ok2 = /vacuous/.test(String(e?.message)); }
  PROBE_SHAPE = saved;
  console.log(`self-test 2: probe mutated to the legacy shape ${ok2 ? "DETECTED as blind" : "NOT DETECTED (audit would pass vacuously)"}`);
  return ok1 && ok2;
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
      .replace('from "./speakers.js"', 'from "../speakers.js"')
      .replace(/^export \{ extractSpeakersGrounded as extractSpeakers \} from .*$/m, "");   // scratch copy is the legacy harness only
    writeFileSync(join(scratchDir, "speakers-llm.ts"), harness, "utf8");

    const { extractSpeakersRuleBased } = await import(pathToFileURL(join(scratchDir, "speakers-llm.ts")).href);
    const bypasses = [];
    for (const { word } of words) {
      if (await shipsAsPersonLegacy(extractSpeakersRuleBased, word)) bypasses.push(word);
    }
    return bypasses;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--mutate-probe")) PROBE_SHAPE = "legacy";   // test hook: the audit must FAIL with a broken probe
  if (process.argv.includes("--self-test")) { process.exitCode = (await selfTest()) ? 0 : 1; return; }
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

function setProbeShape(shape) { PROBE_SHAPE = shape; }   // test hook (ISS-U24SMART-002): lets the suite break the probe and watch the control notice
export { shipsAsPerson, probeCurrent, selfTest, setProbeShape };

// Run the CLI only when executed directly, so audit-closed-class.test.mjs can import the probe without side effects.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
