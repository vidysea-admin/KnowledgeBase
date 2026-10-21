/** Fake HTTP + in-memory sink only: no network, no Mongo, no quota spent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IntakePlan, IntakeSink } from "@lkb/ingest";
import { captionSourceId } from "./adapter.js";
import { createYoutubeApi, pickTrack, type CaptionTrack } from "./client.js";
import type { Http } from "./http.js";
import { createQuotaLedger, QUOTA_COST } from "./quota.js";
import { runImport } from "./run.js";

const V = (n: number) => `vid${String(n).padStart(8, "0")}`; // 11 chars
const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nnamaste everyone\n\n00:00:03.000 --> 00:00:05.000\ntoday we talk careers\n";
const track = (id: string, language: string, trackKind: string, isDraft = false) => ({ id, snippet: { language, trackKind, isDraft, name: "" } });

interface World { videos: string[]; tracks: Record<string, unknown[]>; downloads: Record<string, { status: number; body: string }>; calls: string[]; pageSize?: number }
function fakeHttp(w: World): Http {
  return async (req) => {
    const u = new URL(req.url); w.calls.push(u.pathname.replace("/youtube/v3/", ""));
    const ok = (o: unknown) => ({ status: 200, body: JSON.stringify(o) });
    if (u.pathname.endsWith("/channels")) return ok({ items: [{ id: "UCowner", snippet: { title: "Umesh" }, contentDetails: { relatedPlaylists: { uploads: "UUowner" } } }] });
    if (u.pathname.endsWith("/playlistItems")) {
      const size = w.pageSize ?? 50; const start = Number(u.searchParams.get("pageToken") ?? 0);
      const slice = w.videos.slice(start, start + size);
      return ok({ items: slice.map((id, i) => ({ snippet: { title: `title ${id}` }, contentDetails: { videoId: id, videoPublishedAt: `2026-0${9 - ((start + i) % 9)}-15T10:00:00Z` } })), nextPageToken: start + size < w.videos.length ? String(start + size) : undefined });
    }
    if (u.pathname.endsWith("/captions")) return ok({ items: w.tracks[u.searchParams.get("videoId")!] ?? [] });
    const id = decodeURIComponent(u.pathname.split("/captions/")[1]!);
    return w.downloads[id] ?? { status: 404, body: "{}" };
  };
}
function memSink() {
  const plans: IntakePlan[] = [];
  const sink: IntakeSink = {
    async findSessionBySource(tenantId, sourceId) { const p = plans.find((x) => x.source._id === sourceId && x.session.tenantId === tenantId); return p ? { sessionId: p.session._id } : undefined; },
    async save(plan) { plans.push(plan); },
  };
  return { sink, plans };
}
async function harness(w: World, budget = 9000) {
  const ledger = await createQuotaLedger({ budget });
  const api = createYoutubeApi({ http: fakeHttp(w), accessToken: async () => "tok", ledger, sleep: async () => {} });
  const { sink, plans } = memSink(); const log: string[] = []; let n = 0;
  const run = (opts: Partial<Parameters<typeof runImport>[1]> = {}) => runImport({ api, sink, ledger, newId: () => `s${++n}`, log: (l) => log.push(l) }, { tenantId: "umesh", ...opts });
  return { run, plans, ledger, log };
}
const world = (over: Partial<World> = {}): World => ({ videos: [], tracks: {}, downloads: {}, calls: [], ...over });

test("track choice: manual en/hi, then ASR, then other manual; drafts and forced never", () => {
  const t = (id: string, language: string, kind: CaptionTrack["kind"], isDraft = false): CaptionTrack => ({ id, language, kind, isDraft, name: "" });
  assert.equal(pickTrack([t("asr", "en", "ASR"), t("hi", "hi", "standard"), t("fr", "fr", "standard")])?.id, "hi");
  assert.equal(pickTrack([t("hi", "hi", "standard"), t("en", "en", "standard")])?.id, "en");
  assert.equal(pickTrack([t("fr", "fr", "standard"), t("asr", "en", "ASR")])?.id, "asr");
  assert.equal(pickTrack([t("d", "en", "standard", true), t("f", "en", "forced")]), undefined);
});

test("imports a manual-caption video into the intake path with source metadata and the owner-content receipt", async () => {
  const w = world({ videos: [V(1)], tracks: { [V(1)]: [track("asrT", "en", "ASR"), track("manT", "en", "standard")] }, downloads: { manT: { status: 200, body: VTT } } });
  const { run, plans, ledger } = await harness(w);
  const s = await run();
  assert.equal(s.imported, 1);
  const plan = plans[0]!;
  assert.equal(plan.source._id, captionSourceId("umesh", V(1)));
  assert.equal(plan.session.title, `title ${V(1)}`);
  assert.ok(plan.session.date.startsWith("2026-"), "session date is the published date");
  assert.equal(plan.turns.length, 1);
  assert.equal(plan.turns[0]!.text, "namaste everyone today we talk careers");
  const meta = (plan.source as any).sourceMeta;
  assert.equal(meta.videoId, V(1)); assert.equal(meta.channelId, "UCowner"); assert.equal(meta.captionTrack.id, "manT");
  assert.equal(meta.ownerContent.basis, "own-channel");
  assert.equal(plan.source.captureMode, "provided"); assert.equal(plan.source.consent.given, true);
  assert.match(plan.source.consent.note ?? "", /channel owner's own OAuth/);
  assert.equal(ledger.used(), QUOTA_COST.channelsList + QUOTA_COST.playlistItemsList + QUOTA_COST.captionsList + QUOTA_COST.captionsDownload);
  assert.ok(w.calls.every((c) => ["channels", "playlistItems", "captions"].includes(c) || c.startsWith("captions/")), "only the four official endpoints");
});

test("idempotent by videoId: a second run skips before spending caption quota", async () => {
  const w = world({ videos: [V(1)], tracks: { [V(1)]: [track("manT", "en", "standard")] }, downloads: { manT: { status: 200, body: VTT } } });
  const { run, plans, ledger } = await harness(w);
  await run(); const used = ledger.used();
  const again = await run();
  assert.equal(again.imported, 0); assert.equal(again.alreadyImported, 1); assert.equal(plans.length, 1);
  assert.equal(ledger.used() - used, QUOTA_COST.channelsList + QUOTA_COST.playlistItemsList, "no captions.list or download on the repeat run");
});

test("skip path: no track, refused download, and empty captions are logged and skipped, not fatal", async () => {
  const w = world({ videos: [V(1), V(2), V(3), V(4)], tracks: { [V(2)]: [track("t2", "en", "standard")], [V(3)]: [track("t3", "en", "ASR")], [V(4)]: [track("t4", "hi", "standard")] },
    downloads: { t2: { status: 403, body: JSON.stringify({ error: { errors: [{ reason: "forbidden" }] } }) }, t3: { status: 200, body: "WEBVTT\n\n" }, t4: { status: 200, body: VTT } } });
  const { run, plans, log } = await harness(w);
  const s = await run();
  assert.deepEqual(s.skipped.map((x) => x.reason), ["no-caption-track", "download-refused-403-forbidden", "empty-captions"]);
  assert.equal(s.imported, 1); assert.equal(plans.length, 1); assert.equal(s.failed, 0);
  assert.ok(log.some((l) => l.startsWith(`skip ${V(1)}: no-caption-track`)));
});

test("--limit and --since bound the listing", async () => {
  const w = world({ videos: [V(1), V(2), V(3)], tracks: {} });
  const a = await (await harness(w)).run({ limit: 2 });
  assert.equal(a.examined, 2);
  const b = await (await harness(world({ videos: [V(1), V(2), V(3)] }))).run({ since: "2026-09-01" });
  assert.equal(b.examined, 1); // published dates run 2026-09, 08, 07 newest first
});

test("quota stop: local budget ends the run cleanly after the videos it can afford", async () => {
  const videos = [V(1), V(2), V(3)];
  const w = world({ videos, tracks: Object.fromEntries(videos.map((v, i) => [v, [track(`t${i}`, "en", "standard")]])), downloads: Object.fromEntries(videos.map((_, i) => [`t${i}`, { status: 200, body: VTT }])) });
  const { run, plans } = await harness(w, 1 + 1 + 250 * 2 + 10); // room for exactly two videos
  const s = await run();
  assert.equal(s.imported, 2); assert.equal(plans.length, 2); assert.equal(s.quotaStopped, "budget");
});

test("quota stop: API 403 quotaExceeded stops the run and exhausts the ledger; rate limits back off then stop", async () => {
  const w = world({ videos: [V(1), V(2)], tracks: { [V(1)]: [track("t1", "en", "standard")] }, downloads: { t1: { status: 403, body: JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }) } } });
  const h = await harness(w);
  const s = await h.run();
  assert.equal(s.quotaStopped, "api-quota"); assert.equal(s.imported, 0); assert.equal(h.ledger.remaining(), 0);

  const sleeps: number[] = [];
  const ledger = await createQuotaLedger({});
  const api = createYoutubeApi({ ledger, accessToken: async () => "t", sleep: async (ms) => { sleeps.push(ms); }, backoffMs: 10,
    http: async () => ({ status: 403, body: JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }) }) });
  await assert.rejects(api.ownChannel(), (e: any) => e.name === "QuotaStop");
  assert.deepEqual(sleeps, [10, 20]);
});
