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
function check(name, binary, args, validate = () => true) {
  const result = spawnSync(binary, args, {cwd: root, env, encoding: 'utf8', timeout: 20000, windowsHide: true});
  const ok = result.status === 0 && validate(result.stdout ?? '');
  console.log(`${ok ? 'OK' : 'MISSING'} ${name}`);
  if (result.error) console.log(`Check diagnostic: ${result.error.code ?? 'spawn failure'} (${name})`);
  return ok;
}
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
const checks = [
  check('Node >=24', process.execPath, ['-e', 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)']),
  // Windows command shims need cmd; this is a fixed read-only command, no user interpolation.
  check('pnpm 10.33.0', win ? 'cmd.exe' : 'pnpm', win ? ['/d', '/s', '/c', 'pnpm', '--version'] : ['--version'],
    (output) => output.trim() === '10.33.0'),
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
console.log('Node dependencies: pnpm install --store-dir .cache/pnpm (run from this directory).');
if (!win) console.log('Ubuntu needs ffmpeg, a headed X11 display/Xvfb, Chrome shared libraries, and Tk/X11 support for PyAutoGUI. Provision those OS packages separately. DISPLAY and managed browser ownership must be verifiable; Wayland alone is not supported.');
if (process.argv.includes('--doctor') && checks.some((ok) => !ok)) process.exitCode = 1;
