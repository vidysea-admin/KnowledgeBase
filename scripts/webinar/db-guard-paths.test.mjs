// ISS-NOLKBDEFAULT-001: regression tests for the four guard paths whose mutants survived the nolkbdefault checker
// (M3a validateRunGate, M3b sync-session, M3d run-pipeline-deps Gmail preflight, M5 join-rules API host). Fakes only:
// no database, network or browser is touched (fetch is replaced; the other two paths are asserted at source level).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRunGate} from './run-pipeline.mjs';
import {createPipelineDeps} from './run-pipeline-deps.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const code = file => readFileSync(root + file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
const OPT_IN = {LKB_ALLOW_STAGING: 'lkb_staging'};

// M3a ---------------------------------------------------------------------------------------------------------------
test('validateRunGate refuses unset, lkb, global_university_db and un-opted lkb_staging (any casing)', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gate-'));
  for (const work of [undefined, '', '  ', 'lkb', 'LKB', 'global_university_db', 'lkb_staging', 'LKB_STAGING', 'Lkb_Staging'])
    assert.throws(() => validateRunGate(empty, {MONGO_WORK_DB: work}), /isolated work database; production writes refused/, String(work));
  // an opt-in for a different value, or a mis-cased name even WITH the opt-in, stays refused
  assert.throws(() => validateRunGate(empty, {MONGO_WORK_DB: 'lkb_staging', LKB_ALLOW_STAGING: 'yes'}), /production writes refused/);
  assert.throws(() => validateRunGate(empty, {MONGO_WORK_DB: 'LKB_STAGING', ...OPT_IN}), /production writes refused/);
});
test('validateRunGate lets an isolated name and opted-in lkb_staging past the DB check (next failure is the live-proof file)', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gate-'));
  for (const env of [{MONGO_WORK_DB: 'lkb_work_x'}, {MONGO_WORK_DB: 'lkb_staging', ...OPT_IN}])
    assert.throws(() => validateRunGate(empty, env), /Manual live audio\/video proof is required/);
});

// M3d ---------------------------------------------------------------------------------------------------------------
async function preflight(env, headerValue, scanStatus = 500) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`);
    if (String(url).endsWith('/gmail/scan')) return new Response('{}', {status: scanStatus});
    return new Response('[]', {status: 200, headers: {'x-lkb-work-db': headerValue}});
  };
  try {
    const deps = createPipelineDeps({LKB_API_URL: 'http://api.invalid', LKB_API_KEY: 'k', LKB_TENANT_ID: 't', ...env});
    const error = await deps.loadCandidates(true).then(() => null, e => e);
    return {error, calls};
  } finally { globalThis.fetch = real; }
}
test('Gmail preflight refuses a protected/unset work DB even when the API echoes the same name; no scan POST is sent', async () => {
  for (const work of [undefined, 'lkb', 'global_university_db', 'lkb_staging', 'LKB_STAGING']) {
    const {error, calls} = await preflight({MONGO_WORK_DB: work}, work ?? '');
    assert.match(String(error?.message), /Gmail work database not bound/, String(work));
    assert.equal(calls.some(c => c.startsWith('POST')), false, `${work}: scan must not run`);
  }
});
test('Gmail preflight: isolated or opted-in lkb_staging passes; a mismatching API header is refused', async () => {
  for (const env of [{MONGO_WORK_DB: 'lkb_work_x'}, {MONGO_WORK_DB: 'lkb_staging', ...OPT_IN}]) {
    const {error, calls} = await preflight(env, env.MONGO_WORK_DB);
    assert.match(String(error?.message), /Gmail discovery unavailable/);   // got past the preflight to the scan
    assert.ok(calls.includes('POST /gmail/scan'));
  }
  const {error, calls} = await preflight({MONGO_WORK_DB: 'lkb_work_x'}, 'lkb_work_other');
  assert.match(String(error?.message), /not bound/);
  assert.equal(calls.some(c => c.startsWith('POST')), false);
});

// M3b / M5 (side-effecting entry points, asserted on source: the guard must be the shared one and precede connect) ------
test('sync-session.mjs resolves the work DB through resolveWorkDb, then gates the RESOLVED name with isProtectedWorkDbName before connecting, with no lkb literal list', () => {
  const s = code('scripts/webinar/sync-session.mjs');
  assert.match(s, /import \{ resolveWorkDb \} from "\.\.\/watch\/test-data-route\.mjs";/);
  const route = s.search(/const route = resolveWorkDb\(\{[^}]*workDb: process\.env\.MONGO_WORK_DB\?\.trim\(\)[^}]*env: process\.env \}\);/);
  assert.ok(route > 0, 'the work DB must come from resolveWorkDb fed with MONGO_WORK_DB and process.env');
  assert.match(s, /const workDb = route\.workDb;/);
  const guard = s.search(/if \(isProtectedWorkDbName\(workDb, process\.env\)\) throw new Error\(/);
  assert.ok(guard > route, 'guard call missing, its env argument dropped, or it runs before the route is resolved');
  assert.ok(guard < s.indexOf('await connect('), 'guard must precede connect()');
  assert.match(s, /await connect\([^)]*,\s*workDb\)/, 'connects to the guarded (resolved) name');
  assert.doesNotMatch(s, /["']lkb["']|\?\?\s*["']lkb|\|\|\s*["']lkb/);
});
test('resolveWorkDb returns only the configured DB or lkb_staging (staging needs the exact opt-in); the shared guard still refuses protected names', async () => {
  const {resolveWorkDb, STAGING_DB} = await import('../watch/test-data-route.mjs');
  const {isProtectedWorkDbName} = await import('../lib/transcript-provenance.mjs');
  for (const flag of [undefined, false, 'true', 1, null]) assert.deepEqual(resolveWorkDb({testData: flag, workDb: 'lkb', env: {}}), {workDb: 'lkb', testData: false});
  for (const env of [{}, {LKB_ALLOW_STAGING: 'yes'}, {LKB_ALLOW_STAGING: 'LKB_STAGING'}])
    assert.throws(() => resolveWorkDb({testData: true, workDb: 'lkb_work_x', env}), /refusing to write it anywhere but lkb_staging/);
  assert.equal(resolveWorkDb({testData: true, workDb: 'lkb', env: OPT_IN}).workDb, STAGING_DB);
  assert.equal(resolveWorkDb({testData: true, workDb: 'lkb_work_x', env: OPT_IN}).workDb, STAGING_DB);
  // sync-session applies the guard to whatever came back: production names stay refused, staging only with the opt-in
  for (const name of ['lkb', 'LKB', 'global_university_db', undefined, '']) assert.equal(isProtectedWorkDbName(name, OPT_IN), true, String(name));
  assert.equal(isProtectedWorkDbName(STAGING_DB, {}), true);
  assert.equal(isProtectedWorkDbName(STAGING_DB, OPT_IN), false);
});
test('join-rules-api-host.ts connects through requireDatabaseName() with no MONGODB_DB / lkb fallback', () => {
  const s = code('scripts/webinar/join-rules-api-host.ts');
  assert.match(s, /import \{ requireDatabaseName \} from "\.\.\/\.\.\/apps\/api\/src\/db-name\.js";/);
  assert.match(s, /await connect\(process\.env\.MONGODB_URL \?\? "mongodb:\/\/localhost:27017", requireDatabaseName\(\)\);/);
  assert.doesNotMatch(s, /MONGODB_DB|["']lkb["']/);
});
