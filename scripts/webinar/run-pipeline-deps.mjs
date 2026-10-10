/** ISS-367: default dependency wiring + log redaction for run-pipeline.mjs, split out for the file-length budget. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';
register();
const {createHttpCalendarLoader, createHttpCandidateLoader} = await import('../../packages/meeting-bot/src/calendar/schedule-tick.ts');
const {redactJoinLink} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {launchControlledRecording} = await import('../../packages/meeting-bot/src/capture/reconnect-gaps.ts');
const {createTelegramChannel} = await import('../../packages/meeting-bot/src/capture/telegram-channel.ts');
const {createBrowserRegistrationExecutor} = await import('../../packages/meeting-bot/src/joiners/browser-joiner.ts');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function safeText(text) {
  // Feed errors can include opaque URLs; leave no query, fragment, userinfo or token in logs.
  return String(text).replace(/https?:\/\/[^\s"']+/gi, (url) => {
    try { const parsed = new URL(redactJoinLink(url)); return `${parsed.protocol}//${parsed.host}/[redacted]`; }
    catch { return '[redacted-url]'; }
  }).slice(0, 500);
}
export function createPipelineDeps(env = process.env) {
  const api = (env.LKB_API_URL ?? 'http://localhost:3300').replace(/\/$/, '');
  const log = (text) => console.log(safeText(text));
  let channel, channelInitialized = false;
  return {
    root: ROOT, stateDir: join(ROOT, 'data/webinar-release'), env, log,
    now: () => new Date().toISOString(),
    validateTenant: async () => {
      if (!env.LKB_TENANT_ID || !env.LKB_API_KEY) throw new Error('Explicit lane owner and API key required');
      const response = await fetch(`${api}/webinar-operations`, { headers: { authorization: `Bearer ${env.LKB_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      try {
        if (!response.ok || response.headers.get('x-lkb-tenant') !== env.LKB_TENANT_ID) throw new Error('Connected API owner does not match the configured capture lane');
      } finally { await response.body?.cancel(); }
    },
    loadCalendarEvents: createHttpCalendarLoader(api, env.LKB_API_KEY),
    ...createBrowserRegistrationExecutor(env, ROOT),
    loadCalendarAcquisition: createHttpCalendarLoader(api, env.LKB_API_KEY, undefined, {tenantId: env.LKB_TENANT_ID}),
    loadCandidates: async (refresh = false) => {
      if (refresh) {
        const headers = {authorization: `Bearer ${env.LKB_API_KEY}`};
        const preflight = await fetch(`${api}/meeting-candidates`, {headers, redirect: 'error', signal: AbortSignal.timeout(30000)});
        try {
          if (!preflight.ok || !env.MONGO_WORK_DB || preflight.headers.get('x-lkb-work-db') !== env.MONGO_WORK_DB || ['lkb', 'global_university_db'].includes(env.MONGO_WORK_DB)) throw new Error('Connected Gmail work database not bound');
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
