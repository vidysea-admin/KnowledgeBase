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

// D-204 (prod-optin-sync): sync-session.mjs may write lkb_prod ONLY through the three-part opt-in used by mint-key.mjs /
// recover-index-attempt.mjs / backfill-document-consent.mjs: the script passes allowProduction, argv carries
// --i-know-this-is-production, and MONGODB_DB=lkb_prod. Anything less keeps today's refusal. The real script runs against a local TCP
// listener standing in for Mongo (it never answers), so no database is touched; "allowed" means "got past the guard and tried to connect".
const PROD_FLAG = '--i-know-this-is-production';
const PROD_LINE = /PRODUCTION WRITE ENABLED \(D-204\)/;
const REFUSED_PROTECTED = /MONGO_WORK_DB must name an isolated work database; production writes refused/;
async function runSyncOnFixture(extraEnv, flags = [], {testData = false} = {}) {
  const sid = `zz-prodoptin-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dir = join(root, 'data', 'toc-migrated', sid);
  const attempts = [];
  const server = createServer(sock => { attempts.push(sock.remoteAddress); sock.destroy(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'source.json'), JSON.stringify({_id: `${sid}-src`, tenantId: 't-guard', title: 'guard fixture', createdAt: '2026-10-14T00:00:00Z', ...(testData ? {testData: true} : {})}));
    writeFileSync(join(dir, 'turns.json'), JSON.stringify([{_id: `${sid}-t001`, tenantId: 't-guard', sessionId: sid, speakerRef: 'spk:0', tStart: 0, tEnd: 5, text: 'hello'}]));
    const env = {...process.env, MONGODB_URL: `mongodb://127.0.0.1:${server.address().port}/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`, ...extraEnv};
    delete env.LKB_ALLOW_STAGING;
    const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/webinar/sync-session.mjs'), sid, ...flags], {env, cwd: root});
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const exit = await new Promise(r => { const t = setTimeout(() => child.kill(), 120000); child.on('close', c => { clearTimeout(t); r(c); }); });
    return {exit, out, err, attempts};
  } finally {
    server.close();
    rmSync(dir, {recursive: true, force: true});
  }
}
test('D-204: all three parts (script allowProduction, flag, MONGODB_DB=lkb_prod) take the production path, logged once, then connect', async () => {
  const r = await runSyncOnFixture({MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG]);
  assert.match(r.out, PROD_LINE, r.err.slice(0, 300));
  assert.equal(r.out.match(/PRODUCTION WRITE ENABLED/g).length, 1);
  assert.doesNotMatch(r.err, /production writes refused|requires an explicit MONGODB_DB/);
  assert.ok(r.attempts.length > 0, 'the guard passed, so the script must have tried to connect to the (fake) Mongo');
});
test('D-204: each single missing part keeps the existing refusal, with NO production line and NO Mongo connection', async () => {
  const cases = [
    ['flag missing', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [], REFUSED_PROTECTED],
    ['MONGODB_DB unset', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: ''}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGODB_DB=lkb (not lkb_prod)', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGODB_DB wrong case', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'LKB_PROD'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGO_WORK_DB not lkb_prod (work db + prod MONGODB_DB)', {MONGO_WORK_DB: 'lkb_work_x', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], /explicit isolated work database and Mongo URL required; production writes refused/],
    ['flag spelled as =true', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [`${PROD_FLAG}=true`], REFUSED_PROTECTED],
    ['global_university_db with all flags', {MONGO_WORK_DB: 'global_university_db', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], REFUSED_PROTECTED],
  ];
  for (const [label, env, flags, refusal] of cases) {
    const r = await runSyncOnFixture(env, flags);
    assert.notEqual(r.exit, 0, `${label}: must exit non-zero`);
    assert.match(r.err, refusal, `${label}: ${r.err.slice(0, 300)}`);
    assert.doesNotMatch(r.out, PROD_LINE, label);
    assert.deepEqual(r.attempts, [], `${label}: a Mongo connection was attempted`);
  }
});
test('D-204: a testData source never takes the production path (routes to lkb_staging or refuses), even with all three parts', async () => {
  const r = await runSyncOnFixture({MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], {testData: true});
  assert.notEqual(r.exit, 0);
  assert.match(r.err, /testData source: refusing to write it anywhere but lkb_staging/);
  assert.doesNotMatch(r.out, PROD_LINE);
  assert.deepEqual(r.attempts, []);
});
test('D-204: a non-production work DB is unchanged by the opt-in (no production line, with or without the flag)', async () => {
  for (const flags of [[], [PROD_FLAG]]) {
    const r = await runSyncOnFixture({MONGO_WORK_DB: 'lkb_work_x', MONGODB_DB: ''}, flags);
    assert.doesNotMatch(r.out, PROD_LINE, flags.join(' '));
    assert.doesNotMatch(r.err, /production writes refused/, `${flags.join(' ')}: ${r.err.slice(0, 300)}`);
    assert.ok(r.attempts.length > 0, 'isolated work DB passes the guard and attempts to connect');
  }
});
test('D-204 source: the opt-in is the shared requireScriptDatabase with allowProduction, ahead of connect; isProtectedWorkDbName is untouched', () => {
  const s = code('scripts/webinar/sync-session.mjs');
  assert.match(s, /import \{[^}]*PRODUCTION_FLAG[^}]*\} from "\.\.\/lib\/transcript-provenance\.mjs";/);
  assert.match(s, /requireScriptDatabase\(process\.env, process\.argv\.slice\(2\), \{ allowProduction: true \}\)/);
  assert.ok(s.indexOf('allowProduction: true') < s.indexOf('await connect('), 'opt-in must precede connect()');
  assert.match(s, /if \(isProtectedWorkDbName\(workDb, process\.env\)\) throw new Error\("MONGO_WORK_DB must name an isolated work database; production writes refused"\);/);
  assert.match(code('scripts/lib/transcript-provenance.mjs'), /\["lkb", "lkb_prod", "global_university_db"\]\.includes\(n\.toLowerCase\(\)\) \|\| stagingRefused\(n, env\)/);
});

