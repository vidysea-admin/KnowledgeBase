#!/usr/bin/env node
// Falsification harness for unit wa-dockerfile (C3C). Every mutation runs on a SCRATCH COPY of the two committed files
// (never on the archiver worktree). Per mutation: byte backup of that one file, mutate, run the checker with a timeout,
// restore in `finally` AND on exit/SIGINT/SIGTERM (handler scoped to the current mutation only), compare bytes with the
// backup, then `git hash-object` of the restored copy must equal `git rev-parse HEAD:<file>` of the archiver worktree.
// Usage: node falsify.mjs <archiver worktree> <scratch dir> [--sim]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(process.argv[2]);
const scratch = path.resolve(process.argv[3]);
const withSim = process.argv.includes('--sim');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CHECK = path.join(here, 'check-dockerfile.mjs');
const SIM = path.join(here, 'sim-build.mjs');
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const headBlob = (f) => git('rev-parse', `HEAD:${f}`).stdout.trim();
const hashOf = (p) => spawnSync('git', ['hash-object', '--no-filters', p], { encoding: 'utf8' }).stdout.trim();
const headBytes = (f) => spawnSync('git', ['-C', repo, 'cat-file', 'blob', `HEAD:${f}`], { encoding: 'buffer', maxBuffer: 1 << 20 }).stdout;
const FILES = ['Dockerfile', '.dockerignore'];

const runCheck = (dir) => {
  const r = spawnSync(process.execPath, [CHECK, dir, '--json'], { encoding: 'utf8', timeout: 60000, env: { ...process.env, CTX_ROOT: repo } });
  if (r.error || r.signal) return { error: String(r.error ?? r.signal), red: [] };
  let res; try { res = JSON.parse(r.stdout); } catch { return { error: 'unparseable checker output: ' + r.stdout + r.stderr, red: [] }; }
  return { error: null, red: res.filter((x) => !x.ok).map((x) => x.id.replace('C3C-', '')), detail: Object.fromEntries(res.filter((x) => !x.ok).map((x) => [x.id.replace('C3C-', ''), x.detail])) };
};

const sub = (from, to) => (t) => { const n = typeof from === 'string' ? t.replace(from, to) : t.replace(from, to); if (n === t) throw new Error('mutation did not change the file: ' + from); return n; };
const add = (after, line) => (t) => { if (!t.includes(after)) throw new Error('anchor missing: ' + after); return t.replace(after, after + '\n' + line); };

