#!/usr/bin/env node
/**
 * packages/meeting-bot/src/cli.ts — T-024 C5. `lkb capture <meeting-url> [--consent-note <text>]`
 *
 * Location choice (documented per the contract's instruction to pick apps/ vs packages/ and
 * justify it): `apps/api` exists only as a T-016 placeholder with no routes yet, so there is no
 * live "apps/ hosts CLIs/servers, packages/ hosts libraries" precedent to follow either way. The
 * decisive fact is `.dependency-cruiser.cjs`: `apps -> packages/{ask,ingest,index,ai,db,core}`
 * does NOT include `meeting-bot`, so an `apps/cli` could never import `@lkb/meeting-bot`'s
 * `capture()` without breaking `pnpm lint:structure`. The CLI has to live inside
 * `packages/meeting-bot` to be able to call its own `capture()` at all — hence `src/cli.ts` here,
 * not `apps/cli`.
 *
 * Same dependency wall applies to `@lkb/ai`: `meeting-bot -> ingest, core` only (ARCHITECTURE
 * §5) — `@lkb/ai` is not on that list, so this file cannot `import` a whisper/gemini adapter
 * from `@lkb/ai` even though the contract (C5) asks for "real packages/ai" wiring. The honest
 * resolution used here: `defaultTranscribe()` below makes the *same* wire-shape HTTP call
 * `packages/ai/src/stt/whisper.ts` makes (POST `{WHISPER_URL}/transcribe`) — hitting the real
 * self-hosted whisper worker at runtime — without a static import of `@lkb/ai`, so
 * `pnpm lint:structure`'s dependency-cruiser rule stays green. Pass `--whisper-url` (or leave
 * `WHISPER_URL` unset) to point it at a live worker; with no worker reachable it is expected to
 * throw — that failure is real, not swallowed. `--fake-transcribe` swaps in a deterministic
 * built-in transcriber instead, which is what the required fixture demo run below uses so the
 * demo does not depend on a live `workers/transcribe/` process.
 *
 * Real pieces wired here: `@lkb/ingest`'s `createRecordingSource` with a real SHA-256 hasher
 * (`node:crypto`) and a real file reader (`node:fs/promises`). Fake pieces (per C3/C5): the three
 * `Joiner`s — built from the real `joiners/*.ts` factories (not reimplemented inline) but given
 * injected transport/launch/capture functions that resolve to a local fixture file instead of a
 * live Vexa/browser/OS-audio session, exactly as T-024's non-goals require.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createRecordingSource } from "@lkb/ingest";
import type { ConsentContext, Turn } from "@lkb/ingest";

import { capture } from "./capture.js";
import type { JoinStrategy } from "./strategy.js";
import type { Joiner } from "./joiner.js";
import { createVexaJoiner } from "./joiners/vexa-joiner.js";
import { createBrowserJoiner } from "./joiners/browser-joiner.js";
import { createSystemAudioJoiner } from "./joiners/system-audio-joiner.js";
import { runFinalize, runLogin, runRecord } from "./capture/record-commands.js";
import { runWatchdog } from "./capture/watchdog.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = path.join(HERE, "..", "fixtures", "sample-recording.wav");
const DEFAULT_WHISPER_URL = "http://localhost:8899";

interface CliArgs {
  url: string;
  consentNote?: string;
  tenantId: string;
  recordedBy: string;
  captureMode: ConsentContext["captureMode"];
  confirmedNoAlternative: boolean;
  fixturePath: string;
  whisperUrl: string;
  fakeTranscribe: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const [command, url, ...rest] = argv;
  if (command !== "capture" || !url) {
    throw new Error("usage: lkb capture <meeting-url> [--consent-note <text>] [--capture-mode <mode>] " +
      "[--tenant <id>] [--recorded-by <id>] [--confirmed-no-alternative] [--fixture-path <path>] " +
      "[--whisper-url <url>] [--fake-transcribe]");
  }

  const args: CliArgs = {
    url,
    tenantId: "cli-tenant",
    recordedBy: "cli-user",
    captureMode: "provided",
    confirmedNoAlternative: false,
    fixturePath: DEFAULT_FIXTURE_PATH,
    whisperUrl: DEFAULT_WHISPER_URL,
    fakeTranscribe: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    switch (flag) {
      case "--consent-note":
        args.consentNote = rest[++i];
        break;
      case "--tenant":
        args.tenantId = rest[++i] as string;
        break;
      case "--recorded-by":
        args.recordedBy = rest[++i] as string;
        break;
      case "--capture-mode":
        args.captureMode = rest[++i] as ConsentContext["captureMode"];
        break;
      case "--confirmed-no-alternative":
        args.confirmedNoAlternative = true;
        break;
      case "--fixture-path":
        args.fixturePath = rest[++i] as string;
        break;
      case "--whisper-url":
        args.whisperUrl = rest[++i] as string;
        break;
      case "--fake-transcribe":
        args.fakeTranscribe = true;
        break;
      default:
        throw new Error(`lkb capture: unrecognized flag '${flag}'`);
    }
  }
  return args;
}

/** Same wire shape as packages/ai/src/stt/whisper.ts — see file header for why this is a local
 * mirror rather than an import. */
