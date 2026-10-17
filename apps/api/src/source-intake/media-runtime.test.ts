import { test } from "node:test";
import assert from "node:assert/strict";
import type { UploadTransport, UploadTransportRequest } from "@lkb/ai";
import {
  createSourceMediaTranscriber, inspectSourceMediaRuntime, sourceMediaConfiguration,
  sourceUploadTransport,
} from "./media-runtime.js";

const AUDIO = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 77, 52, 65, 32, 0, 0, 0, 0]);
const AUDIO_OPTS = { diarize: true, mediaDurationSeconds: 6 };
function protocol(options: { failGenerate?: boolean; failDelete?: boolean; processing?: boolean; finishReason?: string } = {}) {
  const requests: UploadTransportRequest[] = [];
  const transport: UploadTransport = async (req): Promise<Awaited<ReturnType<UploadTransport>>> => {
    requests.push(req);
    if (req.method === "DELETE") return { status: options.failDelete ? 500 : 200, headers: {} };
    if (req.url.includes("/upload/")) return { status: 200, headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/resumable/upload" } };
    if (req.method === "PUT") return { status: 200, headers: {}, body: { file: {
      uri: "https://generativelanguage.googleapis.com/v1beta/files/fixture", name: "files/fixture",
    } } };
    if (req.method === "GET") return { status: 200, headers: {}, body: { state: options.processing ? "PROCESSING" : "ACTIVE" } };
    return { status: options.failGenerate ? 500 : 200, headers: {}, body: options.failGenerate ? { error: "secret-token" } : {
      candidates: [{ finishReason: options.finishReason ?? "STOP", content: { parts: [{ text: "[00:00] spk:0: First fact. [00:05] spk:1: Second fact." }] } }],
    } };
  };
  return { requests, transport };
}

test("explicit model/key required; configured capability never reports live verification", () => {
  assert.equal(sourceMediaConfiguration({ GEMINI_API_KEY: "secret" }), undefined);
  assert.equal(sourceMediaConfiguration({ GEMINI_API_KEY: "secret", LKB_SOURCE_INTAKE_MODEL: "../model" }), undefined);
  assert.deepEqual(inspectSourceMediaRuntime({ LKB_SOURCE_INTAKE: "1", GEMINI_API_KEY: "secret", LKB_SOURCE_INTAKE_MODEL: "gemini-test" }), {
    enabled: true, transcriptionConfigured: true, hostedAcquisitionEnabled: false, onairSessionConfigured: false, liveVerified: false,
  });
});

test("actual File API response shape yields turns and remote media is deleted", async () => {
  const fake = protocol();
  const transcribe = createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: fake.transport });
  const turns = await transcribe(AUDIO, AUDIO_OPTS);
  assert.equal(turns.length, 2);
  assert.equal(turns[1]!.speakerRef, "spk:1");
  assert.equal(turns[1]!.tStart, 5);
  assert.equal(fake.requests.at(-1)!.method, "DELETE");
  assert.equal(fake.requests.find((req) => req.method === "PUT")!.body, AUDIO);
});

test("provider failures redact raw diagnostics and still clean uploaded source media", async () => {
  const fake = protocol({ failGenerate: true });
  await assert.rejects(createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: fake.transport })(AUDIO, AUDIO_OPTS),
    (error: Error) => error.message === "source media transcription failed");
  assert.equal(fake.requests.at(-1)!.method, "DELETE");
});

test("processing is bounded; cleanup failure cannot report successful transcription", async () => {
  const processing = protocol({ processing: true });
  await assert.rejects(createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: processing.transport,
    pollAttempts: 2, delay: async () => undefined })(AUDIO, AUDIO_OPTS));
  assert.equal(processing.requests.filter((req) => req.method === "GET").length, 2);
  assert.equal(processing.requests.at(-1)!.method, "DELETE");
  const deletion = protocol({ failDelete: true });
  await assert.rejects(createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: deletion.transport })(AUDIO, AUDIO_OPTS), /cleanup failed/);
});

test("invalid media and a hanging transport refuse within the total budget", async () => {
  const fake = protocol();
  const transcribe = createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: fake.transport });
  await assert.rejects(transcribe(new Uint8Array(), AUDIO_OPTS));
  await assert.rejects(transcribe(Buffer.from("RIFF0000WAVE0000"), AUDIO_OPTS), /normalized MP4/);
  assert.equal(fake.requests.length, 0);
  await assert.rejects(createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", timeoutMs: 15,
    transport: () => new Promise(() => undefined) })(AUDIO, AUDIO_OPTS), /transcription failed/);
});

test("measured duration is mandatory; last turn is clamped and incomplete long-media output refuses", async () => {
  const fake = protocol();
  const transcribe = createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: fake.transport });
  await assert.rejects(transcribe(AUDIO, {}), /measured duration/);
  const turns = await transcribe(AUDIO, AUDIO_OPTS);
  assert.equal(turns.at(-1)!.tEnd, 6);
  const longOpts = { ...AUDIO_OPTS, mediaDurationSeconds: 3_600 };
  await assert.rejects(transcribe(AUDIO, longOpts), /transcription failed/);
});

test("known truncated provider output refuses even when its last timestamp reaches the media tail", async () => {
  const fake = protocol({ finishReason: "MAX_TOKENS" });
  await assert.rejects(createSourceMediaTranscriber({ apiKey: "secret", model: "gemini-test", transport: fake.transport })(AUDIO, AUDIO_OPTS), /transcription failed/);
  assert.equal(fake.requests.at(-1)!.method, "DELETE");
});

test("provider-issued foreign upload endpoint refuses before credentials/media can leave Google", async () => {
  let called = 0;
  const transport = sourceUploadTransport((async () => { called++; return new Response("{}"); }) as typeof fetch);
  for (const url of ["https://attacker.test/upload", "https://generativelanguage.googleapis.com@attacker.test/upload", "http://generativelanguage.googleapis.com/upload"]) {
    await assert.rejects(transport({ method: "PUT", url, body: AUDIO }));
  }
  assert.equal(called, 0);
});
