/**
 * apps/api/src/youtube-import/run.ts - orchestrates one owner-captions import: uploads playlist -> per video
 * (already imported? tracks? pick -> download -> parse) -> existing `intakeFromSource`. Videos already in the sink are
 * skipped BEFORE any caption quota is spent; videos without a downloadable caption are logged and skipped; a quota
 * stop ends the run cleanly and reports it. Writes only through the injected sink (staging is enforced by the CLI).
 */
import { intakeFromSource, type IntakeSink } from "@lkb/ingest";
import { CAPTIONS_KIND, captionSourceId, createCaptionsSource, ownerConsent, type CaptionsInput } from "./adapter.js";
import { parseCaptions } from "./captions.js";
import { pickTrack, YoutubeApiError, type YoutubeApi } from "./client.js";
import { QUOTA_COST, QuotaStop, type QuotaLedger } from "./quota.js";

export interface ImportOptions { tenantId: string; since?: string; limit?: number }
export interface ImportDeps { api: YoutubeApi; sink: IntakeSink; ledger: QuotaLedger; newId: () => string; log: (line: string) => void }
export interface ImportSummary {
  channelId: string; examined: number; imported: number; alreadyImported: number;
  skipped: { videoId: string; reason: string }[]; failed: number; quotaStopped?: "budget" | "api-quota"; quotaUsed: number;
}

export async function runImport(deps: ImportDeps, opts: ImportOptions): Promise<ImportSummary> {
  const { api, sink, ledger, log } = deps;
  const channel = await api.ownChannel();
  const summary: ImportSummary = { channelId: channel.channelId, examined: 0, imported: 0, alreadyImported: 0, skipped: [], failed: 0, quotaUsed: 0 };
  const skip = (videoId: string, reason: string) => { summary.skipped.push({ videoId, reason }); log(`skip ${videoId}: ${reason}`); };
  try {
    for await (const video of api.uploads(channel.uploadsPlaylistId, { since: opts.since, limit: opts.limit })) {
      summary.examined++;
      if (await sink.findSessionBySource(opts.tenantId, captionSourceId(opts.tenantId, video.videoId))) { summary.alreadyImported++; log(`already imported ${video.videoId}`); continue; }
      if (ledger.remaining() < QUOTA_COST.captionsList + QUOTA_COST.captionsDownload) throw new QuotaStop("budget", "not enough quota left for one more video");
      try {
        const track = pickTrack(await api.captionTracks(video.videoId));
        if (!track) { skip(video.videoId, "no-caption-track"); continue; }
        let captionText: string;
        try { captionText = await api.downloadCaption(track.id); }
        catch (e) { if (e instanceof YoutubeApiError && e.status !== 401) { skip(video.videoId, `download-refused-${e.status}-${e.reason}`); continue; } throw e; }
        if (parseCaptions(captionText).length === 0) { skip(video.videoId, "empty-captions"); continue; }
        const input: CaptionsInput = { kind: CAPTIONS_KIND, tenantId: opts.tenantId, videoId: video.videoId, title: video.title, publishedAt: video.publishedAt,
          channelId: channel.channelId, channelTitle: channel.title, track: { id: track.id, language: track.language, kind: track.kind }, captionText };
        const result = await intakeFromSource(input, ownerConsent(channel.channelId), {
          adapters: [createCaptionsSource()], sink, newId: deps.newId, now: () => video.publishedAt, // session.date = the video's published date
        });
        if (result.status === "created") { summary.imported++; log(`imported ${video.videoId} (${result.turnCount} turns, ${track.kind} ${track.language})`); }
        else summary.alreadyImported++;
      } catch (e) {
        if (e instanceof QuotaStop) throw e;
        if (e instanceof YoutubeApiError && e.status === 401) throw e;
        summary.failed++; log(`failed ${video.videoId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    if (!(e instanceof QuotaStop)) throw e;
    summary.quotaStopped = e.why; log(`quota stop (${e.why}): ${e.message}`);
  }
  summary.quotaUsed = ledger.used();
  return summary;
}
