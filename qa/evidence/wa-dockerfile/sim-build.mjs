#!/usr/bin/env node
// Daemon-free simulation of the Dockerfile for unit wa-dockerfile (C3C). NOT a docker build.
// It replays the Dockerfile in a scratch directory: COPY steps are done with fs (honouring .dockerignore),
// only the `npm ...` RUN lines are executed (offline, from the local npm cache), every other RUN is listed as skipped.
// Then it checks what the final stage would hold, and starts `node dist/index.js` from it with no secrets.
// Usage: node sim-build.mjs <repo dir with Dockerfile> <empty scratch dir> [--skip-start]
import { readFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(process.argv[2] ?? '.');
const scratch = path.resolve(process.argv[3] ?? '');
const skipStart = process.argv.includes('--skip-start');
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const fail = (m) => { say('SIM-FAIL ' + m); process.exit(1); };

const dfPath = path.join(repo, 'Dockerfile');
if (!existsSync(dfPath)) fail('no Dockerfile at ' + dfPath);
if (existsSync(scratch) && readdirSync(scratch).length) fail('scratch dir is not empty: ' + scratch);
mkdirSync(scratch, { recursive: true });

// ---- parse
const join = (text) => { const out = []; let buf = null; for (const raw of text.replace(/\r\n/g, '\n').split('\n')) { const t = raw.trim(); if (buf === null) { if (!t || t.startsWith('#')) continue; if (t.endsWith('\\')) buf = t.slice(0, -1).trimEnd() + ' '; else out.push(t); } else { if (t.startsWith('#')) continue; if (t.endsWith('\\')) buf += t.slice(0, -1).trimEnd() + ' '; else { out.push((buf + t).trim()); buf = null; } } } return out; };
const ins = []; let stage = -1; const aliases = {};
for (const line of join(readFileSync(dfPath, 'utf8'))) {
  const m = /^(\S+)\s*(.*)$/s.exec(line); const kw = m[1].toUpperCase(); const args = m[2];
  if (kw === 'FROM') { stage++; const a = /\bAS\s+(\S+)/i.exec(args); if (a) aliases[a[1].toLowerCase()] = stage; }
  ins.push({ kw, args, stage });
}
const nStages = stage + 1; const final = nStages - 1;

// ---- .dockerignore (same semantics as the checker)
const globToRe = (p) => { let re = ''; for (let i = 0; i < p.length; i++) { const c = p[i]; if (c === '*') { if (p[i + 1] === '*') { i++; if (p[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*'; } else if (c === '?') re += '[^/]'; else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&'); } return new RegExp('^' + re + '$'); };
const rules = [];
const diPath = path.join(repo, '.dockerignore');
if (existsSync(diPath)) for (const raw of readFileSync(diPath, 'utf8').replace(/\r\n/g, '\n').split('\n')) { let t = raw.trim(); if (!t || t.startsWith('#')) continue; let neg = false; if (t.startsWith('!')) { neg = true; t = t.slice(1).trim(); } t = t.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/\*\*$/, ''); if (t) rules.push({ neg, re: globToRe(t) }); }
const ignored = (rel) => { const segs = rel.split('/'); let ig = false; for (const r of rules) { for (let n = 1; n <= segs.length; n++) if (r.re.test(segs.slice(0, n).join('/'))) { ig = !r.neg; break; } } return ig; };

// ---- replay
const fsRoot = (n) => path.join(scratch, 'stage' + n);
const toHost = (n, p) => path.join(fsRoot(n), p.replace(/^\/+/, ''));
const wd = {}; const log = []; const skipped = [];
const stageRef = (r) => { const k = r.toLowerCase(); return k in aliases ? aliases[k] : Number(k); };
for (const i of ins) {
  const n = i.stage; if (n < 0) continue;
  if (!(n in wd)) { wd[n] = '/'; mkdirSync(fsRoot(n), { recursive: true }); }
  if (i.kw === 'WORKDIR') { wd[n] = i.args.trim().startsWith('/') ? i.args.trim() : path.posix.join(wd[n], i.args.trim()); mkdirSync(toHost(n, wd[n]), { recursive: true }); }
  else if (i.kw === 'COPY') {
    const fromM = /--from=(\S+)/.exec(i.args);
    const toks = i.args.split(/\s+/).filter((t) => !t.startsWith('--'));
    const dest0 = toks.at(-1); const srcs = toks.slice(0, -1);
    const destAbs = dest0.startsWith('/') ? dest0 : path.posix.join(wd[n], dest0);
    for (const s of srcs) {
      let srcHost; let relForIgnore = null;
      if (fromM) { const sn = stageRef(fromM[1]); srcHost = toHost(sn, s.startsWith('/') ? s : path.posix.join(wd[sn] ?? '/', s)); }
      else { const rel = s.replace(/^\.\//, '').replace(/\/+$/, ''); srcHost = path.join(repo, rel); relForIgnore = rel; if (rel && ignored(rel)) { log.push(`COPY ${s}: EXCLUDED by .dockerignore`); continue; } }
      if (!existsSync(srcHost)) { log.push(`COPY ${s}: NOT FOUND`); say(`SIM-FAIL COPY ${s} not found (stage ${n})`); process.exit(1); }
      const isDir = statSync(srcHost).isDirectory();
      const hostDest = destAbs.endsWith('/') || isDir || srcs.length > 1 ? path.join(toHost(n, destAbs), isDir ? '' : path.basename(srcHost)) : toHost(n, destAbs);
      mkdirSync(path.dirname(hostDest), { recursive: true });
      cpSync(srcHost, hostDest, { recursive: true, filter: (f) => { if (fromM) return true; const rel = path.relative(repo, f).split(path.sep).join('/'); return rel === '' || !ignored(rel); } });
      log.push(`COPY ${fromM ? '--from=' + fromM[1] + ' ' : ''}${s} -> ${destAbs}`);
    }
  } else if (i.kw === 'RUN') {
    const cmd = i.args.trim();
    if (/^npm\s/.test(cmd) && !/[&;|]/.test(cmd)) {
      const cwd = toHost(n, wd[n]);
      const t0 = Date.now();
      const r = spawnSync('bash', ['-c', cmd], { cwd, env: { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', NODE_ENV: '' }, encoding: 'utf8', timeout: 540000 });
      log.push(`RUN ${cmd} (stage ${n}) -> exit ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
      if (r.status !== 0) { say(log.join('\n')); say('--- stderr tail ---\n' + (r.stderr ?? '').split('\n').slice(-15).join('\n') + '\n--- stdout tail ---\n' + (r.stdout ?? '').split('\n').slice(-8).join('\n')); say(`SIM-FAIL RUN ${cmd} exited ${r.status}`); process.exit(1); }
    } else { skipped.push(`RUN ${cmd} (stage ${n})`); }
  }
}
say('--- replay log ---'); say(log.join('\n'));
say('--- RUN lines not executed (not npm, or compound) ---'); say(skipped.length ? skipped.join('\n') : '(none)');

// ---- inspect the final stage
const app = toHost(final, '/app');
const nm = path.join(app, 'node_modules');
const marker = 'lkb-patch';
const count = (f) => { try { return (readFileSync(f, 'utf8').match(new RegExp(marker, 'g')) ?? []).length; } catch { return -1; } };
const sock = count(path.join(nm, 'baileys/lib/Socket/socket.js'));
const recv = count(path.join(nm, 'baileys/lib/Socket/messages-recv.js'));
say('--- final stage inspection ---');
say(`MARKER socket.js=${sock} messages-recv.js=${recv}`);
say(`ls -A /app: ${readdirSync(app).sort().join(' ')}`);
// every package the lock file marks dev-only must be absent from the final node_modules
const lock = JSON.parse(readFileSync(path.join(repo, 'package-lock.json'), 'utf8')).packages;
const devKeys = Object.entries(lock).filter(([k, v]) => k.startsWith('node_modules/') && v.dev === true).map(([k]) => k);
const devPresent = devKeys.filter((k) => existsSync(path.join(app, k)));
say(`lock marks ${devKeys.length} packages dev-only (e.g. typescript, tsx, esbuild, @types/express); present in final node_modules: ${devPresent.length ? devPresent.join(' ') : 'none'}; typescript present: ${existsSync(path.join(nm, 'typescript'))}; tsx present: ${existsSync(path.join(nm, 'tsx'))}`);
say(`dist/index.js present: ${existsSync(path.join(app, 'dist/index.js'))}`);
const bad = ['.env', 'sessions', 'media', 'web', 'patches', 'src'].filter((x) => existsSync(path.join(app, x)));
say(`forbidden entries in /app: ${bad.length ? bad.join(' ') : 'none'}`);

// ---- start from the final stage with no secrets, an unreachable LOOPBACK mongo and a dummy PORT
if (!skipStart) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: '18099', MONGO_URI: 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=3000', MONGO_DB: 'whatsapp_msg_sim', LOG_LEVEL: 'info', NODE_ENV: 'production' };
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['dist/index.js'], { cwd: app, env, encoding: 'utf8', timeout: 30000 });
  const lines = ((r.stdout ?? '') + (r.stderr ?? '')).split('\n').filter(Boolean).map((l) => l.slice(0, 220));
  say(`START node dist/index.js (PORT=18099, no secrets, MONGO_URI=loopback port 1): exit=${r.status} signal=${r.signal ?? 'none'} after ${Math.round((Date.now() - t0) / 100) / 10}s`);
  say('START log (first 6 lines, truncated):\n' + lines.slice(0, 6).join('\n'));
  say(`START module-resolution errors: ${/ERR_MODULE_NOT_FOUND|Cannot find (module|package)/.test((r.stdout ?? '') + (r.stderr ?? '')) ? 'YES' : 'none'}`);
  say(`ls -A /app after start: ${readdirSync(app).sort().join(' ')}`);
}
writeFileSync(path.join(scratch, 'sim-report.txt'), out.join('\n'));
const ok = sock >= 1 && recv >= 1 && devPresent.length === 0 && bad.length === 0;
say(ok ? 'SIM-PASS' : 'SIM-FAIL final stage checks');
process.exit(ok ? 0 : 1);
