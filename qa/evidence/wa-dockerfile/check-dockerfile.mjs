#!/usr/bin/env node
// Static checker for unit wa-dockerfile (C3C). Reads <dir>/Dockerfile and <dir>/.dockerignore only.
// No Docker, no network. Usage: node check-dockerfile.mjs <dir> [--json]
// Prints one line per clause: "PASS|FAIL <id> <detail>". Exit 1 if any clause fails.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const results = [];
const rec = (id, ok, detail) => results.push({ id, ok, detail });

// ---------------------------------------------------------------- parsing
function parseDockerfile(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const ins = [];
  let buf = null;
  for (const raw of lines) {
    const t = raw.trim();
    if (buf === null) {
      if (t === '' || t.startsWith('#')) continue;
      if (t.endsWith('\\')) buf = t.slice(0, -1).trimEnd() + ' ';
      else ins.push(t);
    } else {
      if (t.startsWith('#')) continue; // comment inside a continuation
      if (t.endsWith('\\')) buf += t.slice(0, -1).trimEnd() + ' ';
      else { ins.push((buf + t).trim()); buf = null; }
    }
  }
  if (buf !== null) ins.push(buf.trim());
  const out = [];
  let stage = -1;
  const aliases = {};
  for (const line of ins) {
    const m = /^(\S+)\s*(.*)$/s.exec(line);
    const kw = m[1].toUpperCase();
    const args = m[2];
    if (kw === 'FROM') {
      stage++;
      const fm = /^(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(args);
      const image = fm ? fm[1] : args;
      const alias = fm && fm[2] ? fm[2].toLowerCase() : null;
      if (alias) aliases[alias] = stage;
      out.push({ kw, args, line, stage, image, alias });
    } else out.push({ kw, args, line, stage });
  }
  return { ins: out, stages: stage + 1, aliases };
}

const jsonArray = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null; } catch { return null; } };

// RUN text as a shell string (exec form joined with spaces)
const runText = (i) => { const a = jsonArray(i.args.trim()); return a ? a.join(' ') : i.args; };
// split a RUN text into [{cmd, sep}] pieces on && ; || | (sep is what came before)
function pieces(text) {
  const out = []; const re = /(&&|\|\||;|\|)/g; let last = 0; let sep = ''; let m;
  while ((m = re.exec(text))) { out.push({ cmd: text.slice(last, m.index).trim(), sep }); sep = m[1]; last = m.index + m[1].length; }
  out.push({ cmd: text.slice(last).trim(), sep });
  return out.filter((p) => p.cmd !== '');
}
const PATCH_RE = /^npm\s+run\s+patch:baileys$/;
const BUILD_RE = /^npm\s+run\s+build$/;
const CI_RE = /^npm\s+ci(\s|$)/;
const INSTALL_RE = /^npm\s+(install|i|add)(\s|$)/;
const PRUNE_OK_RE = /^npm\s+prune(\s.*)?\s(--omit=dev|--production)(\s|$)/;
const BYPASS_RES = [/\|\|/, /;/, /\|/, /\bset\s+\+e\b/, /--ignore-scripts/, /\bexit\s+0\b/, /&\s*$/, /^-/];
const bypassOnLine = (text) => BYPASS_RES.filter((r) => r.test(text)).map(String);

// ---------------------------------------------------------------- .dockerignore matcher
function globToRe(p) {
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') { i++; if (p[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function parseIgnore(text) {
  const rules = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    let t = raw.trim();
    if (t === '' || t.startsWith('#')) continue;
    let neg = false;
    if (t.startsWith('!')) { neg = true; t = t.slice(1).trim(); }
    t = t.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/\*\*$/, '');
    if (t === '') continue;
    rules.push({ raw, neg, pat: t, re: globToRe(t) });
  }
  return rules;
}
function isIgnored(rules, p) {
  const segs = p.split('/'); let ig = false;
  for (const r of rules) {
    let hit = false;
    for (let n = 1; n <= segs.length; n++) if (r.re.test(segs.slice(0, n).join('/'))) { hit = true; break; }
    if (hit) ig = !r.neg;
  }
  return ig;
}

