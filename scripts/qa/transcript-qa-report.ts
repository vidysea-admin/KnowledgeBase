/**
 * scripts/qa/transcript-qa-report.ts -- operator runner (T-044). Writes a QA report JSON next to a turns file.
 *   node --import tsx scripts/qa/transcript-qa-report.ts <turns.json> <durationSec> [--out <path>] [--overwrite]
 * Never modifies the turns file; refuses to overwrite an existing report without --overwrite.
 * Exit 0 = PASS, 1 = FAIL verdict, 2 = usage or I/O error.
 */
import { writeTranscriptQaReport } from "../../packages/ai/src/stt/transcript-qa-report.js";

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith("--") && !(outIdx !== -1 && i === outIdx + 1));
if (positional.length !== 2 || (outIdx !== -1 && !outPath)) {
  console.error("usage: transcript-qa-report <turns.json> <durationSec> [--out <path>] [--overwrite]");
  process.exit(2);
}
try {
  const { outPath: written, report } = writeTranscriptQaReport({
    inputPath: positional[0]!, durationSec: Number(positional[1]), outPath, overwrite,
  });
  console.log(`${report.verdict} in=${report.turnsIn} out=${report.turnsOut} clamped=${report.turnsClamped.length} dropped=${report.turnsDropped.length} -> ${written}`);
  process.exit(report.verdict === "PASS" ? 0 : 1);
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
