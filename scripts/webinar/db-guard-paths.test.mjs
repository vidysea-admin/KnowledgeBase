// ISS-NOLKBDEFAULT-001: regression tests for the four guard paths whose mutants survived the nolkbdefault checker
// (M3a validateRunGate, M3b sync-session, M3d run-pipeline-deps Gmail preflight, M5 join-rules API host). Fakes only:
// no database, network or browser is touched (fetch is replaced; the other two paths are asserted at source level).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireScriptDatabase} from '../lib/transcript-provenance.mjs';
import {validateRunGate} from './run-pipeline.mjs';
import {createPipelineDeps} from './run-pipeline-deps.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const code = file => readFileSync(root + file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
const OPT_IN = {LKB_ALLOW_STAGING: 'lkb_staging'};

// M3a ---------------------------------------------------------------------------------------------------------------
test('validateRunGate refuses unset, lkb, global_university_db and un-opted lkb_staging (any casing)', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gate-'));
  for (const work of [undefined, '', '  ', 'lkb', 'LKB', ' lkb ', 'lkb_prod', 'LKB_PROD', ' LkB_PrOd ', 'global_university_db', 'lkb_staging', 'LKB_STAGING', 'Lkb_Staging'])
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
  for (const work of [undefined, 'lkb', 'LKB', ' lkb ', 'lkb_prod', 'LKB_PROD', ' LkB_PrOd ', 'global_university_db', 'lkb_staging', 'LKB_STAGING']) {
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
  const route = s.search(/route = resolveWorkDb\(\{[^}]*workDb: process\.env\.MONGO_WORK_DB\?\.trim\(\)[^}]*env: process\.env \}\);/);
  assert.ok(route > 0, 'the work DB must come from resolveWorkDb fed with MONGO_WORK_DB and process.env');
  assert.match(s, /workDb = route\.workDb;/);
  const guard = s.search(/if \(isProtectedWorkDbName\(workDb, process\.env\)\) throw new Error\(/);
  assert.ok(guard > route, 'guard call missing, its env argument dropped, or it runs before the route is resolved');
  assert.ok(guard < s.indexOf('await connect('), 'guard must precede connect()');
  assert.match(s, /await connect\(target\.url, target\.dbName\)/, 'connects to the guard target built from the resolved name (ISS-LEGACYSEED-007)');
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
  for (const name of ['lkb', 'LKB', ' lkb ', 'lkb_prod', 'LKB_PROD', ' LkB_PrOd ', 'global_university_db', undefined, '']) assert.equal(isProtectedWorkDbName(name, OPT_IN), true, String(name));
  assert.equal(isProtectedWorkDbName(STAGING_DB, {}), true);
  assert.equal(isProtectedWorkDbName(STAGING_DB, OPT_IN), false);
});
test('join-rules-api-host.ts connects through requireScriptDatabase() with no localhost / lkb fallback (ISS-LEGACYSEED-004)', () => {
  const s = code('scripts/webinar/join-rules-api-host.ts');
  assert.match(s, /import \{ requireScriptDatabase \} from "\.\.\/lib\/transcript-provenance\.mjs";/);
  assert.match(s, /await connect\(target\.url, target\.dbName\);/);
  assert.doesNotMatch(s, /MONGODB_DB|localhost|["']lkb["']/);
});

// ISS-WEBINARFIX-001: behavioural, kills "guard wrapped in try/catch" and "raw MongoClient opened before the guard". The real script is
// run against a protected work DB with a local TCP listener standing in for Mongo; ANY connection to it is a failed guard.
test('sync-session.mjs with MONGO_WORK_DB=lkb exits non-zero with the protected-DB refusal and makes NO Mongo connection', async () => {
  const sid = `zz-dbguard-${process.pid}-${Date.now()}`, dir = join(root, 'data', 'toc-migrated', sid);
  const attempts = [];
  const server = createServer(sock => { attempts.push(sock.remoteAddress); sock.destroy(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'source.json'), JSON.stringify({_id: `${sid}-src`, tenantId: 't-guard', title: 'guard fixture', createdAt: '2026-10-14T00:00:00Z'}));
    writeFileSync(join(dir, 'turns.json'), JSON.stringify([{_id: `${sid}-t001`, tenantId: 't-guard', sessionId: sid, speakerRef: 'spk:0', tStart: 0, tEnd: 5, text: 'hello'}]));
    for (const work of ['lkb', 'LKB', ' lkb ', 'lkb_prod', 'LKB_PROD', ' LkB_PrOd ', 'global_university_db']) {
      const env = {...process.env, MONGO_WORK_DB: work, MONGODB_URL: `mongodb://127.0.0.1:${server.address().port}/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`};
      delete env.LKB_ALLOW_STAGING;
      const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/webinar/sync-session.mjs'), sid], {env, cwd: root});
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.stdout.resume();
      const code = await new Promise(r => { const t = setTimeout(() => child.kill(), 60000); child.on('close', c => { clearTimeout(t); r(c); }); });
      assert.notEqual(code, 0, `${work}: must exit non-zero`);
      assert.match(err, /MONGO_WORK_DB must name an isolated work database; production writes refused/, `${work}: ${err.slice(0, 300)}`);
      assert.deepEqual(attempts, [], `${work}: a Mongo connection was attempted`);
    }
  } finally {
    server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

// ISS-LEGACYSEED-004 / -007: no localhost URL or default database; fakes only, no real Mongo is ever contacted.
const URL_ = 'mongodb://fake.invalid:27017';
// Replay of the recorded evidence sites (qa/issues.legacyseed.jsonl rows 004 and 007).
test('ISS-LEGACYSEED-004 replay: join-rules-api-host.ts has no localhost URL or lkb default and guards before connect', () => {
  const s = code('scripts/webinar/join-rules-api-host.ts');
  assert.doesNotMatch(s, /localhost|127\.0\.0\.1|\?\?\s*["']lkb|\|\|\s*["']lkb|["']lkb["']/);
  const guard = s.indexOf('requireScriptDatabase(process.env');
  assert.ok(guard > 0 && guard < s.indexOf('await connect('), 'guard must precede connect()');
  assert.match(s, /await connect\(target\.url, target\.dbName\);/);
  assert.match(s, /import \{ requireScriptDatabase \} from "\.\.\/lib\/transcript-provenance\.mjs";/);
});
test('ISS-LEGACYSEED-007 replay: sync-session.mjs has no localhost URL fallback and connects through the guard target', () => {
  const s = code('scripts/webinar/sync-session.mjs');
  assert.doesNotMatch(s, /localhost|127\.0\.0\.1/);
  const guard = s.indexOf('requireScriptDatabase(guardEnv');
  assert.ok(guard > 0 && guard < s.indexOf('await connect('), 'guard must precede connect()');
  assert.match(s, /await connect\(target\.url, target\.dbName\);/);
});

test('the guard both scripts use refuses missing or ambiguous Mongo env and never invents a URL', () => {
  const P = {allowProduction: true};
  assert.throws(() => requireScriptDatabase({}, [], P), /required|refused/);
  assert.throws(() => requireScriptDatabase({MONGO_WORK_DB: 'lkb_work_x'}, [], P), /required|refused/);          // no URL
  assert.throws(() => requireScriptDatabase({MONGODB_URL: '  ', MONGO_WORK_DB: 'lkb_work_x'}, [], P), /required|refused/);
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_}, [], P), /required|refused/);                    // no DB
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGODB_DB: 'lkb'}, [], P), /refused/);          // lkb without flag
  assert.throws(() => requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: 'lkb_work_x', MONGODB_DB: 'other'}, [], P), /refused/); // ambiguous
  assert.deepEqual(requireScriptDatabase({MONGODB_URL: URL_, MONGO_WORK_DB: 'lkb_work_x'}, [], P), {url: URL_, dbName: 'lkb_work_x'});
});

