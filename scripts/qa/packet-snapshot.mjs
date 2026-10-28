#!/usr/bin/env node
/**
 * Byte provenance, not feature acceptance. No subprocesses/network/source writes.
 * CLI: node scripts/qa/packet-snapshot.mjs snapshot|freeze --root WORKSPACE --spec JSON
 *      node scripts/qa/packet-snapshot.mjs verify --root WORKSPACE --inventory REL --expected-sha SHA
 * snapshot spec: {slug,cycle,output:'.cache/coordination/NEW',paths:['src/a']}
 * freeze spec: {slug,cycle,output,format:'entries'|'sources',snapshot:{path,sha256},
 *   sources:[{path,sha256}],dependencies:[],evidence:[],contract:{path,sha256},
 *   receipts:[{path,sha256}]}. All three pin groups are explicit, sources nonempty.
 * Each receipt JSON: {argv:[...],cwd:'.'|REL,startedAtUTC,endedAtUTC,
 *   durationSeconds,exitCode,output:{path,sha256}}. Nonzero observed exits stay intact.
 * normalizeInventory adapts actual CI sources and B7/D3 entries without rewriting them.
 * Only inventories created with complete snapshot/receipt bindings can be verified;
 * older inventories can be adapted, but missing provenance is never synthesized.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIMITS = Object.freeze({ rows: 256, fileBytes: 4 * 1024 * 1024, jsonBytes: 1024 * 1024, totalBytes: 32 * 1024 * 1024 });
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const hash = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('invalid_hash'); return value; };
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (parent, child) => samePath(parent, child) || (!path.relative(parent, child).startsWith('..') && !path.isAbsolute(path.relative(parent, child)));
const now = () => new Date().toISOString();
const measure = started => ({ startedAtUTC: started.iso, endedAtUTC: now(), durationSeconds: (performance.now() - started.tick) / 1000 });
const start = () => ({ iso: now(), tick: performance.now() });
function relative(value) {
  if (typeof value !== 'string' || value.length > 240 || !value || value.includes('\\') || path.isAbsolute(value)) fail('invalid_path');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.trim() !== p || /[\x00-\x1f\x7f:*?"<>|]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) fail('invalid_path');
  if (parts.some(p => /^(\.env.*|\.git|\.codex|\.agents|\.aws|\.ssh|\.azure|\.config|credentials?|cookies?|secrets?|tokens?|login data|local state|preferences|web data|bot-profile|presenter-profile)$/i.test(p) || /\.(pem|p12|pfx|key)$/i.test(p))) fail('sensitive_path');
  return value;
}
function owner(spec) {
  if (!spec || typeof spec !== 'object' || !/^[a-z][a-z0-9-]{0,79}$/.test(spec.slug) || !Number.isSafeInteger(spec.cycle) || spec.cycle < 0) fail('invalid_owner');
}
function paths(values, nonempty = false) {
  if (!Array.isArray(values) || values.length > LIMITS.rows || (nonempty && !values.length)) fail('invalid_rows');
  const seen = new Set();
  for (const value of values) { const key = relative(value).toLowerCase(); if (seen.has(key)) fail('duplicate_path'); seen.add(key); }
  return values;
}
function pins(values, nonempty = false) {
  if (!Array.isArray(values)) fail('invalid_rows');
  paths(values.map(v => v?.path), nonempty);
  return values.map(v => ({ path: v.path, sha256: hash(v.sha256) }));
}
function disjoint(output, inputs) {
  const target = relative(output).toLowerCase();
  for (const rel of inputs) { const input = relative(rel).toLowerCase(); if (input === target || input.startsWith(`${target}/`) || target.startsWith(`${input}/`)) fail('output_input_collision'); }
}
async function rootContext(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('root_required');
  root = path.resolve(root);
  const repo = await fs.realpath(WORKSPACE);
  if (!inside(repo, root) || !samePath(await fs.realpath(root), root)) fail('root_escape_or_redirect');
  // Every ancestor between the known workspace and fixture root must be physical.
  let current = repo;
  for (const part of path.relative(repo, root).split(path.sep).filter(Boolean)) { current = path.join(current, part); const s = await fs.lstat(current); if (!s.isDirectory() || s.isSymbolicLink() || !samePath(await fs.realpath(current), current)) fail('redirected_path'); }
  return { root, used: 0, identities: new Map() };
}
async function physical(ctx, rel, missing = false) {
  relative(rel);
  let current = ctx.root;
  const parts = rel.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let s;
    try { s = await fs.lstat(current, { bigint: true }); } catch (e) { if (e.code === 'ENOENT' && missing) return { absolute: path.join(ctx.root, ...parts), missing: true }; throw e; }
    if (s.isSymbolicLink() || !samePath(await fs.realpath(current), current)) fail('redirected_path');
    if (i < parts.length - 1 && !s.isDirectory()) fail('not_directory');
    if (i === parts.length - 1) return { absolute: current, stat: s, missing: false };
  }
}
async function read(ctx, rel, { missing = false, json = false, unique = false } = {}) {
  const p = await physical(ctx, rel, missing);
  if (p.missing) return { path: rel, exists: false, sha256: null, bytes: null };
  const s = p.stat;
  if (!s.isFile() || s.nlink > 1) fail('not_unique_regular_file');
  if (s.size > (json ? LIMITS.jsonBytes : LIMITS.fileBytes)) fail('file_limit');
  if (unique) { const key = `${s.dev}:${s.ino}`; if (ctx.identities.has(key) && ctx.identities.get(key) !== rel) fail('duplicate_identity'); ctx.identities.set(key, rel); }
  ctx.used += Number(s.size); if (ctx.used > LIMITS.totalBytes) fail('aggregate_limit');
  const handle = await fs.open(p.absolute, 'r');
  let bytes;
  try { const before = await handle.stat({ bigint: true }); if (before.dev !== s.dev || before.ino !== s.ino || before.size !== s.size) fail('source_drift'); bytes = await handle.readFile(); const after = await handle.stat({ bigint: true }); if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || BigInt(bytes.length) !== before.size) fail('source_drift'); } finally { await handle.close(); }
  const after = await physical(ctx, rel);
  if (after.stat.ino !== s.ino || after.stat.dev !== s.dev || after.stat.size !== s.size || after.stat.mtimeNs !== s.mtimeNs) fail('source_drift');
  return { path: rel, exists: true, sha256: sha256(bytes), bytes };
}
async function jsonRead(ctx, rel, expected) {
  if (expected !== undefined) hash(expected);
  const row = await read(ctx, rel, { json: true });
  if (expected !== undefined && row.sha256 !== expected) fail('pin_mismatch');
  try { return JSON.parse(row.bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail('invalid_json'); }
}
async function checkPin(ctx, pin, json = false) { relative(pin?.path); hash(pin?.sha256); const row = await read(ctx, pin.path, { json, unique: true }); if (row.sha256 !== pin.sha256) fail('pin_mismatch'); return row; }
async function stable(ctx, rows) {
  for (const before of rows) { const after = await read(ctx, before.path, { missing: !before.exists }); if (after.exists !== before.exists || after.sha256 !== before.sha256) fail('source_drift'); }
}
async function reserve(ctx, output, spec) {
  relative(output);
  if (!output.startsWith('.cache/coordination/') || output.split('/').length < 3) fail('output_not_owned_cache');
  // No recursive mkdir: caller supplies existing physical parent; only reserve last component.
  const parent = path.posix.dirname(output);
  const pp = await physical(ctx, parent); if (!pp.stat.isDirectory()) fail('not_directory');
  const absolute = path.join(ctx.root, ...output.split('/'));
  try { await fs.mkdir(absolute); } catch (e) { if (e.code === 'EEXIST') fail('destination_exists'); throw e; }
  await fs.writeFile(path.join(absolute, 'INCOMPLETE.json'), JSON.stringify({ slug: spec.slug, cycle: spec.cycle, createdAtUTC: now(), purpose: 'owned incomplete byte-packet operation' }), { flag: 'wx' });
  return output;
}
async function exclusiveWrite(ctx, rel, bytes) {
  const parent = await physical(ctx, path.posix.dirname(rel)); if (!parent.stat.isDirectory()) fail('not_directory');
  const temp = `${rel}.${randomUUID()}.tmp`;
  await fs.writeFile(path.join(ctx.root, ...temp.split('/')), bytes, { flag: 'wx' });
  // Hard link publishes exclusively (rename would overwrite on POSIX). Never replace a winner.
  try { await fs.link(path.join(ctx.root, ...temp.split('/')), path.join(ctx.root, ...rel.split('/'))); }
  finally { await fs.unlink(path.join(ctx.root, ...temp.split('/'))); }
}
function encoded(value) { const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); if (bytes.length > LIMITS.jsonBytes) fail('json_limit'); return bytes; }
async function publish(ctx, output, filename, value) {
  const bytes = encoded(value);
  await exclusiveWrite(ctx, `${output}/${filename}`, bytes);
  // Readers also require the marker absent; interrupted cleanup cannot verify as complete.
  await fs.unlink(path.join(ctx.root, ...output.split('/'), 'INCOMPLETE.json'));
  return { integrity: 'complete', path: `${output}/${filename}`, sha256: sha256(bytes), timing: value.timing };
}
async function completed(ctx, output) {
  const marker = await physical(ctx, `${output}/INCOMPLETE.json`, true);
  if (!marker.missing) fail('incomplete_operation');
}
export async function snapshot(root, spec, hooks = {}) {
  const began = start(); owner(spec); paths(spec.paths, true); relative(spec.output);
  disjoint(spec.output, spec.paths);
  const ctx = await rootContext(root);
  const captured = [];
  for (const rel of spec.paths) captured.push(await read(ctx, rel, { missing: true, unique: true }));
  await hooks.afterRead?.();
  await stable(ctx, captured); // All validation and pre-capture drift checks precede cache writes.
  const output = await reserve(ctx, spec.output, spec);
  await fs.mkdir(path.join(ctx.root, ...output.split('/'), 'bases'));
  const rows = [];
  for (let i = 0; i < captured.length; i++) {
    const item = captured[i]; const backup = item.exists ? `${output}/bases/${i}.bin` : null;
    if (backup) await exclusiveWrite(ctx, backup, item.bytes);
    rows.push({ path: item.path, baseExists: item.exists, baseSha256: item.sha256, baseBackup: backup });
  }
  await hooks.beforeComplete?.(); await stable(ctx, captured);
  for (const row of rows) if (row.baseExists) await checkPin(ctx, { path: row.baseBackup, sha256: row.baseSha256 });
  return publish(ctx, output, 'snapshot.json', { schema: 'byte-snapshot-v1', slug: spec.slug, cycle: spec.cycle, output, root: ctx.root, state: 'complete', entries: rows, timing: measure(began) });
}
export function normalizeInventory(value) {
  if (!value || typeof value !== 'object' || (!!value.sources === !!value.entries)) fail('ambiguous_format');
  const rows = value.sources ?? value.entries;
  pins(rows, true);
  for (const row of rows) { const exists = row.baseExists ?? (row.baseSha256 !== null && row.baseSha256 !== undefined); if (typeof exists !== 'boolean') fail('invalid_base'); if (exists) hash(row.baseSha256); else if (row.baseSha256 !== null || (row.baseBackup != null)) fail('invalid_missing_base'); if (row.baseBackup != null) relative(row.baseBackup); }
  return { ...value, format: value.sources ? 'sources' : 'entries', sourceRows: rows.map(row => ({ ...row, baseExists: row.baseExists ?? (row.baseSha256 !== null && row.baseSha256 !== undefined) })) };
}
async function baseline(ctx, binding, spec) {
  const value = await jsonRead(ctx, binding?.path, hash(binding?.sha256));
  owner(value);
  if (value.schema !== 'byte-snapshot-v1' || value.state !== 'complete' || value.slug !== spec.slug || value.cycle !== spec.cycle || !samePath(value.root, ctx.root) || binding.path !== `${value.output}/snapshot.json` || !value.output.startsWith('.cache/coordination/')) fail('snapshot_binding');
  await completed(ctx, value.output);
  validTiming(value.timing);
  paths(value.entries?.map(r => r.path), true);
  const backups = [];
  for (let i = 0; i < value.entries.length; i++) { const row = value.entries[i]; if (typeof row.baseExists !== 'boolean') fail('invalid_base'); if (row.baseExists) { if (row.baseBackup !== `${value.output}/bases/${i}.bin`) fail('unowned_base'); hash(row.baseSha256); backups.push(await checkPin(ctx, { path: row.baseBackup, sha256: row.baseSha256 })); } else if (row.baseSha256 !== null || row.baseBackup !== null) fail('invalid_missing_base'); }
  return { value, backups };
}
function groups(spec) {
  const sources = pins(spec.sources ?? spec.sourceRows, true), dependencies = pins(spec.dependencies), evidence = pins(spec.evidence), receipts = pins(spec.receipts, true);
  const contract = pins([spec.contract], true)[0];
  const all = [...sources, ...dependencies, ...evidence, contract, ...receipts];
  paths(all.map(p => p.path)); if (all.length > LIMITS.rows) fail('row_limit');
  if (!contract.path.startsWith('qa/contracts/')) fail('contract_path');
  return { sources, dependencies, evidence, receipts, contract, all };
}
function validDate(v) { if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 19) !== v.slice(0, 19)) fail('receipt_time'); return Date.parse(v); }
function validTiming(value) { if (!value || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0 || validDate(value.endedAtUTC) < validDate(value.startedAtUTC)) fail('invalid_timing'); }
async function receiptCheck(ctx, pin) {
  const value = await jsonRead(ctx, pin.path, pin.sha256);
  if (!Array.isArray(value.argv) || !value.argv.length || value.argv.length > 64 || value.argv.some(v => typeof v !== 'string' || v.length > 2048 || /[\x00-\x1f]/.test(v)) || !Number.isSafeInteger(value.exitCode) || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0) fail('receipt_shape');
  if (value.cwd !== '.') relative(value.cwd); const cwd = value.cwd === '.' ? { stat: { isDirectory: () => true } } : await physical(ctx, value.cwd); if (!cwd.stat.isDirectory()) fail('receipt_cwd');
  const elapsed = (validDate(value.endedAtUTC) - validDate(value.startedAtUTC)) / 1000;
  if (elapsed < 0 || Math.abs(elapsed - value.durationSeconds) > 1) fail('receipt_duration');
  return checkPin(ctx, value.output);
}
async function inspect(ctx, spec, base) {
  const g = groups(spec);
  disjoint(spec.output, [...g.all.map(r => r.path), spec.snapshot.path, ...base.backups.map(r => r.path)]);
  if (g.sources.length !== base.value.entries.length || g.sources.some((r, i) => r.path !== base.value.entries[i].path)) fail('source_allowlist_mismatch');
  const rows = [];
  for (const pin of g.all) rows.push(await checkPin(ctx, pin, g.receipts.some(r => r.path === pin.path)));
  const outputs = [];
  for (const receipt of g.receipts) outputs.push(await receiptCheck(ctx, receipt));
  paths([...g.all, ...outputs].map(p => p.path));
  disjoint(spec.output, outputs.map(r => r.path));
  if (g.all.length + outputs.length + base.backups.length > LIMITS.rows) fail('row_limit');
  return { g, rows: [...rows, ...outputs, ...base.backups], outputs };
}
export async function freeze(root, spec, hooks = {}) {
  const began = start(); owner(spec); if (!['sources', 'entries'].includes(spec.format)) fail('invalid_format');
  const ctx = await rootContext(root); const base = await baseline(ctx, spec.snapshot, spec); const checked = await inspect(ctx, spec, base);
  await hooks.afterRead?.(); await stable(ctx, checked.rows);
  // Snapshot itself is also checked again, not only the cached base bytes.
  await jsonRead(ctx, spec.snapshot.path, spec.snapshot.sha256);
  const output = await reserve(ctx, spec.output, spec);
  await hooks.beforeComplete?.(); await stable(ctx, checked.rows); await jsonRead(ctx, spec.snapshot.path, spec.snapshot.sha256);
  const final = { schema: 'byte-packet-v1', state: 'complete', slug: spec.slug, cycle: spec.cycle, root: ctx.root, output, snapshot: spec.snapshot,
    [spec.format]: checked.g.sources.map((pin, i) => ({ ...base.value.entries[i], ...pin })), dependencies: checked.g.dependencies, evidence: checked.g.evidence, contract: checked.g.contract, receipts: checked.g.receipts, timing: measure(began) };
  return publish(ctx, output, 'inventory.json', final);
}
export async function verify(root, inventoryPath, expectedSha) {
  const began = start(); hash(expectedSha); const ctx = await rootContext(root);
  const raw = await jsonRead(ctx, inventoryPath, expectedSha); owner(raw);
  if (raw.schema !== 'byte-packet-v1' || raw.state !== 'complete' || !samePath(raw.root, ctx.root) || inventoryPath !== `${raw.output}/inventory.json` || !raw.output.startsWith('.cache/coordination/')) fail('inventory_binding');
  await completed(ctx, raw.output);
  const normalized = normalizeInventory(raw); const base = await baseline(ctx, raw.snapshot, raw);
  validTiming(raw.timing); validTiming(base.value.timing);
  if (JSON.stringify(normalized.sourceRows.map(({ path, baseExists, baseSha256, baseBackup }) => ({ path, baseExists, baseSha256, baseBackup }))) !== JSON.stringify(base.value.entries)) fail('baseline_mapping');
  const checked = await inspect(ctx, { ...raw, sources: normalized.sourceRows }, base);
  await stable(ctx, checked.rows); await jsonRead(ctx, raw.snapshot.path, raw.snapshot.sha256); await jsonRead(ctx, inventoryPath, expectedSha);
  return { integrity: 'complete', authority: 'pin-integrity-only', sources: checked.g.sources.length, dependencies: checked.g.dependencies.length, evidence: checked.g.evidence.length, receipts: checked.g.receipts.length, timing: measure(began) };
}
async function cli(args) {
  const operation = args.shift(); const flags = {};
  while (args.length) { const name = args.shift(); const value = args.shift(); if (!['--root', '--spec', '--inventory', '--expected-sha'].includes(name) || !value || flags[name] !== undefined) fail('invalid_cli'); flags[name] = value; }
  const ctx = await rootContext(flags['--root']);
  if (operation === 'verify' && flags['--spec'] === undefined) return verify(ctx.root, flags['--inventory'], flags['--expected-sha']);
  if (!['snapshot', 'freeze'].includes(operation) || flags['--inventory'] !== undefined || flags['--expected-sha'] !== undefined) fail('invalid_cli');
  const spec = await jsonRead(ctx, relative(flags['--spec']));
  return operation === 'snapshot' ? snapshot(ctx.root, spec) : freeze(ctx.root, spec);
}
if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(await cli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ integrity: 'HOLD', reason: String(error.code ?? 'refused').slice(0, 80) })}\n`); process.exitCode = 1; }
}
