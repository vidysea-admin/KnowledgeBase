import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedAcquisition } from "./hosted.js";
import { onairEmbeddedYoutube, publicOnairPage } from "./onair.js";
import { mediaToolEnvironment, boundedMediaArguments } from "./exec.js";
import { createOnairSource } from "../sources/hosted-recording.js";
import { isInsideDir } from "../sources/youtube.js";
import { intakeFromSource } from "../intake.js";
import { createMediaDurationProbe } from "./duration.js";

const VIDEO = "abcdefghijk";
const ONAIR = "https://cloudonair.withgoogle.com/events/fixture";

async function cleanupScratch(root: string) {
  if (!isInsideDir(tmpdir(), root) || !root.split(/[\\/]/).at(-1)?.startsWith("lkb-t045-test-")) throw new Error("test cleanup path refused");
  await rm(root, { recursive: true, force: true });
}

test("OnAir accepts one explicit recording embed; arbitrary links/multiple recordings refuse", () => {
  assert.equal(onairEmbeddedYoutube(`<iframe src="https://www.youtube-nocookie.com/embed/${VIDEO}"></iframe>`), `https://www.youtube.com/watch?v=${VIDEO}`);
  assert.throws(() => onairEmbeddedYoutube(`<a href="https://attacker.test/recording">`));
  assert.throws(() => onairEmbeddedYoutube(`<a href="https://www.youtube.com/watch?v=${VIDEO}">Related video</a>`));
  assert.throws(() => onairEmbeddedYoutube(`<!-- <iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe> -->`));
  assert.throws(() => onairEmbeddedYoutube(`<script>const fake='<iframe src="https://www.youtube.com/embed/${VIDEO}">';</script>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe data-src="https://www.youtube.com/embed/${VIDEO}"></iframe>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe title=' src="https://www.youtube.com/embed/${VIDEO}"'></iframe>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe src="https://www.youtube.com/embed/${VIDEO}" src="https://attacker.test"></iframe>`));
  assert.throws(() => onairEmbeddedYoutube(`<div title='<iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe>'></div>`));
  assert.throws(() => onairEmbeddedYoutube(`<textarea><iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe></textarea>`));
  assert.throws(() => onairEmbeddedYoutube(`<template><iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe></template>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe src="https://attacker.test"><iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe></iframe>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe src="https://www.youtube.com/embed/${VIDEO}suffix"></iframe>`));
  assert.throws(() => onairEmbeddedYoutube(`<iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe><iframe src="https://www.youtube.com/embed/12345678901"></iframe>`));
  assert.throws(() => publicOnairPage("secret\r\nX-Test: injected"));
});

test("tool environment excludes provider keys, profile secrets and application configuration", () => {
  assert.deepEqual(mediaToolEnvironment({ PATH: "tools", GEMINI_API_KEY: "secret", HOME: "profile", CLAUDE_CODE_OAUTH_TOKEN: "secret", LKB_ONAIR_COOKIE_HEADER: "secret" }), { PATH: "tools" });
  const args = boundedMediaArguments(["--", `https://www.youtube.com/watch?v=${VIDEO}`]);
  assert.ok(args.includes("--no-plugin-dirs")); assert.ok(args.includes("128M")); assert.ok(args.includes("Youtube"));
  const zoom = boundedMediaArguments(["--use-extractors", "Zoom", "--", "https://zoom.us/rec/share/abcdefgh"]);
  assert.equal(zoom.filter((arg) => arg === "--use-extractors").length, 1);
});

test("duration probe permits only bounded local metadata and rejects unavailable duration", async () => {
  const localFile = join(tmpdir(), "fixture.m4a");
  const probe = createMediaDurationProbe({}, async (command, args, options) => {
    assert.equal(command, "ffprobe"); assert.equal(options.timeoutMs, 30_000);
    assert.ok(args.includes("file")); assert.equal(args.at(-1), localFile);
    return { exitCode: 0, stdout: '{"format":{"duration":"4.25"}}' };
  });
  assert.equal(await probe(localFile), 4.25);
  await assert.rejects(probe("https://attacker.test/audio"));
  const invalid = createMediaDurationProbe({}, async () => ({ exitCode: 0, stdout: '{"format":{"duration":"N/A"}}' }));
  await assert.rejects(invalid(localFile), /duration unavailable/);
});

