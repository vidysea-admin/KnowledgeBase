/** T-015: content-free, private grounded-claim dataset proposal. No permission is minted. */
import { createHash } from 'node:crypto';
export const trainingHash = value => createHash('sha256').update(value).digest('hex');
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const trainingId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

/** Only an in-memory row builder. Returning rows is restricted to the approved exporter. */
export function groundedTrainingRows(generation, tenantId) {
  const {source, session, turns, claims} = generation.documents;
  requireValue(source.tenantId === tenantId && session.tenantId === tenantId, 'tenant mismatch');
  requireValue(trainingId(source._id) && session.sourceId === source._id, 'source identity mismatch');
  requireValue(source.hash === undefined || (typeof source.hash === 'string' && /^[a-f0-9]{64}$/.test(source.hash)), 'invalid source hash');
  requireValue(source.consent?.given === true && source.consent.revoked !== true, 'capture permission absent or revoked');
  requireValue(source.trainingUse?.allowed !== false && source.trainingUse?.revoked !== true, 'source owner prohibits training');
  for (const permission of [source.consent, source.trainingUse]) if (permission?.expiresAt !== undefined)
    requireValue(typeof permission.expiresAt === 'string' && Number.isFinite(Date.parse(permission.expiresAt)) &&
      Date.parse(permission.expiresAt) > Date.now(), 'source permission expired or invalid');
  const byId = new Map(turns.map(t => [t._id, t])), seen = new Set(), rows = [], excluded = [];
  for (const claim of claims) {
    requireValue(claim.tenantId === tenantId && trainingId(claim._id) && !seen.has(claim._id), 'claim identity mismatch');
    seen.add(claim._id);
    if (claim.status !== 'verified') { excluded.push({id: claim._id, reason: 'claim-not-verified'}); continue; }
    requireValue(typeof claim.text === 'string' && claim.text.trim() && claim.evidence?.length, 'claim invalid');
    const evidence = claim.evidence.map(e => {
      const turn = byId.get(e.turnId);
      requireValue(e.sessionId === session._id && turn?.tenantId === tenantId && turn.sessionId === session._id &&
        trainingId(turn._id) && typeof turn.text === 'string' && turn.text.trim() && trainingId(turn.speakerRef) &&
        !['unknown','unresolved','anonymous'].includes(turn.speakerRef.toLowerCase()) &&
        Number.isFinite(turn.tStart) && turn.tStart >= 0 && Number.isFinite(turn.tEnd) && turn.tEnd >= turn.tStart, 'claim evidence invalid');
      requireValue(e.quote === undefined || (typeof e.quote === 'string' && e.quote.trim() && turn.text.includes(e.quote)), 'claim quote invalid');
      return {turnId: turn._id, sessionId: session._id, speakerRef: turn.speakerRef, tStart: turn.tStart, tEnd: turn.tEnd, text: turn.text};
    });
    rows.push({format: 'grounded-claim-v1', id: claim._id, tenantId, sourceId: source._id, sessionId: session._id,
      input: evidence, output: {text: claim.text, evidence: claim.evidence}, provenance: source.synthetic === true || source._id.startsWith('synthetic')
        ? 'synthetic-fixture-current-derived-verified-claim' : 'current-derived-verified-claim'});
  }
  return {rows, excluded};
}

