import { createReadStream } from 'node:fs';
import { readFile, realpath, writeFile, lstat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN_FIELDS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const inPrefix = (name, prefix) => typeof name === 'string' && (name === prefix || name.startsWith(`${prefix}/`));
const unknown = reason => ({ status: 'unknown', reason, tokens: null });

// Only allowlisted metadata is retained. Response/tool/message bodies never enter receipts.
export async function readSession(file) {
  let identity = null, usage = null, timestamp = null, lifecycle = null, malformed = false;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    // This is only a cheap prefilter, not an envelope parser: runtime adds
    // ordinal and JSON keys may appear in any order. JSON structure below is
    // authoritative; nested type strings cannot impersonate an outer event.
    // Only allowlisted metadata is retained, never conversation/tool bodies.
    if (!line.trimEnd().endsWith('}')) { malformed = true; continue; }
    if (!/"type"\s*:\s*"(?:session_meta|event_msg)"/.test(line)) continue;
    let event;
    try { event = JSON.parse(line); } catch { malformed = true; continue; }
    if (event.type === 'session_meta') {
      const p = event.payload ?? {}, spawn = p.source?.subagent?.thread_spawn;
      const next = { thread_id: p.id, parent_thread_id: p.parent_thread_id ?? spawn?.parent_thread_id ?? null, agent_path: p.agent_path ?? spawn?.agent_path };
      if (identity && JSON.stringify(identity) !== JSON.stringify(next)) malformed = true;
      identity = next;
    } else if (event.type === 'event_msg') {
      const p = event.payload ?? {};
      if (p.type === 'token_count') {
        const total = p.info?.total_token_usage;
        usage = Object.fromEntries(TOKEN_FIELDS.map(key => [key, total?.[key]]));
        timestamp = event.timestamp;
      } else if (['task_started', 'task_complete', 'turn_aborted'].includes(p.type)) {
        lifecycle = { type: p.type, timestamp: event.timestamp };
      }
    }
  }
  const reasons = [];
  if (malformed) reasons.push('malformed_or_partial_record');
  if (!identity || typeof identity.thread_id !== 'string' || typeof identity.agent_path !== 'string') reasons.push('missing_identity');
  if (!usage || !TOKEN_FIELDS.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) || !validTime(timestamp)) reasons.push('missing_or_invalid_usage');
  if (!lifecycle || lifecycle.type !== 'task_complete' || !validTime(lifecycle.timestamp) || (validTime(timestamp) && Date.parse(lifecycle.timestamp) < Date.parse(timestamp))) reasons.push('inflight_or_unconfirmed_completion');
  return { identity, usage_timestamp: timestamp, lifecycle, cumulative_tokens: usage, status: reasons.length ? 'unknown' : 'known', reasons };
}

export async function snapshot({ unit, cycle, phase, boundary, agentPrefix, sessions }) {
  if (!unit || !phase || !Number.isSafeInteger(cycle) || cycle < 0 || !['baseline', 'end'].includes(boundary) || !/^\/root(?:\/[^/]+)*$/.test(agentPrefix) || !sessions.length) throw new Error('invalid_snapshot_scope');
  const records = [], seen = new Map();
  for (const file of sessions) {
    let record;
    try { record = await readSession(file); } catch { record = { identity: null, status: 'unknown', reasons: ['unreadable_session'] }; }
    if (record.identity && !inPrefix(record.identity.agent_path, agentPrefix)) continue;
    const id = record.identity?.thread_id;
    if (id && seen.has(id)) {
      const prior = seen.get(id);
      if (JSON.stringify(prior) !== JSON.stringify(record)) { prior.status = 'unknown'; prior.reasons.push('conflicting_duplicate_thread'); }
      continue;
    }
    records.push(record);
    if (id) seen.set(id, record);
  }
  return { schema: 'review-runtime-usage/v1', unit, cycle, phase, boundary, agent_prefix: agentPrefix, observed_at: new Date().toISOString(), coverage: 'explicit_session_files_only', records, active_seconds: null, monetary_cost: null };
}

