/**
 * apps/api/src/youtube-import/adapter.ts - `Source` adapter for captions a channel owner downloaded through the
 * official YouTube Data API. It feeds the existing `intakeFromSource` (same sink, same sources/sessions/turns docs as
 * every other source). Identity is the videoId: the source hash is sha256("youtube-captions:<videoId>"), so the
 * tenant-scoped source id is stable and a repeat import is "already-ingested" (D-135) even if captions are edited.
 * Consent: the owner's OAuth authorisation is recorded as an owner-content provenance receipt in consent + sourceMeta.
 */
import { createHash } from "node:crypto";
import { tenantSourceId, extractYoutubeVideoId, canonicalYoutubeUrl, type ConsentContext, type MediaDoc, type Source, type SourceDoc, type Turn } from "@lkb/ingest";
import { parseCaptions } from "./captions.js";

export const CAPTIONS_KIND = "youtube-captions";
export const OWNER_RECORDER = "youtube-owner-import";

export interface CaptionsInput {
  kind: typeof CAPTIONS_KIND;
  tenantId: string;
  videoId: string;
  title: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  track: { id: string; language: string; kind: string };
  captionText: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function captionSourceId(tenantId: string, videoId: string): string {
  return tenantSourceId(tenantId, sha256(`${CAPTIONS_KIND}:${videoId}`));
}
export function ownerConsent(channelId: string): ConsentContext {
  return { captureMode: "provided", given: true, recordedBy: OWNER_RECORDER,
    note: `Owner-content import: captions of channel ${channelId} downloaded via YouTube Data API v3 captions.download with the channel owner's own OAuth authorisation.` };
}

function isInput(i: unknown): i is CaptionsInput {
  return typeof i === "object" && i !== null && (i as { kind?: unknown }).kind === CAPTIONS_KIND;
}

export function createCaptionsSource(now: () => string = () => new Date().toISOString()): Source {
  const pending = new Map<string, string>(); // sourceId -> caption text, between fetch() and toTurns() of one intake
  return {
    name: CAPTIONS_KIND,
    detect: isInput,
    async fetch(input: unknown, consent: ConsentContext): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      if (!isInput(input)) throw new Error("youtube-captions: unrecognised input");
      if (!consent?.given || consent.captureMode !== "provided" || consent.recordedBy !== OWNER_RECORDER) {
        throw new Error("youtube-captions: requires the owner-content consent receipt (given, provided, owner import)");
      }
      if (!VIDEO_ID.test(input.videoId) || extractYoutubeVideoId(canonicalYoutubeUrl(input.videoId)) !== input.videoId) throw new Error("youtube-captions: invalid videoId");
      if (!input.tenantId || !input.captionText.trim()) throw new Error("youtube-captions: tenantId and caption text required");
      const hash = sha256(`${CAPTIONS_KIND}:${input.videoId}`);
      const id = tenantSourceId(input.tenantId, hash);
      pending.set(id, input.captionText);
      const canonicalUrl = canonicalYoutubeUrl(input.videoId);
      const source = {
        _id: id, tenantId: input.tenantId, kind: "url", captureMode: consent.captureMode, url: canonicalUrl, hash,
        consent: { given: consent.given, recordedBy: consent.recordedBy, note: consent.note }, createdAt: now(),
        sourceMeta: {
          platform: "youtube", videoId: input.videoId, canonicalUrl, title: input.title, publishedAt: input.publishedAt,
          channelId: input.channelId, channelTitle: input.channelTitle, retrievedAt: now(),
          captionTrack: { id: input.track.id, language: input.track.language, kind: input.track.kind, sha256: sha256(input.captionText) },
          ownerContent: { basis: "own-channel", route: "youtube-data-api-v3/captions.download", authorizedBy: consent.recordedBy },
        },
      } as SourceDoc;
      return { source, media: [] };
    },
    async toTurns(source: SourceDoc): Promise<Turn[]> {
      const text = pending.get(source._id);
      pending.delete(source._id);
      if (text === undefined) throw new Error("youtube-captions: toTurns() without a preceding fetch()");
      return parseCaptions(text);
    },
  };
}