// id, criterion, file, mutate, expected red ids (all must be red; any other red is reported)
const M = [
  { id: 'M01', crit: 'C1', file: 'Dockerfile', what: 'patch step gets `|| true`', mut: sub('RUN npm run patch:baileys', 'RUN npm run patch:baileys || true'), want: ['C1', 'C2', 'C7'] },
  { id: 'M02', crit: 'C1', file: 'Dockerfile', what: 'build stage tag becomes latest', mut: sub('FROM node:24-slim AS build', 'FROM node:latest AS build'), want: ['C1'] },
  { id: 'M03', crit: 'C1', file: 'Dockerfile', what: '`npm ci` becomes `npm install`', mut: sub('RUN npm ci\n', 'RUN npm install\n'), want: ['C1'] },
  { id: 'M04', crit: 'C1', file: 'Dockerfile', what: 'patch step moved after `npm run build`', mut: (t) => { const a = 'RUN npm run patch:baileys\n'; if (!t.includes(a)) throw new Error('anchor'); return t.replace(a, '').replace('RUN npm run build\n', 'RUN npm run build\n' + a); }, want: ['C1'] },
  { id: 'M05', crit: 'C2', file: 'Dockerfile', what: 'final node_modules reinstalled with `npm ci --omit=dev` instead of copied (unpatched)', mut: sub('COPY --from=build --chown=node:node /app/node_modules ./node_modules', 'RUN npm ci --omit=dev'), want: ['C2', 'C4'] },
  { id: 'M06', crit: 'C2', file: 'Dockerfile', what: 'a bare `npm ci --omit=dev` after the copy in the final stage', mut: add('COPY --from=build --chown=node:node /app/dist ./dist', 'RUN npm ci --omit=dev'), want: ['C2'] },
  { id: 'M07', crit: 'C3', file: 'Dockerfile', what: '`USER node` becomes `USER root`', mut: sub('USER node', 'USER root'), want: ['C3'] },
  { id: 'M08', crit: 'C3', file: 'Dockerfile', what: 'a chmod after the last USER', mut: add('USER node', 'RUN chmod -R a+rwx /app'), want: ['C3'] },
  { id: 'M09', crit: 'C3', file: 'Dockerfile', what: 'USER instruction removed', mut: sub('USER node\n', ''), want: ['C3'] },
  { id: 'M10', crit: 'C4', file: '.dockerignore', what: '`sessions` removed from .dockerignore', mut: sub(/^sessions\n/m, ''), want: ['C4'] },
  { id: 'M11', crit: 'C4', file: '.dockerignore', what: '`patches` added to .dockerignore (build input hidden)', mut: add('node_modules', 'patches'), want: ['C4'] },
  { id: 'M12', crit: 'C4', file: 'Dockerfile', what: 'a `COPY .env` is added to the build stage', mut: add('COPY patches ./patches', 'COPY .env ./.env'), want: ['C4', 'C6'] },
  { id: 'M13', crit: 'C4', file: 'Dockerfile', what: '`npm prune --omit=dev` removed (dev dependencies reach the image)', mut: sub('RUN npm prune --omit=dev\n', ''), want: ['C4'] },
  { id: 'M14', crit: 'C4', file: 'Dockerfile', what: 'final stage also copies web/', mut: add('COPY --from=build --chown=node:node /app/dist ./dist', 'COPY --from=build --chown=node:node /app/web ./web'), want: ['C4'] },
  { id: 'M15', crit: 'C5', file: 'Dockerfile', what: 'CMD in shell form', mut: sub('CMD ["node", "dist/index.js"]', 'CMD node dist/index.js'), want: ['C5'] },
  { id: 'M16', crit: 'C5', file: 'Dockerfile', what: 'CMD becomes `npm start`', mut: sub('CMD ["node", "dist/index.js"]', 'CMD ["npm", "start"]'), want: ['C5'] },
  { id: 'M17', crit: 'C5', file: 'Dockerfile', what: 'a HEALTHCHECK is added', mut: add('USER node', 'HEALTHCHECK CMD curl -f http://localhost:8080/svc/v1/health || exit 1'), want: ['C5'] },
  { id: 'M18', crit: 'C5', file: 'Dockerfile', what: 'EXPOSE 3000 while ENV PORT=8080', mut: add('ENV PORT=8080', 'EXPOSE 3000'), want: ['C5'] },
  { id: 'M19', crit: 'C6', file: 'Dockerfile', what: 'ENV SERVICE_API_TOKEN with a value', mut: add('ENV NODE_ENV=production', 'ENV SERVICE_API_TOKEN=dummyvalue'), want: ['C6'] },
  { id: 'M20', crit: 'C6', file: 'Dockerfile', what: 'ARG MONGO_URI with a value', mut: add('WORKDIR /app\nENV NODE_ENV', 'ARG MONGO_URI=mongodb://example'), want: ['C6'], skipIfNoAnchor: true },
  { id: 'M21', crit: 'C7', file: 'Dockerfile', what: 'patch step followed by `; true`', mut: sub('RUN npm run patch:baileys', 'RUN npm run patch:baileys; true'), want: ['C1', 'C2', 'C7'] },
  { id: 'M22', crit: 'C7', file: 'Dockerfile', what: '`COPY patches ./patches` removed (patch step cannot see its patch)', mut: sub('COPY patches ./patches\n', ''), want: ['C7'] },
  { id: 'M23', crit: 'I3', file: 'Dockerfile', what: 'a 44-character token-like string in a comment', mut: add('# WhatsApp archiver image (decision D-023 item 8, unit C3C).', '# key Zx9Qw3Lm7Rt2Vb8Nc4Hd6Jf1Ks5Gp0Ya3Ue7Io9Tq2W'), want: ['I3'] },
];

mkdirSync(scratch, { recursive: true });
const report = [];
let current = null; // { file, backup } of the mutation in flight; the handler restores only this one
const restoreCurrent = () => { if (current) { try { writeFileSync(current.file, current.backup); } catch {} current = null; } };
process.on('exit', restoreCurrent);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restoreCurrent(); process.exit(130); });
process.on('uncaughtException', (e) => { restoreCurrent(); console.error(e); process.exit(2); });

// control: unmutated scratch copy is green
const mkCopy = (name) => { const d = path.join(scratch, name); mkdirSync(d, { recursive: true }); for (const f of FILES) writeFileSync(path.join(d, f), headBytes(f)); return d; };
const ctl = mkCopy('control');
const c0 = runCheck(ctl);
console.log(`CONTROL (scratch copy of HEAD, unmutated): red=[${c0.red}] error=${c0.error}`);
if (c0.red.length || c0.error) { console.log('CONTROL NOT GREEN, abort'); process.exit(1); }

