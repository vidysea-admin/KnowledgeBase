// ISS-LEGACYSEED-001/003/005/006: scripts that defaulted MONGODB_DB to lkb. Fakes only: no Mongo is ever contacted
// (refusal spawns fail BEFORE connect; acceptance is asserted on the pure guard).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {requireScriptDatabase, PRODUCTION_FLAG} from "./transcript-provenance.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = f => readFileSync(root + f, "utf8");
const URL_ = "mongodb://fake.invalid:27017";
const work = {MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_work_x"};
const P = {allowProduction: true};

test("no DB: refused", () => {
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_}, [], P), /required|refused/);
  assert.throws(() => requireScriptDatabase({}, [PRODUCTION_FLAG], P), /MONGODB_DB=lkb/);
});
test("lkb without the production flag: refused (env alone)", () => {
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGODB_DB: "lkb"}, [], P), /refused/);
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: "lkb", MONGODB_DB: "lkb"}, [], P), /refused/);
});
test("production flag alone, wrong/missing/case-variant MONGODB_DB: refused", () => {
  for (const db of [undefined, "", "LKB", "lkb_work_x", " lkb2"])
    assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGODB_DB: db}, [PRODUCTION_FLAG], P), /MONGODB_DB=lkb/, String(db));
});
test("flag + MONGODB_DB=lkb accepted only when script allows production", () => {
  assert.deepEqual(requireScriptDatabase({MONGODB_URL: URL_, MONGODB_DB: "lkb"}, [PRODUCTION_FLAG], P), {url: URL_, dbName: "lkb"});
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGODB_DB: "lkb"}, [PRODUCTION_FLAG]), /refused/);
});
test("intended work DB accepted without any flag", () => {
  assert.deepEqual(requireScriptDatabase(work, []), {url: URL_, dbName: "lkb_work_x"});
  assert.deepEqual(requireScriptDatabase({...work, MONGODB_DB: "lkb_work_x"}, [], P), {url: URL_, dbName: "lkb_work_x"});
});
test("staging needs the double opt-in", () => {
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_staging"}, [], P), /staging/);
  assert.deepEqual(requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging"}, []),
    {url: URL_, dbName: "lkb_staging"});
});

// Replay per issue: the recorded evidence site must no longer default to lkb and must route through the guard.
const issues = {
  "ISS-LEGACYSEED-001": ["scripts/demo/seed-demo-server.mjs"],
  "ISS-LEGACYSEED-003": ["scripts/watch/watch-config.mjs", "scripts/watch/watch-store.mjs", "scripts/watch/watch-reingest.mjs"],
  "ISS-LEGACYSEED-005": ["scripts/live-verify.mjs"],
  "ISS-LEGACYSEED-006": ["scripts/eval-recall.mjs"],
};
for (const [id, files] of Object.entries(issues)) for (const f of files) {
  test(`${id} replay: ${f} has no lkb default`, () => {
    const s = src(f);
    assert.doesNotMatch(s.replace(/\/\/.*$/gm, ""), /(\?\?|\|\|)\s*["']lkb["']/);
    if (!f.endsWith("watch-config.mjs") && !f.endsWith("watch-store.mjs") && !f.endsWith("watch-reingest.mjs")) assert.match(s, /requireScriptDatabase/);
    else assert.match(s, /requireScriptDatabase|watchDbTarget/);
  });
}
test("watch-config.mjs: importing never throws; target refuses lkb default", async () => {
  const m = await import("../watch/watch-config.mjs");
  assert.throws(() => m.watchDbTarget({MONGODB_URL: URL_, MONGODB_DB: "lkb"}, []), /refused/);
  assert.throws(() => m.watchDbTarget({MONGODB_URL: URL_}, []), /required/);
});
test("seed-demo-server spawn with no DB env exits non-zero before connecting", () => {
  const r = spawnSync(process.execPath, [root + "scripts/demo/seed-demo-server.mjs"], {
    env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot}, encoding: "utf8", timeout: 60000, cwd: root});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /explicit isolated work database|refused/);
});
