import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireNativeArchiveAdmission, type NativeArchiveAdmission, openNativeArchiveStore } from "./native-capture-archive.js";
import { rehydrateNativeSpool } from "./native-spool.js";
import { reproveArchivedNativeMedia } from "./native-media-finalize.js";

test("JSON, copied archive facts and native flags cannot manufacture archive or spool authority", async () => {
  for (const value of [{}, { schema: "native-private-archive/1", native: true, complete: true }]) {
    const cap = value as NativeArchiveAdmission;
    await assert.rejects(requireNativeArchiveAdmission(cap), /admission capability required/);
    await assert.rejects(rehydrateNativeSpool(cap), /admission capability required/);
    await assert.rejects(reproveArchivedNativeMedia(cap, { ffmpegPath: "absent", ffprobePath: "absent" }), /admission capability required/);
  }
});
test("archive roots and quotas are explicit trusted server configuration", async () => {
  // A UNC root is a Windows concept: path.resolve("//host/x") collapses to "/host/x" on POSIX, so there it is just a missing local path.
  for (const root of process.platform === "win32" ? ["relative", "//untrusted.example/archive"] : ["relative"]) {
    await assert.rejects(openNativeArchiveStore({ root, maxArchiveBytes: 100, readCurrentBinding: async () => null }), /local private/);
  }
  const root = await mkdtemp(path.join(tmpdir(), "native-archive-refusal-"));
  try {
    await assert.rejects(openNativeArchiveStore({ root, maxArchiveBytes: Infinity, readCurrentBinding: async () => null }), /Bounded/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
