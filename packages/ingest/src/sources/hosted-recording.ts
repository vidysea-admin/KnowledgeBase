/**
 * packages/ingest/src/sources/hosted-recording.ts — T-045 (OnAir + Zoom). Turns the URL-only recognisers
 * (`onair.ts`, `zoom-recording.ts`) into real `Source` adapters with the same output contract as `youtube.ts`
 * (kind "url" source doc + one media doc, tenant carried, `sourceMeta` citation block).
 *
 * The media is obtained through an injected `HostedRecordingDownloader`. No downloader ships here: OnAir needs a
 * one-time Google login and Zoom share links may be passcode-protected, both needing credentials and network that are
 * out of scope. With no downloader injected, `fetch()` fails closed with a typed `downloader-unavailable` error.
 * The only URL ever handed to the downloader is the recogniser's canonical URL (query/fragment dropped).
 * Zoom share tokens are bearer secrets: they are never placed in an error message.
 */
import type { Transcribe } from "@lkb/ai";
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";
import type { RecordingHasher, RecordingReader } from "./recording.js";
import { isInsideDir } from "./youtube.js";
import { parseOnairUrl } from "./onair.js";
import { parseZoomRecordingUrl } from "./zoom-recording.js";

export type HostedRecordingErrorCode =
  | "invalid-input"
  | "consent-refused"
  | "downloader-unavailable"
  | "download-failed"
  | "path-escape"
  | "no-output"
  | "empty-output";

export class HostedRecordingError extends Error {
  readonly code: HostedRecordingErrorCode;
  readonly platform: string;
  constructor(platform: string, code: HostedRecordingErrorCode, message: string) {
    super(`${platform} adapter [${code}]: ${message}`);
    this.name = "HostedRecordingError";
    this.code = code;
    this.platform = platform;
  }
}

export interface HostedDownloadRequest {
  platform: string;
  /** Validated event / recording id. */
  id: string;
  /** Rebuilt canonical URL (https, allow-listed host, no query, no fragment). */
  canonicalUrl: string;
  workDir: string;
}
/** Injected: fetches the media into `workDir` and returns its absolute path. Never implemented here. */
export type HostedRecordingDownloader = (req: HostedDownloadRequest) => Promise<{ path: string }>;

export interface HostedRecordingDeps {
  workDir: string;
  hasher: RecordingHasher;
  reader: RecordingReader;
  transcribe: Transcribe;
  downloader?: HostedRecordingDownloader;
  now?: () => string;
}

interface Recogniser {
  name: string;
  /** id key used in `sourceMeta` (`eventId` / `recordingId`). */
  idKey: string;
  parse(input: unknown): { ok: true; id: string; canonicalUrl: string } | { ok: false };
}

const ONAIR: Recogniser = {
  name: "cloudonair",
  idKey: "eventId",
  parse(input) {
    const r = parseOnairUrl(input);
    return r.ok ? { ok: true, id: r.eventId, canonicalUrl: r.canonicalUrl } : { ok: false };
  },
};
const ZOOM: Recogniser = {
  name: "zoom-recording",
  idKey: "recordingId",
  parse(input) {
    const r = parseZoomRecordingUrl(input);
    return r.ok ? { ok: true, id: r.recordingId, canonicalUrl: r.canonicalUrl } : { ok: false };
  },
};

const VIDEO_EXT = /\.(mp4|webm|mkv|mov)$/i;

function urlOf(input: unknown): unknown {
  return typeof input === "string" ? input : typeof input === "object" && input !== null ? (input as { url?: unknown }).url : undefined;
}

function assertConsent(platform: string, consent: ConsentContext): void {
  const ok =
    !!consent &&
    consent.given === true &&
    (consent.captureMode === "provided" || consent.captureMode === "public") &&
    typeof consent.recordedBy === "string" &&
    consent.recordedBy.length > 0;
  if (!ok) {
    throw new HostedRecordingError(
      platform,
      "consent-refused",
      "requires consent.given === true, recordedBy, and captureMode 'provided' or 'public' (H8 provided-first)",
    );
  }
}

