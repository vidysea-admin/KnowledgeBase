import {
  uploadFile, pollFileState, transcribeUploadedAudio,
  type Transcribe, type UploadTransport, type UploadTransportRequest,
} from "@lkb/ai";

const GOOGLE = "https://generativelanguage.googleapis.com";
const MAX_AUDIO = 128 * 1024 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;

/** Trusted configuration only; capability means configured, never live verified. */
export function sourceMediaConfiguration(env: Record<string, string | undefined>) {
  const model = env.LKB_SOURCE_INTAKE_MODEL;
  const key = env.GEMINI_API_KEY;
  return model && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model) && key?.trim()
    ? { model, apiKey: key } : undefined;
}

export function inspectSourceMediaRuntime(env: Record<string, string | undefined>) {
  return {
    enabled: env.LKB_SOURCE_INTAKE === "1",
    transcriptionConfigured: !!sourceMediaConfiguration(env),
    hostedAcquisitionEnabled: env.LKB_HOSTED_SOURCE_ACQUISITION === "1",
    onairSessionConfigured: !!env.LKB_ONAIR_COOKIE_HEADER?.trim(),
    liveVerified: false as const,
  };
}

function providerUrl(value: string): URL {
  const u = new URL(value);
  if (u.origin !== GOOGLE || u.username || u.password || u.hash || !u.pathname.startsWith("/")) {
    throw new Error("source media provider endpoint refused");
  }
  return u;
}

/** Every request, including provider-issued upload URLs, stays on the configured Google origin. */
export function sourceUploadTransport(fetcher: typeof fetch = fetch, timeoutMs = 60_000, parentSignal?: AbortSignal): UploadTransport {
  return async (req: UploadTransportRequest) => {
    providerUrl(req.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const raw = req.body instanceof Uint8Array;
      const response = await fetcher(req.url, {
        method: req.method, headers: req.headers, redirect: "error",
        signal: parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal,
        body: req.body === undefined ? undefined : raw ? Buffer.from(req.body as Uint8Array) : JSON.stringify(req.body),
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > MAX_RESPONSE) throw new Error("source media provider response too large");
            chunks.push(next.value);
          }
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      }
      const text = Buffer.concat(chunks).toString("utf8");
      let body: unknown;
      try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
      return { status: response.status, headers, body };
    } catch { throw new Error("source media provider request failed"); }
    finally { clearTimeout(timer); }
  };
}

export function sourceAudioMime(bytes: Uint8Array): string {
  const b = Buffer.from(bytes);
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b.length >= 3 && b.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  throw new Error("source media format unsupported");
}

export interface SourceTranscriberOptions {
  apiKey: string;
  model: string;
  transport?: UploadTransport;
  delay?: (ms: number) => Promise<void>;
  pollAttempts?: number;
  timeoutMs?: number;
}

async function boundedProviderCall(transport: UploadTransport, req: UploadTransportRequest, timeoutMs: number) {
  if (timeoutMs <= 0) throw new Error("source media deadline expired");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([transport(req), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("source media deadline expired")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Actual Gemini File API response parser; no assumption that generateContent returns body.turns. */
export function createSourceMediaTranscriber(options: SourceTranscriberOptions): Transcribe {
  if (!options.apiKey.trim() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(options.model)) {
    throw new Error("source media configuration unavailable");
  }
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const polls = options.pollAttempts ?? 30;
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(polls) || polls < 1 || polls > 30) throw new Error("invalid source media poll bound");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error("invalid source media deadline");
  return async (audio, opts) => {
    const duration = (opts as typeof opts & { mediaDurationSeconds?: number }).mediaDurationSeconds;
    if (!Number.isFinite(duration) || duration! <= 0) throw new Error("source media measured duration required");
    if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO) throw new Error("source media audio size refused");
    const mime = sourceAudioMime(audio);
    // Existing Gemini generator explicitly uses audio/mp4; acquisition normalizes all supported sources to m4a.
    if (mime !== "audio/mp4") throw new Error("source media requires normalized MP4 audio");
    const controller = new AbortController();
    const deadline = Date.now() + timeoutMs;
    const rawTransport = options.transport ?? sourceUploadTransport(fetch, 60_000, controller.signal);
    const transport: UploadTransport = async (req) => {
      const response = await boundedProviderCall(rawTransport, req, Math.min(60_000, deadline - Date.now()));
      if (req.url.includes(":generateContent?") && response.status >= 200 && response.status < 300) {
        const body = response.body as { candidates?: { finishReason?: string }[] } | undefined;
        if (body?.candidates?.[0]?.finishReason !== "STOP") throw new Error("source media generation incomplete");
      }
      return response;
    };
    let name: string | undefined;
    let cleanupFailed = false;
    try {
      const uploaded = await uploadFile(audio, mime, transport, options.apiKey, "source-intake-audio");
      name = uploaded.name;
      if (!/^files\/[A-Za-z0-9_-]+$/.test(name)) throw new Error("invalid uploaded file name");
      providerUrl(uploaded.fileUri);
      let active = false;
      for (let attempt = 0; attempt < polls; attempt++) {
        const state = await pollFileState(name, transport, options.apiKey);
        if (state === "FAILED") throw new Error("source media processing failed");
        if (state === "ACTIVE") { active = true; break; }
        if (attempt + 1 < polls) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { await Promise.race([delay(2_000), new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("source media deadline expired")), Math.max(1, deadline - Date.now()));
          })]); } finally { if (timer) clearTimeout(timer); }
        }
      }
      if (!active) throw new Error("source media processing timeout");
      const result = await transcribeUploadedAudio(uploaded.fileUri, transport, options.apiKey, options.model, duration);
      if (!result.turns.length || result.turns.some((turn) =>
        !turn.text.trim() || !turn.speakerRef.trim() || !Number.isFinite(turn.tStart) ||
        !Number.isFinite(turn.tEnd) || turn.tStart < 0 || turn.tEnd <= turn.tStart || turn.tEnd > duration!)) {
        throw new Error("source media transcript invalid");
      }
      if (result.turns[0]!.tStart > Math.min(20, duration!) ||
          duration! - result.turns.at(-1)!.tEnd > Math.max(30, duration! * 0.02)) throw new Error("source media transcript incomplete");
      return result.turns;
    } catch { throw new Error("source media transcription failed"); }
    finally {
      controller.abort();
      // Provider files contain source media. Cleanup failure refuses acceptance rather than reporting success.
      if (name && /^files\/[A-Za-z0-9_-]+$/.test(name)) {
        try {
          const cleanup = options.transport ?? sourceUploadTransport(fetch, 15_000);
          const deleted = await boundedProviderCall(cleanup,
            { method: "DELETE", url: `${GOOGLE}/v1beta/${name}?key=${encodeURIComponent(options.apiKey)}` }, 15_000);
          cleanupFailed = deleted.status !== 404 && (deleted.status < 200 || deleted.status >= 300);
        } catch { cleanupFailed = true; }
      }
      if (cleanupFailed) throw new Error("source media cleanup failed");
    }
  };
}
