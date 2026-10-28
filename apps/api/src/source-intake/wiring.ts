/**
 * apps/api/src/source-intake/wiring.ts — T-045 flag gate for `POST /ingest/source`.
 * OFF by default: `LKB_SOURCE_INTAKE` unset (or anything but "1") returns `undefined`, the route is not mounted and the
 * server behaves exactly as before. ON without trusted explicit model/key configuration or injected STT returns deps that
 * answer 503 `source_intake_unconfigured` rather than ingesting nothing silently.
 */
import type { Transcribe } from "@lkb/ai";
import type { HostedRecordingDownloader } from "@lkb/ingest";
import type { BoundIndexer } from "../indexing/session.js";
import { buildSourceIntakeAdapters } from "./adapters.js";
import { createSourceIntakeDeps, SourceIntakeUnconfiguredError, type SourceIntakeDeps } from "./store.js";
import { parseOnairUrl, parseZoomRecordingUrl, type IntakeSink } from "@lkb/ingest";
import { createSourceMediaTranscriber, sourceMediaConfiguration } from "./media-runtime.js";

export interface SourceIntakeWiringSeams {
  /** Explicit worker-only composition; production HTTP never creates an inline SDK transcriber. */
  execution?: "worker";
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
  if (!seams.transcribe && seams.execution !== "worker") return { async intake() {
    throw new SourceIntakeUnconfiguredError("source intake requires the configured durable worker");
  } };
  const configuration = sourceMediaConfiguration(env);
  const transcribe = seams.transcribe ?? (configuration ? createSourceMediaTranscriber(configuration) : undefined);
  if (!transcribe) {
    return {
      async intake() {
        throw new SourceIntakeUnconfiguredError("source intake is enabled but no speech-to-text provider is configured");
      },
    };
  }
  return createSourceIntakeDeps({
    adapters: buildSourceIntakeAdapters({ transcribe, downloader: seams.downloader, env }),
    sink: seams.sink,
    indexSession,
    ...(seams.execution === "worker" ? { consentFor: ({ url }: { url: string }) => ({
      captureMode: parseZoomRecordingUrl(url).ok || (parseOnairUrl(url).ok && !!env.LKB_ONAIR_COOKIE_HEADER?.trim()) ? "provided" as const : "public" as const,
      given: true, recordedBy: "source-worker",
      note: "Supplied recording; protected source-account and provider-processing permission are checked before acquisition.",
    }) } : {}),
  });
}