/** A row is a grounded claim task, not invented counselling question/answer supervision. */
export function buildTrainingPlan(generations, config, exclusions = []) {
  requireValue(trainingId(config?.tenantId) && trainingId(config.seed), 'tenant and seed identifier required');
  requireValue(Array.isArray(config.sessions) && config.sessions.length && new Set(config.sessions).size === config.sessions.length &&
    config.sessions.every(trainingId), 'explicit unique sessions required');
  requireValue(Array.isArray(config.relatedGroups ?? []) && (config.relatedGroups ?? []).every(g => Array.isArray(g) && g.length > 1 &&
    g.every(s => config.sessions.includes(s))), 'invalid related groups');
  const accepted = [], omitted = [...exclusions], rowsBySession = new Map();
  for (const g of generations) {
    const id = g.documents.session._id, {rows, excluded} = groundedTrainingRows(g, config.tenantId);
    requireValue(config.sessions.includes(id) && !rowsBySession.has(id), 'session selection mismatch');
    omitted.push(...excluded.map(e => ({sessionId: id, ...e})));
    rowsBySession.set(id, rows);
    if (!rows.length) {omitted.push({sessionId: id, reason: 'no-verified-claims'}); continue;}
    accepted.push({sessionId: id, sourceId: g.documents.source._id, sourceHash: g.documents.source.hash ?? null,
      synthetic: rows.some(r => r.provenance.startsWith('synthetic')),
      hashes: g.hashes, claimsSeen: g.documents.claims.length, rows});
  }
  // Preserve excluded selected IDs as relation bridges; only accepted sessions emit rows/splits.
  const parent = new Map(config.sessions.map(id => [id, id]));
  const find = id => { let p = parent.get(id); while (p !== parent.get(p)) p = parent.get(p); return p; };
  const union = (a, b) => {if (parent.has(a) && parent.has(b)) parent.set(find(b), find(a));};
  for (const group of config.relatedGroups ?? []) for (const id of group.slice(1)) union(group[0], id);
  const owners = new Map();
  for (const s of accepted) {
    const keys = [...new Set([`source-id:${s.sourceId}`, ...(s.sourceHash ? [`source:${s.sourceHash}`] : []),
      ...s.rows.flatMap(r => [`claim:${trainingHash(normalized(r.output.text))}`, ...r.input.map(t => `turn:${trainingHash(normalized(t.text))}`)])])];
    for (const key of keys) { if (owners.has(key)) union(s.sessionId, owners.get(key)); else owners.set(key, s.sessionId); }
  }
  const groups = new Map();
  for (const s of accepted) {const root = find(s.sessionId); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(s.sessionId);}
  const units = [...groups.values()].map(ids => ids.sort()).sort((a,b) => trainingHash(`${config.seed}\0${a.join('\0')}`).localeCompare(trainingHash(`${config.seed}\0${b.join('\0')}`)));
  const splits = {train: [], validation: [], evaluation: []};
  // Three independent leakage groups are the minimum for three nonempty splits, not a quality threshold.
  units.forEach((ids, i) => splits[i === 0 ? 'evaluation' : i === 1 ? 'validation' : 'train'].push(...ids));
  const membership = accepted.sort((a,b) => a.sessionId.localeCompare(b.sessionId)).map(s => ({
    sessionId: s.sessionId, sourceId: s.sourceId, sourceHash: s.sourceHash, synthetic: s.synthetic, hashes: s.hashes,
    claimsSeen: s.claimsSeen, rows: s.rows.map(r => ({id: r.id, sha256: trainingHash(JSON.stringify(r)),
      outputSha256: trainingHash(r.output.text), evidence: r.input.map(({text, ...t}) => ({...t, sha256: trainingHash(text)}))}))
  }));
  const totalRows = membership.reduce((n,s) => n+s.rows.length,0);
  const proposal = {format: 'own-model-plan-v1', taskFormat: 'grounded-claim-v1', tenantId: config.tenantId,
    status: totalRows ? 'awaiting-exact-export-approval' : 'blocked-no-current-eligible-examples',
    config: {tenantId: config.tenantId, seed: config.seed, sessions: [...config.sessions].sort(), relatedGroups: config.relatedGroups ?? []},
    transformation: 'identity-v1; verified claim with full cited turns; no generated questions, redaction or semantic gold assertion',
    permissions: 'capture permission is checked; training/export permission requires exact Umesh canonical decision; preparation never authorizes use',
    provenance: 'only current derivation proof accepted; legacy-unbound/stale rejected',
    membership, exclusions: omitted.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    splitAlgorithm: 'connected-source-session-content-v2; related closure over all selected sessions, accepted-only membership; first hashed group evaluation, second validation, remaining train',
    leakageGroups: units, splits, counts: {selectedSessions: config.sessions.length, acceptedSessions: accepted.length,
      rows: totalRows, groups: units.length, train: splits.train.reduce((n,id) => n+rowsBySession.get(id).length,0),
      validation: splits.validation.reduce((n,id) => n+rowsBySession.get(id).length,0), evaluation: splits.evaluation.reduce((n,id) => n+rowsBySession.get(id).length,0)},
    splitReady: units.length >= 3, exported: false, trained: false, evaluated: false, promoted: false};
  return {...proposal, fingerprint: trainingHash(JSON.stringify(proposal))};
}
