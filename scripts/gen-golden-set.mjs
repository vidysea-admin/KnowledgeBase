#!/usr/bin/env node
/**
 * scripts/gen-golden-set.mjs — regenerates `data/eval/golden-set.json` under the ANSWERED gate
 * `qa/gates/golden-set-redesign.md` (Option C, approved by Umesh 2026-09-08).
 *
 * WHAT WAS WRONG. The previous version was five lines of the form `question: insight` — it lifted
 * a verbatim `keyInsights` string out of `session_page.json` and called it a question. Retrieval
 * then scored that string against the `summary` field of *the same document*: same author, same
 * pass, same rare named entities. recall@5 came out 1.000 with zero misses, which is not a good
 * score but an unfalsifiable one (ISS-071) — it could register a regression and could never
 * demonstrate an improvement, leaving Phase 1's exit criteria unfailable.
 *
 * WHAT THIS DOES INSTEAD, per the gate's four binding conditions:
 *   - generates from the RAW TRANSCRIPT (`turns.json`), never `session_page.json`;
 *   - uses a DIFFERENT MODEL from the summarizer and a different prompt. The summarize jobKind
 *     resolves to Gemini's DEFAULT_MODEL `gemini-2.5-flash`, so `session_page.json` came from
 *     Flash and this generates with `gemini-2.5-pro` (Umesh, 2026-09-08). Literally a different
 *     model, but the SAME vendor and family — see the disclosure at the provider construction;
 *   - asks for questions a student would actually ask, not declarative excerpts;
 *   - names NEAR-NEIGHBOUR sessions (chosen for shared topic vocabulary) in the prompt and
 *     requires wording that would also fit them, so a single globally-unique token cannot pin
 *     the answer.
 *
 * The prompt REQUESTS those properties; a deterministic post-filter ENFORCES them — every
 * candidate is rejected if it is pinned by a token unique to its own session or overlaps the
 * transcript verbatim. That split is deliberate: the model is asked for judgment, and code
 * decides what ships. A prompt alone would have produced a set nobody could vouch for.
 *
 * HONEST LIMIT, and the gate says so too: Option C reduces but does not remove same-source
 * vocabulary leakage. The questions still come from the same transcripts the retriever indexes.
 * It is the weakest of the three options on independence and was chosen on cost/latency.
 *
 * Usage: node scripts/gen-golden-set.mjs [--dry-run] [--per-session N]
 *   --dry-run          build prompts and report the neighbour selection; make no API call.
 *   --provenance-only  rewrite golden-set-provenance.json from the set already on disk; no API call.
 *   --refilter         re-apply the CURRENT filter to the candidates already on disk; no API call.
 *   --self-test        run the REAL generation loop against a stub provider; no API call, no writes.
 *                      Exists because ISS-095 shipped a ReferenceError in this loop: it was the only
 *                      path that costs money, and therefore the only one never exercised.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { tokenize } from "./eval/golden-set-diagnostics.mjs";
import { loadCorpora, buildPinTokens, writeProvenance, refilter, judgeCandidate } from "./eval/golden-set-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const OUT_DIR = join(ROOT, "data", "eval");
const OUT_PATH = join(OUT_DIR, "golden-set.json");

const PER_SESSION = Number(process.argv.find((a) => a.startsWith("--per-session="))?.split("=")[1] ?? 4);
const DRY_RUN = process.argv.includes("--dry-run");
const PROVENANCE_ONLY = process.argv.includes("--provenance-only");
const REFILTER = process.argv.includes("--refilter");
const SELF_TEST = process.argv.includes("--self-test");
const NEIGHBOURS = 3;
const MAX_TRANSCRIPT_CHARS = 40_000;
const GENERATION_MODEL = "gemini-2.5-pro";
/** Gemini's DEFAULT_MODEL — what the summarize jobKind resolves to, i.e. what wrote session_page. */
const SUMMARIZER_MODEL = "gemini-2.5-flash";

register();

const loadJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Content tokens only — the stopwords carry no topic signal and swamp the neighbour ranking. */
const STOP = new Set(
  ("the a an and or but if then that this these those is are was were be been being to of in on at for with as by from " +
    "it its i you he she they we us our your their them so not no yes do does did done have has had will would can could " +
    "should about into over under just like really very much more most some any all what when where who how why which " +
    "there here uh um okay ok yeah right actually basically thing things going get got know think see say said one two")
    .split(" "),
);
const contentTokens = (text) => new Set(tokenize(text).filter((t) => t.length > 3 && !STOP.has(t)));

