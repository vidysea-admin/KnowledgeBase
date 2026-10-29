import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveGwsBinary } from "./gws-channels.js";

const root = path.join("repo", "root");

test("win32 default keeps the pinned gws.exe under .cache/tools", () => {
  assert.equal(resolveGwsBinary(root, {}, "win32"), path.join(root, ".cache", "tools", "gws-0.22.5", "gws.exe"));
});

test("linux default is gws on PATH (no .exe, no repo path)", () => {
  assert.equal(resolveGwsBinary(root, {}, "linux"), "gws");
  assert.equal(resolveGwsBinary(root, { LKB_GWS_PATH: "   " }, "linux"), "gws");
  assert.equal(resolveGwsBinary(root, {}, "darwin"), "gws");
});

test("LKB_GWS_PATH overrides on every platform", () => {
  for (const platform of ["win32", "linux", "darwin"] as const) {
    assert.equal(resolveGwsBinary(root, { LKB_GWS_PATH: " /opt/gws/gws " }, platform), "/opt/gws/gws");
  }
});
