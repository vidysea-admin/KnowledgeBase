/** Real scheduler dependency wiring. Operator-reviewed evidence is a separate authority. */
import {join, resolve, isAbsolute} from 'node:path';
import {register} from 'tsx/esm/api';
import {validateSlots} from './service.mjs';
register();
const {buildAutojoinTickDeps} = await import('../../../packages/meeting-bot/src/autojoin/tick-wiring.ts');
const {loadAutojoinConfig} = await import('../../../packages/meeting-bot/src/autojoin/config.ts');
const {raiseAlert, raiseRulesDegraded, clearRulesDegraded, flushFailureDigest} = await import('../../../packages/meeting-bot/src/autojoin/alerts.ts');
const {createGwsRunner} = await import('../../../packages/meeting-bot/src/autojoin/gws-channels.ts');
const {enforceJoinRules} = await import('../../../packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts');
const {selectTabCaptureWorkspace} = await import('../../../packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts');
const {listCaptureSlotReadiness, validateCaptureSlotReadiness} = await import('../../../packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts');
const {createCaptureSlotEvidenceAcceptor} = await import('../../../packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts');
const {publishCapturePrivacyController} = await import('../../../packages/meeting-bot/src/capture/record-consent/controller-bridge.ts');
const {detectPlatform} = await import('../../../packages/meeting-bot/src/platform.ts');
const FLAGS = ['discovery', 'webinarAutoJoin', 'careerPriority', 'testDataRouting'];

export function createSchedulerRuntime(root, env, log, verifiedTenant) {
  const stateDir = join(root, 'raw/webinars'), tenantId = env.LKB_TENANT_ID;
  const captureSlots = typeof env.LKB_CAPTURE_SLOTS === 'string' ? env.LKB_CAPTURE_SLOTS.split(',').map(value => value.trim()) : [];
  const configuredRoot = (name, fallback) => {
    const value = env[name] ?? fallback;
    if (typeof value !== 'string' || !value.trim() || !isAbsolute(value) || /^[/\\]{2}/.test(value))
      throw new Error('Capture runtime requires explicit local absolute directories');
    return resolve(value);
  };
  const defaults = {tenantId, profileDir: configuredRoot('LKB_BOT_PROFILE_DIR', join(root, 'data/bot-profile')),
    recordDir: configuredRoot('LKB_RECORD_DIR', stateDir)};
  const authority = () => {
    if (typeof tenantId !== 'string' || !tenantId || env.LKB_TENANT_ID !== tenantId || verifiedTenant() !== tenantId)
      throw new Error('Freshly verified API capture owner required');
  };
  const acceptEvidence = createCaptureSlotEvidenceAcceptor({root, env, verifiedTenant});
  const workspace = (slot, operation = 'finalize') => {
    authority();
    if (!captureSlots.includes(slot)) throw new Error('Capture slot is outside configured pool');
    return selectTabCaptureWorkspace(['--capture-slot', slot], defaults, operation);
  };
  // Keep this object stable: the central factory spreads the runtime once.
  const autojoin = {};
  let alertTail = Promise.resolve();
  const serializeAlert = body => {
    const next = alertTail.then(() => {authority(); return body();}); alertTail = next.catch(() => {}); return next;
  };
  const alertDeps = () => ({cfg: autojoin.cfg, stateDir, tenantId,
    now: () => new Date().toISOString(), log, gws: createGwsRunner(root, env)});
  const reloadAutojoin = () => {
    const current = buildAutojoinTickDeps(root, stateDir, env, log)
      ?? {cfg: loadAutojoinConfig(root, env, log), tagsDir: join(stateDir, 'capture-tags')};
    current.tagsDir = join(defaults.recordDir, 'capture-tags');
    current.raise = input => serializeAlert(() => raiseAlert(alertDeps(), input));
    current.rulesDegraded = event => serializeAlert(() => raiseRulesDegraded(alertDeps(), event));
    current.rulesHealthy = () => serializeAlert(() => clearRulesDegraded(alertDeps()));
    for (const key of Object.keys(autojoin)) delete autojoin[key];
    Object.assign(autojoin, current);
    return Boolean(autojoin.topic) && FLAGS.every(flag => autojoin.cfg[flag] === true)
      && ['last-valid', 'fail-closed'].includes(env.LKB_JOIN_RULES_ENFORCE);
  };
  reloadAutojoin();
  const capabilities = new Map();
  const reloadCapabilities = () => {
    capabilities.clear();
    for (const slot of captureSlots) {
      try {capabilities.set(slot, new Set(listCaptureSlotReadiness(workspace(slot), {acceptEvidence}).map(receipt => receipt.platform)));}
      catch {capabilities.set(slot, new Set());}
    }
  };
  return {
    captureSlots, autojoin,
    async validateCaptureSlots(slots) {
      authority(); validateSlots(slots);
      if (JSON.stringify(slots) !== JSON.stringify(captureSlots)) throw new Error('Capture pool configuration changed');
      reloadCapabilities();
      if (slots.some(slot => !capabilities.get(slot)?.size)) throw new Error('Each capture slot requires reviewed real host capability evidence');
    },
    captureSlotSupports(slot, item) {
      try {authority(); return capabilities.get(slot)?.has(detectPlatform(item.meetingUrl)) === true;} catch {return false;}
    },
    async validateCaptureSlot(slot, item) {
      validateCaptureSlotReadiness(workspace(slot, 'record'), {platform: detectPlatform(item.meetingUrl), acceptEvidence});
    },
    async refreshSchedulerPolicy() {
      authority(); const enabled = reloadAutojoin(); reloadCapabilities(); return enabled;
    },
    flushSchedulerAlerts: () => serializeAlert(() => flushFailureDigest(alertDeps())),
    applyJoinRules(selection, {readOnly = false, now} = {}) {
      const verified = verifiedTenant();
      return enforceJoinRules(selection, {mode: env.LKB_JOIN_RULES_ENFORCE, tenantId,
        keyTenantId: verified === tenantId && env.LKB_TENANT_ID === tenantId ? verified : null, stateDir, log, readOnly,
        now: () => now === undefined ? Date.now() : Date.parse(now), onDegraded: autojoin.rulesDegraded, onHealthy: autojoin.rulesHealthy});
    },
    async publishCaptureControl({tenantId: owner, sessionId, control}) {
      const directory = env.LKB_CAPTURE_CONTROL_DIR;
      if (!directory) return undefined;
      authority(); if (owner !== tenantId) throw new Error('Private capture controller owner mismatch');
      return publishCapturePrivacyController({directory: configuredRoot('LKB_CAPTURE_CONTROL_DIR', directory), tenantId, sessionId, control});
    },
  };
}