/** Jaccard over content tokens — the sessions most likely to be confused with the target. */
function nearestNeighbours(id, vocab, n) {
  const mine = vocab.get(id);
  return [...vocab.entries()]
    .filter(([other]) => other !== id)
    .map(([other, theirs]) => {
      let shared = 0;
      for (const t of mine) if (theirs.has(t)) shared++;
      return { id: other, score: shared / (mine.size + theirs.size - shared || 1) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function buildPrompt(sessionId, title, transcript, neighbourTitles, perSession) {
  return `You are building an evaluation set for a retrieval system over counselling-webinar transcripts.

Write ${perSession} questions that a real student (or parent) would ask, which THIS session's
transcript genuinely answers.

Hard requirements:
1. Phrase each as an actual question someone would type or say. Never a declarative statement or
   a summary sentence.
2. Do NOT quote the transcript. Use your own wording throughout.
3. AVOID rare identifying words — company names, product names, unusual numbers, and any term a
   different session would be unlikely to mention. The question must NOT be answerable just by
   spotting one distinctive word.
4. Write questions whose WORDING would also plausibly fit these related sessions, so that only
   understanding the content — not keyword-spotting — identifies the right one:
${neighbourTitles.map((t) => `     - ${t}`).join("\n")}
5. Each question must still be genuinely answerable from THIS transcript.

Session title: ${title}

Transcript:
${transcript}

Return ONLY a JSON array of ${perSession} strings. No prose, no markdown fence.`;
}

function parseQuestions(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((q) => typeof q === "string" && q.trim().length > 0) : [];
  } catch {
    return [];
  }
}

async function main() {
  // Rebuild provenance for a set already on disk, with NO API call — so a missing or stale record
  // can be repaired without regenerating (which would cost spend and, being non-deterministic,
  // would produce a different set and invalidate any review already done against this one).
  if (PROVENANCE_ONLY) {
    const kept = loadJson(OUT_PATH).length;
    const rejectedPath = join(OUT_DIR, "golden-set-rejected.json");
    const rejectedCount = existsSync(rejectedPath) ? loadJson(rejectedPath).length : 0;
    const sessions = new Set(loadJson(OUT_PATH).map((q) => q.expectedSessionId)).size;
    writeProvenance(kept, rejectedCount, sessions, true);
    return;
  }

  if (REFILTER) return refilter();

  const { GeminiProvider } = await import("../packages/ai/src/providers/gemini.ts");
  // Reused, not rewritten: this is the workspace's only real Transport.
  const { realTransport } = await import("../apps/api/src/ai-transport.ts");

  // One loader shared with the re-filter path, so generation and re-filtering cannot end up
  // judging different corpora.
  const { sessionIds, turnsText, pageText, titles } = loadCorpora();

  const vocab = new Map([...turnsText].map(([id, t]) => [id, contentTokens(t)]));
  const unique = buildPinTokens(turnsText, pageText);

  // GEMINI 2.5 PRO — chosen by Umesh 2026-09-08 ("go with gemini api key"), and it does satisfy
  // the gate's "different model" condition literally: the summarize jobKind resolves to Gemini's
  // DEFAULT_MODEL, `gemini-2.5-flash`, so `session_page.json` was written by Flash and this is Pro.
  //
  // DISCLOSED WEAKNESS, so no reader mistakes this for full independence: different model, SAME
  // VENDOR AND FAMILY. Cross-vendor generation (the Anthropic OAuth path this replaced) would
  // share no training data or phrasing habits with the summarizer; Pro and Flash share both. So
  // this reduces same-source vocabulary leakage by less than a cross-vendor run would, on top of
  // the reduction the gate itself already calls partial. The diagnostics below are what decide
  // whether that mattered — pin rate and overlap are measured, not assumed, and a recall@5 of
  // 1.000 still means the remedy FAILED and escalates to Option B.
  // A stub stands in for the paid provider so `--self-test` executes every line of the loop below
  // — prompt build, completion, parse, filter — with no network and no spend. ISS-095 was a plain
  // ReferenceError in this loop that survived three green CLI paths because none of them ran it.
  const provider = SELF_TEST
    ? { complete: async () => ({ text: '["What funding options are open to me?", "How long does a decision take?"]' }) }
    : DRY_RUN
      ? null
      : new GeminiProvider(realTransport, { apiKey: process.env.GEMINI_API_KEY, model: GENERATION_MODEL });

  const questions = [];
  const rejected = [];
  for (const id of SELF_TEST ? sessionIds.slice(0, 2) : sessionIds) {
    const neighbours = nearestNeighbours(id, vocab, NEIGHBOURS);
    const prompt = buildPrompt(
      id,
      titles.get(id),
      turnsText.get(id).slice(0, MAX_TRANSCRIPT_CHARS),
      neighbours.map((n) => titles.get(n.id)),
      PER_SESSION,
    );

    if (DRY_RUN) {
      console.log(`${id}\n  neighbours: ${neighbours.map((n) => `${n.id} (${n.score.toFixed(3)})`).join(", ")}`);
      continue;
    }

    const res = await provider.complete({ kind: "golden-set", messages: [{ role: "user", content: prompt }] });
    const candidates = parseQuestions(res.text ?? "");
    let kept = 0;
    for (const q of candidates) {
      // ENFORCE what the prompt only requested. A model asked to avoid unique tokens still emits
      // them; without this filter the set would look regenerated and behave exactly as before.
      const verdict = judgeCandidate(q, id, unique, turnsText.get(id));
      if (!verdict.ok) {
        rejected.push({ sessionId: id, question: q, reason: verdict.reason });
        continue;
      }
      kept++;
      questions.push({
        id: `${id}-gq${String(kept).padStart(2, "0")}`,
        question: q,
        expectedSessionId: id,
      });
    }
    console.log(`${id}: ${kept} kept, ${candidates.length - kept} rejected`);
  }

  if (DRY_RUN) return;
  if (SELF_TEST) {
    console.log(`self-test OK: generation loop ran for 2 session(s), ${questions.length} kept, ${rejected.length} rejected, no writes`);
    return;
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(questions, null, 2) + "\n", "utf8");
  writeFileSync(join(OUT_DIR, "golden-set-rejected.json"), JSON.stringify(rejected, null, 2) + "\n", "utf8");

  writeProvenance(questions.length, rejected.length, sessionIds.length, false);

  const covered = new Set(questions.map((q) => q.expectedSessionId)).size;
  console.log(`\nwrote ${questions.length} questions spanning ${covered}/${sessionIds.length} sessions -> ${OUT_PATH}`);
  console.log(`${rejected.length} candidate(s) rejected by the post-filter -> golden-set-rejected.json`);
}

main();
