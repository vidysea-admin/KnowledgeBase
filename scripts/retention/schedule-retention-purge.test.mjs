import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const launcher = resolve(root, 'scripts/retention/schedule-retention-purge.ps1');
const shell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
function invoke(args = []) {
  return spawnSync(shell, ['-NoProfile', '-File', launcher, ...args], {cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 65536, windowsHide: true});
}
const good = ['-Tenant', 'toc', '-DataRoot', 'C:\\x\\data', '-MediaRoot', 'C:\\x\\media', '-MinAgeDays', '90', '-ClipPaddingSeconds', '15'];
test('default preview is a dry run that registers nothing and names the job CLI and report file', () => {
  const r = invoke();
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.equal(v.mode, 'preview'); assert.equal(v.deletes, false); assert.equal(v.taskRegistered, false);
  assert.match(v.cli, /retention-purge-job-cli\.ts$/);
  assert.match(v.reportFile, /data\\retention\\report\.json$/);
});
test('thresholds default to 90 days / 15 s and below-floor values are refused', () => {
  const noThr = ['-Tenant', 'toc', '-DataRoot', 'C:\\x\\d', '-MediaRoot', 'C:\\x\\m'];
  const v = JSON.parse(invoke(['-TaskPreview', ...noThr]).stdout);
  assert.match(v.action.arguments, /-MinAgeDays 90 -ClipPaddingSeconds 15/);
  for (const [k, val] of [['-MinAgeDays', '89'], ['-MinAgeDays', '7'], ['-ClipPaddingSeconds', '14']]) {
    const r = invoke(['-TaskPreview', ...noThr, k, val]);
    assert.notEqual(r.status, 0, k + val);
    assert.match(r.stderr, /ruling 5 floor/);
  }
});
test('-Execute alone refuses; deletion needs -ConfirmDeletion', () => {
  for (const flag of ['-Run', '-InstallTask', '-TaskPreview']) {
    const r = invoke([flag, '-Execute', ...good]);
    assert.notEqual(r.status, 0, flag);
    assert.match(r.stderr, /ConfirmDeletion/);
  }
});
test('task preview builds a daily dry-run action: no --execute / -Execute in its arguments, nothing registered', () => {
  const r = invoke(['-TaskPreview', ...good]);
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.equal(v.registered, false); assert.equal(v.deletes, false);
  assert.match(v.trigger.type, /Daily/i);
  assert.ok(!/execute/i.test(v.action.arguments), v.action.arguments);
  assert.match(v.action.arguments, /-Run /);
});
test('task preview with explicit -Execute -ConfirmDeletion carries the flag, and says deletes', () => {
  const v = JSON.parse(invoke(['-TaskPreview', '-Execute', '-ConfirmDeletion', ...good]).stdout);
  assert.equal(v.deletes, true);
  assert.match(v.action.arguments, /-Execute -ConfirmDeletion/);
});
test('bad values are refused: relative path, quote, expansion, parent segment, bad threshold, bad time', () => {
  const swap = (k, val) => { const a = [...good]; a[a.indexOf(k) + 1] = val; return a; };
  const cases = [swap('-DataRoot', 'data'), swap('-MediaRoot', 'C:\\a"b'), swap('-MediaRoot', 'C:\\%X%'), swap('-DataRoot', 'C:\\a\\..\\b'),
    swap('-MinAgeDays', '7; calc'), swap('-ClipPaddingSeconds', '-1'), swap('-Tenant', 'a b')];
  for (const c of cases) { const r = invoke(['-TaskPreview', ...c]); assert.notEqual(r.status, 0, c.join(' ')); }
  assert.notEqual(invoke(['-TaskPreview', '-DailyAt', '25:00', ...good]).status, 0);
});
test('source: only the job CLI is launched, and --execute is added only behind -Execute', () => {
  const src = readFileSync(launcher, 'utf8');
  assert.equal([...src.matchAll(/--execute/g)].length, 1);
  assert.equal([...src.matchAll(/--confirm-deletion/g)].length, 1);
  assert.match(src, /if \(\$Execute\) \{ \$jobArgs \+= @\('--execute', '--confirm-deletion'\) \}/);
  assert.ok(!/Start-ScheduledTask|schtasks/i.test(src));
});
