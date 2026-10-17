import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrivateDirectory } from "./private-directory.js";
import { verifyPrivateDirectory, verifyPrivateArtifact } from "./private-acl.js";

test("new private root and inherited descendants satisfy actual OS guards", () => {
  const parent = mkdtempSync(path.join(process.env.LKB_NATIVE_TEST_PRIVATE_DIR ?? tmpdir(), "new-private-"));
  try {
    const root = createPrivateDirectory(path.join(parent, "root"));
    verifyPrivateDirectory(root);
    const child = path.join(root, "child"); mkdirSync(child, { mode: 0o700 });
    const file = path.join(child, "bytes"); writeFileSync(file, "private", { mode: 0o600 });
    verifyPrivateDirectory(child); verifyPrivateArtifact(file);
    assert.throws(() => createPrivateDirectory(root));
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
test("preexisting unsafe directory is refused without ACL repair", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "existing-private-"));
  try { assert.throws(() => createPrivateDirectory(parent)); }
  finally { rmSync(parent, { recursive: true, force: true }); }
});