let bad = 0;
for (const m of M) {
  const dir = mkCopy(m.id); const file = path.join(dir, m.file);
  const backup = readFileSync(file); // per-mutation byte backup
  let row;
  try {
    current = { file, backup };
    const mutated = m.mut(backup.toString('utf8'));
    writeFileSync(file, mutated);
    const r = runCheck(dir);
    const redOk = m.want.every((w) => r.red.includes(w));
    const extra = r.red.filter((x) => !m.want.includes(x));
    row = { ...m, red: r.red, ok: redOk && !r.error, extra, detail: r.error ?? m.want.map((w) => `${w}: ${(r.detail?.[w] ?? '').slice(0, 110)}`).join(' | ') };
  } catch (e) { row = { ...m, red: [], ok: false, extra: [], detail: 'HARNESS ERROR ' + e.message }; }
  finally { restoreCurrent(); }
  const after = readFileSync(file);
  const bytesOk = Buffer.compare(after, backup) === 0;
  const hashOk = hashOf(file) === headBlob(m.file);
  const r2 = runCheck(dir);
  row.restored = bytesOk && hashOk && r2.red.length === 0;
  if (!row.ok || !row.restored) bad++;
  report.push(row);
  console.log(`${m.id} ${m.crit} [${m.file}] ${m.what}\n   red after: [${row.red}] expected [${m.want}] extra [${row.extra}] -> ${row.ok ? 'KILLED' : 'SURVIVED/ERROR'}; restored bytes=${bytesOk} hash=${hashOk} green-again=${r2.red.length === 0}\n   ${row.detail}`);
}

// the real worktree files were never touched
const real = FILES.map((f) => `${f}:${hashOf(path.join(repo, f)) === headBlob(f)}`).join(' ');
const st = git('status', '--short').stdout.trim();
console.log(`WORKTREE hash==HEAD blob: ${real}; git status --short: ${st === '' ? '(empty)' : st}`);

if (withSim) {
  // dynamic falsification for C2: build stage without the patch step -> the replay shows marker count 0 in the final stage
  const d = mkCopy('M24-dyn-repo'); const dockerfile = path.join(d, 'Dockerfile'); const backup = readFileSync(dockerfile);
  // the sim needs the whole repo context: build a context dir = real repo files minus node_modules via the sim itself (it reads from `repo`),
  // so we point the sim at a copy of the repo tree files it needs
  const ctx = path.join(scratch, 'M24-ctx'); mkdirSync(ctx, { recursive: true });
  for (const f of ['package.json', 'package-lock.json', 'tsconfig.json']) writeFileSync(path.join(ctx, f), readFileSync(path.join(repo, f)));
  const cp = (rel) => spawnSync('bash', ['-c', `cp -r "${path.join(repo, rel)}" "${ctx}/"`]);
  cp('patches'); cp('src');
  writeFileSync(path.join(ctx, '.dockerignore'), headBytes('.dockerignore'));
  try {
    current = { file: dockerfile, backup };
    writeFileSync(path.join(ctx, 'Dockerfile'), sub('RUN npm run patch:baileys\n', '')(backup.toString('utf8')));
    const r = spawnSync(process.execPath, [SIM, ctx, path.join(scratch, 'M24-sim'), '--skip-start'], { encoding: 'utf8', timeout: 600000 });
    const marker = /MARKER socket.js=(-?\d+) messages-recv.js=(-?\d+)/.exec(r.stdout ?? '');
    console.log(`M24 C2 (dynamic) build stage without the patch step: sim exit=${r.status}; ${marker ? marker[0] : 'no marker line'} -> ${r.status !== 0 && marker && marker[1] === '0' && marker[2] === '0' ? 'KILLED' : 'SURVIVED/ERROR'}`);
    if (!(r.status !== 0 && marker && marker[1] === '0' && marker[2] === '0')) bad++;
  } finally { restoreCurrent(); }
  // control for the dynamic run: the unmutated Dockerfile in the same context is green (marker >= 1)
  writeFileSync(path.join(ctx, 'Dockerfile'), backup);
  const r = spawnSync(process.execPath, [SIM, ctx, path.join(scratch, 'M24-sim-control'), '--skip-start'], { encoding: 'utf8', timeout: 600000 });
  const marker = /MARKER socket.js=(-?\d+) messages-recv.js=(-?\d+)/.exec(r.stdout ?? '');
  console.log(`M24 control (unmutated Dockerfile, same context): sim exit=${r.status}; ${marker ? marker[0] : 'no marker line'} -> ${r.status === 0 ? 'GREEN' : 'NOT GREEN'}`);
  if (r.status !== 0) bad++;
  console.log(`M24 Dockerfile hash==HEAD blob: ${hashOf(path.join(ctx, 'Dockerfile')) === headBlob('Dockerfile')}`);
}
console.log(`SUMMARY mutants=${M.length}${withSim ? '+1 dynamic' : ''} problems=${bad}`);
process.exit(bad ? 1 : 0);
