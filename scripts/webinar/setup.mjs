#!/usr/bin/env node
/** Doctor by default. --install is the only dependency mutation path; installs stay in project. */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const venv = join(root, '.venv');
const win = process.platform === 'win32';
const python = join(venv, win ? 'Scripts/python.exe' : 'bin/python');
const env = {...process.env, PIP_CACHE_DIR: join(root, '.cache/pip'), XDG_CACHE_HOME: join(root, '.cache')};
const planned = [
  [process.env.LKB_SETUP_PYTHON ?? (win ? 'python' : 'python3'), ['-m', 'venv', venv]],
  [python, ['-m', 'pip', '--isolated', 'install', '--cache-dir', join(root, '.cache/pip'), '-r', join(root, 'packages/meeting-bot/py/requirements.txt')]],
  [python, ['-m', 'seleniumbase', 'get', 'cft']],
  [python, ['-m', 'seleniumbase', 'get', 'uc_driver', 'stable']],
];
function check(name, binary, args, validate = () => true, childEnv = {}) {
  const checkEnv = Object.fromEntries(Object.entries({...env, ...childEnv}).filter(([, value]) => value !== undefined));
  const result = spawnSync(binary, args, {cwd: root, env: checkEnv, encoding: 'utf8', timeout: 20000, windowsHide: true});
  const ok = !result.error && result.status === 0 && validate(result.stdout ?? '');
  console.log(`${ok ? 'OK' : 'MISSING'} ${name}`);
  if (result.error) console.log(`Check diagnostic: ${result.error.code ?? 'spawn failure'} (${name})`);
  return ok;
}
export function renderServicePreview({platform, projectRoot, node, userSid, display}) {
  if (!['win32', 'linux'].includes(platform)) throw new Error('Unsupported service platform');
  const windows = platform === 'win32';
  for (const value of [projectRoot, node]) {
    if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f"]/.test(value) ||
      (windows ? !/^[A-Za-z]:\\/.test(value) || value.length > 240 : !value.startsWith('/'))) {
      throw new Error('Service paths must be absolute and contain no controls or quotes');
    }
  }
  const runner = `${projectRoot.replace(/[\\/]$/, '')}${windows ? '\\' : '/'}scripts${windows ? '\\' : '/'}webinar${windows ? '\\' : '/'}run-pipeline.mjs`;
  if (windows) {
    if (typeof userSid !== 'string' || !/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(userSid)) throw new Error('Windows local/domain user SID required');
    const xml = value => value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
    return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${xml(userSid)}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Operator"><UserId>${xml(userSid)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings>
  <Actions Context="Operator"><Exec><Command>${xml(node)}</Command><Arguments>${xml(`"${runner}" --run --watch`)}</Arguments><WorkingDirectory>${xml(projectRoot)}</WorkingDirectory></Exec></Actions>
</Task>`;
  }
  if (typeof display !== 'string' || !/^:\d{1,5}(?:\.\d{1,2})?$/.test(display)) throw new Error('Explicit local X11 DISPLAY required (--display=:0)');
  const unit = (value, command = false) => '"' + value.replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/\$/g, command ? '$$$$' : '$$') + '"';
  return `[Unit]
Description=Vidysea webinar pipeline (manual live proof required)
After=graphical-session.target
PartOf=graphical-session.target
[Service]
Type=exec
WorkingDirectory=${unit(projectRoot)}
Environment=DISPLAY=${display}
ExecStart=${unit(node, true)} ${unit(runner, true)} --run --watch
Restart=on-failure
RestartSec=60
[Install]
WantedBy=graphical-session.target`;
}
if (process.argv.includes('--service-preview')) {
  if (process.argv.includes('--install')) throw new Error('Service preview cannot be combined with dependency installation');
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  let userSid = option('service-user');
  if (win) {
    const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {encoding: 'utf8', timeout: 5000, maxBuffer: 16384, windowsHide: true});
    const currentSid = identity.stdout?.match(/S-1-5-21-\d+-\d+-\d+-\d+/g);
    if (identity.error || identity.status !== 0 || currentSid?.length !== 1 || (userSid && userSid !== currentSid[0])) throw new Error('Service preview requires the verified current Windows user');
    userSid = currentSid[0];
  }
  console.log(renderServicePreview({platform: process.platform, projectRoot: root, node: process.execPath,
    userSid, display: option('display')}));
} else {
if (process.argv.includes('--install') && !process.argv.includes('--dry-run')) {
  if (existsSync(venv) && lstatSync(venv).isSymbolicLink()) throw new Error('Refusing installation into a linked .venv');
  for (const [binary, args] of planned) {
    if (binary === planned[0][0] && existsSync(python)) continue;
    const result = spawnSync(binary, args, {cwd: root, env, stdio: 'inherit', windowsHide: true});
    if (result.status !== 0) throw new Error('Project-local dependency installation failed');
  }
} else console.log('Preview: no dependencies installed. Use --install explicitly.');
console.log('Project install plan:');
for (const [binary, args] of planned) console.log(JSON.stringify([binary, ...args]));
const managerEnv = {COREPACK_ENABLE_NETWORK: '0', COREPACK_DEFAULT_TO_LATEST: '0', COREPACK_ENABLE_AUTO_PIN: '0',
  COREPACK_ENV_FILE: '0', COREPACK_ENABLE_PROJECT_SPEC: '1', COREPACK_ENABLE_STRICT: '1', npm_config_manage_package_manager_versions: 'false', pnpm_config_pm_on_fail: 'ignore', XDG_CACHE_HOME: process.env.XDG_CACHE_HOME};
const directPnpm = check('direct pnpm 10.33.0', win ? 'cmd.exe' : 'pnpm',
  win ? ['/d', '/s', '/c', 'pnpm', '--version'] : ['--version'], output => output.trim() === '10.33.0', managerEnv);
const cachedPnpm = !directPnpm && check('cached Corepack pnpm 10.33.0', win ? 'cmd.exe' : 'corepack',
  win ? ['/d', '/s', '/c', 'corepack', 'pnpm', '--version'] : ['pnpm', '--version'], output => output.trim() === '10.33.0', managerEnv);
const packageCommand = directPnpm ? 'pnpm' : cachedPnpm ? 'corepack pnpm' : undefined;
const checks = [
  check('Node >=24', process.execPath, ['-e', 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)']),
  directPnpm || cachedPnpm,
  check('ffmpeg', 'ffmpeg', ['-version']), check('ffprobe', 'ffprobe', ['-version']),
  check('project Python + SeleniumBase + PyAutoGUI + psutil + websocket-client', python, ['-c', 'import seleniumbase; import pyautogui; import psutil; import websocket; assert websocket.__version__ == "1.9.2"; assert seleniumbase.__version__ == "4.51.9"; assert psutil.__version__ == "7.2.2"']),
  check('project Chrome for Testing installed', python, ['-c',
    'import importlib.util,pathlib,sys; spec=importlib.util.find_spec("seleniumbase"); assert spec and spec.origin; p=pathlib.Path(spec.origin).parent/"drivers"/"cft_drivers"; platform,binary=("chrome-win64","chrome.exe") if sys.platform=="win32" else ("chrome-linux64","chrome"); assert (p/platform/binary).is_file()']),
  check('managed Chrome and installed UC driver versions match', python, ['-c',
    'import pathlib,re,subprocess,sys,seleniumbase; from seleniumbase.core import detect_b_ver; p=pathlib.Path(seleniumbase.__file__).parent/"drivers"; platform,binary=("chrome-win64","chrome.exe") if sys.platform=="win32" else ("chrome-linux64","chrome"); browser=detect_b_ver.get_browser_version_from_binary(str(p/"cft_drivers"/platform/binary)); driver=p/("uc_driver.exe" if sys.platform=="win32" else "uc_driver"); result=subprocess.run([str(driver),"--version"],capture_output=True,text=True,timeout=15,check=True); version=re.search(r"ChromeDriver\\s+(\\d+(?:\\.\\d+){3})",result.stdout); assert browser and version and browser.split(".")[0]==version.group(1).split(".")[0]']),
];
if (!win) {
  checks.push(check('headed X11 DISPLAY', process.execPath, ['-e', 'process.exit(process.env.DISPLAY ? 0 : 1)']));
}
console.log(`Set LKB_PYTHON=${python}`);
console.log('Set LKB_BROWSER_EXECUTABLE=cft; set LKB_CAPTURE_BACKEND=tab');
console.log(`Node dependencies: ${packageCommand ?? 'pnpm (install pinned 10.33.0 explicitly)'} install --frozen-lockfile --store-dir .cache/pnpm (run from this directory).`);
if (!win) console.log('Ubuntu needs ffmpeg, a headed X11 display/Xvfb, Chrome shared libraries, and Tk/X11 support for PyAutoGUI. Provision those OS packages separately. DISPLAY and managed browser ownership must be verifiable; Wayland alone is not supported.');
if (process.argv.includes('--doctor') && checks.some((ok) => !ok)) process.exitCode = 1;
}