// D-207 (reindex-sync-fix): the migrated source shape and --index-existing go through the SAME D-204 guard; nothing about it is weakened.
// Synthetic fixtures only. The real script runs; a fake TCP listener stands in for Mongo (it never answers), so no database is touched.
async function runScript(args, extraEnv = {}, {fixture, listener = true} = {}) {
  const sid = `zz-d207-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dir = join(root, 'data', 'toc-migrated', sid);
  const attempts = [];
  const server = createServer(sock => { attempts.push(sock.remoteAddress); sock.destroy(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    if (fixture) {
      mkdirSync(dir, {recursive: true});
      for (const [name, doc] of Object.entries(fixture(sid))) writeFileSync(join(dir, name), JSON.stringify(doc));
    }
    const env = {...process.env, ...(listener ? {MONGODB_URL: `mongodb://127.0.0.1:${server.address().port}/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`} : {}), ...extraEnv};
    delete env.LKB_ALLOW_STAGING;
    for (const k of ['MONGODB_DB', 'MONGO_WORK_DB']) if (!(k in extraEnv)) delete env[k];
    const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/webinar/sync-session.mjs'), sid, ...args], {env, cwd: root});
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const exit = await new Promise(r => { const t = setTimeout(() => child.kill(), 120000); child.on('close', c => { clearTimeout(t); r(c); }); });
    return {exit, out, err, attempts, sid};
  } finally {
    server.close();
    rmSync(dir, {recursive: true, force: true});
  }
}
const migratedFixture = sid => ({
  'source.json': {_id: `${sid}-src`, tenantId: 't-guard', kind: 'document', captureMode: 'provided', path: 'raw/x.md', hash: 'h', consent: {given: true}, createdAt: '2026-09-03T06:13:39.454Z'},
  'session.json': {_id: sid, tenantId: 't-guard', sourceId: `${sid}-src`, title: 'Synthetic Migrated Title', date: '2026-01-02', org: 'Synthetic Org', status: {transcribe: 'done', diarize: 'pending', summarize: 'done', index: 'pending'}},
  'turns.json': [0, 1].map(i => ({_id: `${sid}-t00${i + 1}`, tenantId: 't-guard', sessionId: sid, speakerRef: 'Speaker A', tStart: i * 5, tEnd: i * 5 + 4, text: `synthetic line ${i}`})),
});
const titledFixture = sid => ({
  'source.json': {_id: `${sid}-src`, tenantId: 't-guard', title: 'guard fixture', createdAt: '2026-10-14T00:00:00Z'},
  'turns.json': [{_id: `${sid}-t001`, tenantId: 't-guard', sessionId: sid, speakerRef: 'spk:0', tStart: 0, tEnd: 5, text: 'hello'}],
});
test('D-207: --dry-run --index passes for BOTH source shapes (migrated: title from session.json; titled: unchanged) and connects to nothing', async () => {
  for (const [label, fixture, title] of [['migrated', migratedFixture, /Synthetic Migrated Title|turns 2/], ['titled', titledFixture, /turns 1/]]) {
    const r = await runScript(['--dry-run', '--index'], {}, {fixture});
    assert.equal(r.exit, 0, `${label}: ${r.err.slice(0, 400)}`);
    assert.match(r.out, title, label);
    assert.match(r.out, /index plan: .*lexical chunk/, label);
    assert.match(r.out, /No Mongo connection attempted \(--dry-run\)/, label);
    assert.deepEqual(r.attempts, [], `${label}: a Mongo connection was attempted`);
  }
});
test('D-207 falsification: a title-less source with no matching session.json is still refused by the dry run', async () => {
  const r = await runScript(['--dry-run', '--index'], {}, {fixture: sid => { const f = migratedFixture(sid); delete f['session.json']; return f; }});
  assert.notEqual(r.exit, 0);
  assert.match(r.err, /invalid\/silent webinar source/);
});
test('D-207: --index-existing --dry-run prints the plan, needs no local directory, connects to nothing', async () => {
  const r = await runScript(['--index-existing', '--tenant', 'vidysea', '--dry-run']);
  assert.equal(r.exit, 0, r.err.slice(0, 300));
  assert.match(r.out, /--index-existing: indexes the rows already in the target database/);
  assert.match(r.out, /No Mongo connection attempted \(--dry-run\)/);
  assert.deepEqual(r.attempts, []);
});
test('D-207: --index-existing needs a valid --tenant and refuses --emit-files (usage error, no connection)', async () => {
  for (const args of [['--index-existing'], ['--index-existing', '--tenant'], ['--index-existing', '--tenant', '--dry-run'], ['--index-existing', '--tenant', 'a b'],
    ['--index-existing', '--tenant', 'vidysea', '--emit-files']]) {
    const r = await runScript(args, {MONGO_WORK_DB: 'lkb_work_x'});
    assert.notEqual(r.exit, 0, args.join(' '));
    assert.match(r.err, /usage: node scripts\/webinar\/sync-session\.mjs/, args.join(' '));
    assert.deepEqual(r.attempts, [], args.join(' '));
  }
});
test('D-207: the D-204 refusal matrix is unchanged for --index-existing (each missing part refuses, NO production line, NO connection) and all three parts pass the guard', async () => {
  const existing = ['--index-existing', '--tenant', 't-guard'];
  const cases = [
    ['flag missing', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [], REFUSED_PROTECTED],
    ['MONGODB_DB unset', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: ''}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGODB_DB=lkb', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGODB_DB wrong case', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'LKB_PROD'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGO_WORK_DB=lkb (protected, no opt-in)', {MONGO_WORK_DB: 'lkb', MONGODB_DB: 'lkb'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['MONGO_WORK_DB unset', {MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['flag spelled as =true', {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'}, [`${PROD_FLAG}=true`], REFUSED_PROTECTED],
    ['global_university_db with all flags', {MONGO_WORK_DB: 'global_university_db', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], REFUSED_PROTECTED],
    ['work db + prod MONGODB_DB', {MONGO_WORK_DB: 'lkb_work_x', MONGODB_DB: 'lkb_prod'}, [PROD_FLAG], /explicit isolated work database and Mongo URL required; production writes refused/],
  ];
  for (const [label, env, flags, refusal] of cases) {
    const r = await runScript([...existing, ...flags], env);
    assert.notEqual(r.exit, 0, `${label}: must exit non-zero`);
    assert.match(r.err, refusal, `${label}: ${r.err.slice(0, 300)}`);
    assert.doesNotMatch(r.out, PROD_LINE, label);
    assert.deepEqual(r.attempts, [], `${label}: a Mongo connection was attempted`);
  }
  const all = await runScript([...existing, PROD_FLAG], {MONGO_WORK_DB: 'lkb_prod', MONGODB_DB: 'lkb_prod'});
  assert.match(all.out, PROD_LINE, all.err.slice(0, 300));
  assert.equal(all.out.match(/PRODUCTION WRITE ENABLED/g).length, 1);
  assert.doesNotMatch(all.err, /production writes refused/);
  assert.ok(all.attempts.length > 0, 'all three parts: the guard passed, so the script tried to connect to the (fake) Mongo');
  assert.notEqual(all.exit, 0, 'the fake Mongo never answers, so the run fails after the guard (nothing written)');
});
test('D-207 source: both paths call the one guardDatabase(); the migrated and existing paths add no second opt-in and no weaker check', () => {
  const s = code('scripts/webinar/sync-session.mjs');
  assert.equal(s.match(/\bguardDatabase\(/g).length, 3, 'definition + sync call + index-existing call');
  assert.equal(s.match(/allowProduction: true/g).length, 1, 'exactly one production opt-in');
  assert.equal(s.match(/isProtectedWorkDbName\(/g).length, 1, 'exactly one protected-name gate, inside guardDatabase');
  assert.ok(s.indexOf('function guardDatabase') < s.indexOf('guardDatabase(undefined)'));
  assert.match(code('scripts/lib/transcript-provenance.mjs'), /\["lkb", "lkb_prod", "global_university_db"\]\.includes\(n\.toLowerCase\(\)\) \|\| stagingRefused\(n, env\)/);
});
