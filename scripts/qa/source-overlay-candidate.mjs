#!/usr/bin/env node
/** Local byte candidate only. Default: readonly plan; materialization is explicit. No git/network/cleanup. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTRACTION_IMPORT = 'scripts/eval/extraction-authorized-import.mjs';
const ROOT_FILES = ['Dockerfile', '.dockerignore', 'docker-compose.yml', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  '.github/workflows/docker.yml', 'scripts/lint-root.mjs', 'scripts/lint.test.mjs', 'scripts/lint-loc.mjs',
  'scripts/gen-types.mjs', 'scripts/lib/walk.mjs', 'structure.config.json', 'tsconfig.base.json', '.gitignore',
  'contracts/verify_contracts.py', 'workers/transcribe/package.json', 'qa/issues.T045WORKER.jsonl'];
const ROOTS = ['packages', 'apps/api', 'apps/web', 'schema', 'config', 'migrations', 'scripts/qa/container-workflows'];
const EXCLUDED = new Set(['node_modules', 'dist', '__pycache__', '.cache', '.git', '.venv', 'recordings', 'downloaded_files']);
const MAX_FILE = 8 * 1024 * 1024, MAX_TOTAL = 96 * 1024 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw Object.assign(new Error(reason), {code: 'NOT_READY'}); };
function relative(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\') || path.posix.isAbsolute(value)) fail('Invalid relative path');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[\x00-\x1f\x7f:*?"<>|]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) fail('Invalid relative path');
  return value;
}
function permitted(rel) {
  relative(rel);
  const parts = rel.split('/'), base = parts.at(-1);
  if (parts.some(p => EXCLUDED.has(p.toLowerCase()) || /^private[-_ ]?corpus$/i.test(p) || /^\.env/i.test(p)) ||
      /^(client_secret|credentials?|secrets?|cookies?)([._-].*)?\.json$/i.test(base) || /\.(pem|p12|pfx|key|log|pyc|tsbuildinfo)$/i.test(base)) return false;
  if (/^(raw|data|reference|sources|qa)\//i.test(rel)) return rel === 'qa/issues.T045WORKER.jsonl';
  return rel === EXTRACTION_IMPORT || rel === 'contracts/contracts.json' || ROOT_FILES.includes(rel) || ROOTS.some(root => rel.startsWith(`${root}/`));
}
async function physical(root, rel, directory = false) {
  relative(rel);
  let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || path.resolve(await fs.realpath(current)).toLowerCase() !== path.resolve(current).toLowerCase()) fail('Linked or redirected path');
  }
  const stat = await fs.lstat(current, {bigint: true});
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n) fail('Expected physical unique file/directory');
  return {absolute: current, stat};
}
async function read(root, rel) {
  const before = await physical(root, rel);
  if (before.stat.size > BigInt(MAX_FILE)) fail('File byte limit');
  const handle = await fs.open(before.absolute, 'r');
  let bytes;
  try {
    const opened = await handle.stat({bigint:true});
    if (opened.ino !== before.stat.ino || opened.dev !== before.stat.dev || opened.size !== before.stat.size || opened.mtimeNs !== before.stat.mtimeNs) fail('Source changed');
    bytes = await handle.readFile();
    const after = await handle.stat({bigint:true});
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || BigInt(bytes.length) !== opened.size) fail('Source changed');
  } finally { await handle.close(); }
  const after = await physical(root, rel);
  if (after.stat.ino !== before.stat.ino || after.stat.dev !== before.stat.dev || after.stat.size !== before.stat.size || after.stat.mtimeNs !== before.stat.mtimeNs) fail('Source changed');
  return bytes;
}
async function context(root) {
  root = path.resolve(root);
  const prefix = path.relative(WORKSPACE, root);
  if (prefix.startsWith('..') || path.isAbsolute(prefix)) fail('Root outside workspace');
  if ((await fs.realpath(WORKSPACE)).toLowerCase() !== WORKSPACE.toLowerCase()) fail('Redirected workspace');
  if (prefix) await physical(WORKSPACE, prefix.split(path.sep).join('/'), true);
  return root;
}
async function required(root) {
  const rows = [...ROOT_FILES];
  async function walk(rel) {
    await physical(root, rel, true);
    for (const item of await fs.readdir(path.join(root, rel), {withFileTypes:true})) {
      if (EXCLUDED.has(item.name.toLowerCase())) continue;
      const child = `${rel}/${item.name}`;
      if (item.isSymbolicLink()) fail('Linked footprint member');
      if (item.isDirectory()) {
        if (/^private[-_ ]?corpus$/i.test(item.name) || /^\.env/i.test(item.name)) continue;
        await walk(child);
      } else if (permitted(child)) rows.push(child);
    }
  }
  for (const rel of ROOTS) await walk(rel);
  try { await fs.lstat(path.join(root,'contracts/contracts.json')); rows.push('contracts/contracts.json'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  // Older synthetic footprints lack this import; current Docker COPY declarations
  // require it even if the physical dependency was accidentally removed.
  let extractionRequired = false;
  for (const dockerfile of ['Dockerfile','apps/api/Dockerfile']) {
    try { if ((await read(root,dockerfile)).includes(Buffer.from(EXTRACTION_IMPORT))) extractionRequired = true; }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  try { await fs.lstat(path.join(root,EXTRACTION_IMPORT)); extractionRequired = true; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  if (extractionRequired) rows.push(EXTRACTION_IMPORT);
  return [...new Set(rows)].sort();
}
async function capture(root, spec) {
  if (spec?.scope !== 'docker-workflow' || !Array.isArray(spec.entries) || !spec.entries.length || spec.entries.length > 12000) fail('Explicit Docker scope and pinned entries required');
  const seen = new Set(), rows = [];
  let total = 0;
  for (const row of spec.entries) {
    if (!permitted(row?.path) || !/^[a-f0-9]{64}$/.test(row.sha256 ?? '')) fail('Disallowed or unpinned source');
    const key = row.path.toLowerCase();
    if (seen.has(key)) fail('Duplicate/case-colliding source');
    seen.add(key);
    const bytes = await read(root, row.path);
    if (digest(bytes) !== row.sha256) fail('Source pin changed');
    total += bytes.length; if (total > MAX_TOTAL) fail('Aggregate byte limit');
    rows.push({path:row.path, sha256:row.sha256, bytes});
  }
  const exactPaths = new Set(rows.map(row => row.path));
  const missing = (await required(root)).filter(rel => !exactPaths.has(rel));
  if (missing.length) fail(`Missing required Docker dependency: ${missing[0]}`);
  rows.sort((a,b) => a.path < b.path ? -1 : 1);
  return rows;
}
async function stable(root, rows) {
  const expected = JSON.stringify(rows.map(row => row.path).sort());
  if (JSON.stringify(await required(root)) !== expected) fail('Required source footprint changed');
  for (const row of rows) if (digest(await read(root, row.path)) !== row.sha256) fail('Source pin changed');
  if (JSON.stringify(await required(root)) !== expected) fail('Required source footprint changed');
}
function outputPath(value) {
  relative(value);
  if (!/^\.cache\/coordination\/source-overlay-[a-zA-Z0-9][a-zA-Z0-9-]{7,79}$/.test(value)) fail('Unique owned output required');
  return value;
}
export async function plan(root, spec) {
  root = await context(root);
  const rows = await capture(root, spec);
  await stable(root, rows);
  return {status:'LOCAL_BYTES_VERIFIED', readiness:'NOT_READY', scope:'docker-workflow', generalCI:'UNKNOWN', acceptance:'NOT_VERIFIED',
    entries:rows.map(({path,sha256,bytes}) => ({path,sha256,size:bytes.length})), totalBytes:rows.reduce((n,r)=>n+r.bytes.length,0)};
}
export async function materialize(root, spec, hooks = {}) {
  root = await context(root); const output = outputPath(spec.output);
  const rows = await capture(root, spec);
  await hooks.afterRead?.(); await stable(root, rows);
  await physical(root, '.cache/coordination', true);
  const destination = path.join(root, output);
  await fs.mkdir(destination); // Exclusive ownership; existing directories are never reused.
  await fs.writeFile(path.join(destination,'ownership.json'), JSON.stringify({scope:spec.scope,output}), {flag:'wx'});
  await fs.mkdir(path.join(destination,'tree'));
  for (const row of rows) {
    const target = path.join(destination,'tree',row.path);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.writeFile(target, row.bytes, {flag:'wx'});
  }
  await hooks.afterCopy?.(); await stable(root, rows);
  const manifest = {schema:'source-overlay-candidate-v1', scope:'docker-workflow', generalCI:'UNKNOWN', acceptance:'NOT_VERIFIED',
    output, entries:rows.map(({path,sha256,bytes})=>({path,sha256,size:bytes.length}))};
  await verifyTree(path.join(destination,'tree'), manifest.entries);
  const bytes = Buffer.from(`${JSON.stringify(manifest,null,2)}\n`);
  await fs.writeFile(path.join(destination,'manifest.json'),bytes,{flag:'wx'});
  return {status:'LOCAL_BYTES_VERIFIED', readiness:'NOT_READY', output, manifestSha256:digest(bytes), generalCI:'UNKNOWN', acceptance:'NOT_VERIFIED'};
}
async function verifyTree(root, entries) {
  const actual = [];
  async function walk(rel='') {
    for (const entry of await fs.readdir(path.join(root,rel),{withFileTypes:true})) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail('Linked candidate');
      if (entry.isDirectory()) { await physical(root,child,true); await walk(child); }
      else actual.push(child);
    }
  }
  await walk();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(entries.map(r=>r.path).sort())) fail('Candidate extra or missing files');
  for (const row of entries) {
    const bytes = await read(root,row.path);
    if (bytes.length !== row.size || digest(bytes) !== row.sha256) fail('Candidate byte mismatch');
  }
}
export async function verify(root, output, expectedSha256) {
  root = await context(root); outputPath(output);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) fail('Manifest pin required');
  await physical(root,output,true);
  if ((await fs.readdir(path.join(root,output))).sort().join('|') !== 'manifest.json|ownership.json|tree') fail('Incomplete or unexpected candidate state');
  const ownership=JSON.parse((await read(root,`${output}/ownership.json`)).toString('utf8'));
  if (ownership.scope!=='docker-workflow' || ownership.output!==output) fail('Candidate ownership binding');
  const bytes = await read(root,`${output}/manifest.json`);
  if (digest(bytes) !== expectedSha256) fail('Manifest pin changed');
  const value = JSON.parse(bytes.toString('utf8'));
  if (value.schema !== 'source-overlay-candidate-v1' || value.output !== output || value.generalCI !== 'UNKNOWN' || value.acceptance !== 'NOT_VERIFIED') fail('Candidate manifest binding');
  const current = await capture(root,value);
  await physical(root,`${output}/tree`,true);
  await verifyTree(path.join(root,output,'tree'),value.entries);
  await stable(root,current);
  if (digest(await read(root,`${output}/manifest.json`)) !== expectedSha256) fail('Manifest changed');
  return {status:'LOCAL_BYTES_VERIFIED',readiness:'NOT_READY',scope:value.scope,files:current.length,generalCI:'UNKNOWN',acceptance:'NOT_VERIFIED'};
}
async function cli(args) {
  if (args.length===1 && args[0]==='--help') return {usage:[
    'node scripts/qa/source-overlay-candidate.mjs --spec RELATIVE_JSON (readonly plan)',
    'node scripts/qa/source-overlay-candidate.mjs --materialize --spec RELATIVE_JSON (explicit local copy)',
    'node scripts/qa/source-overlay-candidate.mjs --verify --output .cache/coordination/source-overlay-NONCE --manifest-sha256 SHA256'],
    spec:{scope:'docker-workflow',output:'.cache/coordination/source-overlay-NONCE',entries:[{path:'Dockerfile',sha256:'exact lowercase raw-byte SHA256'}]},
    readiness:'NOT_READY: full CI closure and independent review remain required'};
  const flags = {}; let operation='plan';
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==='--materialize' || arg==='--verify') { if (operation!=='plan') fail('Conflicting operations'); operation=arg.slice(2); }
    else { if (!['--spec','--output','--manifest-sha256'].includes(arg) || flags[arg] || !args[i+1]) fail('Invalid CLI'); flags[arg]=args[++i]; }
  }
  if (operation==='verify') { if(flags['--spec']) fail('Invalid CLI'); return verify(WORKSPACE,flags['--output'],flags['--manifest-sha256']); }
  if (!flags['--spec'] || flags['--output'] || flags['--manifest-sha256']) fail('Pinned spec required');
  const spec=JSON.parse((await read(WORKSPACE,relative(flags['--spec']))).toString('utf8'));
  return operation==='materialize' ? materialize(WORKSPACE,spec) : plan(WORKSPACE,spec);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await cli(process.argv.slice(2)))); }
  catch(error) { console.error(JSON.stringify({status:'NOT_READY',reason:String(error.message).slice(0,240)})); process.exitCode=1; }
}