// Behavioural: the REAL sync-session.mjs on a fixture, with a Mongo target that is missing or ambiguous.
test('sync-session.mjs with MONGODB_URL missing/blank or MONGODB_DB ambiguous exits non-zero and never connects (no localhost write)', async () => {
  const sid = `zz-legacyseed-${process.pid}-${Date.now()}`, dir = join(root, 'data', 'toc-migrated', sid);
  const attempts = [];
  const server = createServer(sock => { attempts.push(sock.remoteAddress); sock.destroy(); });
  const listening = await new Promise(r => { server.once('error', () => r(false)); server.listen(27017, '127.0.0.1', () => r(true)); });
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'source.json'), JSON.stringify({_id: `${sid}-src`, tenantId: 't-guard', title: 'guard fixture', createdAt: '2026-10-14T00:00:00Z'}));
    writeFileSync(join(dir, 'turns.json'), JSON.stringify([{_id: `${sid}-t001`, tenantId: 't-guard', sessionId: sid, speakerRef: 'spk:0', tStart: 0, tEnd: 5, text: 'hello'}]));
    const cases = [
      {MONGO_WORK_DB: 'lkb_work_x', MONGODB_URL: ''},
      {MONGO_WORK_DB: 'lkb_work_x', MONGODB_URL: '   '},
      {MONGO_WORK_DB: 'lkb_work_x', MONGODB_URL: URL_, MONGODB_DB: 'some_other_db'},
    ];
    for (const extra of cases) {
      const env = {...process.env, ...extra};
      delete env.LKB_ALLOW_STAGING;
      if (extra.MONGODB_DB === undefined) delete env.MONGODB_DB;
      const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/webinar/sync-session.mjs'), sid], {env, cwd: root});
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.stdout.resume();
      const exit = await new Promise(r => { const t = setTimeout(() => child.kill(), 240000); child.on('close', c => { clearTimeout(t); r(c); }); });
      assert.notEqual(exit, 0, `${JSON.stringify(extra)}: must exit non-zero`);
      assert.match(err, /explicit isolated work database and Mongo URL required; production writes refused/, `${JSON.stringify(extra)}: ${err.slice(0, 300)}`);
      assert.deepEqual(attempts, [], `${JSON.stringify(extra)}: a Mongo connection was attempted`);
    }
    if (!listening) console.log('note: 127.0.0.1:27017 busy, localhost-connect probe skipped (refusal assertions still ran)');
  } finally {
    if (listening) server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

// Fix cycle 1: the guard must run before ANY side effect, --emit-files included. The real script is spawned with a blank or
// mismatched Mongo env; it must exit non-zero and leave the session directory exactly as it was (no emitted artifacts).
test('sync-session.mjs --emit-files with blank/mismatched Mongo env refuses before writing any file', async () => {
  const sid = `zz-legacyseed-emit-${process.pid}-${Date.now()}`, dir = join(root, 'data', 'toc-migrated', sid);
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'source.json'), JSON.stringify({_id: `${sid}-src`, tenantId: 't-guard', title: 'guard fixture', createdAt: '2026-10-14T00:00:00Z'}));
    writeFileSync(join(dir, 'turns.json'), JSON.stringify([{_id: `${sid}-t001`, tenantId: 't-guard', sessionId: sid, speakerRef: 'spk:0', tStart: 0, tEnd: 5, text: 'hello'}]));
    const before = readdirSync(dir).sort();
    for (const extra of [{MONGO_WORK_DB: 'lkb_work_x', MONGODB_URL: ''}, {MONGO_WORK_DB: 'lkb_work_x', MONGODB_URL: URL_, MONGODB_DB: 'some_other_db'}]) {
      const env = {...process.env, ...extra};
      delete env.LKB_ALLOW_STAGING;
      if (extra.MONGODB_DB === undefined) delete env.MONGODB_DB;
      const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/webinar/sync-session.mjs'), sid, '--emit-files'], {env, cwd: root});
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.stdout.resume();
      const exit = await new Promise(r => { const t = setTimeout(() => child.kill(), 240000); child.on('close', c => { clearTimeout(t); r(c); }); });
      assert.notEqual(exit, 0, `${JSON.stringify(extra)}: must exit non-zero`);
      assert.match(err, /explicit isolated work database and Mongo URL required; production writes refused/, `${JSON.stringify(extra)}: ${err.slice(0, 300)}`);
      assert.deepEqual(readdirSync(dir).sort(), before, `${JSON.stringify(extra)}: files were written before the refusal`);
    }
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
