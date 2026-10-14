/**
 * packages/ingest/src/sources/recording.ts — T-020 C2. Detects audio/video files (or an
 * explicit `{kind: "recording"}` hint), reads + hashes them, and delegates transcription to the
 * injected T-019 STT seam (`Transcribe` from `packages/ai/src/stt/transcribe.ts`) — never a
 * concrete adapter (`whisper.ts`/`gemini.ts`) imported directly, keeping `ingest` from binding to
 * one STT provider (ARCHITECTURE §5: `ingest → ai, db, core` only, the *choice* of backend stays
 * the caller's).
 */
import type { Transcribe } from "@lkb/ai";
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";

const AUDIO_VIDEO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".opus",
  ".webm",
  ".mp4",
  ".mov",
  ".mkv",
];

/** Injected content hasher — no `crypto`/`fs` call baked in (testable with fixture bytes). */
export type RecordingHasher = (bytes: Uint8Array) => string | Promise<string>;
/** Injected file reader — no direct `fs` call baked in (testable with an in-memory fixture). */
export type RecordingReader = (path: string) => Promise<Uint8Array>;

export interface RecordingAdapterDeps {
  hasher: RecordingHasher;
  reader: RecordingReader;
  transcribe: Transcribe;
  now?: () => string;
}

export interface RecordingInput {
  path: string;
  tenantId: string;
}

function isRecordingHint(input: unknown): input is { kind: "recording"; path: string; tenantId?: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).kind === "recording" &&
    typeof (input as Record<string, unknown>).path === "string"
  );
}

function extractPath(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (isRecordingHint(input)) return input.path;
  return undefined;
}

function hasAudioVideoExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return AUDIO_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Creates the `recording` `Source` adapter (contract C2). */
export function createRecordingSource(deps: RecordingAdapterDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    name: "recording",

    detect(input: unknown): boolean {
      if (isRecordingHint(input)) return true;
      const path = extractPath(input);
      return typeof path === "string" && hasAudioVideoExtension(path);
    },

    async fetch(
      input: unknown,
      consent: ConsentContext,
    ): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      const path = extractPath(input);
      if (!path) throw new Error("recording adapter: fetch() called with an unrecognized input");

      const tenantId = isRecordingHint(input) && input.tenantId ? input.tenantId : (input as RecordingInput)?.tenantId;
      if (!tenantId) throw new Error("recording adapter: fetch() requires a tenantId");

      const bytes = await deps.reader(path);
      const hash = await deps.hasher(bytes);

      const source: SourceDoc = {
        _id: tenantSourceId(tenantId, hash),
        tenantId,
        kind: "recording",
        captureMode: consent.captureMode,
        path,
        hash,
        consent: {
          given: consent.given,
          recordedBy: consent.recordedBy,
          note: consent.note,
        },
        createdAt: now(),
      };

      const media: MediaDoc[] = [
        {
          _id: `${source._id}-media`,
          tenantId,
          sourceRef: source._id,
          kind: "recording",
          path,
          retention: { purgeAfterVerified: false },
        },
      ];

      return { source, media };
    },

    async toTurns(source: SourceDoc): Promise<Turn[]> {
      if (!source.path) throw new Error("recording adapter: toTurns() requires source.path");
      const bytes = await deps.reader(source.path);
      return deps.transcribe(bytes, {});
    },
  };
}
