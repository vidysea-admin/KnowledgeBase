/**
 * packages/ai/src/stt/gemini-file-upload.ts — T-003. The Gemini File API flow for audio too
 * large for `gemini.ts`'s inline-base64 path (most of the real TOC session recordings are
 * 20-60MB). Behind its own small `UploadTransport` seam — the shared `Transport` type in
 * `provider.ts` doesn't expose response headers, which the resumable-upload handoff needs (the
 * upload-start response returns the actual upload URL in an `x-goog-upload-url` header, not the
 * body) — a deliberate, narrow addition rather than widening the type every other adapter
 * depends on. No real network call anywhere in this module's own logic; a real implementation is
 * injected by the caller (a script, not a test).
 */
import type { Turn } from "./transcribe.js";

export interface UploadTransportRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  /** JSON object (upload-start) or raw bytes (upload-finalize PUT). */
  body?: unknown;
}

export interface UploadTransportResponse {
  status: number;
  /** Lowercased header names. */
  headers: Record<string, string>;
  /** Parsed JSON body when the response is JSON; undefined otherwise. */
  body?: unknown;
}

export type UploadTransport = (req: UploadTransportRequest) => Promise<UploadTransportResponse>;

const DEFAULT_MODEL = "gemini-3.5-flash";

function assertOk(res: UploadTransportResponse, step: string): void {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`gemini file upload: ${step} failed with status ${res.status}: ${JSON.stringify(res.body)}`);
  }
}

/** Starts + finalizes a resumable file upload. Returns the uploaded file's `uri` (for
 * `generateContent`'s `fileData`) and `name` (for polling status). */
