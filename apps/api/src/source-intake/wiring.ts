/**
 * apps/api/src/source-intake/wiring.ts — T-045 flag gate for `POST /ingest/source`.
 * OFF by default: `LKB_SOURCE_INTAKE` unset (or anything but "1") returns `undefined`, the route is not mounted and the
 * server behaves exactly as before. ON without an STT provider composed (none is: an owner decision) returns deps that
 * answer 503 `source_intake_unconfigured` rather than ingesting nothing silently.
 */
import type { Transcribe } from "@lkb/ai";
import type { HostedRecordingDownloader } from "@lkb/ingest";
import type { BoundIndexer } from "../indexing/session.js";
import { buildSourceIntakeAdapters } from "./adapters.js";
import { createSourceIntakeDeps, SourceIntakeUnconfiguredError, type SourceIntakeDeps } from "./store.js";
import type { IntakeSink } from "@lkb/ingest";

export interface SourceIntakeWiringSeams {
  transcribe?: Transcribe;
  downloader?: HostedRecordingDownloader;
  sink?: IntakeSink;

}

export function buildSourceIntakeDeps(
  env: Record<string, string | undefined>,
  indexSession?: BoundIndexer,
  seams: SourceIntakeWiringSeams = {},
): SourceIntakeDeps | undefined {
  if (env.LKB_SOURCE_INTAKE !== "1") return undefined;
  if (!seams.transcribe) {
    return {
      async intake() {
        throw new SourceIntakeUnconfiguredError("source intake is enabled but no speech-to-text provider is configured");
      },
    };
  }
  return createSourceIntakeDeps({
    adapters: buildSourceIntakeAdapters({ transcribe: seams.transcribe, downloader: seams.downloader, env }),
    sink: seams.sink,
    indexSession,
  });
}
