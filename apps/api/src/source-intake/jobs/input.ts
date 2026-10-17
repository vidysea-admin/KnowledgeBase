import { createHash } from "node:crypto";
import { canonicalYoutubeUrl, extractYoutubeVideoId, parseOnairUrl, parseZoomRecordingUrl } from "@lkb/ingest";
import { SourceJobError, type SourceJobInput, type WatchedJobSnapshot } from "./types.js";

export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function sourceJobInputHash(value: Pick<SourceJobInput, "tenantId" | "actorKeyId" | "url" | "watchedSnapshot">): string {
  const identity = [value.tenantId, value.actorKeyId, value.url];
  return digest(value.watchedSnapshot ? [...identity, value.watchedSnapshot] : identity);
}
function approvedWatchedSnapshot(value: WatchedJobSnapshot): WatchedJobSnapshot {
  if (!value || value.version !== 1 || typeof value.text !== "string" || !value.text.trim() ||
      Buffer.byteLength(value.text, "utf8") > 48 * 1024 || Buffer.from(value.text, "utf8").toString("utf8") !== value.text ||
      typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash) ||
      createHash("sha256").update(value.text, "utf8").digest("hex") !== value.hash ||
      (value.previousHash !== null && (typeof value.previousHash !== "string" || !/^[a-f0-9]{64}$/.test(value.previousHash))) ||
      typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)) ||
      new Date(value.fetchedAt).toISOString() !== value.fetchedAt) throw new SourceJobError("invalid_watched_snapshot", 400);
  const snapshot: WatchedJobSnapshot = { version: 1, watchedSourceId: actorIdentity(value.watchedSourceId), text: value.text,
    hash: value.hash, fetchedAt: value.fetchedAt, previousHash: value.previousHash };
  // The existing private journal has a 128KiB event limit. Leave room for identity,
  // approval and completion records; reject rather than truncate the guarded bytes.
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 48 * 1024) throw new SourceJobError("watched_snapshot_too_large", 400);
  return Object.freeze(snapshot);
}
export function jobIdentity(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new SourceJobError("invalid_job_id", 400);
  return value;
}
export function actorIdentity(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) throw new SourceJobError("invalid_actor", 400);
  return value;
}
export function approvedSourceInput(value: SourceJobInput): SourceJobInput {
  const tenantId = actorIdentity(value.tenantId), actorKeyId = actorIdentity(value.actorKeyId);
  if (typeof value.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.idempotencyKey)) throw new SourceJobError("invalid_idempotency_key", 400);
  if (typeof value.url !== "string" || value.url.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value.url)) throw new SourceJobError("invalid_source_url", 400);
  let target: URL;
  try { target = new URL(value.url); } catch { throw new SourceJobError("invalid_source_url", 400); }
  if (target.protocol !== "https:" || target.username || target.password || target.port || target.hash) throw new SourceJobError("invalid_source_url", 400);
  if (value.watchedSnapshot !== undefined) {
    if (target.search || target.href !== value.url) throw new SourceJobError("source_url_parameters_refused", 400);
    return Object.freeze({ tenantId, actorKeyId, url: target.href, idempotencyKey: value.idempotencyKey,
      watchedSnapshot: approvedWatchedSnapshot(value.watchedSnapshot) });
  }
  const video = extractYoutubeVideoId(value.url), onair = parseOnairUrl(value.url), zoom = parseZoomRecordingUrl(value.url);
  let url: string;
  if (video) {
    if (target.searchParams.getAll("v").length > 1 || [...target.searchParams.keys()].some(key => key !== "v")) throw new SourceJobError("source_url_parameters_refused", 400);
    url = canonicalYoutubeUrl(video);
  } else if ((onair.ok || zoom.ok) && !target.search) url = onair.ok ? onair.canonicalUrl : zoom.ok ? zoom.canonicalUrl : "";
  else throw new SourceJobError("unsupported_worker_source", 400);
  return Object.freeze({ tenantId, actorKeyId, url, idempotencyKey: value.idempotencyKey });
}
