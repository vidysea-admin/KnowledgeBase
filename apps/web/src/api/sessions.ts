import { apiFetch, API_BASE_URL, ApiError } from "./client.js";
import type { SessionDetail, SessionSummary, WebinarOperation, WebinarDiscoveryHealth } from "./types.js";

function normalizeSessionPathParam(value: string): string {
  // Accept route params whether they arrive encoded or decoded, and avoid double-encoding.
  // decodeURIComponent throws on malformed payloads; in that case we fall back to raw encoding.
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function listSessions(apiKey: string | null): Promise<{ sessions: SessionSummary[] }> {
  return apiFetch("/sessions", apiKey);
}
export function listWebinarOperations(apiKey: string | null): Promise<{ operations: WebinarOperation[]; omitted: number; discovery?: Record<"calendar" | "gmail", WebinarDiscoveryHealth> }> {
  return apiFetch("/webinar-operations", apiKey);
}

export function getSession(apiKey: string | null, id: string): Promise<SessionDetail> {
  return apiFetch(`/sessions/${normalizeSessionPathParam(id)}`, apiKey);
}

export async function getSessionMedia(apiKey: string | null, id: string, frameId?: string): Promise<Blob> {
  if (!apiKey) throw new ApiError(401, "no API key set");
  const suffix = frameId ? `frames/${encodeURIComponent(frameId)}` : "media";
  const response = await fetch(`${API_BASE_URL}/sessions/${normalizeSessionPathParam(id)}/${suffix}`,
    { headers: { authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new ApiError(response.status, response.status === 413 ? "Browser playback limit is 200 MB" : "Recording unavailable");
  if (Number(response.headers.get("content-length")) > 200 * 1024 * 1024) {
    await response.body?.cancel(); throw new ApiError(413, "Browser playback limit is 200 MB");
  }
  return response.blob();
}

/** Authenticated streaming for large WebM recordings. No key appears in a media URL. */
export function streamSessionMedia(apiKey: string | null, id: string, mime: string,
  video: HTMLVideoElement, onError: (message: string) => void): ((() => void) & { seek(seconds: number): void }) | null {
  const candidates = mime === "video/webm" ? ['video/webm; codecs="vp8,opus"', 'video/webm; codecs="vp9,opus"'] : [];
  const codec = typeof MediaSource !== "undefined" ? candidates.find((c) => MediaSource.isTypeSupported(c)) : undefined;
  if (!apiKey || !codec) return null;
  const selectedCodec: string = codec;
  let stopped = false, generation = 0, pendingTarget: number | null = null;
  let disposeGeneration = () => {}, activeBuffer: SourceBuffer | undefined;
  const contains = (buffer: SourceBuffer, seconds: number) => Array.from({ length: buffer.buffered.length }, (_, i) => i)
    .some((i) => seconds >= buffer.buffered.start(i) && seconds <= buffer.buffered.end(i));
  const update = (buffer: SourceBuffer, signal: AbortSignal, operation: () => void) => new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Recording cannot be decoded by this browser")); };
    const cleanup = () => { buffer.removeEventListener("updateend", done); buffer.removeEventListener("error", fail); signal.removeEventListener("abort", fail); };
    buffer.addEventListener("updateend", done, { once: true }); buffer.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", fail, { once: true });
    try { operation(); } catch (error) { cleanup(); reject(error); }
  });
  function start(target: number | null) {
    disposeGeneration();
    const current = ++generation, controller = new AbortController(), source = new MediaSource(), url = URL.createObjectURL(source);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    pendingTarget = target; activeBuffer = undefined; video.src = url;
    disposeGeneration = () => { controller.abort(); void reader?.cancel().catch(() => {}); URL.revokeObjectURL(url); };
    source.addEventListener("sourceopen", () => { void (async () => {
    if (controller.signal.aborted) return;
    const response = await fetch(`${API_BASE_URL}/sessions/${normalizeSessionPathParam(id)}/media`,
      { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
    if (!response.ok || !response.body) throw new Error("Recording unavailable");
    reader = response.body.getReader();
    const buffer = source.addSourceBuffer(selectedCodec);
    activeBuffer = buffer;
    while (!controller.signal.aborted && current === generation) {
      // Keep at most a minute ahead; fetch pauses until playback catches up.
      while (pendingTarget === null && buffer.buffered.length && buffer.buffered.end(buffer.buffered.length - 1) - video.currentTime > 60) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        if (controller.signal.aborted) return;
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      if (controller.signal.aborted || current !== generation) return;
      await update(buffer, controller.signal, () => buffer.appendBuffer(chunk.value.slice().buffer));
      if (pendingTarget !== null && contains(buffer, pendingTarget)) {
        video.currentTime = pendingTarget; pendingTarget = null;
      }
      const trimBefore = (pendingTarget ?? video.currentTime) - 60;
      if (trimBefore > 0 && buffer.buffered.length) {
        const end = Math.min(trimBefore, buffer.buffered.end(buffer.buffered.length - 1) - 5);
        if (end > buffer.buffered.start(0)) await update(buffer, controller.signal, () => buffer.remove(0, end));
      }
    }
    if (controller.signal.aborted || current !== generation) return;
    if (pendingTarget !== null) throw new Error("Evidence timestamp is not present in this recording");
    if (source.readyState === "open") source.endOfStream();
  })().catch((error: unknown) => {
    if (!controller.signal.aborted && current === generation) { onError(error instanceof Error ? error.message : "Streaming failed"); controller.abort(); }
  }); }, { once: true });
  }
  const stop = () => { if (stopped) return; stopped = true; video.removeEventListener("seeking", onSeeking); generation++; disposeGeneration(); activeBuffer = undefined; video.removeAttribute("src"); video.load(); };
  const seek = (seconds: number) => {
    if (stopped) return;
    if (!Number.isFinite(seconds) || seconds < 0) { onError("Invalid evidence timestamp"); return; }
    if (activeBuffer && contains(activeBuffer, seconds)) { pendingTarget = null; video.currentTime = seconds; }
    else start(seconds);
  };
  const onSeeking = () => {
    if (stopped || pendingTarget !== null || !activeBuffer) return;
    const target = video.currentTime;
    if (Number.isFinite(target) && target >= 0 && !contains(activeBuffer, target)) seek(target);
  };
  video.addEventListener("seeking", onSeeking);
  start(null);
  return Object.assign(stop, { seek });
}
