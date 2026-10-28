// ISS-367: shared fixtures for run-pipeline.test.mjs, split out for the test-file length budget.
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export const NOW = '2026-09-30T12:00:00Z';
export const event = (changes = {}) => ({id: 'cal-one', title: 'University webinar', startTime: '2026-09-30T12:01:00Z',
  endTime: '2026-09-30T13:00:00Z', meetingUrl: 'https://meeting.zoho.com/meeting/123?token=private', ...changes});

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lkb-poller-')), stateDir = join(root, 'data/webinar-release');
  const logs = [], calls = [];
  const deps = {root, stateDir, env: {MONGO_WORK_DB: 'lkb_work_release', LKB_TENANT_ID: 'fixture'}, now: () => NOW,
    validateTenant: async () => {}, log: (line) => logs.push(line), loadCalendarEvents: async () => [event()], loadCandidates: async () => [],
    launch: async (...args) => calls.push(args)};
  let generation = 0;
  deps.loadCalendarAcquisition = async (token, checkedAt) => {
    const rows = (await deps.loadCalendarEvents()).map(row => ({...row, providerUpdated: row.providerUpdated ?? new Date(Date.parse(NOW) + ++generation).toISOString()}));
    return {version: 1, tenantId: 'fixture', scope: 'available-connected-source-state', complete: true, mode: token ? 'sync' : 'baseline',
      checkedAt, requestedSyncToken: token, syncToken: `fixture-${generation}`, sourceEvents: rows, meetings: rows};
  };
  return {root, stateDir, deps, logs, calls, cleanup: () => rmSync(root, {recursive: true, force: true})};
}
export async function withFixture(body, ready = false) {
  const f = fixture();
  try { if (ready) proof(f); await body(f); } finally { f.cleanup(); }
}
export function proof(f) {
  mkdirSync(f.stateDir, {recursive: true});
  const file = join(f.root, 'proof.webm'); writeFileSync(file, 'test artifact');
  writeFileSync(join(f.stateDir, 'live-proof.json'), JSON.stringify({status: 'passed', platform: process.platform,
    backend: 'tab', sessionId: 'proof-session', audio: true, video: true, verifiedAt: NOW, recording: 'proof.webm'}));
}
export function completed(root, id) {
  const dir = join(root, 'data/toc-migrated', id); mkdirSync(dir, {recursive: true});
  const bytes = JSON.stringify([{_id:'turn-a',tenantId:'fixture',sessionId:id,text:'Supported source'}]);
  writeFileSync(join(dir,'knowledge-turns.json'),bytes);
  writeFileSync(join(dir,'source.json'),JSON.stringify({_id:`${id}-src`,tenantId:'fixture'}));
  const proof = {version:2,status:'done',strict:true,sessionId:id,tenantId:'fixture',generation:'generation-a',
    inputHash:createHash('sha256').update(bytes).digest('hex'),summary:'done',claims:'done',chunks:'done',tree:'done',semanticSupport:'passed',turnCount:1};
  writeFileSync(join(dir,'index-proof.json'),JSON.stringify(proof));
  writeFileSync(join(dir,'pipeline-state.json'),JSON.stringify({...proof,stage:'index'}));
}