export async function uploadFile(bytes: Uint8Array, mimeType: string, transport: UploadTransport,
  apiKey: string, displayName = "audio"): Promise<{ fileUri: string; name: string }> {
  const start = await transport({
    method: "POST",
    url: `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: { file: { display_name: displayName } },
  });
  assertOk(start, "upload-start");

  const uploadUrl = start.headers["x-goog-upload-url"];
  if (!uploadUrl) {
    throw new Error("gemini file upload: upload-start response carried no x-goog-upload-url header");
  }

  const finalize = await transport({
    method: "PUT",
    url: uploadUrl,
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  assertOk(finalize, "upload-finalize");

  const body = finalize.body as { file?: { uri?: string; name?: string } } | undefined;
  if (!body?.file?.uri || !body.file.name) {
    throw new Error("gemini file upload: finalize response missing file.uri/file.name");
  }
  return { fileUri: body.file.uri, name: body.file.name };
}

export type FileState = "ACTIVE" | "FAILED" | "PROCESSING";

/** A SINGLE poll — the caller (a real script, never a test) retries with its own backoff. */
export async function pollFileState(name: string, transport: UploadTransport,
  apiKey: string): Promise<FileState> {
  const res = await transport({
    method: "GET",
    url: `https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`,
  });
  assertOk(res, "poll-file-state");

  const body = res.body as { state?: string } | undefined;
  const state = body?.state;
  if (state === "ACTIVE" || state === "FAILED" || state === "PROCESSING") return state;
  throw new Error(`gemini file upload: unexpected file state "${String(state)}"`);
}

/** `hours` is `undefined` for a `[MM:SS]` match, or the parsed hour string for `[H:MM:SS]` —
 * real bug found live (2026-09-04): Gemini switches to the 3-group form once a transcript
 * crosses the 60-minute mark, which the original 2-group-only regex could not match at all,
 * silently absorbing everything past that point as unparsed trailing text glued onto the last
 * recognized turn. */
function parseTimestamp(hours: string | undefined, minutes: string, seconds: string): number {
  const h = hours !== undefined ? Number(hours) : 0;
  return h * 3600 + Number(minutes) * 60 + Number(seconds);
}

// Global, NOT anchored to line-start — real bug found live (2026-09-04): the model does not
// reliably put every `[MM:SS] Speaker:` marker on its own line; sometimes dozens of turns arrive
// back-to-back within one continuous block of text with no newline between them. A per-line
// regex silently swallowed everything after the first line-boundary-aligned marker into a single
// giant "turn" — the content wasn't lost (verified against a real response spanning a full
// ~60-minute session merged into 2 turns), just mis-split. Matching globally and slicing text
// between consecutive marker positions (not line boundaries) finds every real turn regardless of
// whether the model inserted a newline before it. Speaker capture is non-greedy up to a colon
// followed by whitespace ("<speaker>: text"), not just any colon — a speakerRef like "spk:1"
// contains its own colon with no following space, so a naive "first colon" split would wrongly
// cut it at "spk". The timestamp itself matches EITHER `[MM:SS]` (2 groups) OR `[H:MM:SS]`
// (3 groups, optional middle `(?:(\d{1,2}):)?` group) — see parseTimestamp's doc comment.
const TIMESTAMP_MARKER_RE = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.+?):\s+/g;

/**
 * Parses `[MM:SS] SpeakerName: text` markers into `Turn[]` — matches anywhere in the text, not
 * just at line starts (see TIMESTAMP_MARKER_RE comment). `tEnd` for each turn is the NEXT turn's
 * `tStart`; the LAST turn's inferred `tEnd` is its own `tStart + 30` seconds, limited by a
 * finite positive media duration when its start precedes that duration. Unknown duration and
 * starts at/after EOF retain the fallback for downstream validation. Text before the first marker
 * (headers, preamble) is dropped; text between two markers belongs entirely to the FIRST one's
 * turn (it is that speaker's continued content, not a separate unparseable line to discard).
 */
// Real bug found live (2026-09-04, T-003 phase 4): the non-greedy `(.+?):\s+` speaker capture
// occasionally has no real "Name:"/"spk:N:" marker immediately after a timestamp to anchor on
// (the model continued straight into prose without one) and instead runs on until it happens to
// find SOME unrelated ": " later in that sentence -- swallowing real spoken content into
// `speakerRef` (observed: a real session's turn 2 had a ~280-character sentence fragment as its
// "speaker label"). A genuine speaker label (a name, a title, "spk:N") is never that long, so an
// implausibly long capture is treated as a mis-split: the swallowed text is recovered into the
// turn's own content (prepended, since it's real spoken words, not a label) and the speaker is
// inherited from the previous turn (the far more common case here is the same speaker
// continuing, not a genuine unlabeled speaker change).
const MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH = 60;

export function parseDiarizedTranscript(text: string, mediaDurationSeconds?: number): Turn[] {
  const matches = [...text.matchAll(TIMESTAMP_MARKER_RE)];
  const parsed: { speakerRef: string; tStart: number; text: string }[] = [];
  let lastPlausibleSpeaker = "spk:0";

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const [, hours, mm, ss, speaker] = match;
    const contentStart = match.index + match[0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    let turnText = text.slice(contentStart, contentEnd).trim();
    let speakerRef = speaker!.trim();

    if (speakerRef.length >= MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH) {
      turnText = `${speakerRef}: ${turnText}`.trim();
      speakerRef = lastPlausibleSpeaker;
    } else {
      lastPlausibleSpeaker = speakerRef;
    }

    if (!turnText) continue;
    parsed.push({ speakerRef, tStart: parseTimestamp(hours, mm!, ss!), text: turnText });
  }

  const LAST_TURN_FALLBACK_SECONDS = 30;
  const knownDuration = Number.isFinite(mediaDurationSeconds) && mediaDurationSeconds! > 0;
  return parsed.map((turn, i) => ({
    speakerRef: turn.speakerRef,
    tStart: turn.tStart,
    tEnd: i + 1 < parsed.length ? parsed[i + 1]!.tStart
      : knownDuration && turn.tStart < mediaDurationSeconds!
        ? Math.min(turn.tStart + LAST_TURN_FALLBACK_SECONDS, mediaDurationSeconds!)
        : turn.tStart + LAST_TURN_FALLBACK_SECONDS,
    text: turn.text,
  }));
}

export interface TranscribeUploadedResult {
  turns: Turn[];
  usage: { inputTokens: number; outputTokens: number };
}

const DIARIZE_PROMPT = [
  "Transcribe and diarize this audio in full, start to end.",
  "Output ONLY the transcript as one line per turn, in this EXACT format:",
  "[MM:SS] SpeakerName: spoken text",
  "Use the speaker's actual name if it is said aloud or clearly inferable from context;",
  "otherwise use spk:0, spk:1, etc. consistently for the same voice.",
  // Real bug found live (2026-09-04): without this, one speaker talking continuously for
  // several minutes came back as ONE turn with a single leading marker and no others -- the
  // downstream parser's only way to guess that turn's real tEnd (the next marker's tStart, or
  // this +30s fallback for the very last turn) then drastically understated how much real
  // content/time it actually covered, making a fully-transcribed passage look like it stopped
  // after 30 seconds. Forcing a fresh marker at least every ~20s, even mid-monologue, keeps
  // tEnd accurate throughout instead of relying on speaker changes that may never come.
  "Insert a fresh [MM:SS] marker at least every 15-20 seconds even when the same speaker keeps",
  "talking without interruption -- never let one turn span more than about 20 seconds.",
  "No headers, no summary, no commentary outside the transcript lines.",
].join(" ");

/** Calls `generateContent` against an already-uploaded file (criterion 1's `uploadFile`). */
export async function transcribeUploadedAudio(fileUri: string, transport: UploadTransport,
  apiKey: string, model: string = DEFAULT_MODEL, mediaDurationSeconds?: number): Promise<TranscribeUploadedResult> {
  if (mediaDurationSeconds !== undefined && (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0)) {
    throw new Error("gemini file upload: invalid measured media duration");
  }
  const res = await transport({
    method: "POST",
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    headers: { "content-type": "application/json" },
    body: {
      contents: [
        {
          parts: [
            { text: DIARIZE_PROMPT },
            { fileData: { mimeType: "audio/mp4", fileUri } },
          ],
        },
      ],
      // Real bug found live (2026-09-04): without this, Gemini 2.5+/3.x's extended-thinking mode
      // can consume the entire output budget on hidden reasoning tokens, returning
      // `finishReason: "STOP"` with a near-empty transcript (`text: "\n"` plus an opaque
      // `thoughtSignature` blob) — a "successful" completion with no usable content. Disabling
      // thinking frees the whole budget for the actual transcript.
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
    },
  });
  assertOk(res, "generateContent");

  const body = res.body as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  } | undefined;
  const text = (body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  // A 200 response with no usable text is NOT a valid "silent recording" result — real audio
  // never legitimately transcribes to nothing. Caught live on a 62.7MB file: the model returned
  // finishReason (e.g. MAX_TOKENS/SAFETY/RECITATION) with an empty completion, and a naive caller
  // silently wrote 0 turns over 107 real placeholder turns before this guard existed. Throw with
  // the diagnostic fields so the caller knows WHY, rather than treating empty as success.
  if (text.trim().length === 0) {
    const finishReason = body?.candidates?.[0]?.finishReason;
    const blockReason = body?.promptFeedback?.blockReason;
    throw new Error(
      `gemini file upload: generateContent returned no usable text (finishReason=${finishReason ?? "unknown"}, ` +
      `blockReason=${blockReason ?? "none"}) — audio may be too long for a single call, or was blocked/truncated`,
    );
  }

  return {
    turns: parseDiarizedTranscript(text, mediaDurationSeconds),
    usage: {
      inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
