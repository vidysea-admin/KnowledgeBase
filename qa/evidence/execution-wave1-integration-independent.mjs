import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildAutojoinTickDeps } from '../../packages/meeting-bot/src/autojoin/tick-wiring.ts';
import { readBotEvents } from '../../packages/meeting-bot/src/autojoin/bot-events.ts';
import { runScheduleTickOnce } from '../../packages/meeting-bot/src/calendar/schedule-tick.ts';
import { emptyStoredJoinRules, saveJoinRules } from '../../packages/meeting-bot/src/calendar/join-rules/join-rules-store.ts';
import { projectBotEvent } from '../../apps/api/src/bot-events/router.ts';

test('actual optional wiring: OFF does not load rules or alert; degraded dryrun writes nothing; live trusted sink reaches API and recovers', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lkb-independent-glue-'));
  const tenant = 'integration-checker';
  try {
    const logs = [];
    // A recognized false flag makes config present, with all external channels disabled.
    const autojoin = buildAutojoinTickDeps(dir, dir, { LKB_TENANT_ID: tenant, LKB_ALERT_EMAIL: '0' }, line => logs.push(line));
    assert.ok(autojoin?.rulesDegraded);
    assert.ok(autojoin?.rulesHealthy);
    const deps = { stateDir: dir, stateTenantId: tenant, joinRulesTenantId: tenant, joinRulesKeyTenantId: tenant,
      autojoin, loadCalendarEvents: async () => [], loadCandidates: async () => [], now: () => new Date().toISOString(),
      log: line => logs.push(line), scheduler: { scheduleOnce: async () => assert.fail('no schedules expected') } };
    await runScheduleTickOnce({ ...deps, joinRulesIo: { load: () => assert.fail('OFF may not open rule store') } }, true);
    assert.deepEqual(readdirSync(dir), []);
    await runScheduleTickOnce({ ...deps, joinRulesEnforce: 'last-valid' }, true);
    assert.deepEqual(readdirSync(dir), []);
    await runScheduleTickOnce({ ...deps, joinRulesEnforce: 'last-valid' }, false);
    const rows = readBotEvents(dir, tenant, 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'rules-degraded');
    assert.deepEqual(readBotEvents(dir, 'foreign-tenant', 10), []);
    const projected = projectBotEvent(rows[0]);
    assert.equal(projected?.kind, 'rules-degraded');
    assert.equal(Object.hasOwn(projected, 'tenantId'), false);
    assert.match(projected.detail, /No validated snapshot is in use/);
    await autojoin.rulesDegraded({ tenantId: 'foreign-tenant', reason: 'https://secret.invalid/?TOKEN', usingSnapshot: false });
    assert.equal(readBotEvents(dir, tenant, 10).length, 1);
    saveJoinRules(dir, tenant, emptyStoredJoinRules());
    await runScheduleTickOnce({ ...deps, joinRulesEnforce: 'last-valid' }, false);
    const state = JSON.parse(readFileSync(path.join(dir, `autojoin-alert-state.${tenant}.json`), 'utf8'));
    assert.equal(Object.hasOwn(state, 'rulesOutage'), false);
    assert.ok(logs.some(line => line.includes('tenant mismatch')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
