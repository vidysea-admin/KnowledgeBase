// Meeting-bot container smoke (D-205 U5). Static + shimmed checks run anywhere with bash; the real
// Docker run happens only with LKB_DOCKER_TESTS=1 and BOT_IMAGE=<built bot image>.
//   node --test scripts/qa/container-workflows/bot-smoke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'bot-smoke.sh');
const fixture = join(here, 'fixtures', 'bot-smoke-meeting.html');
const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
const posix = (p) => process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_m, d) => '/' + d.toLowerCase()).replace(/\\/g, '/') : p;
const haveBash = spawnSync(bash, ['--version'], {encoding: 'utf8'}).status === 0;

test('fixture is a self-contained looping canvas + 440 Hz tone page with no external assets', () => {
  const html = readFileSync(fixture, 'utf8');
  assert.match(html, /<canvas\b/);
  assert.match(html, /requestAnimationFrame\(frame\)/, 'animation must loop');
  assert.match(html, /createOscillator\(\)/);
  assert.match(html, /frequency\.value = 440/);
  assert.match(html, /\.connect\(ctx\.destination\)/);
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']?(https?:)?\/\//i, 'no external assets');
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|import\s*\(/);
});

test('script records the way run-pipeline does and states all four criteria', () => {
  const s = readFileSync(script, 'utf8');
  assert.match(s, /^#!\/usr\/bin\/env bash/);
  assert.match(s, /node --import tsx packages\/meeting-bot\/src\/cli\.ts record "\$url" --until "\$until" --backend tab/);
  assert.match(s, /LKB_CAPTURE_BACKEND=tab/);
  assert.match(s, /https:\/\/127\.0\.0\.1:8443\/bot-smoke-meeting\.html/, 'record consent requires an https meeting URL');
  assert.match(s, /date -u -d '\+90 seconds'/);
  for (const c of ['a', 'b', 'c', 'd']) assert.match(s, new RegExp(`SMOKE ${c} PASS`), `criterion ${c} has a pass line`);
  assert.match(s, /MIN_PEAK_DB="\$\{BOT_SMOKE_MIN_PEAK_DB:--40\}"/);
  assert.match(s, /docker rm -f -v "\$name"/);
  assert.doesNotMatch(s, /\.env\b|docker (push|login)/);
});

// ---- (e): the check mode exits nonzero when any of a-d fails (shimmed ffprobe/ffmpeg and /proc) -------
function world(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bot-smoke-test-'));
  const rec = join(dir, 'rec'), shim = join(dir, 'shim'), proc = join(dir, 'proc');
  for (const d of [rec, shim, proc]) mkdirSync(d);
  const webm = 'webm' in opts ? opts.webm : 'tab-1.webm';
  if (webm) writeFileSync(join(rec, webm), opts.empty ? '' : 'webm-bytes');
  writeFileSync(join(shim, 'ffprobe'), '#!/bin/sh\ncase "$*" in\n *"select_streams v"*) n=${FAKE_VIDEO:-1}; t=video;;\n *"select_streams a"*) n=${FAKE_AUDIO:-1}; t=audio;;\nesac\ni=0; while [ "$i" -lt "$n" ]; do echo $t; i=$((i+1)); done\n');
  writeFileSync(join(shim, 'ffmpeg'), '#!/bin/sh\n[ -n "$FAKE_PEAK" ] && echo "[Parsed_volumedetect_0 @ 0x1] max_volume: $FAKE_PEAK dB" >&2\nexit 0\n');
  for (const f of ['ffprobe', 'ffmpeg']) chmodSync(join(shim, f), 0o755);
  if (opts.leftover) { mkdirSync(join(proc, '4242')); writeFileSync(join(proc, '4242', 'comm'), opts.leftover + '\n'); }
  mkdirSync(join(proc, '1')); writeFileSync(join(proc, '1', 'comm'), 'tini\n');
  return {dir, rec, shim, proc};
}
function check(opts = {}, exit = '0', env = {}) {
  const w = world(opts);
  try {
    const r = spawnSync(bash, [posix(script), '--check', posix(w.rec), exit], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${posix(w.shim)}:${process.env.PATH}`, BOT_SMOKE_PROC: posix(w.proc), BOT_SMOKE_REAP_TRIES: '1',
        FAKE_PEAK: '-3.3', ...env},
    });
    return {status: r.status, out: `${r.stdout}${r.stderr}`};
  } finally { rmSync(w.dir, {recursive: true, force: true}); }
}
const t = haveBash ? test : test.skip;

t('check passes when a, b, c and d all hold', () => {
  const r = check();
  assert.equal(r.status, 0, r.out);
  for (const c of ['a', 'b', 'c', 'd']) assert.match(r.out, new RegExp(`SMOKE ${c} PASS`));
});
t('(a) fails with no webm, an empty webm, or only a .playable.webm', () => {
  for (const opts of [{webm: null}, {empty: true}, {webm: 'tab-1.playable.webm'}]) {
    const r = check(opts);
    assert.notEqual(r.status, 0, JSON.stringify(opts));
    assert.match(r.out, /SMOKE a FAIL/);
  }
});
t('(b) fails unless there is exactly one audio and one video stream', () => {
  for (const env of [{FAKE_VIDEO: '0'}, {FAKE_AUDIO: '0'}, {FAKE_VIDEO: '2'}, {FAKE_AUDIO: '2'}]) {
    const r = check({}, '0', env);
    assert.notEqual(r.status, 0, JSON.stringify(env));
    assert.match(r.out, /SMOKE b FAIL/);
  }
});
t('(c) fails on a silent, quiet-below-threshold or unreadable audio peak, passes just above -40 dB', () => {
  for (const peak of ['-91.0', '-40.0', '-45.2', '']) {
    const r = check({}, '0', {FAKE_PEAK: peak});
    assert.notEqual(r.status, 0, `peak '${peak}'`);
    assert.match(r.out, /SMOKE c FAIL/);
  }
  assert.equal(check({}, '0', {FAKE_PEAK: '-39.9'}).status, 0);
  assert.equal(check({}, '0', {FAKE_PEAK: '0.0'}).status, 0);
});
t('(d) fails on a nonzero record exit or a leftover chrome/chromedriver process', () => {
  const bad = check({}, '1');
  assert.notEqual(bad.status, 0); assert.match(bad.out, /SMOKE d FAIL record_exit=1/);
  for (const comm of ['chrome', 'chromedriver', 'uc_driver']) {
    const r = check({leftover: comm});
    assert.notEqual(r.status, 0, comm);
    assert.match(r.out, new RegExp(`SMOKE d FAIL .*4242:${comm}`));
  }
});

// ---- real container run: needs Docker and a built bot image ---------------------------------------
const dockerTests = process.env.LKB_DOCKER_TESTS === '1';
test('real container smoke: a-d pass inside the bot image', {skip: !dockerTests && 'set LKB_DOCKER_TESTS=1 and BOT_IMAGE=<built bot image>', timeout: 600000}, () => {
  assert.ok(process.env.BOT_IMAGE, 'BOT_IMAGE must name a built bot image (docker build -f docker/meeting-bot/Dockerfile -t <image> .)');
  const r = spawnSync(bash, [posix(script)], {encoding: 'utf8', env: process.env, timeout: 590000, maxBuffer: 16 * 1024 * 1024});
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 0, out);
  for (const c of ['a', 'b', 'c', 'd']) assert.match(out, new RegExp(`SMOKE ${c} PASS`));
  assert.match(out, /SMOKE RESULT PASS/);
});
