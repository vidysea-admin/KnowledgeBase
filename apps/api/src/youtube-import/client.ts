/**
 * apps/api/src/youtube-import/client.ts - the four official YouTube Data API v3 calls the import uses, and nothing
 * else: channels.list (mine=true), playlistItems.list, captions.list, captions.download. Every call is charged to the
 * quota ledger BEFORE it is sent; a 403 quota error stops the run (QuotaStop) after bounded backoff for rate limits.
 */
import type { Http } from "./http.js";
import { QUOTA_COST, QuotaStop, type QuotaLedger } from "./quota.js";

const BASE = "https://www.googleapis.com/youtube/v3";
const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

export class YoutubeApiError extends Error {
  constructor(readonly status: number, readonly reason: string, message: string) { super(message); this.name = "YoutubeApiError"; }
}

export interface OwnChannel { channelId: string; title: string; uploadsPlaylistId: string }
export interface UploadedVideo { videoId: string; title: string; publishedAt: string }
export interface CaptionTrack { id: string; language: string; kind: "standard" | "ASR" | "forced"; isDraft: boolean; name: string }

export interface YoutubeApiDeps { http: Http; accessToken: () => Promise<string>; ledger: QuotaLedger; sleep?: (ms: number) => Promise<void>; backoffMs?: number }

type Json = Record<string, any>;
function errorReason(body: string): string {
  try {
    const e = (JSON.parse(body) as Json).error as Json | undefined;
    return String(e?.errors?.[0]?.reason ?? e?.status ?? "unknown");
  } catch { return "unknown"; }
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function createYoutubeApi(deps: YoutubeApiDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const backoff = deps.backoffMs ?? 2000;

  async function call(cost: number, path: string, params: Record<string, string>): Promise<string> {
    await deps.ledger.charge(cost);
    const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;
    for (let attempt = 0; ; attempt++) {
      const res = await deps.http({ url, headers: { authorization: `Bearer ${await deps.accessToken()}` } });
      if (res.status >= 200 && res.status < 300) return res.body;
      const reason = errorReason(res.body);
      if (res.status === 403 && QUOTA_REASONS.has(reason)) { await deps.ledger.exhaust(); throw new QuotaStop("api-quota", `YouTube API ${reason}`); }
      const rate = res.status === 403 && RATE_REASONS.has(reason);
      if ((rate || res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(backoff * 2 ** attempt); continue; }
      if (rate) { await deps.ledger.exhaust(); throw new QuotaStop("api-quota", `YouTube API ${reason}`); }
      throw new YoutubeApiError(res.status, reason, `YouTube API ${path} failed: HTTP ${res.status} ${reason}`);
    }
  }
  const json = (body: string): Json => JSON.parse(body) as Json;

  return {
    async ownChannel(): Promise<OwnChannel> {
      const body = json(await call(QUOTA_COST.channelsList, "channels", { part: "snippet,contentDetails", mine: "true" }));
      const item = (body.items as Json[] | undefined)?.[0];
      const uploads = str(item?.contentDetails?.relatedPlaylists?.uploads);
      if (!item || !uploads) throw new YoutubeApiError(404, "noChannel", "the authorized Google account has no YouTube channel");
      return { channelId: str(item.id), title: str(item.snippet?.title), uploadsPlaylistId: uploads };
    },
    /** Newest first. Stops paging at `since` or `limit` so unneeded pages cost no quota. */
    async *uploads(playlistId: string, opts: { since?: string; limit?: number } = {}): AsyncGenerator<UploadedVideo> {
      let pageToken = ""; let count = 0;
      for (;;) {
        const params: Record<string, string> = { part: "snippet,contentDetails", playlistId, maxResults: "50" };
        if (pageToken) params.pageToken = pageToken;
        const body = json(await call(QUOTA_COST.playlistItemsList, "playlistItems", params));
        for (const it of (body.items as Json[] | undefined) ?? []) {
          const publishedAt = str(it.contentDetails?.videoPublishedAt);
          const videoId = str(it.contentDetails?.videoId);
          if (!videoId || !publishedAt) continue; // private or deleted entries carry no published date
          if (opts.since && publishedAt.slice(0, 10) < opts.since) return;
          yield { videoId, title: str(it.snippet?.title), publishedAt };
          if (opts.limit && ++count >= opts.limit) return;
        }
        pageToken = str(body.nextPageToken);
        if (!pageToken) return;
      }
    },
    async captionTracks(videoId: string): Promise<CaptionTrack[]> {
      const body = json(await call(QUOTA_COST.captionsList, "captions", { part: "snippet", videoId }));
      return ((body.items as Json[] | undefined) ?? []).map((it): CaptionTrack => {
        const kind = str(it.snippet?.trackKind).toLowerCase();
        return { id: str(it.id), language: str(it.snippet?.language), kind: kind === "asr" ? "ASR" : kind === "forced" ? "forced" : "standard",
          isDraft: it.snippet?.isDraft === true, name: str(it.snippet?.name) };
      }).filter((t) => t.id);
    },
    async downloadCaption(trackId: string): Promise<string> {
      return call(QUOTA_COST.captionsDownload, `captions/${encodeURIComponent(trackId)}`, { tfmt: "vtt" });
    },
  };
}
export type YoutubeApi = ReturnType<typeof createYoutubeApi>;

/** Manual en/hi first, then auto-generated (ASR), then any other manual track. Drafts and forced tracks are never used. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const usable = tracks.filter((t) => !t.isDraft && t.kind !== "forced");
  const rank = (t: CaptionTrack) => (t.kind === "standard" && /^(en|hi)(-|$)/i.test(t.language) ? 0 : t.kind === "ASR" ? 1 : 2);
  const pref = (t: CaptionTrack) => (/^en(-|$)/i.test(t.language) ? 0 : /^hi(-|$)/i.test(t.language) ? 1 : 2);
  return [...usable].sort((a, b) => rank(a) - rank(b) || pref(a) - pref(b))[0];
}
