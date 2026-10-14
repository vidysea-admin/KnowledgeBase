/** Capture tags: written by the tick, merged into source.json by finalize (the testData flag the pipeline routes on). Temp dirs and fakes only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { readCaptureTags, writeCaptureTags } from "./capture-tags.js";
import { finalizeRecordingWith } from "../capture/record-commands.js";

test("write then read round-trips the three known keys only", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-tags-"));
  try {
    const tagsDir = path.join(dir, "capture-tags");
    writeCaptureTags(tagsDir, "webinar-1", { careerGuidance: false, testData: true, matchedKeywords: [] }, () => {});
    assert.deepEqual(readCaptureTags(dir, "webinar-1"), { careerGuidance: false, testData: true, matchedKeywords: [] });
    writeFileSync(path.join(tagsDir, "webinar-2.json"), JSON.stringify({ testData: "yes", careerGuidance: true, evil: 1, matchedKeywords: ["a", 3] }));
    assert.deepEqual(readCaptureTags(dir, "webinar-2"), { careerGuidance: true, matchedKeywords: ["a"] });
    writeFileSync(path.join(tagsDir, "webinar-3.json"), "{not json");
    assert.deepEqual(readCaptureTags(dir, "webinar-3"), {});
    assert.deepEqual(readCaptureTags(dir, "../escape"), {}, "an unsafe session id is never turned into a path");
    assert.deepEqual(readCaptureTags(dir, "missing"), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("finalize merges testData into source.json when the tick tagged the session, and adds nothing when it did not", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-tags-fin-"));
  try {
    writeFileSync(path.join(root, "fake-video.mkv"), "fake-video-bytes");
    mkdirSync(path.join(root, "raw", "webinars"), { recursive: true });
    writeCaptureTags(path.join(root, "raw", "webinars", "capture-tags"), "sess-test", { careerGuidance: false, testData: true, matchedKeywords: [] }, () => {});
    const overrides = { repoRoot: root, tenantId: "lane", probeMedia: () => 60, extractAudio: (_v: string, out: string) => writeFileSync(out, "fake-audio"), measureVolume: () => ({ maxDb: -20, meanDb: -30 }) };
    for (const id of ["sess-test", "sess-plain"]) {
      await finalizeRecordingWith(overrides, path.join(root, "fake-video.mkv"), id, "Fixture", "zoom", false, []);
    }
    const tagged = JSON.parse(readFileSync(path.join(root, "data/toc-migrated/sess-test/source.json"), "utf8"));
    const plain = JSON.parse(readFileSync(path.join(root, "data/toc-migrated/sess-plain/source.json"), "utf8"));
    assert.deepEqual([tagged.testData, tagged.careerGuidance], [true, false]);
    assert.equal("testData" in plain, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
