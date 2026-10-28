/** ISS-367: default dependency wiring + log redaction for run-pipeline.mjs, split out for the file-length budget. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedWorkDbName } from '../lib/transcript-provenance.mjs';
import { createSchedulerRuntime } from './scheduler/deps-runtime.mjs';
import { resolveAttendanceExecutable } from './calendar-attendance-source.mjs';
import { register } from 'tsx/esm/api';
register();
const {createHttpCalendarLoader, createHttpCandidateLoader} = await import('../../packages/meeting-bot/src/calendar/schedule-tick.ts');
const {redactJoinLink} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {launchControlledRecording} = await import('../../packages/meeting-bot/src/capture/reconnect-gaps.ts');
const {createTelegramChannel} = await import('../../packages/meeting-bot/src/capture/notify/telegram-channel.ts');
const {createBrowserRegistrationExecutor} = await import('../../packages/meeting-bot/src/joiners/browser-joiner.ts');
const {createRegistrationPolicyResolver} = await import('./registration/registration-policy-host.ts');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function safeText(text) {
  // Feed errors can include opaque URLs; leave no query, fragment, userinfo or token in logs.
  return String(text).replace(/https?:\/\/[^\s"']+/gi, (url) => {
    try { const parsed = new URL(redactJoinLink(url)); return `${parsed.protocol}//${parsed.host}/[redacted]`; }
    catch { return '[redacted-url]'; }
  }).slice(0, 500);
}
export function createPipelineDeps(env = process.env) {
  env = {...env}; // One resolved environment shared by capture, registration and alert transports.
  for (const [name, key] of [['gws', 'LKB_GWS_PATH'], ['ffmpeg', 'LKB_FFMPEG'], ['ffprobe', 'LKB_FFPROBE'], ['python', 'LKB_PYTHON']]) {
    try {env[key] = resolveAttendanceExecutable(name, env[key], env);}
    catch {if (env[key]) throw new Error('Configured runtime executable is missing: ' + name);}
  }
  const api = (env.LKB_API_URL ?? 'http://localhost:3300').replace(/\/$/, '');
  const log = (text) => console.log(safeText(text));
  let channel, channelInitialized = false;
  let verifiedTenant;
  const registrationExecutor = createBrowserRegistrationExecutor(env, ROOT);
  return {
    root: ROOT, stateDir: join(ROOT, 'data/webinar-release'), env, log,
    ...createSchedulerRuntime(ROOT, env, log, () => verifiedTenant),
    now: () => new Date().toISOString(),
    validateTenant: async () => {
      verifiedTenant = undefined;
      if (!env.LKB_TENANT_ID || !env.LKB_API_KEY) throw new Error('Explicit lane owner and API key required');
      const response = await fetch(`${api}/webinar-operations`, { headers: { authorization: `Bearer ${env.LKB_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      try {
        if (!response.ok || response.headers.get('x-lkb-tenant') !== env.LKB_TENANT_ID) throw new Error('Connected API owner does not match the configured capture lane');
        verifiedTenant = env.LKB_TENANT_ID;
      } finally { await response.body?.cancel(); }
    },
    loadCalendarEvents: createHttpCalendarLoader(api, env.LKB_API_KEY),
    ...registrationExecutor,
    registrationConfig: candidate => {
      if (!verifiedTenant || verifiedTenant !== env.LKB_TENANT_ID) throw new Error('Registration requires current verified lane ownership');
      const runtime = registrationExecutor.registrationConfig();
      if (!runtime?.python || !runtime.profileDir) throw new Error('Explicit registration runtime paths required');
      return createRegistrationPolicyResolver({stateDir: join(ROOT, 'raw', 'webinars'), tenantId: verifiedTenant,
        runtime: {python: runtime.python, profileDir: runtime.profileDir, browserExecutable: runtime.browserExecutable, timeoutMs: runtime.timeoutMs}})(candidate);
    },
    loadCalendarAcquisition: createHttpCalendarLoader(api, env.LKB_API_KEY, undefined, {tenantId: env.LKB_TENANT_ID}),
    loadCandidates: async (refresh = false) => {
      if (refresh) {
        const headers = {authorization: `Bearer ${env.LKB_API_KEY}`};
        const preflight = await fetch(`${api}/meeting-candidates`, {headers, redirect: 'error', signal: AbortSignal.timeout(30000)});
        try {
          if (!preflight.ok || isProtectedWorkDbName(env.MONGO_WORK_DB, env) || preflight.headers.get('x-lkb-work-db') !== env.MONGO_WORK_DB) throw new Error('Connected Gmail work database not bound');
        } finally { await preflight.body?.cancel(); }
        const scanned = await fetch(`${api}/gmail/scan`, {method: 'POST', headers: {...headers, 'X-LKB-Work-DB': env.MONGO_WORK_DB}, redirect: 'error', signal: AbortSignal.timeout(30000)});
        if (!scanned.ok) { await scanned.body?.cancel(); throw new Error('Gmail discovery unavailable'); }
        const result = await scanned.json();
        if (!result || !Number.isInteger(result.created) || result.created < 0 || !Number.isInteger(result.autoApproved) || result.autoApproved < 0 || result.autoApproved > result.created) throw new Error('Invalid Gmail scan result');
      }
      // Preserve legacy mapping while refusing failed discovery in this runner.
      let failure = false;
      const loader = createHttpCandidateLoader(api, env.LKB_API_KEY,
        (message) => { log(message); if (/skipping|fetch failed/i.test(message)) failure = true; }, true);
      const rows = await loader();
      if (failure) throw new Error('Gmail candidate discovery unavailable');
      return rows;
    },
    launch: (args, childEnv, onLine, onControl) => launchControlledRecording(ROOT, args, childEnv, onLine, onControl),
    notifyOperation: async ({sessionId, status, reason, feed}) => {
      if (!channelInitialized) {
        channel = createTelegramChannel({token: env.TELEGRAM_BOT_TOKEN ?? '', chatId: env.TELEGRAM_CHAT_ID ?? '', log});
        channelInitialized = true;
      }
      if (!channel) return 'disabled';
      await channel.send(feed ? `Webinar discovery ${feed}: ${status}. Check the operations view for coverage.` :
        `Webinar ${sessionId}: ${status}${reason ? ` (${reason})` : ''}. Check the operations view for details.`);
      return 'sent';
    },
  };
}
export function captureWait(ms, signal) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); signal.addEventListener('abort', finish, {once: true});
    if (signal.aborted) finish();
  });
}
