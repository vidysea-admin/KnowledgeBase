import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(reason); };
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function localFile(root, name) {
  if (typeof name !== 'string' || isAbsolute(name) || name.includes('\\') || name.split('/').includes('..')) fail('unsafe-path');
  if (/(^|\/)(\.env(?:\..*)?|auth\.json|credentials[^/]*|state_\d+\.sqlite)$/i.test(name)) fail('sensitive-path');
  const file = resolve(root, name), rel = relative(root, realpathSync(file));
  if (rel.startsWith('..') || isAbsolute(rel) || !lstatSync(file).isFile()) fail('nonlocal-file');
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) fail('unbounded-file');
  return file;
}
function pinned(root, item) {
  if (!item || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('missing-pin');
  const bytes = readFileSync(localFile(root, item.path));
  if (digest(bytes) !== item.sha256) fail('stale-pin');
  return bytes;
}
export function admission(spec, now = Date.now()) {
  if (!spec || spec.version !== 1 || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(spec.slug) || !Number.isSafeInteger(spec.cycle) || spec.cycle < 0) fail('invalid-identity');
  const root = realpathSync(spec.root);
  if (!finite(spec.makerActiveMs) || spec.makerActiveMs === 0) fail('maker-timing-unknown');
  const budgetMs = Math.floor(Math.min(spec.makerActiveMs * 0.1, 180000));
  if (budgetMs < 1) fail('insufficient-budget');
  const manifest = pinned(root, spec.manifest).toString('utf8').replace(/\*\*/g, '');
  const statuses = [...manifest.matchAll(/^(?:Handshake status|Status):\s*(\S+)/gm)].map(m => m[1]);
  if (!statuses.length || statuses.some(s => s !== 'ready-for-check')) fail('not-ready');
  const cycles = [...manifest.matchAll(/^Fix cycle:\s*(\d+)\s*$/gm)].map(m => Number(m[1]));
  if (cycles.length !== 1 || cycles[0] !== spec.cycle) fail('wrong-cycle');
  const packet = pinned(root, spec.packet);
  if (packet.length > 16384) fail('packet-over-budget');
  if (!Array.isArray(spec.pins) || !spec.pins.length || spec.pins.length > 128) fail('invalid-pins');
  const seen = new Set([spec.manifest.path, spec.packet.path]);
  let bytes = packet.length;
  for (const item of spec.pins) {
    if (seen.has(item.path)) fail('duplicate-pin');
    seen.add(item.path); bytes += pinned(root, item).length;
  }
  if (bytes > 8 * 1024 * 1024) fail('context-over-budget');
  if (!Array.isArray(spec.requiredChecks) || !spec.requiredChecks.length || spec.requiredChecks.some(x => typeof x !== 'string' || x.length > 200)) fail('missing-required-checks');
  if (!Array.isArray(spec.riskFlags) || spec.riskFlags.some(x => !['auth','tenancy','writes','credentials','none'].includes(x))) fail('invalid-risk-flags');
  if (spec.riskFlags.length === 0 || (spec.riskFlags.includes('none') && spec.riskFlags.length !== 1)) fail('invalid-risk-flags');
  return { version: 1, slug: spec.slug, cycle: spec.cycle, specSha256: digest(JSON.stringify(spec)), startedAtMs: now, deadlineMs: now + budgetMs, budgetMs, pinnedBytes: bytes, packetBytes: packet.length, estimatedPacketTokens: Math.ceil(packet.length / 4), estimateOnly: true, tokenUsage: 'unknown', billedCost: 'unknown', status: 'admitted' };
}
export function finish(spec, lease, report, now = Date.now()) {
  if (lease.specSha256 !== digest(JSON.stringify(spec))) fail('changed-spec');
  admission(spec, lease.startedAtMs); // revalidate the same READY bytes, including dependencies and receipts
  if (!report || !['PASS','FAIL','HOLD'].includes(report.verdict)) fail('invalid-verdict');
  if (!Array.isArray(report.completedChecks)) fail('missing-check-list');
  const missing = spec.requiredChecks.filter(x => !report.completedChecks.includes(x));
  const elapsedMs = Math.max(0, now - lease.startedAtMs), overBudget = now > lease.deadlineMs;
  const requested = report.verdict;
  const verdict = requested === 'PASS' && (missing.length || overBudget) ? 'HOLD' : requested;
  return { ...lease, status: 'finished', requestedVerdict: requested, verdict, missingChecks: missing, elapsedMs, overBudget, completedAtMs: now, checkerTokenUsage: report.tokenUsage ?? 'unknown', billedCost: report.billedCost ?? 'unknown', explanation: overBudget ? 'Budget exhausted; incomplete acceptance remains HOLD. Proven failures remain FAIL.' : report.explanation ?? '' };
}
function statePaths(spec) {
  const root = realpathSync(spec.root), folder = resolve(root, '.cache/checker-efficient');
  mkdirSync(folder, { recursive: true });
  const rel = relative(root, realpathSync(folder));
  if (rel.startsWith('..') || isAbsolute(rel)) fail('nonlocal-ledger');
  const key = `${spec.slug}-cycle-${spec.cycle}`;
  return { lease: resolve(folder, `${key}.lease.json`), report: resolve(folder, `${key}.report.json`) };
}
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const saveNew = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
export function cli(args) {
  const [action, specPath, reportPath] = args;
  if (!['admit','status','finish','run'].includes(action) || !specPath) fail('usage-admit-status-finish-run-spec-json');
  const spec = json(specPath);
  // All input validation precedes reservation or command execution.
  const candidate = admission(spec), paths = statePaths(spec);
  if (action === 'admit') { saveNew(paths.lease, candidate); return candidate; }
  const lease = json(paths.lease);
  if (lease.specSha256 !== candidate.specSha256) fail('changed-spec');
  if (action === 'status') return { ...lease, remainingMs: Math.max(0, lease.deadlineMs - Date.now()), expired: Date.now() > lease.deadlineMs, finished: existsSync(paths.report) };
  if (existsSync(paths.report)) fail('already-finished');
  if (action === 'finish') {
    const report = json(reportPath), receiptPath = paths.lease.replace('.lease.json', '.command-receipt.json');
    if (spec.independentCommand && report.verdict === 'PASS') {
      const receipt = existsSync(receiptPath) ? json(receiptPath) : null;
      if (!receipt || receipt.specSha256 !== lease.specSha256 || receipt.exitCode !== 0 || receipt.errorCode) {
        report.verdict = 'HOLD'; report.explanation = 'Required independent command missing, failed or timed out.';
      }
    }
    const result = finish(spec, lease, report); saveNew(paths.report, result); return result;
  }
  const command = spec.independentCommand;
  if (!command || typeof command.file !== 'string' || !isAbsolute(command.file) || !Array.isArray(command.args) || command.args.some(x => typeof x !== 'string')) fail('invalid-command');
  const remainingMs = lease.deadlineMs - Date.now();
  if (remainingMs < 1) fail('budget-exhausted-HOLD');
  // One launch per frozen cycle; no shell expansion, provider credentials or environment dump.
  const commandPath = paths.lease.replace('.lease.json', '.command.json');
  saveNew(commandPath, { command, startedAtMs: Date.now() });
  const start = Date.now();
  const result = spawnSync(command.file, command.args, { cwd: realpathSync(spec.root), timeout: remainingMs, maxBuffer: 1024 * 1024, windowsHide: true, shell: false, encoding: 'utf8' });
  const receipt = { exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null, elapsedMs: Date.now() - start, stdoutSha256: digest(result.stdout ?? ''), stderrSha256: digest(result.stderr ?? ''), specSha256: lease.specSha256 };
  const receiptPath = paths.lease.replace('.lease.json', '.command-receipt.json');
  saveNew(receiptPath, receipt);
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n'); }
  catch (error) { process.stderr.write(`HOLD: ${error.code === 'EEXIST' ? 'duplicate-dispatch-or-command' : error.message}\n`); process.exitCode = 2; }
}
