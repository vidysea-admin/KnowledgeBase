/** Plan A7 (D-257): the recorder's --index step forwards D-204's production flag only on the fixed opt-in LKB_INDEX_PRODUCTION=1. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncSessionIndexArgs } from "./record-finalize.js";

const FLAG = "--i-know-this-is-production";

test("A7: without LKB_INDEX_PRODUCTION=1 the index step never carries the production flag", () => {
  for (const env of [{}, { LKB_INDEX_PRODUCTION: "" }, { LKB_INDEX_PRODUCTION: "0" }, { LKB_INDEX_PRODUCTION: "true" },
    { LKB_INDEX_PRODUCTION: "yes" }, { LKB_INDEX_PRODUCTION: " 1" }, { LKB_INDEX_PRODUCTION: "1 " },
    { MONGODB_DB: "lkb_prod", MONGO_WORK_DB: "lkb_prod" }]) {
    const args = syncSessionIndexArgs("sess-1", env);
    assert.deepEqual(args.slice(-3), ["sess-1", "--emit-files", "--index"], JSON.stringify(env));
    assert.ok(!args.includes(FLAG), JSON.stringify(env));
  }
});

test("A7: LKB_INDEX_PRODUCTION=1 forwards exactly the D-204 flag, last, once", () => {
  const args = syncSessionIndexArgs("sess-1", { LKB_INDEX_PRODUCTION: "1" });
  assert.match(args[0]!, /scripts[\\/]webinar[\\/]sync-session\.mjs$/);
  assert.deepEqual(args.slice(1), ["sess-1", "--emit-files", "--index", FLAG]);
});

test("A7: the flag string matches the guard's own constant", async () => {
  const { PRODUCTION_FLAG } = await import("../../../../scripts/lib/transcript-provenance.mjs" as string) as { PRODUCTION_FLAG: string };
  assert.equal(PRODUCTION_FLAG, FLAG);
});

test("A7 wiring (review): processRecordingArtifacts spawns sync-session with the flag only under LKB_INDEX_PRODUCTION=1", async () => {
  const { processRecordingArtifacts } = await import("./record-finalize.js");
  const { mkdirSync, rmSync } = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const sessionId = `a7-wiring-${process.pid}`, dir = path.join(root, "data", "toc-migrated", sessionId);
  mkdirSync(dir, { recursive: true });
  const saved = process.env.LKB_INDEX_PRODUCTION;
  try {
    for (const [value, want] of [[undefined, false], ["1", true], ["true", false]] as const) {
      if (value === undefined) delete process.env.LKB_INDEX_PRODUCTION; else process.env.LKB_INDEX_PRODUCTION = value;
      const seen: string[][] = [];
      const run = ((_cmd: string, args: readonly string[]) => { seen.push([...args]); return { status: args[0]!.endsWith("sync-session.mjs") ? 1 : 0 }; }) as never;
      assert.throws(() => processRecordingArtifacts("x.webm", sessionId, ["--process-video", "--transcribe", "--index"], run, { backoffMs: [0, 0], sleep: () => {} }), /knowledge indexing failed/);
      const sync = seen.find(a => a[0]!.endsWith("sync-session.mjs"));
      assert.ok(sync, "the index step spawned sync-session");
      assert.equal(sync!.includes(FLAG), want, String(value));
    }
  } finally {
    if (saved === undefined) delete process.env.LKB_INDEX_PRODUCTION; else process.env.LKB_INDEX_PRODUCTION = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});