function validateSnapshot(s) {
  if (s?.schema !== 'review-runtime-usage/v1' || !Array.isArray(s.records) || !validTime(s.observed_at)) throw new Error('invalid_snapshot');
  const ids = s.records.map(r => r.identity?.thread_id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate_thread_in_snapshot');
}

export function phaseDelta(baseline, end) {
  validateSnapshot(baseline); validateSnapshot(end);
  if (baseline.boundary !== 'baseline' || end.boundary !== 'end' || ['unit', 'cycle', 'phase', 'agent_prefix', 'coverage'].some(k => baseline[k] !== end[k]) || Date.parse(end.observed_at) < Date.parse(baseline.observed_at)) throw new Error('phase_identity_or_boundary_mismatch');
  const before = new Map(baseline.records.filter(r => r.identity).map(r => [r.identity.thread_id, r]));
  const after = new Map(end.records.filter(r => r.identity).map(r => [r.identity.thread_id, r]));
  const records = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id), b = after.get(id);
    let result;
    if (!a || !b) result = unknown('missing_per_thread_baseline_or_end');
    else if (JSON.stringify(a.identity) !== JSON.stringify(b.identity) || !inPrefix(b.identity.agent_path, end.agent_prefix)) result = unknown('identity_mismatch');
    else if (a.status !== 'known' || b.status !== 'known') result = unknown('unconfirmed_snapshot');
    else if (!validTime(a.usage_timestamp) || !validTime(b.usage_timestamp) || Date.parse(b.usage_timestamp) < Date.parse(a.usage_timestamp)) result = unknown('usage_timestamp_reset');
    else if (!TOKEN_FIELDS.every(k => Number.isSafeInteger(a.cumulative_tokens?.[k]) && Number.isSafeInteger(b.cumulative_tokens?.[k]) && a.cumulative_tokens[k] >= 0 && b.cumulative_tokens[k] >= a.cumulative_tokens[k])) result = unknown('counter_reset_or_missing');
    else result = { status: 'known', tokens: Object.fromEntries(TOKEN_FIELDS.map(k => [k, b.cumulative_tokens[k] - a.cumulative_tokens[k]])) };
    records.push({ thread_id: id, agent_path: b?.identity.agent_path ?? a?.identity.agent_path, ...result });
  }
  const unidentified = [...baseline.records, ...end.records].some(r => !r.identity);
  const known = records.filter(r => r.status === 'known');
  const complete = records.length > 0 && !unidentified && known.length === records.length;
  const subtotal = Object.fromEntries(TOKEN_FIELDS.map(k => [k, known.reduce((sum, r) => sum + r.tokens[k], 0)]));
  const safe = TOKEN_FIELDS.every(k => Number.isSafeInteger(subtotal[k]));
  return { schema: 'review-runtime-phase/v1', unit: end.unit, cycle: end.cycle, phase: end.phase, agent_prefix: end.agent_prefix, coverage: end.coverage, status: complete && safe ? 'known' : 'unknown', records, unidentified_session: unidentified, actual_tokens: complete && safe ? subtotal : null, reported_subtotal: safe ? subtotal : null, advisory: { actual_total_tokens: complete && safe ? subtotal.total_tokens : null, allocated_output_budget: null, full_role_ratio_verified: false }, wall_span_seconds: (Date.parse(end.observed_at) - Date.parse(baseline.observed_at)) / 1000, active_seconds: null, monetary_cost: null, accounting: 'Cached input is included in input; reasoning output is included in output. Never add either subset again.' };
}

export async function writeReceipt(workspace, output, value) {
  if (!path.isAbsolute(workspace) || !path.isAbsolute(output)) throw new Error('explicit_absolute_workspace_and_output_required');
  const root = await realpath(workspace), parent = await realpath(path.dirname(output));
  const relative = path.relative(root, parent);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('output_outside_workspace');
  try { if ((await lstat(output)).isSymbolicLink()) throw new Error('output_symlink_refused'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Exclusive creation prevents overwriting a source, secret, or previous receipt.
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

async function main(args) {
  const command = args.shift(), options = {}, sessions = [];
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!key?.startsWith('--') || !value) throw new Error('invalid_arguments');
    if (key === '--session') sessions.push(value);
    else { if (Object.hasOwn(options, key)) throw new Error('duplicate_argument'); options[key] = value; }
  }
  const allowed = command === 'snapshot' ? ['--unit', '--cycle', '--phase', '--boundary', '--agent-prefix', '--workspace', '--output'] : ['--baseline', '--end', '--workspace', '--output'];
  if (!['snapshot', 'delta'].includes(command) || Object.keys(options).some(k => !allowed.includes(k)) || (command === 'delta' && sessions.length)) throw new Error('invalid_command_or_option');
  const result = command === 'snapshot' ? await snapshot({ unit: options['--unit'], cycle: options['--cycle'] ? Number(options['--cycle']) : NaN, phase: options['--phase'], boundary: options['--boundary'], agentPrefix: options['--agent-prefix'], sessions }) : phaseDelta(JSON.parse(await readFile(options['--baseline'], 'utf8')), JSON.parse(await readFile(options['--end'], 'utf8')));
  await writeReceipt(options['--workspace'] ?? '', options['--output'] ?? '', result);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(() => { process.stderr.write('Runtime usage receipt failed; check explicit scope, inputs and workspace output.\n'); process.exitCode = 1; });