test("real filesystem acquisition flows through existing source/intake consumer and tenant dedupe", async () => {
  const root = await mkdtemp(join(tmpdir(), "lkb-t045-test-"));
  let saves = 0, transcribes = 0;
  const seen = new Map<string, string>();
  try {
    const downloader = createHostedAcquisition({ onairPage: async () => `<iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe>`,
      exec: async (_command, args, opts) => {
        assert.equal(args.at(-1), `https://www.youtube.com/watch?v=${VIDEO}`);
        assert.ok(args.includes("Youtube")); assert.equal(args.at(-2), "--");
        const file = join(opts.cwd, "recording.m4a");
        await writeFile(file, Buffer.from("unit media fixture"));
        return { exitCode: 0, stdout: file };
      } });
    const { readFile } = await import("node:fs/promises");
    const source = createOnairSource({ workDir: root, downloader, reader: readFile, hasher: () => "same-bytes", transcribe: async () => {
      transcribes++; return [{ speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Source fixture." }];
    } });
    const deps = { adapters: [source], newId: () => `session-${saves}`, now: () => "2026-10-14T00:00:00.000Z", sink: {
      findSessionBySource: async (_tenant: string, id: string) => seen.has(id) ? { sessionId: seen.get(id)! } : undefined,
      save: async (plan: Parameters<import("../intake.js").IntakeSink["save"]>[0]) => {
        assert.equal(plan.turns[0]!.tenantId, plan.session.tenantId);
        assert.equal((plan.source as { sourceMeta?: { platform?: string } }).sourceMeta?.platform, "cloudonair");
        seen.set(plan.source._id, plan.session._id); saves++;
      },
    } };
    const consent = { given: true, captureMode: "public" as const, recordedBy: "test" };
    const first = await intakeFromSource({ url: ONAIR, tenantId: "tenant-1" }, consent, deps);
    const repeat = await intakeFromSource({ url: ONAIR, tenantId: "tenant-1" }, consent, deps);
    const secondTenant = await intakeFromSource({ url: ONAIR, tenantId: "tenant-2" }, consent, deps);
    assert.equal(first.status, "created"); assert.equal(repeat.status, "already-ingested");
    assert.notEqual(first.sourceId, secondTenant.sourceId); assert.equal(saves, 2); assert.equal(transcribes, 2);
  } finally { await cleanupScratch(root); }
});

test("Zoom uses its specific extractor, invalid requests never execute, failed downloads clean only scratch", async () => {
  const root = await mkdtemp(join(tmpdir(), "lkb-t045-test-"));
  let calls = 0;
  try {
    await writeFile(join(root, "keep.txt"), "unrelated");
    const downloader = createHostedAcquisition({ exec: async (_command, args) => {
      calls++; assert.ok(args.includes("Zoom")); assert.ok(!args.includes("Generic"));
      return { exitCode: 1, stdout: "secret-token", stderr: "secret-cookie" };
    } });
    await assert.rejects(downloader({ platform: "zoom-recording", id: "abcdefgh", canonicalUrl: "https://attacker.test/rec/share/abcdefgh", workDir: root }));
    assert.equal(calls, 0);
    await assert.rejects(downloader({ platform: "zoom-recording", id: "abcdefgh", canonicalUrl: "https://zoom.us/rec/share/abcdefgh", workDir: root }),
      (error: Error) => error.message === "hosted recording acquisition failed");
    assert.equal(calls, 1); assert.deepEqual(await readdir(root), ["keep.txt"]);
  } finally { await cleanupScratch(root); }
});