function defaultTranscribe(whisperUrl: string) {
  return async (audio: Uint8Array): Promise<Turn[]> => {
    const res = await fetch(`${whisperUrl}/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: JSON.stringify({ audio: Array.from(audio), diarize: true }),
    });
    if (!res.ok) throw new Error(`whisper worker error ${res.status}`);
    const body = (await res.json()) as { turns?: Turn[] };
    return body.turns ?? [];
  };
}

/** Deterministic built-in transcriber — no network call. Used by `--fake-transcribe` and the
 * required fixture demo run so it does not depend on a live workers/transcribe/ process. */
function fakeTranscribe(): (audio: Uint8Array) => Promise<Turn[]> {
  return async (audio: Uint8Array): Promise<Turn[]> => [
    { speakerRef: "spk:0", tStart: 0, tEnd: 1, text: `[fake-transcribe] ${audio.byteLength} bytes captured` },
  ];
}

/** Builds all three joiners from the real joiners/*.ts factories, wired to resolve to a local
 * fixture file instead of a live session (T-024 non-goal: no real Vexa/Playwright/OS-audio yet). */
function buildFakeJoiners(fixturePath: string): Record<JoinStrategy, Joiner> {
  const resolved = { sessionHandle: fixturePath, mediaStream: undefined };
  return {
    vexa: createVexaJoiner({
      baseUrl: "https://unused.invalid",
      transport: async () => ({ status: 200, body: resolved }),
    }),
    browser: createBrowserJoiner({ launch: async () => resolved }),
    "system-audio": createSystemAudioJoiner({
      startCapture: async () => resolved,
      stopCapture: async () => {},
    }),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "record") return runRecord(argv.slice(1));
  if (argv[0] === "finalize") return runFinalize(argv.slice(1));
  if (argv[0] === "login") return runLogin(argv.slice(1));
  if (argv[0] === "watchdog") return runWatchdog(argv.slice(1));
  const args = parseArgs(argv);

  const consent: ConsentContext = {
    captureMode: args.captureMode,
    given: true,
    recordedBy: args.recordedBy,
    note: args.consentNote,
    confirmedNoAlternative: args.confirmedNoAlternative,
  };

  const ingestSource = createRecordingSource({
    hasher: (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
    reader: (filePath: string) => readFile(filePath),
    transcribe: args.fakeTranscribe ? fakeTranscribe() : defaultTranscribe(args.whisperUrl),
  });

  const result = await capture(
    args.url,
    { tenantId: args.tenantId, consent },
    { joiners: buildFakeJoiners(args.fixturePath), ingestSource },
  );

  console.log(`sessionId: ${result.session._id}`);
  console.log(`capture mode: ${result.source.captureMode}`);
  console.log(`turn count: ${result.turns.length}`);
  console.log(`warnings: ${result.warnings.length > 0 ? result.warnings.join(" | ") : "(none)"}`);
}

main().catch((err) => {
  console.error(`lkb capture failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
