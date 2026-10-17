/** Pure lexical rejection precedes any filesystem operation; mapped volumes need host proof. */
import { isAbsolute, resolve } from 'node:path';
function rejectNamespace(path) {
  if (typeof path !== 'string' || !path || path.includes('\0') || /^[a-z]+:\/\//i.test(path)) throw new Error('private local path required');
  const normalized=path.replaceAll('\\','/');
  if (normalized.startsWith('//') || /^\/(?:\?\?|Device)(?:\/|$)/i.test(normalized)) throw new Error('network and device namespaces refused');
}
export function assertPrivateTrainingPath(path, platform=process.platform) {
  rejectNamespace(path);
  const normalized=path.replaceAll('\\','/');
  if (platform==='win32') {
    if (!/^[A-Za-z]:[\\/](?![\\/])/.test(path)) throw new Error('absolute drive-qualified local path required');
    const segments=normalized.slice(3).split('/');
    if (segments.some(s=>/[<>:"|?*]/.test(s) || /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\..*)?$/i.test(s))) throw new Error('device path refused');
  } else if (!isAbsolute(path)) throw new Error('absolute local path required');
  return path;
}
export function resolvePrivateTrainingPath(path) {rejectNamespace(path); return assertPrivateTrainingPath(resolve(path));}