function createHosted(rec: Recogniser, deps: HostedRecordingDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());
  const isAbs = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(deps.workDir);
  if (!isAbs) throw new HostedRecordingError(rec.name, "path-escape", "workDir must be an absolute path");

  return {
    name: rec.name,

    detect(input: unknown): boolean {
      return rec.parse(urlOf(input)).ok;
    },

    async fetch(input: unknown, consent: ConsentContext): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      assertConsent(rec.name, consent);
      const parsed = rec.parse(urlOf(input));
      const tenantId = typeof input === "object" && input !== null ? (input as { tenantId?: unknown }).tenantId : undefined;
      if (!parsed.ok || typeof tenantId !== "string" || tenantId.length === 0) {
        throw new HostedRecordingError(rec.name, "invalid-input", "input must be { url, tenantId } with a supported URL");
      }
      if (!deps.downloader) {
        throw new HostedRecordingError(rec.name, "downloader-unavailable", "no media downloader is configured for this platform");
      }

      let mediaPath: string;
      try {
        ({ path: mediaPath } = await deps.downloader({
          platform: rec.name,
          id: parsed.id,
          canonicalUrl: parsed.canonicalUrl,
          workDir: deps.workDir,
        }));
      } catch {
        // deliberately drops the underlying message: it may echo the URL (a bearer token for Zoom)
        throw new HostedRecordingError(rec.name, "download-failed", "the downloader failed");
      }
      if (typeof mediaPath !== "string" || mediaPath.length === 0) {
        throw new HostedRecordingError(rec.name, "no-output", "downloader reported no file path");
      }
      if (!isInsideDir(deps.workDir, mediaPath)) {
        throw new HostedRecordingError(rec.name, "path-escape", "reported media path is outside workDir");
      }
      let bytes: Uint8Array;
      try {
        bytes = await deps.reader(mediaPath);
      } catch {
        throw new HostedRecordingError(rec.name, "no-output", "media file could not be read");
      }
      if (!bytes || bytes.byteLength === 0) throw new HostedRecordingError(rec.name, "empty-output", "media file is empty");
      const hash = await deps.hasher(bytes);
      const retrievedAt = now();
      const sourceId = tenantSourceId(tenantId, hash);

      const source = {
        _id: sourceId,
        tenantId,
        kind: "url",
        captureMode: consent.captureMode,
        path: mediaPath,
        url: parsed.canonicalUrl,
        hash,
        consent: { given: consent.given, recordedBy: consent.recordedBy, note: consent.note },
        createdAt: retrievedAt,
        sourceMeta: { platform: rec.name, [rec.idKey]: parsed.id, canonicalUrl: parsed.canonicalUrl, retrievedAt },
      } as SourceDoc;
      const media = [
        {
          _id: `${sourceId}-media`,
          tenantId,
          sourceRef: sourceId,
          kind: VIDEO_EXT.test(mediaPath) ? "video" : "audio",
          path: mediaPath,
          retention: { purgeAfterVerified: false },
        },
      ] as MediaDoc[];
      return { source, media };
    },

    async toTurns(source: SourceDoc): Promise<Turn[]> {
      if (!source.path || !isInsideDir(deps.workDir, source.path)) {
        throw new HostedRecordingError(rec.name, "path-escape", "toTurns requires source.path inside workDir");
      }
      const bytes = await deps.reader(source.path);
      if (bytes.byteLength === 0) throw new HostedRecordingError(rec.name, "empty-output", "media file is empty");
      return deps.transcribe(bytes, {});
    },
  };
}

/** `Source` for https://cloudonair.withgoogle.com/events/<slug>. */
export function createOnairSource(deps: HostedRecordingDeps): Source {
  return createHosted(ONAIR, deps);
}

/** `Source` for https://zoom.us/rec/share/<token>. */
export function createZoomRecordingSource(deps: HostedRecordingDeps): Source {
  return createHosted(ZOOM, deps);
}
