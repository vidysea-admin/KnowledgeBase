// Static contract for the Linux meeting-bot image (D-205 U1). Runs without Docker.
// Set LKB_DOCKER_TESTS=1 to also run the built-image checks (needs a built image named by BOT_IMAGE).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const dockerfile = () => read('docker/meeting-bot/Dockerfile');
const entry = () => read('docker/meeting-bot/entrypoint.sh');

test('Dockerfile pins the toolchain and runs as uid 1000', () => {
  const d = dockerfile();
  assert.match(d, /^FROM node:24-slim/m);
  assert.match(d, /pnpm@10\.33\.0/);
  assert.match(d, /pnpm install --frozen-lockfile/);
  assert.match(d, /seleniumbase get cft/);
  assert.match(d, /seleniumbase get uc_driver stable/);
  for (const pkg of ['xvfb', 'pulseaudio', 'ffmpeg', 'tini', 'python3-tk', 'python3-xlib', 'xdotool', 'x11vnc', 'fonts-noto-color-emoji'])
    assert.ok(d.includes(pkg), `missing apt package ${pkg}`);
  assert.match(d, /^USER node$/m);
  assert.match(d, /ARG GWS_URL=""/);
  assert.match(d, /ARG GWS_SHA256=""/);
  assert.match(d, /ARG GWS_VERSION=/);
  assert.match(d, /sha256sum -c/);
  assert.match(d, /ENTRYPOINT \["\/usr\/bin\/tini", "-s", "--", "\/usr\/local\/bin\/bot-entrypoint"\]/);
});

test('Dockerfile sets the Linux bot environment and carries no secrets', () => {
  const d = dockerfile();
  for (const kv of ['DISPLAY=:99', 'LKB_PYTHON=/app/.venv/bin/python', 'LKB_BROWSER_EXECUTABLE=cft', 'LKB_CAPTURE_BACKEND=tab',
    'LKB_BOT_PROFILE_DIR=/data/bot-profile', 'LKB_RECORD_DIR=/app/raw/webinars', 'LKB_GWS_PATH=/usr/local/bin/gws', 'LKB_CHROME_NO_SANDBOX=1', 'TZ='])
    assert.ok(d.includes(kv), `missing ENV ${kv}`);
  assert.doesNotMatch(d, /(API_KEY|TOKEN|PASSWORD|SECRET|MONGODB_URL)\s*=\s*\S/);
  assert.doesNotMatch(d, /COPY[^\n]*\.env(?!\.example)/);
});

test('entrypoint has run, doctor and login modes and cleans stale state', () => {
  const e = entry();
  assert.match(e, /^#!\/bin\/sh|^#!\/usr\/bin\/env bash|^#!\/bin\/bash/m);
  assert.doesNotMatch(e, /pulseaudio --start/, 'PULSE_SERVER is set in the image, so --start refuses to autospawn');
  for (const needle of ['BOT_MODE', 'doctor', 'login', 'pulseaudio -D', 'Xvfb :99', 'module-null-sink', '.lkb-tab-capture.lock',
    'setup.mjs --doctor', 'run-pipeline.mjs --run --watch', 'x11vnc', 'VNC_PASSWORD'])
    assert.ok(e.includes(needle), `entrypoint missing ${needle}`);
  assert.match(e, /exec node scripts\/webinar\/run-pipeline\.mjs --run --watch/);
  assert.ok(existsSync(join(root, 'docker/meeting-bot/healthcheck.sh')));
});

test('.dockerignore keeps secrets and local state out of the build context', () => {
  const lines = read('.dockerignore').split(/\r?\n/);
  for (const l of ['.env', '**/.env', '.env.*', 'data', 'raw', '.venv', '.cache', '.worktrees'])
    assert.ok(lines.includes(l), `.dockerignore missing ${l}`);
});

test('compose adds only an opt-in bot service', () => {
  const c = read('docker-compose.yml');
  const bot = c.slice(c.indexOf('\n  bot:'));
  assert.ok(c.includes('\n  bot:'), 'bot service missing');
  assert.match(bot, /profiles: \["bot"\]/);
  assert.match(bot, /dockerfile: docker\/meeting-bot\/Dockerfile/);
  assert.match(bot, /init: true/);
  assert.match(bot, /shm_size: 2gb/);
  assert.match(bot, /restart: unless-stopped/);
  assert.doesNotMatch(bot.split('\n  local-mongo:')[0], /\n    ports:/);
  for (const v of ['lkb-bot-profile', 'lkb-bot-recordings', 'lkb-bot-data', 'lkb-bot-gws']) assert.ok(c.includes(v), v);
});

test('docker compose config validates; the default project excludes the bot', {skip: spawnSync('docker', ['--version']).status !== 0}, () => {
  const env = {...process.env, MONGODB_URL: 'x', MONGODB_DB: 'x', OLLAMA_API_KEY: 'x'};
  const base = spawnSync('docker', ['compose', 'config', '--services'], {cwd: root, env, encoding: 'utf8'});
  assert.equal(base.status, 0, base.stderr);
  assert.doesNotMatch(base.stdout, /^bot$/m);
  const withBot = spawnSync('docker', ['compose', '--profile', 'bot', 'config', '--services'], {cwd: root, env, encoding: 'utf8'});
  assert.equal(withBot.status, 0, withBot.stderr);
  assert.match(withBot.stdout, /^bot$/m);
});

const image = process.env.BOT_IMAGE;
test('built image: uid 1000, no .env, doctor passes', {skip: process.env.LKB_DOCKER_TESTS !== '1' || !image}, () => {
  const run = (args, env = []) => spawnSync('docker', ['run', '--rm', ...env.flatMap(e => ['-e', e]), '--entrypoint', '', image, ...args], {encoding: 'utf8'});
  assert.equal(run(['id', '-u']).stdout.trim(), '1000');
  assert.equal(run(['sh', '-c', 'ls -a /app | grep -x .env || true']).stdout.trim(), '');
  const doc = spawnSync('docker', ['run', '--rm', '-e', 'BOT_MODE=doctor', image], {encoding: 'utf8'});
  assert.equal(doc.status, 0, doc.stdout + doc.stderr);
  assert.doesNotMatch(doc.stdout, /MISSING/);
});
