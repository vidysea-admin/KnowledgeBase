/**
 * Review 2026-11-27 (low): every reason the scheduler writes must be in WEBINAR_OPERATION_REASONS, or the operations view
 * shows a retrying meeting as "processing-failed". Read from the scheduler source so a new reason fails here.
 * privacy-controller-unavailable is deliberately left out (D-210: the privacy/consent surface is not touched here).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WEBINAR_OPERATION_REASONS } from "./brain.js";

const EXCLUDED = new Set(["privacy-controller-unavailable"]);
test("every reason the scheduler dispatcher writes is a known operation reason", () => {
  const source = readFileSync(fileURLToPath(new URL("../../../../scripts/webinar/scheduler/dispatch.mjs", import.meta.url)), "utf8");
  const written = new Set([...source.matchAll(/reason: '([a-z-]+)'/g)].map(m => m[1]!).concat([...source.matchAll(/\? '([a-z-]+)' : '([a-z-]+)'/g)].flatMap(m => [m[1]!, m[2]!])));
  assert.ok(written.has("prelaunch-transient") && written.has("capacity-full"), "the extractor still finds the reasons");
  const missing = [...written].filter(r => !EXCLUDED.has(r) && !WEBINAR_OPERATION_REASONS.includes(r));
  assert.deepEqual(missing, []);
});