// ---------------------------------------------------------------- load
const dfPath = path.join(dir, 'Dockerfile');
const diPath = path.join(dir, '.dockerignore');
const dfText = existsSync(dfPath) ? readFileSync(dfPath, 'utf8') : null;
const diText = existsSync(diPath) ? readFileSync(diPath, 'utf8') : null;
if (dfText === null) for (const id of ['C1', 'C2', 'C3', 'C5', 'C6', 'C7']) rec('C3C-' + id, false, 'no Dockerfile at ' + dfPath);
if (dfText === null) rec('C3C-C4', false, 'no Dockerfile at ' + dfPath);

if (dfText !== null) {
  const D = parseDockerfile(dfText);
  const inStage = (n) => D.ins.filter((i) => i.stage === n);
  const final = D.stages - 1;
  const resolveStage = (ref) => {
    if (ref === undefined) return null;
    const r = ref.toLowerCase();
    if (r in D.aliases) return D.aliases[r];
    return /^\d+$/.test(r) ? Number(r) : null;
  };
  // flatten the commands of a stage in order
  const flat = (n) => {
    const out = [];
    for (const i of inStage(n)) {
      if (i.kw === 'RUN') { const text = runText(i); for (const p of pieces(text)) out.push({ ...p, ins: i, text }); }
    }
    return out;
  };
  const patchStages = [];
  for (let s = 0; s < D.stages; s++) if (flat(s).some((p) => PATCH_RE.test(p.cmd))) patchStages.push(s);

  // ---- C1
  {
    const why = [];
    if (D.stages < 2) why.push(`only ${D.stages} FROM stage(s)`);
    for (const f of D.ins.filter((i) => i.kw === 'FROM')) {
      const img = f.image;
      if (img.toLowerCase() in D.aliases && D.aliases[img.toLowerCase()] < f.stage) continue; // FROM <earlier stage>
      if (/\$/.test(img)) why.push(`FROM ${img}: not an explicit literal tag`);
      else if (/@sha256:[0-9a-f]{64}$/.test(img)) { /* digest ok */ }
      else {
        const tag = /^[^:@]+(?::\d+)?\/[^:@]+:([^:@]+)$/.exec(img) ?? /^[^:@/]+:([^:@]+)$/.exec(img) ?? /^.+:([^:/@]+)$/.exec(img);
        if (!tag) why.push(`FROM ${img}: no explicit tag or digest`);
        else if (tag[1].toLowerCase() === 'latest') why.push(`FROM ${img}: latest`);
      }
    }
    if (patchStages.length !== 1) why.push(`the patch command appears in ${patchStages.length} stages (need exactly 1)`);
    const bs = patchStages[0];
    if (bs !== undefined) {
      const cmds = flat(bs);
      const iCi = cmds.findIndex((p) => CI_RE.test(p.cmd));
      const iPatch = cmds.findIndex((p) => PATCH_RE.test(p.cmd));
      const iBuild = cmds.findIndex((p) => BUILD_RE.test(p.cmd));
      if (iCi < 0) why.push('build stage has no `npm ci`');
      if (cmds.some((p) => INSTALL_RE.test(p.cmd))) why.push('an `npm install|i|add` appears in the build stage');
      if (iPatch < 0) why.push('no `npm run patch:baileys` command');
      if (iBuild < 0) why.push('no `npm run build` command');
      if (iCi >= 0 && iPatch >= 0 && !(iCi < iPatch)) why.push('`npm ci` does not come before the patch step');
      if (iPatch >= 0 && iBuild >= 0 && !(iPatch < iBuild)) why.push('the patch step does not come before `npm run build`');
      if (iPatch >= 0) {
        const bp = bypassOnLine(cmds[iPatch].text);
        if (bp.length) why.push(`bypass on the patch line: ${bp.join(' ')}`);
        if (cmds[iPatch].sep === '||' || cmds[iPatch].sep === ';' || cmds[iPatch].sep === '|') why.push('the patch command is joined by ' + cmds[iPatch].sep);
      }
      if (iBuild >= 0) { const bp = bypassOnLine(cmds[iBuild].text); if (bp.length) why.push(`bypass on the build line: ${bp.join(' ')}`); }
    }
    for (const i of D.ins) if (i.kw === 'RUN' && /\bnpm\s+(install|i|add)\b/.test(runText(i))) why.push('`npm install` in: ' + i.line);
    rec('C3C-C1', why.length === 0, why.length ? [...new Set(why)].join('; ') : `${D.stages} stages, all FROM tagged, ci -> patch -> build in stage ${patchStages[0]}, no bypass`);
  }

  // ---- C2 : state machine over node_modules patched-ness
  {
    const memo = {};
    const stateOf = (n, depth = 0) => {
      if (n === null || n === undefined || depth > 10) return { patched: false, why: 'unknown stage' };
      if (memo[n] !== undefined) return memo[n];
      let patched = false; let why = 'never patched';
      for (const i of inStage(n)) {
        if (i.kw === 'RUN') {
          for (const p of pieces(runText(i))) {
            if (CI_RE.test(p.cmd) || INSTALL_RE.test(p.cmd)) { patched = false; why = `reinstall at: ${i.line}`; }
            else if (PATCH_RE.test(p.cmd) && bypassOnLine(runText(i)).length === 0) { patched = true; why = 'patch step ran'; }
          }
        } else if (i.kw === 'COPY') {
          const fm = /--from=(\S+)/.exec(i.args);
          const toks = i.args.split(/\s+/).filter((t) => !t.startsWith('--'));
          const srcs = toks.slice(0, -1);
          if (srcs.some((s) => /node_modules/.test(s))) {
            if (fm) { const st = stateOf(resolveStage(fm[1]), depth + 1); patched = st.patched; why = `node_modules copied from ${fm[1]}: ${st.why}`; }
            else { patched = false; why = 'node_modules copied from the build context'; }
          }
        }
      }
      return (memo[n] = { patched, why });
    };
    const st = stateOf(final);
    const why = [];
    if (D.stages < 2) why.push('single stage');
    if (!st.patched) why.push('final node_modules is not patched: ' + st.why);
    // a copy-from route must also not be followed by a reinstall in the final stage (covered by the state machine)
    rec('C3C-C2', why.length === 0, why.length ? why.join('; ') : `final stage node_modules: ${st.why}`);
  }

  // ---- C3
  {
    const why = [];
    const fi = inStage(final);
    const users = fi.map((i, ix) => ({ i, ix })).filter((x) => x.i.kw === 'USER');
    if (users.length === 0) why.push('no USER instruction in the final stage');
    else {
      const last = users[users.length - 1];
      const u = last.i.args.trim().split(':')[0];
      if (/\$/.test(u)) why.push('USER uses a variable: ' + last.i.args);
      else if (u === 'root' || /^0+$/.test(u) || u === '') why.push('last USER is root/0: ' + last.i.args);
      else {
        const known = ['node', 'nobody', 'nonroot'];
        if (!known.includes(u) && !/^\d+$/.test(u)) {
          const created = fi.slice(0, last.ix).some((i) => i.kw === 'RUN' && /\b(useradd|adduser)\b/.test(runText(i)));
          if (!created) why.push(`USER ${u} is not created in the final stage`);
        }
      }
      for (const i of fi.slice(last.ix + 1)) {
        if (i.kw === 'USER') why.push('later USER');
        if (i.kw === 'RUN' && /\b(chown|chmod)\b/.test(runText(i))) why.push('chown/chmod after the last USER: ' + i.line);
        if ((i.kw === 'COPY' || i.kw === 'ADD') && /--chown=|--chmod=/.test(i.args)) why.push('COPY --chown/--chmod after the last USER: ' + i.line);
      }
    }
    for (const i of fi) {
      if (i.kw === 'COPY' || i.kw === 'ADD') {
        const co = /--chown=(\S+)/.exec(i.args);
        if (co && /^(root|0+)(:|$)/.test(co[1])) why.push('COPY owned by root: ' + i.line);
        const cm = /--chmod=(\d+)/.exec(i.args);
        if (cm && cm[1].length >= 3 && Number(cm[1].slice(-1)) < 4) why.push('COPY not readable by others: ' + i.line);
      }
    }
    rec('C3C-C3', why.length === 0, why.length ? why.join('; ') : `last USER ${users.at(-1).i.args}, no chown/chmod after it`);
  }

  // ---- C4
  {
    const why = [];
    const FORBID = new Set(['sessions', 'media', 'web', '.git', '.playwright-mcp']);
    const norm = (s) => s.replace(/^\.\//, '').replace(/^\/app\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    let usesContext = false;
    for (const i of D.ins) {
      if (i.kw !== 'COPY' && i.kw !== 'ADD') continue;
      const toks = i.args.split(/\s+/).filter((t) => !t.startsWith('--'));
      const srcs = toks.slice(0, -1);
      const fromFlag = /--from=/.test(i.args);
      if (i.kw === 'ADD' && srcs.some((s) => /^https?:/i.test(s))) why.push('ADD of a URL: ' + i.line);
      for (const s0 of srcs) {
        const s = norm(s0); const first = s.split('/')[0];
        if (FORBID.has(first) || /^\.env/.test(path.posix.basename(s)) || /^\.env/.test(first)) why.push(`${i.kw} names ${s0}`);
        if (!fromFlag && (s === '.' || s === '' || s === '*')) usesContext = true;
      }
      if (i.stage === final) {
        if (!fromFlag) why.push('final stage copies from the build context: ' + i.line);
        else for (const s0 of srcs) { const s = norm(s0); if (!['dist', 'node_modules', 'package.json'].includes(s)) why.push(`final stage copies ${s0} (allowed: dist, node_modules, package.json)`); }
      }
    }
    const finalSrcs = new Set();
    for (const i of inStage(final)) if (i.kw === 'COPY') for (const s0 of i.args.split(/\s+/).filter((t) => !t.startsWith('--')).slice(0, -1)) finalSrcs.add(norm(s0));
    for (const need of ['dist', 'node_modules', 'package.json']) if (!finalSrcs.has(need)) why.push(`final stage does not copy ${need}`);
    // production dependencies only
    {
      const ci = flat(final).some((p) => CI_RE.test(p.cmd) && /--omit=dev|--production/.test(p.cmd));
      let pruned = false;
      const copyFrom = inStage(final).filter((i) => i.kw === 'COPY' && /--from=/.test(i.args) && /node_modules/.test(i.args)).map((i) => resolveStage(/--from=(\S+)/.exec(i.args)[1]));
      for (const s of copyFrom) {
        let lastInstall = -1; let lastPrune = -1; const cmds = flat(s);
        cmds.forEach((p, ix) => { if (CI_RE.test(p.cmd) || INSTALL_RE.test(p.cmd)) lastInstall = ix; if (PRUNE_OK_RE.test(p.cmd)) lastPrune = ix; });
        if (lastPrune > lastInstall) pruned = true;
      }
      if (!ci && !pruned) why.push('node_modules is not production-only (no `npm prune --omit=dev` after the install in the source stage, no `--omit=dev` install in the final stage)');
    }
    if (diText === null) why.push('no .dockerignore');
    else {
      const rules = parseIgnore(diText);
      const mustIgnore = ['.env', '.env.local', '.env.production', 'sessions/x.json', 'media/x.jpg', 'web/index.html', '.git/config', '.playwright-mcp/x', 'node_modules/x/index.js', 'dist/index.js'];
      for (const p of mustIgnore) if (!isIgnored(rules, p)) why.push(`.dockerignore does not exclude ${p}`);
      const names = ['.env', '.env.*', 'sessions', 'media', 'web', '.git', '.playwright-mcp', 'node_modules', 'dist'];
      const listed = new Set(rules.filter((r) => !r.neg).map((r) => r.pat.replace(/^\*\*\//, '')));
      for (const n of names) if (!(listed.has(n) || (n === '.env.*' && listed.has('.env*')))) why.push(`.dockerignore does not list ${n}`);
      // files the build needs must NOT be ignored
      const needed = ['patches', 'patches/apply-baileys-patch.mjs', 'patches/baileys+7.0.0-rc14.patch', 'package.json', 'package-lock.json', 'tsconfig.json', 'src', 'src/index.ts', 'src/config.ts'];
      const ctxRoot = process.env.CTX_ROOT; // optional: real repo root, to also test every src file
      if (ctxRoot && existsSync(path.join(ctxRoot, 'src'))) {
        const walk = (d, rel) => readdirSync(d).flatMap((n) => { const f = path.join(d, n); const r = rel + '/' + n; return statSync(f).isDirectory() ? walk(f, r) : [r]; });
        needed.push(...walk(path.join(ctxRoot, 'src'), 'src'));
      }
      for (const p of needed) if (isIgnored(rules, p)) why.push(`.dockerignore hides ${p}, which the build needs`);
    }
    rec('C3C-C4', why.length === 0, why.length ? [...new Set(why)].join('; ') : 'no forbidden COPY source; final stage copies dist, node_modules, package.json only; node_modules pruned; .dockerignore lists all nine, hides no build input' + (usesContext ? ' (COPY . . is used)' : ''));
  }

  // ---- C5
  {
    const why = [];
    const fi = inStage(final);
    const cmds = fi.filter((i) => i.kw === 'CMD'); const eps = fi.filter((i) => i.kw === 'ENTRYPOINT');
    const WANT = JSON.stringify(['node', 'dist/index.js']);
    const startOf = (i) => jsonArray(i.args.trim());
    if (cmds.length + eps.length === 0) why.push('no CMD or ENTRYPOINT');
    if (cmds.length + eps.length > 1) why.push('more than one CMD/ENTRYPOINT in the final stage');
    for (const i of [...cmds, ...eps]) {
      const a = startOf(i);
      if (a === null) why.push(`${i.kw} is shell form: ${i.args}`);
      else if (JSON.stringify(a) !== WANT) why.push(`${i.kw} is ${JSON.stringify(a)}, not ${WANT}`);
    }
    for (const i of D.ins) if (i.kw === 'HEALTHCHECK') why.push('HEALTHCHECK present: ' + i.line);
    for (const i of D.ins) if ((i.kw === 'CMD' || i.kw === 'ENTRYPOINT') && /\bnpm\s+start\b|\bsh\s+-c\b/.test(i.args)) why.push('npm start / sh -c in ' + i.kw);
    // PORT / EXPOSE
    let envPort = null;
    for (const i of D.ins.filter((x) => x.kw === 'ENV')) {
      const m = /(?:^|\s)PORT(?:=|\s+)(\S+)/.exec(i.args);
      if (m) envPort = m[1].replace(/^"|"$/g, '');
    }
    if (envPort !== null && !/^\d+$/.test(envPort) && !/^\$/.test(envPort)) why.push('ENV PORT is not a number: ' + envPort);
    for (const i of D.ins.filter((x) => x.kw === 'EXPOSE')) {
      for (const p of i.args.split(/\s+/)) {
        const port = p.replace(/\/(tcp|udp)$/i, '');
        if (/^\$\{?PORT\}?$/.test(port)) continue;
        if (envPort === null || port !== envPort) why.push(`EXPOSE ${p} does not match ENV PORT (${envPort})`);
      }
    }
    rec('C3C-C5', why.length === 0, why.length ? why.join('; ') : `start is ${WANT} in exec form; ENV PORT=${envPort}; no HEALTHCHECK; EXPOSE ${D.ins.filter((x) => x.kw === 'EXPOSE').map((x) => x.args).join(',') || 'none'}`);
  }

  // ---- C6 (and I3 secret scan)
  {
    const why = [];
    const SECRET_RE = /(API_KEY|TOKEN|PASSWORD|SECRET|MONGO_URI|ENC_KEY)\s*=\s*\S/;
    const NAMES = ['SERVICE_API_TOKEN_NEXT', 'SERVICE_API_TOKEN', 'SESSION_KEYS_ENC_KEY', 'MONGO_URI'];
    for (const i of D.ins) {
      if (i.kw === 'ENV' || i.kw === 'ARG') {
        if (SECRET_RE.test(i.line)) why.push(`${i.kw} matches the secret pattern: ${i.line.replace(/=.*/, '=<hidden>')}`);
        for (const n of NAMES) {
          // legacy form "ENV NAME value" or ARG NAME=value
          const re = new RegExp(`(^|\\s)${n}(\\s*=\\s*\\S|\\s+\\S)`);
          if (i.kw === 'ENV' && re.test(' ' + i.args)) why.push(`ENV names ${n} with a value`);
          if (i.kw === 'ARG' && new RegExp(`(^|\\s)${n}\\s*=\\s*\\S`).test(' ' + i.args)) why.push(`ARG names ${n} with a value`);
        }
      }
      if (i.kw === 'RUN' && SECRET_RE.test(i.line)) why.push('RUN carries a secret-looking assignment: ' + i.line.replace(/=.*/, '=<hidden>'));
      if (i.kw === 'COPY' || i.kw === 'ADD') {
        const toks = i.args.split(/\s+/).filter((t) => !t.startsWith('--')).slice(0, -1);
        for (const s of toks) if (/(^|\/)(\.env.*|\.npmrc|\.netrc|id_rsa.*|credentials.*|.*\.pem|.*\.key|.*service-account.*)$/i.test(s)) why.push('COPY of a credentials-looking file: ' + s);
      }
    }
    rec('C3C-C6', why.length === 0, why.length ? why.join('; ') : 'no ENV/ARG/RUN secret assignment, none of the four names with a value, no credentials COPY');
  }

  // ---- C7 (static half): the patch step cannot be bypassed and can see its inputs
  {
    const why = [];
    const bs = patchStages[0];
    if (bs === undefined) why.push('no patch step');
    else {
      const cmds = flat(bs);
      const ip = cmds.findIndex((p) => PATCH_RE.test(p.cmd));
      const bp = bypassOnLine(cmds[ip].text);
      if (bp.length) why.push('bypass on the patch line: ' + bp.join(' '));
      if (['||', ';', '|'].includes(cmds[ip].sep)) why.push('patch command joined by ' + cmds[ip].sep);
      // the patch command, as written, must be the package.json script
      const patchIdx = inStage(bs).findIndex((i) => i.kw === 'RUN' && pieces(runText(i)).some((p) => PATCH_RE.test(p.cmd)));
      const before = inStage(bs).slice(0, patchIdx);
      const copied = (name) => before.some((i) => (i.kw === 'COPY') && !/--from=/.test(i.args) && i.args.split(/\s+/).filter((t) => !t.startsWith('--')).slice(0, -1).some((s) => { const n = s.replace(/^\.\//, '').replace(/\/+$/, ''); return n === name || n === '.' || n === '' ; }));
      for (const need of ['patches', 'package.json', 'package-lock.json']) if (!copied(need)) why.push(`${need} is not copied into the build stage before the patch step`);
      const pkgPath = path.join(process.env.CTX_ROOT ?? '', 'package.json');
      if (process.env.CTX_ROOT && existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.['patch:baileys'] !== 'node patches/apply-baileys-patch.mjs') why.push('package.json patch:baileys script is not the C2 applier');
      }
    }
    rec('C3C-C7', why.length === 0, why.length ? why.join('; ') : 'patch line has no bypass; patches/, package.json, package-lock.json copied before it');
  }

  // ---- I3 : no secret value in either file
  {
    const why = [];
    const body = dfText.split('\n').filter((l) => !/^\s*FROM\b/i.test(l)).join('\n') + '\n' + (diText ?? '');
    if (/[A-Za-z0-9+/_-]{40,}={0,2}/.test(body.replace(/[\w./-]*\/[\w./-]*/g, ''))) why.push('a 40+ character token-like string');
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) why.push('a private key block');
    if (/\bmongodb(\+srv)?:\/\/[^\s"']*:[^\s"']*@/.test(body)) why.push('a mongodb URI with credentials');
    if (/\bBearer\s+\S{12,}/i.test(body)) why.push('a bearer value');
    rec('C3C-I3', why.length === 0, why.length ? why.join('; ') : 'no token-like string, key block, credentialed URI or bearer value in either file');
  }
}

// ---------------------------------------------------------------- report
results.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
else for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
