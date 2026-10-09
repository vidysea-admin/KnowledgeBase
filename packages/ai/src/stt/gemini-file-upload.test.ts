/**
 * packages/ai/src/stt/gemini-file-upload.test.ts — T-003 C4. `uploadFile`, `pollFileState`,
 * `transcribeUploadedAudio`, `parseDiarizedTranscript` against a fake `UploadTransport` — no
 * real network call anywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  uploadFile, pollFileState, transcribeUploadedAudio, parseDiarizedTranscript,
  type UploadTransport, type UploadTransportRequest,
} from "./gemini-file-upload.js";

function fakeTransport(handlers: Record<string, (req: UploadTransportRequest) => { status: number; headers?: Record<string, string>; body?: unknown }>): UploadTransport {
  return async (req) => {
    const key = `${req.method} ${req.url.split("?")[0]}`;
    const handler = handlers[key] ?? handlers[req.method];
    if (!handler) throw new Error(`fakeTransport: no handler for ${key}`);
    const result = handler(req);
    return { status: result.status, headers: result.headers ?? {}, body: result.body };
  };
}

const API_KEY = "fake-key";
const CAPTURED_SHORT_RESPONSE = "[00:00] spk:0: VDC controlled test. This generated voice is for an authorized private test. [00:08] The video shows a changing pattern and a frame counter. Test number one.";
const CAPTURED_AV_RESPONSE = "[00:00] spk:0: Vidiac control test. This generated voice is for an authorized private test. [00:06] The video shows a changing pattern and a frame counter. Test number one.";

test("measured final fallback replays both exact 172-byte captures without changing text, labels or default request", async () => {
  for (const [text, sha256] of [[CAPTURED_SHORT_RESPONSE, "3aba227dfbe45c60a5ff67f09ee43574da4233f2a6c266c11fb54b064b78fb82"],
    [CAPTURED_AV_RESPONSE, "9169b00d13f90b0a617cd4ecf40e20a84f8e42bef6918d2f4f3847a35564d82f"]]) {
    assert.equal(Buffer.byteLength(text!), 172);
    assert.equal(createHash("sha256").update(text!).digest("hex"), sha256);
    const legacy = parseDiarizedTranscript(text!);
    assert.equal(legacy[0]!.tEnd, 30);
    for (const duration of [12.650958, 15]) {
      let calls = 0;
      const transport: UploadTransport = async req => {
        calls++;
        assert.match(req.url, /models\/gemini-3\.5-flash:generateContent/);
        assert.deepEqual((req.body as {generationConfig: unknown}).generationConfig, {thinkingConfig: {thinkingBudget: 0}});
        return {status: 200, headers: {}, body: {candidates: [{content: {parts: [{text}]}, finishReason: "STOP"}]}};
      };
      const result = await transcribeUploadedAudio("files/captured", transport, API_KEY, undefined, duration);
      assert.deepEqual(result.turns, [{...legacy[0], tEnd: duration}]);
      assert.equal(calls, 1);
    }
  }
});

test("duration fallback changes only final inferred EOF and leaves unknown or invalid starts visible", async () => {
  const text = "[00:00] Bob: first [00:05] Ann: final";
  const legacy = parseDiarizedTranscript(text);
  assert.deepEqual(parseDiarizedTranscript(text, 12.650958), [legacy[0], {...legacy[1], tEnd: 12.650958}]);
  for (const duration of [undefined, NaN, Infinity, -Infinity, 0, -1]) {
    assert.deepEqual(parseDiarizedTranscript(text, duration), legacy);
  }
  assert.equal(parseDiarizedTranscript("[00:01] Bob: incomplete long recording", 3600)[0]!.tEnd, 31);
  for (const start of [15, 16]) {
    const turn = parseDiarizedTranscript(`[00:${start}] Bob: invalid late start`, 15)[0]!;
    assert.equal(turn.tStart, start); assert.equal(turn.tEnd, start + 30);
  }
});

test("invalid supplied STT measurements refuse before the provider transport runs", async () => {
  let calls = 0;
  const transport: UploadTransport = async () => {calls++; throw new Error("provider must not run");};
  for (const duration of [NaN, Infinity, -Infinity, 0, -1]) {
    await assert.rejects(transcribeUploadedAudio("files/invalid", transport, API_KEY, undefined, duration), /invalid measured media duration/);
  }
  assert.equal(calls, 0);
});

test("uploadFile posts a resumable-upload start, then PUTs bytes to the returned upload URL", async () => {
  let capturedFinalizeUrl = "";
  let capturedBytes: unknown;
  const transport = fakeTransport({
    "POST https://generativelanguage.googleapis.com/upload/v1beta/files": () => ({
      status: 200, headers: { "x-goog-upload-url": "https://upload.example.com/session/abc" },
    }),
    "PUT https://upload.example.com/session/abc": (req) => {
      capturedFinalizeUrl = req.url;
      capturedBytes = req.body;
      return { status: 200, body: { file: { uri: "files/abc123", name: "files/abc123" } } };
    },
  });

  const bytes = new Uint8Array([1, 2, 3]);
  const result = await uploadFile(bytes, "audio/mp4", transport, API_KEY, "test-audio");

  assert.equal(result.fileUri, "files/abc123");
  assert.equal(result.name, "files/abc123");
  assert.equal(capturedFinalizeUrl, "https://upload.example.com/session/abc");
  assert.equal(capturedBytes, bytes);
});

test("uploadFile throws when the start response carries no upload URL header", async () => {
  const transport = fakeTransport({
    "POST https://generativelanguage.googleapis.com/upload/v1beta/files": () => ({ status: 200, headers: {} }),
  });
  await assert.rejects(
    () => uploadFile(new Uint8Array([1]), "audio/mp4", transport, API_KEY),
    /no x-goog-upload-url/,
  );
});

test("uploadFile throws on a non-2xx status at either step", async () => {
  const failingStart = fakeTransport({
    "POST https://generativelanguage.googleapis.com/upload/v1beta/files": () => ({ status: 403, body: { error: "denied" } }),
  });
  await assert.rejects(() => uploadFile(new Uint8Array([1]), "audio/mp4", failingStart, API_KEY), /upload-start failed with status 403/);
});

test("pollFileState maps the response state field to ACTIVE/PROCESSING/FAILED", async () => {
  const active = fakeTransport({ GET: () => ({ status: 200, body: { state: "ACTIVE" } }) });
  assert.equal(await pollFileState("files/abc", active, API_KEY), "ACTIVE");

  const processing = fakeTransport({ GET: () => ({ status: 200, body: { state: "PROCESSING" } }) });
  assert.equal(await pollFileState("files/abc", processing, API_KEY), "PROCESSING");

  const failed = fakeTransport({ GET: () => ({ status: 200, body: { state: "FAILED" } }) });
  assert.equal(await pollFileState("files/abc", failed, API_KEY), "FAILED");
});

test("pollFileState throws on an unexpected state value", async () => {
  const transport = fakeTransport({ GET: () => ({ status: 200, body: { state: "WEIRD" } }) });
  await assert.rejects(() => pollFileState("files/abc", transport, API_KEY), /unexpected file state/);
});

test("parseDiarizedTranscript parses [MM:SS] Speaker: text lines, computes tEnd from the next turn", () => {
  const text = [
    "[00:00] Devesh: Perfect perfect.",
    "[00:02] spk:1: Welcome everyone.",
    "[01:55] Priyamvada: Thank you.",
  ].join("\n");

  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 3);
  assert.deepEqual(turns[0], { speakerRef: "Devesh", tStart: 0, tEnd: 2, text: "Perfect perfect." });
  assert.deepEqual(turns[1], { speakerRef: "spk:1", tStart: 2, tEnd: 115, text: "Welcome everyone." });
  assert.equal(turns[2]!.tStart, 115);
  assert.equal(turns[2]!.tEnd, 115 + 30, "last turn's tEnd falls back to tStart + 30s");
});

test("parseDiarizedTranscript drops preamble before the first marker; text between two markers belongs to the first speaker", () => {
  const text = "## Some header\n\n[00:10] Bob: hello\nstill Bob talking, no newline needed\n[00:20] Ann: hi";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.speakerRef, "Bob");
  assert.equal(turns[0]!.text, "hello\nstill Bob talking, no newline needed",
    "continuation text between two markers is real spoken content, not a line to discard");
  assert.equal(turns[1]!.speakerRef, "Ann");
});

test("parseDiarizedTranscript real bug repro: many turns arriving with NO newline between markers are still split correctly", () => {
  // Real failure found live 2026-09-04: the model sometimes emits dozens of turns back-to-back
  // in one continuous block with no line breaks. A per-line regex merged all of this into a
  // single giant "turn" on a real 62.7MB session (full content still present in the raw text,
  // just mis-split into 2 turns instead of ~150). This reproduces that shape at small scale.
  const text = "[00:00] Nikhil: Perfect perfect.[00:02] spk:1: Welcome everyone.[01:55] Priyamvada: Thank you so much.";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 3, "must split into 3 turns even with zero separators between markers");
  assert.equal(turns[0]!.speakerRef, "Nikhil");
  assert.equal(turns[0]!.text, "Perfect perfect.");
  assert.equal(turns[1]!.speakerRef, "spk:1");
  assert.equal(turns[1]!.text, "Welcome everyone.");
  assert.equal(turns[2]!.speakerRef, "Priyamvada");
  assert.equal(turns[2]!.text, "Thank you so much.");
});

test("parseDiarizedTranscript real bug repro: an implausibly long speaker capture is recovered as text, not kept as a fake speakerRef", () => {
  // Real corruption found live 2026-09-04 in production data (T-003 phase 4 checker sweep): a
  // real session's turn 2 had NO real "Name:" marker right after its timestamp, so the
  // non-greedy speaker capture ran on until it found some unrelated ": " deep inside a sentence,
  // swallowing ~280 real characters of spoken content into `speakerRef`. This reproduces that
  // shape (a marker with no clean short label before the next real colon) at small scale.
  const text = "[00:00] spk:0: Or [00:01] so, good evening to all our members joining from different parts of the Global South today, you know: It is ciao, bonjour, and kia ora.";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.speakerRef, "spk:0");
  assert.equal(turns[1]!.speakerRef, "spk:0", "an implausible speaker capture inherits the previous turn's real speaker, never a sentence fragment");
  assert.match(turns[1]!.text, /^so, good evening to all our members/, "the swallowed text is recovered into the turn's own content");
  assert.match(turns[1]!.text, /It is ciao, bonjour, and kia ora\.$/);
});

test("parseDiarizedTranscript real bug repro (u1-toc-sept-catchup, 2026-09-25): a speaker capture of EXACTLY MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH (60) chars is still recovered as text, not kept as a fake speakerRef", () => {
  // Off-by-one found live in data/toc-migrated/2026-09-16-pathways-in-psychology/turns.json
  // (t280): the guard was `speakerRef.length > 60`, so an exactly-60-char garbled capture
  // ("through any of the three intakes in a year. [32:41] Anuradha") slipped through as a real
  // speakerRef. A genuine speaker label is never anywhere near 60 chars, so the boundary itself
  // must count as implausible, not just anything past it.
  const garbled = "through any of the three intakes in a year. [32:41] Anuradha";
  assert.equal(garbled.length, 60, "fixture must reproduce the exact boundary length");
  const text = `[00:00] Anuradha: intro text here. [00:05] ${garbled}: Psychology would only have one intake.`;
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 2);
  assert.equal(turns[1]!.speakerRef, "Anuradha", "a 60-char capture must inherit the previous turn's real speaker, not stay as a sentence fragment");
  assert.match(turns[1]!.text, /^through any of the three intakes in a year\. \[32:41\] Anuradha: /, "the swallowed text is recovered into the turn's own content");
  assert.match(turns[1]!.text, /Psychology would only have one intake\.$/);
});

test("parseDiarizedTranscript: a normal short speaker label right after the first marker is unaffected by the length guard", () => {
  const text = "[00:00] Dr. Priya Sharma: Welcome everyone to this session.";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns[0]!.speakerRef, "Dr. Priya Sharma");
  assert.equal(turns[0]!.text, "Welcome everyone to this session.");
});

test("parseDiarizedTranscript parses [H:MM:SS] timestamps (real bug: Gemini switches format past 60 minutes)", () => {
  const text = "[0:59:50] Bob: Almost an hour in.\n[1:26:30] Ann: Past the hour mark now.";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.speakerRef, "Bob");
  assert.equal(turns[0]!.tStart, 59 * 60 + 50);
  assert.equal(turns[1]!.speakerRef, "Ann");
  assert.equal(turns[1]!.tStart, 1 * 3600 + 26 * 60 + 30);
});

test("parseDiarizedTranscript handles a mix of [MM:SS] and [H:MM:SS] in the same transcript", () => {
  const text = "[05:00] Bob: Early on.\n[1:05:00] Ann: An hour and five minutes in.";
  const turns = parseDiarizedTranscript(text);
  assert.equal(turns[0]!.tStart, 5 * 60);
  assert.equal(turns[1]!.tStart, 3600 + 5 * 60);
});

test("parseDiarizedTranscript on empty text returns an empty array", () => {
  assert.deepEqual(parseDiarizedTranscript(""), []);
});

test("transcribeUploadedAudio calls generateContent with fileData and parses the response", async () => {
  const transport = fakeTransport({
    POST: () => ({
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ text: "[00:00] Bob: hi\n[00:05] Ann: hey" }] } }],
        usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 56 },
      },
    }),
  });

  const result = await transcribeUploadedAudio("files/abc123", transport, API_KEY);
  assert.equal(result.turns.length, 2);
  assert.equal(result.turns[0]!.speakerRef, "Bob");
  assert.equal(result.usage.inputTokens, 1234);
  assert.equal(result.usage.outputTokens, 56);
});

test("transcribeUploadedAudio disables the model's extended-thinking budget in the request", async () => {
  // Real bug found live: without thinkingConfig.thinkingBudget=0, Gemini can spend the whole
  // output budget on hidden reasoning tokens and return finishReason:"STOP" with an empty
  // transcript. This proves the fix is genuinely present in the request, not just that the
  // function still returns turns for a well-formed response.
  let capturedBody: Record<string, unknown> | undefined;
  const transport: UploadTransport = async (req) => {
    capturedBody = req.body as Record<string, unknown>;
    return {
      status: 200,
      headers: {},
      body: { candidates: [{ content: { parts: [{ text: "[00:00] Bob: hi" }] } }] },
    };
  };

  await transcribeUploadedAudio("files/abc", transport, API_KEY);

  const generationConfig = capturedBody?.generationConfig as
    { thinkingConfig?: { thinkingBudget?: number } } | undefined;
  assert.equal(generationConfig?.thinkingConfig?.thinkingBudget, 0);
});

test("transcribeUploadedAudio throws on a non-2xx status", async () => {
  const transport = fakeTransport({ POST: () => ({ status: 500, body: { error: "oops" } }) });
  await assert.rejects(() => transcribeUploadedAudio("files/abc", transport, API_KEY), /generateContent failed with status 500/);
});

test("transcribeUploadedAudio throws (never silently returns 0 turns) on an empty/blocked completion", async () => {
  // Real bug caught live on a 62.7MB audio file: a 200 response with finishReason set and no
  // usable text previously parsed to an empty turns array, which a naive caller then wrote over
  // real existing data. This must throw with the diagnostic fields, not succeed with turns: [].
  const transport = fakeTransport({
    POST: () => ({
      status: 200,
      body: {
        candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
        usageMetadata: { promptTokenCount: 151828, candidatesTokenCount: 1 },
      },
    }),
  });
  await assert.rejects(
    () => transcribeUploadedAudio("files/big-file", transport, API_KEY),
    /finishReason=MAX_TOKENS/,
  );
});

test("transcribeUploadedAudio throws on a totally empty candidates array too", async () => {
  const transport = fakeTransport({
    POST: () => ({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }),
  });
  await assert.rejects(
    () => transcribeUploadedAudio("files/blocked", transport, API_KEY),
    /blockReason=SAFETY/,
  );
});
