/**
 * packages/ingest/src/retention/retention-clips-wire.ts - T-046 / D-008. Builds the real evidence-clip extractor that
 * the two CLIs hand to the purge executor (`deps.clips`). Execute mode only ever uses it; a dry run just reports.
 */
import { resolve } from "node:path";
import { REAL_CLIP_IO, extractEvidenceClips, resolveFfmpegCommand } from "./retention-clips.js";
import type { PurgeDeps } from "./retention-purge.js";

export function realClipExtractor(repoRoot: string = process.cwd()): NonNullable<PurgeDeps["clips"]> {
  return { extract: (media, windows, outDir) => extractEvidenceClips(media, windows, outDir, resolveFfmpegCommand(process.env, resolve(repoRoot)), REAL_CLIP_IO) };
}
