/**
 * scripts/lib/find-audio-file.test.mjs — T-033 / ISS-286 capability coverage. Falsifies the
 * `source.json.audioPath` branch added for bot-captured (meeting-bot `record`) sessions, which
 * bypasses the TOC basename-match path entirely (webinar-bot-live, 2026-09-24), plus proves the
 * pre-existing TOC basename-match fallback still fires when `audioPath` is absent.
 * Run: node --test scripts/lib/find-audio-file.test.mjs   (wired into `pnpm test:lint`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findAudioFile, transcriptTenant } from "./find-audio-file.mjs";

function fixture() {
  return mkdtempSync(join(tmpdir(), "lkb-find-audio-"));
}

test("audioPath branch: returns the repo-relative path named in source.json, no TOC basename match needed", () => {
  const root = fixture();
  try {
    const dataDir = join(root, "data", "toc-migrated");
    const sessionId = "2026-09-24-zoho-next-european-study-destinations";
    mkdirSync(join(dataDir, sessionId), { recursive: true });
    mkdirSync(join(root, "raw", "webinars"), { recursive: true });
    writeFileSync(join(root, "raw", "webinars", "session.m4a"), "fake-audio");
    writeFileSync(
      join(dataDir, sessionId, "source.json"),
      JSON.stringify({ audioPath: "raw/webinars/session.m4a" }),
    );
    const { path, filename } = findAudioFile(dataDir, join(root, "Audio"), sessionId);
    assert.equal(path, join(root, "raw", "webinars", "session.m4a"));
    assert.equal(filename, "session.m4a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audioPath branch: throws when the named file does not exist", () => {
  const root = fixture();
  try {
    const dataDir = join(root, "data", "toc-migrated");
    const sessionId = "missing-audio-session";
    mkdirSync(join(dataDir, sessionId), { recursive: true });
    writeFileSync(
      join(dataDir, sessionId, "source.json"),
      JSON.stringify({ audioPath: "raw/webinars/does-not-exist.m4a" }),
    );
    assert.throws(
      () => findAudioFile(dataDir, join(root, "Audio"), sessionId),
      /audioPath "raw\/webinars\/does-not-exist\.m4a" does not exist/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to TOC basename matching when source.json has no audioPath", () => {
  const root = fixture();
  try {
    const dataDir = join(root, "data", "toc-migrated");
    const audioDir = join(root, "Audio");
    const sessionId = "23rd-May-UniAccess-ATLAS-Skilltech";
    mkdirSync(join(dataDir, sessionId), { recursive: true });
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, "23rd-May-UniAccess-ATLAS-Skilltech.m4a"), "fake-audio");
    writeFileSync(
      join(dataDir, sessionId, "source.json"),
      JSON.stringify({
        path: "raw/TOC/TOC-Materials/Transcripts/23rd-May-UniAccess-ATLAS-Skilltech.content.md",
      }),
    );
    const { filename } = findAudioFile(dataDir, audioDir, sessionId);
    assert.equal(filename, "23rd-May-UniAccess-ATLAS-Skilltech.m4a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("transcript tenant is source-derived and missing/malformed sources fail closed", () => {
  const dir = fixture();
  try {
    const session = join(dir, "tenant-session");
    mkdirSync(session, { recursive: true });
    writeFileSync(join(session, "source.json"), JSON.stringify({ tenantId: "tenant-second" }));
    assert.equal(transcriptTenant(dir, "tenant-session"), "tenant-second");
    for (const source of [{}, { tenantId: null }, { tenantId: "" }, { tenantId: "   " }, { tenantId: 42 }]) {
      writeFileSync(join(session, "source.json"), JSON.stringify(source));
      assert.throws(() => transcriptTenant(dir, "tenant-session"), /source tenantId required/);
    }
    assert.throws(() => transcriptTenant(dir, "missing-session"), /ENOENT/);
    writeFileSync(join(session, "source.json"), "{broken");
    assert.throws(() => transcriptTenant(dir, "tenant-session"), SyntaxError);
    for (const id of ["../escape", "..", "/absolute", "C:\\absolute", "bad/name", "bad\\name", "", "x".repeat(151)]) {
      assert.throws(() => transcriptTenant(dir, id), /invalid sessionId/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
