#!/usr/bin/env node
/** Current-user Ubuntu supervisor installation. Preview by default; activation is explicit. */
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const UNIT_NAME = 'lkb-webinar-portable-supervisor.service';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MAX_BYTES = 65536;
const defaultDeps = {
  platform: process.platform, uid: process.getuid?.(), home: homedir(), node: process.execPath,
  lstat: lstatSync, exists: existsSync, mkdir: mkdirSync, open: openSync, close: closeSync,
  fstat: fstatSync, read: readFileSync, write: writeFileSync, spawn: spawnSync,
};

function physicalPath(path, directory, d) {
  if (typeof path !== 'string' || !posix.isAbsolute(path) || /["\x00-\x1f\x7f]/.test(path)) throw new Error('Absolute physical paths required');
  path = posix.resolve(path);
  let cursor = path;
  while (true) {
    const stat = d.lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error('Linked paths refused');
    if (cursor === path && (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error('Unexpected path type');
    const parent = posix.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return path;
}

function unitQuote(value, command = false) {
  return '"' + value.replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/\$/g, command ? '$$$$' : '$$') + '"';
}

/** Validate actual setup output against the fixed common runner and exact service directives. */
export function verifyUbuntuUnit(text, {root, node, display}) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('Invalid service preview');
  const expected = `[Unit]
Description=Vidysea webinar pipeline (manual live proof required)
After=graphical-session.target
PartOf=graphical-session.target
[Service]
Type=exec
WorkingDirectory=${unitQuote(root)}
Environment=DISPLAY=${display}
ExecStart=${unitQuote(node, true)} ${unitQuote(`${root.replace(/[\\/]$/, '')}/scripts/webinar/run-pipeline.mjs`, true)} --run --watch
Restart=on-failure
RestartSec=60
[Install]
WantedBy=graphical-session.target`;
  if (text.replace(/\r\n/g, '\n').trim() !== expected) throw new Error('Service binding or settings mismatch');
  return expected + '\n';
}

function boundedResult(command, args, root, d) {
  const result = d.spawn(command, args, {cwd: root, encoding: 'utf8', timeout: 15000,
    maxBuffer: MAX_BYTES, windowsHide: true, shell: false});
  if (result.error || !Number.isInteger(result.status) || result.signal) throw new Error('Supervisor command failed or timed out');
  return result;
}

function runBounded(command, args, root, d) {
  const result = boundedResult(command, args, root, d);
  if (result.status !== 0) throw new Error('Supervisor command failed');
  return result.stdout ?? '';
}

function trustedSystemctl(d) {
  const command = physicalPath('/usr/bin/systemctl', false, d);
  const stat = d.lstat(command);
  if (stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('Trusted systemctl required');
  return command;
}

function assertDisabled(systemctl, root, d, allowAbsent) {
  const result = boundedResult(systemctl, ['--user', 'is-enabled', UNIT_NAME], root, d);
  const state = (result.stdout ?? '').trim();
  if (!((result.status === 1 && state === 'disabled') || (allowAbsent && result.status === 4 && state === 'not-found'))) {
    throw new Error('Existing enablement or unknown supervisor state refused');
  }
}

function assertManagerBinding(systemctl, target, root, node, display, d) {
  // Ambiguous systemctl argument serialization is refused; preview/install still support
  // all safely quoted service paths, while activation requires unambiguous POSIX tokens.
  if ([root, node].some(path => !/^\/[A-Za-z0-9_./-]+$/.test(path))) throw new Error('Activation requires simple physical POSIX paths');
  const output = runBounded(systemctl, ['--user', 'show', UNIT_NAME,
    '--property=FragmentPath,DropInPaths,LoadState,Transient,NeedDaemonReload,ExecStart,WorkingDirectory,Environment'], root, d);
  const properties = new Map();
  for (const line of output.trim().split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1 || properties.has(line.slice(0, separator))) throw new Error('Unknown manager unit binding');
    properties.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const expected = {FragmentPath: target, DropInPaths: '', LoadState: 'loaded', Transient: 'no',
    NeedDaemonReload: 'no', WorkingDirectory: root, Environment: `DISPLAY=${display}`};
  if (properties.size !== 8 || Object.entries(expected).some(([key,value]) => properties.get(key) !== value)) {
    throw new Error('Effective manager unit differs from the verified installed unit');
  }
  const start = properties.get('ExecStart');
  if (typeof start !== 'string' || !start.startsWith('{ ') || !start.endsWith(' }') || /[{}]/.test(start.slice(2,-2))) throw new Error('Unknown effective executable');
  const fields = new Map(start.slice(2,-2).split(' ; ').map(field => {
    const separator = field.indexOf('='); return [field.slice(0,separator),field.slice(separator+1)];
  }));
  const runner = `${root}/scripts/webinar/run-pipeline.mjs`;
  if (fields.size !== 8 || fields.get('path') !== node || fields.get('argv[]') !== `${node} ${runner} --run --watch` ||
      fields.get('ignore_errors') !== 'no' || !['start_time','stop_time','pid','code','status'].every(key => fields.has(key))) {
    throw new Error('Effective executable differs from the verified common runner');
  }
}

function ownedDirectory(path, d) {
  physicalPath(path, true, d);
  const stat = d.lstat(path);
  if (stat.uid !== d.uid || (stat.mode & 0o022) !== 0) throw new Error('User-owned private configuration directory required');
}

function configurationDirectory(d, create) {
  const home = physicalPath(d.home, true, d);
  ownedDirectory(home, d);
  let current = home;
  for (const component of ['.config', 'systemd', 'user']) {
    current = posix.join(current, component);
    if (!d.exists(current)) {
      if (!create) return {path: current, absent: true};
      d.mkdir(current, {mode: 0o700});
    }
    ownedDirectory(current, d);
  }
  return {path: current, absent: false};
}

function readOwnedUnit(path, d) {
  physicalPath(path, false, d);
  const fd = d.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = d.fstat(fd);
    if (!stat.isFile() || stat.uid !== d.uid || (stat.mode & 0o022) !== 0 || stat.size > MAX_BYTES) throw new Error('Unsafe installed unit');
    return d.read(fd, 'utf8');
  } finally { d.close(fd); }
}

export function installUbuntuSupervisor(options, d = defaultDeps) {
  if (d.platform !== 'linux' || !Number.isInteger(d.uid) || d.uid <= 0) throw new Error('Non-root Linux user required');
  const {install = false, activate = false, display} = options;
  if (install && activate) throw new Error('Installation and activation are separate operations');
  if (!/^:\d{1,5}(?:\.\d{1,2})?$/.test(display ?? '')) throw new Error('Explicit local X11 DISPLAY required');
  const root = physicalPath(options.root ?? ROOT, true, d);
  const node = physicalPath(d.node, false, d);
  const setup = physicalPath(posix.join(root, 'scripts/webinar/setup.mjs'), false, d);
  physicalPath(posix.join(root, 'scripts/webinar/run-pipeline.mjs'), false, d);
  const expected = verifyUbuntuUnit(runBounded(node, [setup, '--service-preview', `--display=${display}`], root, d), {root, node, display});
  const directory = configurationDirectory(d, install);
  const target = posix.join(directory.path, UNIT_NAME);
  if (activate) {
    if (directory.absent || !d.exists(target)) throw new Error('Install the disabled supervisor first');
    verifyUbuntuUnit(readOwnedUnit(target, d), {root, node, display});
    const systemctl = trustedSystemctl(d);
    runBounded(systemctl, ['--user', 'daemon-reload'], root, d);
    // Check the manager's resolved fragment/drop-ins/command, not just a file that may
    // be shadowed by transient, generator, user.control or alternate load paths.
    assertManagerBinding(systemctl, target, root, node, display, d);
    verifyUbuntuUnit(readOwnedUnit(target, d), {root, node, display});
    runBounded(systemctl, ['--user', 'enable', '--now', UNIT_NAME], root, d);
    runBounded(systemctl, ['--user', 'is-active', '--quiet', UNIT_NAME], root, d);
    return {status: 'activated', unit: target, liveRecoveryVerified: false};
  }
  if (!install) return {status: 'preview', unit: posix.join(posix.resolve(d.home), '.config/systemd/user', UNIT_NAME), text: expected};
  const systemctl = trustedSystemctl(d);
  assertDisabled(systemctl, root, d, true);
  // Exclusive creation refuses existing units and any concurrent symlink/name collision.
  const fd = d.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { d.write(fd, expected); } finally { d.close(fd); }
  if (readOwnedUnit(target, d) !== expected) throw new Error('Installed unit readback mismatch; inspect manually');
  assertDisabled(systemctl, root, d, false);
  // No daemon-reload, enable, start, linger or system configuration change occurs here.
  return {status: 'installed-disabled', unit: target, liveRecoveryVerified: false};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--install', '--activate'].includes(arg) && !arg.startsWith('--display=') && !arg.startsWith('--project-root=')) ||
      args.filter(arg => arg.startsWith('--display=')).length !== 1 || args.filter(arg => arg.startsWith('--project-root=')).length > 1 ||
      args.filter(arg => arg === '--install').length > 1 || args.filter(arg => arg === '--activate').length > 1) throw new Error('Invalid supervisor arguments');
    const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const result = installUbuntuSupervisor({root: value('project-root'), display: value('display'),
      install: args.includes('--install'), activate: args.includes('--activate')});
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
