/** Bounded child execution. Diagnostic bytes stay private; only stable retry codes escape. */
import {spawn} from 'node:child_process';
import {join} from 'node:path';

const RETRY_CODES = new Set(['io-error', 'provider-timeout', 'provider-5xx', 'rate-limited', 'db-unavailable']);
export function classifyStageFailure(error) {
  if (error?.code === 'cancelled') return 'cancelled';
  if (error?.code === 'provider-not-billed' || error?.name === 'GeminiFreeTierQuotaError') return 'provider-not-billed';
  if (RETRY_CODES.has(error?.code)) return error.code;
  if (['ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(error?.code)) return 'provider-timeout';
  if (['EBUSY', 'EIO', 'EMFILE', 'ENFILE'].includes(error?.code)) return 'io-error';
  if (error?.status === 429) return 'rate-limited';
  if (Number.isInteger(error?.status) && error.status >= 500 && error.status <= 599) return 'provider-5xx';
  const diagnostic = typeof error?.diagnostic === 'string' ? error.diagnostic.slice(-16384) : '';
  if (/GeminiFreeTierQuotaError/.test(diagnostic)) return 'provider-not-billed';
  // Rate limits and database connection errors precede generic transport classification.
  if (/\b(?:429|RESOURCE_EXHAUSTED)\b|rate.limit/i.test(diagnostic)) return 'rate-limited';
  if (/MongoServerSelectionError|MongoNetworkError|database unavailable/i.test(diagnostic)) return 'db-unavailable';
  if (/\b(?:ETIMEDOUT|ECONNRESET)\b|request timed out|provider.timeout/i.test(diagnostic)) return 'provider-timeout';
  if (/\b(?:HTTP|status(?:Code)?)\s*[:=]?\s*5\d\d\b/i.test(diagnostic)) return 'provider-5xx';
  // A separate child reports a transient file lock or descriptor exhaustion only through stderr text.
  if (/\b(?:EBUSY|EIO|EMFILE|ENFILE)\b/.test(diagnostic)) return 'io-error';
  return 'stage-failed';
}

export function runNodeScript(root, script, args, env, options = {}) {
  const timeoutMs = Number(env.LKB_PIPELINE_STAGE_TIMEOUT_MS || 1800000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 21600000)
    return Promise.reject(Object.assign(new Error('Invalid stage timeout'), {code: 'stage-failed'}));
  return new Promise((resolve, reject) => {
    let diagnostic = '', code = null, settled = false, hardStop;
    const child = spawn(process.execPath, [join(root, script), ...args], {cwd: root, env, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    const stop = (why) => {
      if (settled || code) return;
      code = why;
      child.kill('SIGTERM');
      hardStop = setTimeout(() => child.kill('SIGKILL'), 2000);
      hardStop.unref();
    };
    const abort = () => stop('cancelled');
    const timeout = setTimeout(() => stop('provider-timeout'), timeoutMs);
    timeout.unref();
    options.signal?.addEventListener('abort', abort, {once: true});
    if (options.signal?.aborted) abort();
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-16384); });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout); clearTimeout(hardStop);
      options.signal?.removeEventListener('abort', abort);
      child.stderr?.destroy();
      if (error || code) {
        const classified = code || classifyStageFailure(error);
        reject(Object.assign(new Error('Pipeline stage failed'), {code: classified}));
      } else resolve();
    };
    child.once('error', error => finish(error));
    child.once('exit', status => finish(status === 0 ? null : {diagnostic}));
  });
}
