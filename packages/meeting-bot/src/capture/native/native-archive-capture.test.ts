import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createNativeCaptureSealer, hasNativeSampler, sealFinalizedNativeCapture } from "./native-archive-capture.js";
import type { NativeSealCaptureInput } from "./native-archive-join-types.js";

test("unissued imported media JSON cannot reach archive seal", async () => {
  let called = false;
  const service = createNativeCaptureSealer({ store: { seal: async () => { called = true; return "forged"; } },
    readCurrentReceipt: () => { throw new Error("No trusted current receipt"); } });
  await assert.rejects(service.sealCapture({ media: {} } as NativeSealCaptureInput), /capability/);
  assert.equal(called, false);
});
test("missing or unsupported sampler preserves public completion without native claim", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sampler-refusal-"));
  try {
    const file = path.join(root, "old.jsonl"); writeFileSync(file, '{"tSec":0,"displayName":"Name"}\n');
    assert.equal(hasNativeSampler(file), false);
    let called = false;
    await sealFinalizedNativeCapture({ sealer: { sealCapture: async () => { called = true; throw new Error("No sampler"); } },
      sourcePath: path.join(root, "source.json"), publicVideoPath: path.join(root, "video.webm"), recordDir: root });
    assert.equal(called, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
