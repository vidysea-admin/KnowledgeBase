/**
 * scripts/lib/find-audio-file.mjs — shared between transcribe-toc-session.mjs and
 * transcribe-long-session.mjs. T-002's source.json.path is the ORIGINAL raw transcript file
 * (e.g. "raw/TOC/TOC-Materials/Transcripts/23rd-May-UniAccess-ATLAS-Skilltech.content.md") — its
 * basename (minus ".content.md") is the exact same stem the Audio/ directory's extracted audio
 * uses. This is an exact-basename match, not a fuzzy title-word heuristic (which mismatched a
 * real session against a different one's audio on this pipeline's first-ever real run).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

export function findAudioFile(dataDir, audioDir, sessionId) {
  const sourceJsonPath = join(dataDir, sessionId, "source.json");
  if (!existsSync(sourceJsonPath)) throw new Error(`no data/toc-migrated/${sessionId}/source.json found`);
  const source = JSON.parse(readFileSync(sourceJsonPath, "utf8"));

  // Bot-captured recordings (meeting-bot `record`, 2026-09-24) name their audio explicitly,
  // repo-relative — no TOC basename matching needed.
  if (source.audioPath) {
    const direct = join(dataDir, "..", "..", source.audioPath);
    if (!existsSync(direct)) throw new Error(`source.json audioPath "${source.audioPath}" does not exist`);
    return { path: direct, filename: source.audioPath.split("/").pop() };
  }

  const rawStem = source.path.split("/").pop().replace(/\.content\.md$/i, "");

  const files = readdirSync(audioDir).filter((f) => [".m4a", ".mp4", ".mp3"].includes(extname(f).toLowerCase()));
  const match = files.find((f) => f.slice(0, f.lastIndexOf(".")).toLowerCase() === rawStem.toLowerCase());
  if (!match) {
    throw new Error(`no exact audio-file basename match for "${rawStem}" (from source.json path "${source.path}") among: ${files.join(", ")}`);
  }
  return { path: join(audioDir, match), filename: match };
}
