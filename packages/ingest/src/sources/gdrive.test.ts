/**
 * packages/ingest/src/sources/gdrive.test.ts — U2. All fake `gws` output, no real Drive call.
 * Covers: month-folder resolution, file listing, download command shape, and the new-file diff
 * (the claim the live dry-run check leans on: "0 new after U1, 4 new before it").
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  listDriveSubfolders,
  listDriveFiles,
  downloadDriveFile,
  findMonthFolder,
  diffNewDriveFiles,
  type DriveFile,
} from "./gdrive.js";

function fakeRun(responses: Record<string, string>) {
  const calls: string[][] = [];
  const run = async (args: string[]) => {
    calls.push(args);
    const key = args[2] === "list" ? "list" : args[2] === "get" ? "get" : args.join(" ");
    const found = responses[key];
    if (found === undefined) throw new Error(`fakeRun: no canned response for "${key}"`);
    return found;
  };
  return { run, calls };
}

test("listDriveSubfolders parses gws JSON output into DriveFile[]", async () => {
  const { run, calls } = fakeRun({
    list: JSON.stringify({ files: [{ id: "f1", name: "September 26" }, { id: "f2", name: "August 26" }] }),
  });
  const result = await listDriveSubfolders("root123", { run });
  assert.deepEqual(result, [{ id: "f1", name: "September 26" }, { id: "f2", name: "August 26" }]);
  assert.equal(calls[0]?.[0], "drive");
  assert.match(calls[0]?.[4] ?? "", /application\/vnd\.google-apps\.folder/);
});

test("listDriveSubfolders tolerates a banner line before the JSON (gws quirk)", async () => {
  const { run } = fakeRun({ list: `Signed in as umeshsugara@vidysea.com\n${JSON.stringify({ files: [{ id: "f1", name: "X" }] })}` });
  const result = await listDriveSubfolders("root123", { run });
  assert.deepEqual(result, [{ id: "f1", name: "X" }]);
});

test("listDriveSubfolders returns [] when gws reports no files key", async () => {
  const { run } = fakeRun({ list: "{}" });
  assert.deepEqual(await listDriveSubfolders("root123", { run }), []);
});

test("listDriveFiles parses real-shaped September recordings", async () => {
  const files: DriveFile[] = [
    { id: "1nyGCB", name: "video1968958572.mp4", size: "226897326", createdTime: "2026-09-22T11:33:54.275Z" },
    { id: "11sQTx", name: "16th Sep: Dear Psychology, What Can't You Do? ", size: "840646934", createdTime: "2026-09-17T04:52:57.221Z" },
  ];
  const { run } = fakeRun({ list: JSON.stringify({ files }) });
  const result = await listDriveFiles("month456", { run });
  assert.deepEqual(result, files);
});

test("downloadDriveFile shells the exact gws get shape (fileId, alt=media, supportsAllDrives, -o path)", async () => {
  const { run, calls } = fakeRun({ get: "" });
  await downloadDriveFile("1nyGCB", "raw/TOC/TOC-Materials/Recordings/September/video1968958572.mp4", { run });
  const args = calls[0]!;
  assert.deepEqual(args.slice(0, 3), ["drive", "files", "get"]);
  const params = JSON.parse(args[4]!);
  assert.equal(params.fileId, "1nyGCB");
  assert.equal(params.alt, "media");
  assert.equal(params.supportsAllDrives, true);
  assert.equal(args[5], "-o");
  assert.equal(args[6], "raw/TOC/TOC-Materials/Recordings/September/video1968958572.mp4");
});

test("findMonthFolder matches the real TOC naming exactly", () => {
  const subfolders: DriveFile[] = [{ id: "a", name: "August 26" }, { id: "b", name: "September 26" }];
  const found = findMonthFolder(subfolders, "September", "26");
  assert.equal(found?.id, "b");
});

test("findMonthFolder falls back to a month-name prefix match", () => {
  const subfolders: DriveFile[] = [{ id: "b", name: "September 2026" }];
  const found = findMonthFolder(subfolders, "September", "26");
  assert.equal(found?.id, "b");
});

test("findMonthFolder returns undefined when no folder matches", () => {
  const subfolders: DriveFile[] = [{ id: "a", name: "August 26" }];
  assert.equal(findMonthFolder(subfolders, "September", "26"), undefined);
});

// --- diffNewDriveFiles: the claim the live dry-run check depends on ---

const SEPT_FILES: DriveFile[] = [
  { id: "1nyGCB", name: "video1968958572.mp4" },
  { id: "11sQTx", name: "16th Sep: Dear Psychology, What Can't You Do? " },
  { id: "122akK", name: "9th Sep: Mastering Global Test Pathways" },
  { id: "1tBi4G", name: "2nd Sep: India Test Series - Part II" },
];

test("diffNewDriveFiles: before U1 (empty watch_state, empty ingested set) — all 4 are new", () => {
  const result = diffNewDriveFiles(SEPT_FILES, new Set(), new Set());
  assert.equal(result.length, 4);
});

test("diffNewDriveFiles: after U1 (ids present in the ingested-manifest cross-check) — 0 new", () => {
  const ingestedIds = new Set(SEPT_FILES.map((f) => f.id));
  const result = diffNewDriveFiles(SEPT_FILES, new Set(), ingestedIds);
  assert.equal(result.length, 0);
});

test("diffNewDriveFiles: a file already recorded in watch_state (seen or ingested) is never new again", () => {
  const seenIds = new Set(["1nyGCB"]);
  const result = diffNewDriveFiles(SEPT_FILES, seenIds, new Set());
  assert.equal(result.length, 3);
  assert.equal(result.some((f) => f.id === "1nyGCB"), false);
});

test("diffNewDriveFiles: idempotent — running the diff twice with the same seenIds finds nothing new the second time", () => {
  const seenIds = new Set<string>();
  const first = diffNewDriveFiles(SEPT_FILES, seenIds, new Set());
  for (const f of first) seenIds.add(f.id); // simulates run-watch.mjs marking each as seen
  const second = diffNewDriveFiles(SEPT_FILES, seenIds, new Set());
  assert.equal(first.length, 4);
  assert.equal(second.length, 0);
});
