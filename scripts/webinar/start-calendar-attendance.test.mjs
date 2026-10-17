import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const launcher = resolve(root, 'scripts/webinar/start-calendar-attendance.ps1');
const shell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
function invoke(args = []) {
  return spawnSync(shell, ['-NoProfile', '-File', launcher, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true,
  });
}
test('default preview names the existing runner, target account and absolute paths without activation', () => {
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  const view = JSON.parse(result.stdout);
  assert.equal(view.account, 'umeshsugara@vidysea.com');
  assert.equal(view.mode, 'preview');
  assert.equal(view.captureStarted, false); assert.equal(view.taskRegistered, false);
  assert.equal(view.workingDirectory, root);
  assert.deepEqual(view.arguments, [resolve(root, 'scripts/webinar/run-pipeline.mjs'),
    '--calendar-attendance-account', 'umeshsugara@vidysea.com']);
  for (const path of [view.executable, view.python, view.gws, view.mediaDirectory]) assert.match(path, /^[A-Z]:\\/i);
});
test('Watch preview never adds run, and install cannot register or start a task', () => {
  const preview = invoke(['-Watch']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).arguments.at(-1), '--watch');
  assert.ok(!JSON.parse(preview.stdout).arguments.includes('--run'));
  const install = invoke(['-InstallTask']);
  assert.notEqual(install.status, 0);
  assert.match(install.stderr, /explicit confirmation/i);
});
test('relative and quote/expansion paths refuse before any executable starts', () => {
  for (const path of ['node.exe', 'C:\\bad"\\node.exe', 'C:\\%SECRET%\\node.exe']) {
    const result = invoke(['-NodePath', path]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /absolute local executable\/directory path/);
  }
});
test('Run refuses absent interactive/capacity approval and missing runtime before child startup', () => {
  const gate = invoke(['-Run']);
  assert.notEqual(gate.status, 0);
  assert.match(gate.stderr, /explicit confirmation/);
  const missing = invoke(['-Run', '-InteractiveSessionConfirmed', '-CaptureCapacityConfirmed',
    '-PythonPath', 'C:\\missing-runtime-fixture\\python.exe']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /runtime prerequisite is missing/);
});
test('task preview cannot be combined with activation', () => {
  const result = invoke(['-TaskPreview', '-Run']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TaskPreview cannot activate capture/);
});
test('eligible task mutation uses real production ownership boundary with isolated scheduler doubles', (t) => {
  const dir = mkdtempSync(resolve(tmpdir(), 'attendance-task-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const harness = resolve(dir, 'mock-task.ps1');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  writeFileSync(harness, `
$ErrorActionPreference='Stop'
. ${quote(launcher)} | Out-Null
$script:registrations=0; $script:updates=0; $script:existing=@()
function Get-ScheduledTask { [CmdletBinding()]param($TaskPath); return $script:existing }
function Register-ScheduledTask { [CmdletBinding()]param($TaskName,$TaskPath,$InputObject); $script:registrations++ }
function Set-ScheduledTask { [CmdletBinding()]param($TaskName,$TaskPath,$Action,$Trigger,$Settings,$Principal); $script:updates++ }
$definition=[pscustomobject]@{Principal=[pscustomobject]@{UserId='S-1-fixture'};
 Actions=@([pscustomobject]@{Execute='C:\\fixture\\pwsh.exe';WorkingDirectory=$projectRoot;
 Arguments=('-NoProfile -File "'+$launcherPath+'" -Run -Watch -NodePath "C:\\fixture\\node.exe"')});
 Triggers=@();Settings=[pscustomobject]@{}}
if ((Register-OwnedAttendanceTask $definition) -ne 'registered' -or $script:registrations -ne 1) { throw 'Eligible registration failed' }
$script:existing=@([pscustomobject]@{TaskName='Vidysea-Umesh-Calendar-Attendance';
 Principal=$definition.Principal;Actions=$definition.Actions})
if ((Register-OwnedAttendanceTask $definition) -ne 'updated' -or $script:updates -ne 1) { throw 'Owned update failed' }
$script:existing[0].Principal=[pscustomobject]@{UserId='S-1-foreign'}
$refused=$false
try { Register-OwnedAttendanceTask $definition | Out-Null } catch { $refused=$true }
if (-not $refused -or $script:updates -ne 1 -or $script:registrations -ne 1) { throw 'Foreign task mutation was not refused' }
Write-Output 'mock-boundary-pass'
`);
  const result = spawnSync(shell, ['-NoProfile', '-File', harness], {
    cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mock-boundary-pass/);
});
