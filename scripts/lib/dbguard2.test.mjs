// ISS-LEGACYSEED-002 (mint-key), ISS-SCRIPTGUARDS-001 (migrate-mongo-config) and the backfill "Mongo not connected" cause.
// Fakes only: refusals are asserted from spawned processes that exit BEFORE any connect(); acceptance on the pure guard / on
// config load (migrate-mongo-config.cjs never connects when required). cwd is an empty temp dir so no .env is ever read.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";
import {requireScriptDatabase, PRODUCTION_FLAG} from "./transcript-provenance.mjs";
import {loadSharedDb, assertConnected} from "./shared-db.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = f => readFileSync(root + f, "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const URL_ = "mongodb://fake.invalid:27017";
const cwd = mkdtempSync(join(tmpdir(), "dbguard2-"));
const run = (args, env) => spawnSync(process.execPath, args, {cwd, encoding: "utf8", timeout: 90000,
  env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env}});

// ISS-LEGACYSEED-002 --------------------------------------------------------------------------------------------------
const mint = (extra, env) => run([root + "scripts/mint-key.mjs", ...extra], env);
test("ISS-LEGACYSEED-002 replay: mint-key.mjs:43 no longer defaults to lkb and routes through requireScriptDatabase", () => {
  const s = strip(src("scripts/mint-key.mjs"));
  assert.doesNotMatch(s, /(\?\?|\|\|)\s*["']lkb["']/);
  assert.match(s, /requireScriptDatabase\(process\.env, process\.argv\.slice\(2\), \{allowProduction: true\}\)/);
  assert.ok(s.indexOf("requireScriptDatabase(process.env") < s.indexOf("await connect("), "guard precedes connect");
});
test("mint-key refuses (exit 1, before connecting) with no DB, lkb without flag, flag without exact lkb", () => {
  const cases = [
    [[], {MONGODB_URL: URL_}, /required|refused/],
    [[], {MONGODB_URL: URL_, MONGODB_DB: "lkb"}, /refused/],
    [[], {MONGODB_URL: URL_, MONGODB_DB: "lkb", MONGO_WORK_DB: "lkb"}, /refused/],
    [[PRODUCTION_FLAG], {MONGODB_URL: URL_}, /MONGODB_DB=lkb/],
    [[PRODUCTION_FLAG], {MONGODB_URL: URL_, MONGODB_DB: "LKB"}, /MONGODB_DB=lkb/],
    [[PRODUCTION_FLAG], {MONGODB_URL: URL_, MONGODB_DB: "lkb_work_x"}, /MONGODB_DB=lkb/],
    [[], {MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_staging"}, /staging/],
  ];
  for (const [args, env, re] of cases) {
    const r = mint(args, env);
    assert.equal(r.status, 1, JSON.stringify([args, env]));
    assert.match(r.stderr, re);
    assert.doesNotMatch(r.stdout, /lv_/);
  }
});
test("mint-key guard (as invoked) accepts lkb only with flag + exact MONGODB_DB=lkb, and an isolated work DB without a flag", () => {
  const P = {allowProduction: true}, env = {MONGODB_URL: URL_, MONGODB_DB: "lkb"};
  assert.deepEqual(requireScriptDatabase(env, [PRODUCTION_FLAG, "--tenant", "toc"], P), {url: URL_, dbName: "lkb"});
  assert.throws(() => requireScriptDatabase(env, ["--tenant", "toc"], P), /refused/);
  assert.deepEqual(requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_work_x"}, [], P), {url: URL_, dbName: "lkb_work_x"});
});

// ISS-SCRIPTGUARDS-001 ------------------------------------------------------------------------------------------------
const cfg = root + "config/migrate-mongo-config.cjs";
const load = (env, argv = []) => {
  const r = run(["-e", `process.argv.push(...${JSON.stringify(argv)});const c=require(${JSON.stringify(cfg)});console.log(JSON.stringify(c.mongodb))`], env);
  return {status: r.status, err: r.stderr, out: r.status === 0 ? JSON.parse(r.stdout) : null};
};
test("ISS-SCRIPTGUARDS-001 replay: migrate-mongo-config.cjs:6-7 defaults are gone (source)", () => {
  const s = strip(src("config/migrate-mongo-config.cjs"));
  assert.doesNotMatch(s, /(\?\?|\|\|)\s*["']lkb["']/);
  assert.doesNotMatch(s, /(\?\?|\|\|)\s*["']mongodb:\/\/localhost/);
});
test("migrate config refuses: nothing set, URL only, lkb without opt-in, opt-in without/with another DB, env opt-in alone", () => {
  const refused = [
    [{}, [], /MONGODB_URL is required/],
    [{MONGODB_URL: URL_}, [], /MONGODB_DB is required/],
    [{MONGODB_URL: URL_, MONGODB_DB: "   "}, [], /MONGODB_DB is required/],
    [{MONGODB_URL: URL_, MONGODB_DB: "lkb"}, [], /refused/],
    [{MONGODB_URL: URL_, MONGODB_DB: "LKB"}, [], /refused/],
    [{MONGODB_URL: URL_, MONGODB_DB: "global_university_db"}, [PRODUCTION_FLAG], /MONGODB_DB=lkb exactly/],
    [{MONGODB_URL: URL_}, [PRODUCTION_FLAG], /MONGODB_DB is required/],
    [{MONGODB_URL: URL_, MONGODB_DB: "lkb_work_x"}, [PRODUCTION_FLAG], /MONGODB_DB=lkb exactly/],
    [{MONGODB_URL: URL_, LKB_I_KNOW_THIS_IS_PRODUCTION: "1"}, [], /MONGODB_DB is required/],
    [{MONGODB_URL: URL_, MONGODB_DB: "lkb", LKB_I_KNOW_THIS_IS_PRODUCTION: "yes"}, [], /refused/],
    [{MONGODB_URL: URL_, MONGODB_DB: "lkb_staging"}, [], /LKB_ALLOW_STAGING/],
    [{MONGODB_URL: URL_, MONGODB_DB: "LKB_STAGING", LKB_ALLOW_STAGING: "lkb_staging"}, [], /LKB_ALLOW_STAGING/],
    [{MONGODB_URL: URL_, MONGODB_DB: "a b"}, [], /invalid/],
  ];
  for (const [env, argv, re] of refused) {
    const r = load(env, argv);
    assert.notEqual(r.status, 0, JSON.stringify([env, argv]));
    assert.match(r.err, re, JSON.stringify([env, argv]));
  }
});
test("migrate config accepts: lkb only with opt-in AND exact lkb; isolated and opted-in staging DBs", () => {
  assert.equal(load({MONGODB_URL: URL_, MONGODB_DB: "lkb"}, [PRODUCTION_FLAG]).out.databaseName, "lkb");
  assert.equal(load({MONGODB_URL: URL_, MONGODB_DB: "lkb", LKB_I_KNOW_THIS_IS_PRODUCTION: "1"}).out.databaseName, "lkb");
  assert.equal(load({MONGODB_URL: URL_, MONGODB_DB: "lkb_work_x"}).out.databaseName, "lkb_work_x");
  assert.equal(load({MONGODB_URL: URL_, MONGODB_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging"}).out.databaseName, "lkb_staging");
  assert.equal(load({MONGODB_URL: URL_, MONGODB_DB: "lkb_work_x"}).out.url, URL_);
});
test("compose migrate service passes the DB explicitly (no pinned lkb) and forwards the opt-in; docs mention both", () => {
  const compose = src("docker-compose.yml"), m = compose.slice(compose.indexOf("  migrate:"), compose.indexOf("  api:"));
  assert.doesNotMatch(m, /MONGODB_DB:\s*lkb\s*$/m);
  assert.match(m, /MONGODB_DB: \$\{MONGODB_DB:\?/);
  assert.match(m, /LKB_I_KNOW_THIS_IS_PRODUCTION: \$\{LKB_I_KNOW_THIS_IS_PRODUCTION:-\}/);
  assert.match(src(".env.example"), /migrate-mongo-config\.cjs[^\n]*LKB_I_KNOW_THIS_IS_PRODUCTION/);
});

// backfill "Mongo not connected" -------------------------------------------------------------------------------------
// A fake @lkb/db: its private `db` is set only by ITS OWN connect(), exactly like packages/db/src/client.ts.
const fakeDbModule = () => {
  let db = null;
  return {connect: async (_u, n) => (db = {name: n}), getDb: () => { if (!db) throw new Error("Mongo not connected"); return db; }};
};
test("cause reproduced: a relative-path copy of @lkb/db and the API-side copy do not share a connection", async () => {
  const cliCopy = fakeDbModule(), apiCopy = fakeDbModule();
  await cliCopy.connect("u", "lkb_work_x");
  assert.throws(() => apiCopy.getDb(), /Mongo not connected/);
  assert.throws(() => assertConnected(apiCopy), /not connected after connect/);
});
test("loadSharedDb returns the module apps/api resolves for @lkb/db, so connect() is visible to the API-side getDb()", async () => {
  const apiSide = fakeDbModule(), asked = [];
  const mod = await loadSharedDb({from: "/x/apps/api/package.json", resolve: s => { asked.push(s); return "/x/packages/db/src/index.ts"; },
    load: href => { asked.push(href); return apiSide; }});
  assert.equal(mod, apiSide);
  assert.equal(asked[0], "@lkb/db");
  await mod.connect("u", "lkb_work_x");
  assert.doesNotThrow(() => assertConnected(mod));
  assert.equal(apiSide.getDb().name, "lkb_work_x");
});
test("loadSharedDb's real resolution equals what apps/api's own source files resolve (single instance)", () => {
  const fromApi = createRequire(root + "apps/api/src/store.ts").resolve("@lkb/db");
  const fromHelper = createRequire(root + "apps/api/package.json").resolve("@lkb/db");
  assert.equal(fromHelper, fromApi);
  assert.match(src("scripts/lib/shared-db.mjs"), /apps\/api\/package\.json/);
  assert.ok(pathToFileURL(fromApi).href.startsWith("file:///"));
});
test("backfill.mjs no longer imports @lkb/db by relative path; connects then asserts the shared connection before reading", () => {
  const s = strip(src("scripts/backfill.mjs"));
  assert.doesNotMatch(s, /import\("\.\.\/packages\/db\/src\/index\.ts"\)/);
  assert.match(s, /const dbModule = await loadSharedDb\(\);/);
  assert.ok(s.indexOf("await connect(target.url") < s.indexOf("assertConnected(dbModule)"));
  assert.ok(s.indexOf("assertConnected(dbModule)") < s.indexOf("const db = getDb()"));
});
test("backfill.mjs run directly refuses a protected DB before connecting (guarded CLI works standalone)", () => {
  const r = run([root + "scripts/backfill.mjs", "--dry-run"], {MONGODB_URL: URL_, MONGODB_DB: "lkb"});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /production writes refused|isolated work database/);
});
