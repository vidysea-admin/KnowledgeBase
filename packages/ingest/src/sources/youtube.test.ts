/**
 * packages/ingest/src/sources/youtube.test.ts — T-045. Everything is in-memory: fake exec,
 * fake reader/hasher/transcribe. No network, no yt-dlp, no process spawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildYtDlpArgs,
  canonicalYoutubeUrl,
  createYoutubeSource,
  extractYoutubeVideoId,
  isInsideDir,
  YoutubeSourceError,
  type YoutubeExec,
} from "./youtube.js";
import { baseConsent, fakeBytesReader, fakeHasher, TENANT, FIXED_NOW } from "../testUtils.js";

const ID = "dQw4w9WgXcQ";
const WORK = "/work/yt";
const AUDIO = `${WORK}/yt-${ID}.m4a`;
const BYTES = new Uint8Array([9, 8, 7, 6]);

const ACCEPT: Array<[string, string]> = [
  [`https://www.youtube.com/watch?v=${ID}`, ID],
  [`https://youtube.com/watch?v=${ID}&t=30s`, ID],
  [`https://m.youtube.com/watch?v=${ID}`, ID],
  [`https://youtu.be/${ID}`, ID],
  [`https://youtu.be/${ID}?si=abc`, ID],
  [`https://www.youtube.com/live/${ID}`, ID],
  [`https://www.youtube.com/shorts/${ID}`, ID],
  [`https://www.youtube.com/watch?v=${ID}&list=PLabc`, ID],
  ["https://youtu.be/a-b_c-d_e-1", "a-b_c-d_e-1"],
];
const REJECT: string[] = [
  `http://www.youtube.com/watch?v=${ID}`,
  `ftp://www.youtube.com/watch?v=${ID}`,
  `javascript:alert(1)`,
  `https://www.youtube.com.evil.tld/watch?v=${ID}`,
  `https://youtu.be@evil.tld/${ID}`,
  `https://user:pw@www.youtube.com/watch?v=${ID}`,
  `https://user@youtu.be/${ID}`,
  `https://evil.tld/youtu.be/${ID}`,
  `https://notyoutube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com:8443/watch?v=${ID}`,
  `https://www.youtube.com/playlist?list=PLabcdefghijk`,
  `https://www.youtube.com/watch?list=PLabcdefghijk`,
  `https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv`,
  `https://www.youtube.com/@somechannel`,
  `https://www.youtube.com/watch?v=short`,
  `https://www.youtube.com/watch?v=${ID}x`,
  `https://www.youtube.com/watch?v=${ID.slice(0, 10)}!`,
  `https://youtu.be/${ID}/extra`,
  `https://www.youtube.com/live/${ID}/more`,
  ` https://youtu.be/${ID}`,
  `https://youtu.be/${ID} `,
  `https://youtu.be/${ID}\n`,
  `https://youtu.be/${ID};ls`,
  `https://youtu.be\\@evil.tld/${ID}`,
  `https://www.youtube.com/watch?v=${ID}${"a".repeat(300)}`,
  "",
];

test("accepts supported URL shapes and extracts the id", () => {
  for (const [url, id] of ACCEPT) assert.equal(extractYoutubeVideoId(url), id, url);
});

test("rejects every hostile or unsupported URL shape", () => {
  for (const url of REJECT) assert.equal(extractYoutubeVideoId(url), undefined, JSON.stringify(url));
  for (const v of [undefined, null, 42, {}, [], true]) assert.equal(extractYoutubeVideoId(v), undefined);
});

test("canonical URL is rebuilt from the id and refuses a bad id", () => {
  assert.equal(canonicalYoutubeUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
  assert.throws(() => canonicalYoutubeUrl("x; rm -rf /"), YoutubeSourceError);
});

test("argv: exact vector for a sample id, URL last after --, no dangerous options", () => {
  const args = buildYtDlpArgs(ID, WORK);
  assert.deepEqual(args, [
    "--ignore-config",
    "--no-playlist",
    "--no-progress",
    "-x",
    "--audio-format",
    "m4a",
    "--no-simulate",
    "--print",
    "after_move:filepath",
    "-o",
    `${WORK}/yt-${ID}.%(ext)s`,
    "--",
    `https://www.youtube.com/watch?v=${ID}`,
  ]);
  assert.equal(args[args.length - 2], "--");
  assert.equal(args[0], "--ignore-config");
  for (const bad of ["--exec", "--exec-before-download", "--cookies", "--cookies-from-browser", "--username", "--password", "--config-locations"]) {
    assert.ok(!args.some((a) => a === bad || a.startsWith(bad + "=")), bad);
  }
  assert.equal(args.filter((a) => a === "--").length, 1);
});

test("argv: hostile inputs never reach the vector or add an argument", () => {
  const hostile = [
    "--exec=calc",
    `-o /etc/passwd`,
    `"${ID}"`,
    `${ID}; rm -rf /`,
    `${ID} && whoami`,
    "`id`",
    "$(id)",
    `${ID}\n--exec calc`,
    `${ID} --exec calc`,
  ];
  for (const h of hostile) {
    const asUrl = `https://youtu.be/${h}`;
    assert.equal(extractYoutubeVideoId(asUrl), undefined, h);
    assert.equal(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${h}`), undefined, h);
    assert.throws(() => buildYtDlpArgs(h, WORK), YoutubeSourceError, h);
  }
  // A valid id embedded in hostile URL surroundings yields only the clean canonical URL.
  const id = extractYoutubeVideoId(`https://youtu.be/${ID}?a=$(id)&b=%60x%60&c=--exec`);
  assert.equal(id, ID);
  const args = buildYtDlpArgs(id!, WORK);
  assert.equal(args.length, 13);
  assert.ok(!args.join("\0").includes("$("));
  assert.ok(!args.join("\0").includes("--exec"));
});

test("isInsideDir rejects escapes (posix and windows flavours)", () => {
  assert.equal(isInsideDir("/work/yt", "/work/yt/a.m4a"), true);
  assert.equal(isInsideDir("/work/yt", "/work/yt/../x.m4a"), false);
  assert.equal(isInsideDir("/work/yt", "/work/ytx/a.m4a"), false);
  assert.equal(isInsideDir("/work/yt", "/etc/passwd"), false);
  assert.equal(isInsideDir("/work/yt", "relative.m4a"), false);
  assert.equal(isInsideDir("/work/yt", "/work/yt"), false);
  assert.equal(isInsideDir("C:\\work\\yt", "C:\\work\\yt\\a.m4a"), true);
  assert.equal(isInsideDir("C:\\work\\yt", "C:\\work\\yt\\..\\x.m4a"), false);
  assert.equal(isInsideDir("C:\\work\\yt", "D:\\work\\yt\\a.m4a"), false);
  assert.equal(isInsideDir("C:\\work\\yt", "C:\\work\\ytx\\a.m4a"), false);
});

function build(exec: YoutubeExec, files: Record<string, Uint8Array> = { [AUDIO]: BYTES }, timeoutMs = 50) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const wrapped: YoutubeExec = async (cmd, args, opts) => {
    calls.push({ cmd, args });
    return exec(cmd, args, opts);
  };
  const turns = [{ speaker: "A", text: "hi", startMs: 0, endMs: 10 }];
  let transcribed: Uint8Array | undefined;
  const adapter = createYoutubeSource({
    workDir: WORK,
    exec: wrapped,
    hasher: fakeHasher,
    reader: fakeBytesReader(files),
    transcribe: async (audio) => {
      transcribed = audio;
      return turns as never;
    },
    now: () => FIXED_NOW,
    timeoutMs,
  });
  return { adapter, calls, turns, getTranscribed: () => transcribed };
}

const okExec: YoutubeExec = async () => ({ exitCode: 0, stdout: `noise\n${AUDIO}\n` });
const input = { url: `https://youtu.be/${ID}`, tenantId: TENANT };

test("success: fake exec -> source doc with citation metadata, then STT seam gets the audio", async () => {
  const { adapter, calls, turns, getTranscribed } = build(okExec);
  assert.equal(adapter.detect(input), true);
  assert.equal(adapter.detect("https://evil.tld/x"), false);
  const { source, media } = await adapter.fetch(input, baseConsent({ captureMode: "public" }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.cmd, "yt-dlp");
  assert.equal(calls[0]!.args.at(-1), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(source.kind, "url");
  assert.equal(source.url, `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(source.path, AUDIO);
  assert.equal(source.captureMode, "public");
  assert.equal(source.hash, fakeHasher(BYTES));
  assert.equal(source.createdAt, FIXED_NOW);
  assert.deepEqual((source as Record<string, unknown>).sourceMeta, {
    platform: "youtube",
    videoId: ID,
    canonicalUrl: `https://www.youtube.com/watch?v=${ID}`,
    retrievedAt: FIXED_NOW,
  });
  assert.equal(media.length, 1);
  assert.equal(media[0]!.sourceRef, source._id);
  const out = await adapter.toTurns(source);
  assert.equal(out, turns);
  assert.deepEqual(getTranscribed(), BYTES);
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof YoutubeSourceError, String(e));
    return e.code;
  }
  return "no-error";
}

test("failure modes are typed and produce no document", async () => {
  const c = baseConsent();
  assert.equal(await code(build(async () => { throw new Error("ENOENT"); }).adapter.fetch(input, c)), "exec-failed");
  assert.equal(await code(build(async () => ({ exitCode: 1, stdout: AUDIO })).adapter.fetch(input, c)), "non-zero-exit");
  assert.equal(await code(build(async () => ({ exitCode: null, stdout: "", timedOut: true })).adapter.fetch(input, c)), "timeout");
  assert.equal(await code(build(() => new Promise(() => {})).adapter.fetch(input, c)), "timeout");
  assert.equal(await code(build(async () => ({ exitCode: 0, stdout: "  \n" })).adapter.fetch(input, c)), "no-output");
  assert.equal(await code(build(okExec, {}).adapter.fetch(input, c)), "no-output");
  assert.equal(await code(build(okExec, { [AUDIO]: new Uint8Array() }).adapter.fetch(input, c)), "empty-output");
  assert.equal(await code(build(okExec).adapter.fetch({ url: "https://evil.tld/x", tenantId: TENANT }, c)), "invalid-url");
  assert.equal(await code(build(okExec).adapter.fetch({ url: input.url }, c)), "invalid-url");
});

test("path escape in the reported audio path is rejected", async () => {
  const c = baseConsent();
  for (const p of ["/etc/passwd", `${WORK}/../escape.m4a`, "relative.m4a", `${WORK}x/a.m4a`]) {
    const b = build(async () => ({ exitCode: 0, stdout: p }), { [p]: BYTES });
    assert.equal(await code(b.adapter.fetch(input, c)), "path-escape", p);
  }
  assert.throws(() => createYoutubeSource({ ...build(okExec), workDir: "rel/dir" } as never), YoutubeSourceError);
  const { adapter } = build(okExec);
  assert.equal(
    await code(adapter.toTurns({ path: "/elsewhere/a.m4a" } as never)),
    "path-escape",
  );
});

test("consent: refused without explicit given + provided/public", async () => {
  const { adapter, calls } = build(okExec);
  const bad = [
    baseConsent({ given: false }),
    baseConsent({ captureMode: "silent" }),
    baseConsent({ captureMode: "notes" }),
    baseConsent({ recordedBy: "" }),
    undefined as never,
  ];
  for (const c of bad) assert.equal(await code(adapter.fetch(input, c)), "consent-refused");
  assert.equal(calls.length, 0, "exec must not run without consent");
  const ok = await adapter.fetch(input, baseConsent({ captureMode: "provided" }));
  assert.equal(ok.source.captureMode, "provided");
});
