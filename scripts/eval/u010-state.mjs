/** Single-owner, versioned, immutable checkpoint snapshots; no historical report replacement. */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, openSync, fsyncSync, closeSync, renameSync, unlinkSync, rmdirSync, fstatSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { hash, requireValue } from './u010-corpus.mjs';
import { randomUUID } from 'node:crypto';
const previousSaved = new Map();
function confirmedDead(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) return false;
  try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;
}
function sameFile(left, right) { return right.isFile() && sameIdentity(left, right); }
function removeOwned(lock, token, identity) {
  if (!identity) return; // this caller never successfully created a lock
  try {
    if (!sameFile(identity, lstatSync(lock, { bigint: true }))) return;
    const fd = openSync(lock, 'r');
    try {
      if (sameFile(identity, fstatSync(fd, { bigint: true })) && readFileSync(fd, 'utf8') === token
        && sameFile(identity, lstatSync(lock, { bigint: true }))) unlinkSync(lock);
    } finally { closeSync(fd); }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function acquireCheckpoint(directory, resume) {
  if (!resume) mkdirSync(directory); // an existing output is always a collision
  const lock = join(directory, '.owner-lock');
  const token = `${process.pid}:${randomUUID()}`;
  let ownedIdentity = null;
  const guardName = `.acquire-lock-${process.pid}-${randomUUID()}`;
  const acquisition = join(directory, guardName);
  mkdirSync(acquisition); // PID is atomic in the name, even if killed before metadata writes
  const guardIdentity = lstatSync(acquisition, { bigint: true });
  try {
    requireValue(!existsSync(join(directory, '.acquire-lock')), 'legacy acquisition owner unknown; verified operator cleanup required');
    for (const name of readdirSync(directory).filter((f) => f.startsWith('.acquire-lock-') && f !== guardName)) {
      const match = name.match(/^\.acquire-lock-(\d+)-[a-f0-9-]{36}$/);
      requireValue(match && confirmedDead(Number(match[1])), 'live/unverifiable acquisition owner');
      const deadGuard = join(directory, name);
      try {
        const identity = lstatSync(deadGuard, { bigint: true });
        requireValue(identity.isDirectory() && sameIdentity(identity, lstatSync(deadGuard, { bigint: true })), 'unverifiable acquisition identity');
        rmdirSync(deadGuard);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (resume && existsSync(lock)) {
      const previousIdentity = lstatSync(lock, { bigint: true });
      requireValue(previousIdentity.isFile(), 'unverifiable owner lock identity');
      const previous = readFileSync(lock, 'utf8');
      requireValue(/^[1-9]\d*:(?:\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(previous), 'corrupt owner lock');
      requireValue(confirmedDead(Number(previous.split(':')[0])) && readFileSync(lock, 'utf8') === previous, 'live/unverifiable checkpoint owner');
      requireValue(sameFile(previousIdentity, lstatSync(lock, { bigint: true })), 'checkpoint owner identity changed');
      unlinkSync(lock); // exact owned checkpoint lock, confirmed dead process; no age threshold
    }
    const fd = openSync(lock, 'wx');
    try { ownedIdentity = fstatSync(fd, { bigint: true }); writeFileSync(fd, token); fsyncSync(fd); }
    finally { closeSync(fd); }
    if (resume) for (const name of readdirSync(directory).filter((f) => /^snapshot-\d{8}\.json\.tmp$/.test(f))) {
      requireValue(!existsSync(join(directory, name.slice(0, -4))), 'conflicting temporary/committed snapshot');
      unlinkSync(join(directory, name)); // exact uncommitted temp within this exclusively owned checkpoint
    }
  } catch (error) {
    removeOwned(lock, token, ownedIdentity);
    throw error;
  } finally {
    if (existsSync(acquisition) && sameIdentity(guardIdentity, lstatSync(acquisition, { bigint: true }))) rmdirSync(acquisition);
  }
  return () => removeOwned(lock, token, ownedIdentity);
}

export function saveSnapshot(directory, state) {
  const name = `snapshot-${String(state.sequence).padStart(8, '0')}.json`;
  const final = join(directory, name), temporary = join(directory, `${name}.tmp`);
  requireValue(!existsSync(final), 'snapshot collision');
  const previous = previousSaved.get(directory);
  requireValue(state.sequence === 0 || previous?.sequence === state.sequence - 1, 'snapshot writer sequence not loaded');
    const payload = previous ? { delta: { sequence: state.sequence, binding: state.binding, stopReason: state.stopReason, sourceDriftDetected: state.sourceDriftDetected,
    cells: state.cells.slice(previous.cells.length), attempts: state.attempts.slice(previous.attempts.length),
    updatedAttempts: state.attempts.slice(0, previous.attempts.length).flatMap((attempt, i) => JSON.stringify(attempt) === JSON.stringify(previous.attempts[i]) ? [] : [{ index: i, attempt }]),
    invocations: state.invocations } } : { state };
  const content = JSON.stringify({ checksum: hash(JSON.stringify(payload)), ...payload }) + '\n';
  const fd = openSync(temporary, 'wx');
  try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, final);
  previousSaved.set(directory, JSON.parse(JSON.stringify(state)));
  return final;
}

export function loadSnapshot(directory, throughName) {
  const entries = readdirSync(directory).filter((f) => /^snapshot-\d{8}\.json$/.test(f)).sort();
  requireValue(entries.length > 0, 'no completed checkpoint snapshot');
  let previous = null;
  for (const entry of entries) {
    const envelope = JSON.parse(readFileSync(join(directory, entry), 'utf8'));
    const payload = envelope.state ? { state: envelope.state } : { delta: envelope.delta };
    requireValue(envelope.checksum === hash(JSON.stringify(payload)), 'corrupt checkpoint checksum');
    let state;
    if (envelope.state) { requireValue(!previous, 'conflicting checkpoint base'); state = envelope.state; }
    else {
      requireValue(previous && envelope.delta, 'missing checkpoint base');
      const delta = envelope.delta;
      const attempts = [...previous.attempts];
      const updated = new Set();
      for (const update of delta.updatedAttempts) {
        requireValue(Number.isSafeInteger(update.index) && update.index >= 0 && update.index < attempts.length, 'foreign attempt update');
        requireValue(!updated.has(update.index), 'duplicate attempt update'); updated.add(update.index);
        const old = attempts[update.index];
        requireValue(old.status === 'inflight', 'checkpoint rewrites terminal receipt');
        for (const key of Object.keys(old).filter((k) => k !== 'status')) requireValue(JSON.stringify(old[key]) === JSON.stringify(update.attempt[key]), 'checkpoint rewrites reserved attempt');
        attempts[update.index] = update.attempt;
      }
      state = { ...previous, sequence: delta.sequence, binding: delta.binding, stopReason: delta.stopReason,
        sourceDriftDetected: delta.sourceDriftDetected ?? previous.sourceDriftDetected,
        cells: [...previous.cells, ...delta.cells], attempts: [...attempts, ...delta.attempts], invocations: delta.invocations };
    }
    requireValue(state.format === 'u010-run-v1' && Number.isSafeInteger(state.sequence), 'unknown checkpoint schema');
    requireValue(entry === `snapshot-${String(state.sequence).padStart(8, '0')}.json`, 'checkpoint sequence mismatch');
    requireValue(previous || state.sequence === 0, 'checkpoint missing first sequence');
    requireValue(!previous || state.sequence === previous.sequence + 1, 'checkpoint sequence gap');
    requireValue(!previous || state.binding === previous.binding, 'checkpoint binding conflict');
    requireValue(!previous?.sourceDriftDetected || state.sourceDriftDetected === true, 'checkpoint removes source-drift evidence');
    previous = state;
    if (entry === throughName) break;
  }
  requireValue(!throughName || entries.includes(throughName), 'requested snapshot missing');
  previousSaved.set(directory, JSON.parse(JSON.stringify(previous)));
  return previous;
}

export function saveReport(directory, report, sequence) {
  const out = join(directory, `report-${String(sequence).padStart(8, '0')}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return out;
}
